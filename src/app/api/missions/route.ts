import { NextResponse } from "next/server"
import type { Mission, StudentMission } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getAverageGrade } from "@/lib/academic"
import { verifyMission } from "@/lib/missionVerification"

type StudentSession = { userId: string } | { error: NextResponse }
type MissionContext = { mission: Mission; existingMission: StudentMission | null }
type Resolved<T> = { value: T } | { error: NextResponse }

// Sesión de estudiante: compartida por GET y POST para no duplicar el 401/403.
async function requireStudentSession(): Promise<StudentSession> {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  }

  if (session.user.role !== "STUDENT") {
    return {
      error: NextResponse.json(
        { error: "Solo los estudiantes pueden gestionar misiones" },
        { status: 403 }
      ),
    }
  }

  return { userId: session.user.id as string }
}

function devError(error: string, cause: unknown): NextResponse | null {
  if (process.env.NODE_ENV !== "development") return null
  return NextResponse.json(
    { error, details: cause instanceof Error ? cause.message : String(cause) },
    { status: 500 }
  )
}

// GET: Obtener misiones del estudiante
export async function GET() {
  try {
    const session = await requireStudentSession()
    if ("error" in session) return session.error

    const { userId } = session

    // Obtener perfil del estudiante
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId }
    })

    if (!studentProfile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
    }

    // Obtener misiones disponibles (activas y con nivel adecuado)
    const availableMissions = await prisma.mission.findMany({
      where: {
        isActive: true,
        OR: [
          { requiredLevel: null },
          { requiredLevel: { lte: studentProfile.level } }
        ]
      },
      include: {
        course: true
      }
    })

    // Obtener misiones del estudiante
    const studentMissions = await prisma.studentMission.findMany({
      where: { studentId: userId },
      include: {
        mission: true
      }
    })

    // Combinar misiones disponibles con el estado del estudiante
    const missions = availableMissions.map((mission) => {
      const studentMission = studentMissions.find(
        (sm) => sm.missionId === mission.id
      )

      return {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        type: mission.type,
        points: mission.pointsReward,
        autoVerify: mission.autoVerify,
        requiredLevel: mission.requiredLevel,
        startDate: mission.startDate,
        endDate: mission.endDate,
        course: mission.course ? {
          id: mission.course.id,
          name: mission.course.name,
          code: mission.course.code
        } : null,
        // Estado del estudiante en esta misión
        studentMissionId: studentMission?.id || null,
        status: studentMission?.status || "NO_ASIGNADA",
        progress: studentMission?.progress || 0,
        completedAt: studentMission?.completedAt || null,
        evidence: studentMission?.evidence || null,
        reviewComment: studentMission?.reviewComment || null
      }
    })

    // Calcular puntos ganados de misiones completadas
    const totalPointsFromMissions = studentMissions
      .filter((sm) => sm.status === "COMPLETADA" || sm.status === "VERIFICADA")
      .reduce((acc, sm) => acc + sm.mission.pointsReward, 0)

    return NextResponse.json({
      missions,
      stats: {
        total: missions.length,
        pending: missions.filter((m) => m.status === "PENDIENTE" || m.status === "NO_ASIGNADA").length,
        inProgress: missions.filter((m) => m.status === "EN_PROGRESO").length,
        completed: missions.filter((m) => m.status === "COMPLETADA" || m.status === "VERIFICADA").length,
        totalPointsEarned: totalPointsFromMissions
      }
    })
  } catch (error) {
    console.error("Error fetching missions:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// Valida misión, nivel y asignación previa en el mismo orden que antes, para que
// los errores respondan igual.
async function loadMissionContext(
  userId: string,
  missionId: unknown
): Promise<Resolved<MissionContext>> {
  if (!missionId) {
    return {
      error: NextResponse.json({ error: "ID de misión requerido" }, { status: 400 })
    }
  }

  // Verificar que la misión existe y está activa
  const mission = await prisma.mission.findUnique({ where: { id: missionId as string } })
  if (!mission || !mission.isActive) {
    return {
      error: NextResponse.json(
        { error: "Misión no encontrada o inactiva" },
        { status: 404 }
      ),
    }
  }

  // Verificar nivel del estudiante
  const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } })
  if (!studentProfile) {
    return { error: NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 }) }
  }

  if (mission.requiredLevel && studentProfile.level < mission.requiredLevel) {
    return {
      error: NextResponse.json(
        { error: "Nivel insuficiente para esta misión" },
        { status: 403 }
      ),
    }
  }

  // Buscar si ya tiene esta misión
  const existingMission = await prisma.studentMission.findUnique({
    where: {
      studentId_missionId: {
        studentId: userId,
        missionId: mission.id
      }
    }
  })

  return { value: { mission, existingMission } }
}

async function acceptMission(userId: string, mission: Mission): Promise<NextResponse> {
  const studentMission = await prisma.studentMission.create({
    data: {
      studentId: userId,
      missionId: mission.id,
      status: "PENDIENTE",
      progress: 0
    }
  })

  // Crear notificación
  await prisma.notification.create({
    data: {
      userId,
      title: "Misión aceptada",
      message: `Has aceptado la misión: ${mission.title}`,
      type: "MISION_DISPONIBLE",
      link: "/misiones"
    }
  })

  return NextResponse.json({ studentMission })
}

// La metadata de arranque es una captura auxiliary: si falla, en produccion se
// sigue con null, y solo en desarrollo se corta con 500.
async function buildStartMetadataSafe(
  mission: Mission,
  userId: string
): Promise<Resolved<string | null>> {
  try {
    return { value: await buildStartMetadata(mission, userId) }
  } catch (metaError) {
    console.error("Error en buildStartMetadata:", metaError)
    const response = devError("Error al preparar la misión", metaError)
    return response ? { error: response } : { value: null }
  }
}

