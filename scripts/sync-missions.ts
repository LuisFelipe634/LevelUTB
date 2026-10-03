import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const MISSIONS = [
  ["Primer recorrido", "Visita el Dashboard, Perfil, Malla, Misiones y Recompensas.", "PLANIFICACION", 10],
  ["Conoce tu perfil", "Completa los datos principales de tu perfil académico.", "PLANIFICACION", 15],
  ["Descubre tus misiones", "Consulta la lista de misiones y abre el detalle de una misión.", "PLANIFICACION", 5],
  ["Revisa tus logros", "Consulta la sección de logros o insignias.", "PLANIFICACION", 5],
  ["Conoce las recompensas", "Explora el catálogo y consulta una recompensa.", "PLANIFICACION", 5],
  ["Encuentra un docente", "Busca y consulta el perfil de un docente.", "PLANIFICACION", 10],
  ["Consulta tus estadísticas", "Abre estadísticas y revisa tu avance académico.", "ACADEMICO", 5],
  ["Descubre una recomendación", "Abre una recomendación académica personalizada.", "PLANIFICACION", 5],
  ["Explorador universitario", "Visita los ocho módulos principales de LevelUTB.", "PLANIFICACION", 30],
  ["Ruta del estudiante", "Consulta perfil, malla, misiones, logros y recompensas.", "PLANIFICACION", 25],
  ["Conoce tu carrera", "Explora diez áreas diferentes de la malla curricular.", "ACADEMICO", 40],
  ["Cazador de oportunidades", "Revisa recomendaciones, misiones y recompensas.", "PLANIFICACION", 20],
  ["Planifica tu semestre", "Consulta asignaturas, prerrequisitos y recomendaciones.", "PLANIFICACION", 40],
] as const

async function main() {
  let created = 0
  let updated = 0

  // Purga espejo de sync-badges: elimina misiones fuera del catalogo canonico
  // (las 13 viejas academicas con verificationKey) para no acumular 26 tras
  // seed(vieja) + sync(nueva). Se borran primero sus StudentMission huerfanas.
  const canonicalTitles = MISSIONS.map(([title]) => title)
  const staleMissions = await prisma.mission.findMany({
    where: { title: { notIn: canonicalTitles } },
    select: { id: true },
  })
  if (staleMissions.length > 0) {
    const staleIds = staleMissions.map((m) => m.id)
    await prisma.studentMission.deleteMany({ where: { missionId: { in: staleIds } } })
    const stale = await prisma.mission.deleteMany({ where: { id: { in: staleIds } } })
    console.log(`Se eliminaron ${stale.count} misiones fuera del catalogo.`)
  }

  for (const [title, description, type, pointsReward] of MISSIONS) {
    const existing = await prisma.mission.findFirst({ where: { title } })
    if (existing) {
      await prisma.mission.update({
        where: { id: existing.id },
        data: { description, type, pointsReward, autoVerify: true, isActive: true },
      })
      updated++
    } else {
      await prisma.mission.create({
        data: { title, description, type, pointsReward, autoVerify: true, isActive: true },
      })
      created++
    }
  }

  console.log(`Misiones sincronizadas: ${created} creadas, ${updated} actualizadas.`)
}

main()
  .catch((error) => {
    console.error("No se pudieron sincronizar las misiones:", error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
