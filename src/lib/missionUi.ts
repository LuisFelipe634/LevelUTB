export type MissionNoticeKind = "pending" | "error"

export type MissionNotice = {
  kind: MissionNoticeKind
  title: string
  detail: string
  progress?: number
  missionId?: string
}

type ErrorPayload = {
  error?: unknown
  message?: unknown
  progress?: unknown
}

/**
 * Convierte la respuesta 400 de POST /api/missions en un aviso normal.
 * Si el backend envía `message` + `progress` es una misión auto-verificada
 * que aún no cumple la condición (no es un error técnico).
 */
export function toMissionNotice(payload: ErrorPayload, missionId?: string): MissionNotice {
  const progress =
    typeof payload.progress === "number" && Number.isFinite(payload.progress)
      ? Math.max(0, Math.min(100, Math.round(payload.progress)))
      : undefined
  const message = typeof payload.message === "string" ? payload.message.trim() : ""
  const errorText = typeof payload.error === "string" ? payload.error.trim() : ""

  if (message && progress !== undefined) {
    return {
      kind: "pending",
      title: "Aún no puedes completar esta misión",
      detail: message,
      progress,
      missionId,
    }
  }

  return {
    kind: "error",
    title: "No se pudo procesar la misión",
    detail: errorText || message || "Inténtalo de nuevo en un momento.",
    progress,
    missionId,
  }
}
