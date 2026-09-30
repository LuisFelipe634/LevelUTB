export interface MissionResponseDTO {
  id: string
  title: string
  description: string
  type: string
  points: number
  autoVerify: boolean
  requiredLevel: number | null
  startDate: string | null
  endDate: string | null
  course: {
    id: string
    name: string
    code: string
  } | null
  studentMissionId: string | null
  status: string
  progress: number
  completedAt: string | null
  evidence: string | null
  reviewComment: string | null
}

export interface MissionsStatsDTO {
  total: number
  pending: number
  inProgress: number
  completed: number
  totalPointsEarned: number
}

export interface GetMissionsResponseDTO {
  missions: MissionResponseDTO[]
  stats: MissionsStatsDTO
}

export interface AcceptMissionRequestDTO {
  missionId: string
  action: "accept"
}

export interface StartMissionRequestDTO {
  missionId: string
  action: "start"
}

export interface CompleteMissionRequestDTO {
  missionId: string
  action: "complete"
  evidence?: string
}

export type MissionActionRequestDTO = AcceptMissionRequestDTO | StartMissionRequestDTO | CompleteMissionRequestDTO

export interface MissionActionResponseDTO {
  studentMission: {
    id: string
    studentId: string
    missionId: string
    status: string
    progress: number
    completedAt?: string
    evidence?: string | null
    metadata?: string | null
  }
}

export interface ErrorResponseDTO {
  error: string
}

export function toMissionResponseDTO(mission: MissionResponseDTO): MissionResponseDTO {
  return mission
}

export function toGetMissionsResponseDTO(
  missions: MissionResponseDTO[],
  stats: MissionsStatsDTO
): GetMissionsResponseDTO {
  return { missions, stats }
}