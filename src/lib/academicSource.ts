// Interface para fuente académica desacoplada (Prisma vs HTTP externa)

export type AcademicEnrollment = {
  courseId: string
  course: {
    id: string
    code: string
    name: string
    credits: number
    type?: string | null
    semester?: { number: number }
  }
  status: string
  grade: number | null
  source: string | null
  semesterCode: string
}

export type AcademicProgram = {
  id: string
  code: string
  name: string
  version: string
  semesters: Array<{
    id: string
    number: number
    name: string | null
    courses: Array<{
      id: string
      code: string
      name: string
      credits: number
      prerequisites: Array<{ prerequisite: { id: string; code: string; name: string } }>
    }>
  }>
}

export type AcademicStudentData = {
  // null si estudiante no encontrado
  profile: {
    id: string
    userId: string
    studentCode: string
    programId: string
    currentSemester: number
    admissionYear: number
    totalCredits: number
    averageGrade: number
    level: number
    program: AcademicProgram
    enrollments: AcademicEnrollment[]
  } | null
  // metadata para audit
  source: "prisma" | "http"
}

export interface AcademicSource {
  getStudentAcademicData(userId: string): Promise<AcademicStudentData>
}
