import type { BadgeSource } from "@/lib/badgeSource"
import { HttpBadgeSource } from "@/lib/httpBadgeSource"

const STU_NOT_FOUND_PREFIX = "EXTERNAL_BADGES_STUDENT_NOT_FOUND:"

export function getBadgeSource(): BadgeSource {
  return new HttpBadgeSource()
}

// El estudiante no existe en la fuente externa: es un dato faltante, no una
// caida del servicio, asi que no se degrada (degradar devolveria un catalogo
// local que en realidad no es de la universidad).
export function isExternalStudentNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(STU_NOT_FOUND_PREFIX)
}
