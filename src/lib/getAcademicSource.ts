import type { AcademicSource } from "@/lib/academicSource"
import { HttpAcademicSource } from "@/lib/httpAcademicSource"

export function getAcademicSource(): AcademicSource {
  return new HttpAcademicSource()
}

export function isExternalAcademicEnabled(): boolean {
  return true
}
