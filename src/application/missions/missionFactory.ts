import { PrismaMissionServiceRepository } from "@/infrastructure/missions/repositories/prismaMissionRepository"
import type { MissionServiceRepository } from "@/domain/missions/repositories/missionRepository"
import { GetMissionsUseCase, AcceptMissionUseCase, StartMissionUseCase, CompleteMissionUseCase, VerifyMissionUseCase, AwardPointsUseCase, CreateNotificationUseCase } from "@/application/missions/use-cases/missionUseCases"

let missionServiceRepository: MissionServiceRepository | null = null

function getMissionServiceRepository(): MissionServiceRepository {
  if (!missionServiceRepository) {
    missionServiceRepository = new PrismaMissionServiceRepository()
  }
  return missionServiceRepository
}

export function getGetMissionsUseCase(): GetMissionsUseCase {
  return new GetMissionsUseCase(getMissionServiceRepository())
}

export function getAcceptMissionUseCase(): AcceptMissionUseCase {
  return new AcceptMissionUseCase(getMissionServiceRepository())
}

export function getStartMissionUseCase(): StartMissionUseCase {
  return new StartMissionUseCase(getMissionServiceRepository())
}

export function getCompleteMissionUseCase(): CompleteMissionUseCase {
  return new CompleteMissionUseCase(getMissionServiceRepository())
}

export function getVerifyMissionUseCase(): VerifyMissionUseCase {
  return new VerifyMissionUseCase(getMissionServiceRepository())
}

export function getAwardPointsUseCase(): AwardPointsUseCase {
  return new AwardPointsUseCase(getMissionServiceRepository())
}

export function getCreateNotificationUseCase(): CreateNotificationUseCase {
  return new CreateNotificationUseCase(getMissionServiceRepository())
}

export async function buildStartMetadata(mission: { verificationKey: string | null }, userId: string): Promise<string | null> {
  if (mission.verificationKey !== "MEJORAR_PROMEDIO") return null

  const { prisma } = await import("@/lib/prisma")
  const { getAverageGrade } = await import("@/lib/academic")

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