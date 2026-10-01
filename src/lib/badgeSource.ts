// Interfaz para la fuente de insignias, al estilo de AcademicSource: permite
// que /api/badges lea del catalogo local (Prisma) o del de la universidad
// (HTTP) sin cambiar la ruta.
//
// A diferencia de la fuente academica, aqui NO se corta con 503 si la externa
// no responde: el catalogo local es una fuente completa y valida, asi que quien
// llama degrada a local. Ver src/app/api/badges/route.ts.

export type BadgeCategoryName =
  | "PROGRESO"
  | "RENDIMIENTO"
  | "HABITO"
  | "COMPETENCIA"
  | "IMPACTO_SOCIAL"

// Una insignia del catalogo, con el estado del estudiante ya resuelto.
// earnedAt/evidence solo tienen valor si earned es true.
export type BadgeRecord = {
  // Identificador estable del catalogo de origen. En Prisma es el id de Badge;
  // en la API externa es su "code" institucional. La UI no lo muestra, pero
  // permite reconciliar ambos catalogos si alguna vez se mezclan.
  code: string
  name: string
  description: string
  iconUrl: string
  category: string
  requiredLevel: number | null
  pointsRequired: number | null
  earned: boolean
  earnedAt: Date | string | null
  evidence: string | null
}

export type BadgeCatalog = {
  badges: BadgeRecord[]
  // De donde salio el catalogo, para auditar la respuesta.
  source: "prisma" | "http"
  // Identifica la version del catalogo remoto. null cuando es Prisma.
  catalogVersion: string | null
}

export interface BadgeSource {
  getStudentBadges(studentCode: string): Promise<BadgeCatalog>
}