async function startMission(
  userId: string,
  mission: Mission,
  existingMission: StudentMission | null
): Promise<NextResponse> {
  if (!existingMission || !["PENDIENTE", "RECHAZADA"].includes(existingMission.status)) {
    return NextResponse.json(
      { error: "No puedes iniciar esta misión" },
      { status: 400 }
    )
  }

  const metadata = await buildStartMetadataSafe(mission, userId)
  if ("error" in metadata) return metadata.error

  const studentMission = await prisma.studentMission.update({
    where: { id: existingMission.id },
    data: {
      status: "EN_PROGRESO",
      progress: 0,
      completedAt: null,
      evidence: null,
      metadata: metadata.value,
      verifiedBy: null,
      verifiedAt: null,
      reviewComment: null
    }
  })

  return NextResponse.json({ studentMission })
}

// Verificación automática por regla académica. Sin autoVerify no hay mensaje.
async function runAutoVerification(
  mission: Mission,
  userId: string,
  metadata: string | null
): Promise<Resolved<string | null>> {
  if (!mission.autoVerify || !mission.verificationKey) return { value: null }

  const verification = await verifyMission(mission, userId, metadata)
  if (!verification.passed) {
    return {
      error: NextResponse.json(
        {
          error: "Tu misión aún no cumple la condición de verificación automática.",
          message: verification.message,
          progress: verification.progress
        },
        { status: 400 }
      ),
    }
  }

  return { value: verification.message }
}

function buildCompletionEvidence(
  mission: Mission,
  submittedEvidence: string | undefined,
  verificationMessage: string | null
): string | null {
  if (!mission.autoVerify) return submittedEvidence ?? null
  return verificationMessage
    ? `Cumplimiento registrado automáticamente — ${verificationMessage}`
    : "Cumplimiento registrado automáticamente"
}

function persistCompletion(
  userId: string,
  mission: Mission,
  existingMission: StudentMission,
  evidence: string | null
): Promise<StudentMission> {
  return prisma.$transaction(async (transaction) => {
    const completedMission = await transaction.studentMission.update({
      where: { id: existingMission.id },
      data: {
        status: mission.autoVerify ? "COMPLETADA" : "EN_REVISION",
        progress: 100,
        completedAt: new Date(),
        evidence
      }
    })

    if (mission.autoVerify) {
      await transaction.point.create({
        data: {
          userId,
          amount: mission.pointsReward,
          source: "MISION_COMPLETADA",
          description: `Misión completada: ${mission.title}`
        }
      })
    }

    await transaction.notification.create({
      data: {
        userId,
        title: mission.autoVerify ? "Misión completada" : "Misión enviada a revisión",
        message: mission.autoVerify
          ? `Completaste «${mission.title}» y ganaste ${mission.pointsReward} puntos.`
          : `Tu evidencia para «${mission.title}» será revisada por un docente.`,
        type: mission.autoVerify ? "LOGRO_OBTENIDO" : "INFO",
        link: "/misiones"
      }
    })

    return completedMission
  })
}

async function completeMission(
  userId: string,
  mission: Mission,
  existingMission: StudentMission,
  evidence: unknown
): Promise<NextResponse> {
  if (existingMission.status !== "EN_PROGRESO") {
    return NextResponse.json(
      { error: "No puedes completar esta misión" },
      { status: 400 }
    )
  }

  const submittedEvidence =
    typeof evidence === "string" ? evidence.trim() : existingMission.evidence?.trim()
  if (!mission.autoVerify && !submittedEvidence) {
    return NextResponse.json(
      { error: "Debes adjuntar una evidencia antes de enviar la misión" },
      { status: 400 }
    )
  }

  const verification = await runAutoVerification(mission, userId, existingMission.metadata)
  if ("error" in verification) return verification.error

  const studentMission = await persistCompletion(
    userId,
    mission,
    existingMission,
    buildCompletionEvidence(mission, submittedEvidence, verification.value)
  )

  return NextResponse.json({ studentMission })
}

// POST: Aceptar/ejecutar una misión
export async function POST(request: Request) {
  try {
    const session = await requireStudentSession()
    if ("error" in session) return session.error

    const { userId } = session
    const body = await request.json()
    const { missionId, action, evidence } = body

    const context = await loadMissionContext(userId, missionId)
    if ("error" in context) return context.error

    const { mission, existingMission } = context.value

    if (action === "accept") {
      // Aceptar la misión
      if (existingMission) {
        return NextResponse.json(
          { error: "Ya tienes esta misión asignada" },
          { status: 400 }
        )
      }
      return acceptMission(userId, mission)
    }

    if (action === "start") {
      return startMission(userId, mission, existingMission)
    }

    if (action === "complete") {
      if (!existingMission) {
        return NextResponse.json(
          { error: "No puedes completar esta misión" },
          { status: 400 }
        )
      }
      return completeMission(userId, mission, existingMission, evidence)
    }

    return NextResponse.json(
      { error: "Acción no válida" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Error processing mission:", error)
    const response = devError("Error interno del servidor", error)
    if (response) return response
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// Captura la línea base (ej. promedio al inicio del período) para reglas de verificación automática
async function buildStartMetadata(mission: { verificationKey: string | null }, userId: string): Promise<string | null> {
  if (mission.verificationKey !== "MEJORAR_PROMEDIO") return null

  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      enrollments: { include: { course: true } },
      academicHistory: true,
    },
  })

  if (!profile) return null

  const initialAverage = getAverageGrade(profile.academicHistory, profile.enrollments, profile.averageGrade)
  return JSON.stringify({ initialAverage })
}
