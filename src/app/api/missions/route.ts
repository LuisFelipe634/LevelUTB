import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getGetMissionsUseCase } from "@/application/missions/missionFactory"
import { getAcceptMissionUseCase } from "@/application/missions/missionFactory"
import { getStartMissionUseCase } from "@/application/missions/missionFactory"
import { getCompleteMissionUseCase } from "@/application/missions/missionFactory"
import { getVerifyMissionUseCase } from "@/application/missions/missionFactory"
import { getAwardPointsUseCase } from "@/application/missions/missionFactory"
import { getCreateNotificationUseCase } from "@/application/missions/missionFactory"
import { buildStartMetadata } from "@/application/missions/missionFactory"

type StudentSession = { userId: string } | { error: NextResponse }

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

    // Obtener perfil del estudiante para el nivel
    const { prisma } = await import("@/lib/prisma")
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { level: true },
    })

    if (!studentProfile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
    }

    const getMissionsUseCase = getGetMissionsUseCase()
    const result = await getMissionsUseCase.execute(userId, studentProfile.level)

    return NextResponse.json({
      missions: result.missions,
      stats: result.stats,
    })
  } catch (error) {
    console.error("Error fetching missions:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

async function loadMissionContext(
  userId: string,
  missionId: unknown
): Promise<{ value: { mission: { id: string; isActive: boolean; requiredLevel: number | null; autoVerify: boolean; verificationKey: string | null; verificationValue: string | null; title: string; pointsReward: number } } & { existingMission: { id: string; status: string; metadata: string | null; evidence: string | null } | null } } | { error: NextResponse }> {
  if (!missionId) {
    return {
      error: NextResponse.json({ error: "ID de misión requerido" }, { status: 400 })
    }
  }

  const { prisma } = await import("@/lib/prisma")

  const mission = await prisma.mission.findUnique({ where: { id: missionId as string } })
  if (!mission || !mission.isActive) {
    return {
      error: NextResponse.json(
        { error: "Misión no encontrada o inactiva" },
        { status: 404 }
      ),
    }
  }

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

  const existingMission = await prisma.studentMission.findUnique({
    where: {
      studentId_missionId: {
        studentId: userId,
        missionId: mission.id
      }
    }
  })

  return {
    value: {
      mission: {
        id: mission.id,
        isActive: mission.isActive,
        requiredLevel: mission.requiredLevel,
        autoVerify: mission.autoVerify,
        verificationKey: mission.verificationKey,
        verificationValue: mission.verificationValue,
        title: mission.title,
        pointsReward: mission.pointsReward,
      },
      existingMission: existingMission ? {
        id: existingMission.id,
        status: existingMission.status,
        metadata: existingMission.metadata,
        evidence: existingMission.evidence,
      } : null
    }
  }
}

async function acceptMission(userId: string, mission: { id: string; title: string }): Promise<NextResponse> {
  const acceptMissionUseCase = getAcceptMissionUseCase()
  const createNotificationUseCase = getCreateNotificationUseCase()

  const result = await acceptMissionUseCase.execute(userId, mission.id)

  await createNotificationUseCase.execute(
    userId,
    "Misión aceptada",
    `Has aceptado la misión: ${mission.title}`,
    "MISION_DISPONIBLE",
    "/misiones"
  )

  return NextResponse.json({ studentMission: result.studentMission })
}

async function startMission(
  userId: string,
  mission: { id: string; verificationKey: string | null },
  existingMission: { id: string; status: string } | null
): Promise<NextResponse> {
  if (!existingMission || !["PENDIENTE", "RECHAZADA"].includes(existingMission.status)) {
    return NextResponse.json(
      { error: "No puedes iniciar esta misión" },
      { status: 400 }
    )
  }

  const metadata = await buildStartMetadataSafe(mission, userId)
  if ("error" in metadata) return metadata.error

  const startMissionUseCase = getStartMissionUseCase()
  const result = await startMissionUseCase.execute(userId, mission.id, metadata.value)

  return NextResponse.json({ studentMission: result.studentMission })
}

async function buildStartMetadataSafe(
  mission: { verificationKey: string | null },
  userId: string
): Promise<{ value: string | null } | { error: NextResponse }> {
  try {
    return { value: await buildStartMetadata(mission, userId) }
  } catch (metaError) {
    console.error("Error en buildStartMetadata:", metaError)
    const response = devError("Error al preparar la misión", metaError)
    return response ? { error: response } : { value: null }
  }
}

async function runAutoVerification(
  mission: { autoVerify: boolean; verificationKey: string | null; verificationValue: string | null },
  userId: string,
  metadata: string | null
): Promise<{ value: string | null } | { error: NextResponse }> {
  if (!mission.autoVerify || !mission.verificationKey) return { value: null }

  const verifyMissionUseCase = getVerifyMissionUseCase()
  const verification = await verifyMissionUseCase.execute(mission, userId, metadata)
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
  mission: { autoVerify: boolean },
  submittedEvidence: string | undefined,
  verificationMessage: string | null
): string | null {
  if (!mission.autoVerify) return submittedEvidence ?? null
  return verificationMessage
    ? `Cumplimiento registrado automáticamente — ${verificationMessage}`
    : "Cumplimiento registrado automáticamente"
}

async function completeMission(
  userId: string,
  mission: { id: string; autoVerify: boolean; verificationKey: string | null; verificationValue: string | null; title: string; pointsReward: number },
  existingMission: { id: string; status: string; metadata: string | null; evidence: string | null },
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

  const completeMissionUseCase = getCompleteMissionUseCase()
  const result = await completeMissionUseCase.execute(
    userId,
    mission.id,
    buildCompletionEvidence(mission, submittedEvidence, verification.value),
    verification.value ? { passed: true, progress: 100, message: verification.value } : null
  )

  if (mission.autoVerify) {
    const awardPointsUseCase = getAwardPointsUseCase()
    await awardPointsUseCase.execute(
      userId,
      mission.pointsReward,
      "MISION_COMPLETADA",
      `Misión completada: ${mission.title}`
    )
  }

  const createNotificationUseCase = getCreateNotificationUseCase()
  await createNotificationUseCase.execute(
    userId,
    mission.autoVerify ? "Misión completada" : "Misión enviada a revisión",
    mission.autoVerify
      ? `Completaste «${mission.title}» y ganaste ${mission.pointsReward} puntos.`
      : `Tu evidencia para «${mission.title}» será revisada por un docente.`,
    mission.autoVerify ? "LOGRO_OBTENIDO" : "INFO",
    "/misiones"
  )

  return NextResponse.json({ studentMission: result.studentMission })
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
      return completeMission(userId, { ...mission, verificationValue: mission.verificationValue }, existingMission, evidence)
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