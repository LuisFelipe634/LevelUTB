type EnrollmentForSemester = {
  status?: string
  semesterCode?: string
  courseId?: string
  course: { semester?: { number: number } }
}

type GradeRecord = {
  grade: number | null
  status?: string
  source?: string
  credits?: number
  course?: { credits?: number }
}

type RewardCourseEnrollment = {
  status?: string
  source?: string
  semesterCode?: string
  courseId?: string
  course: { semester?: { number: number } } & {
    id?: string
    code?: string
    name?: string
    credits?: number
  }
}

function creditsOf(record: GradeRecord): number {
  const credits = record.credits ?? record.course?.credits
  return typeof credits === "number" && credits > 0 ? credits : 1
}

function weightedAverage(grades: { grade: number; credits: number }[]): number | null {
  const totalCredits = grades.reduce((total, item) => total + item.credits, 0)
  if (totalCredits <= 0) return null
  const total = grades.reduce((sum, item) => sum + item.grade * item.credits, 0)
  return Number((total / totalCredits).toFixed(2))
}

export function getCurrentSemester(
  enrollments: EnrollmentForSemester[],
  fallback: number,
  period?: string
) {
  // Un CURSANDO duplicado de un curso ya APROBADO no debe anclar el semestre
  const approvedIds = new Set(
    enrollments
      .filter((enrollment) => enrollment.status === "APROBADO" && enrollment.courseId)
      .map((enrollment) => enrollment.courseId as string)
  )
  const activeSemesters = enrollments
    .filter((enrollment) =>
      enrollment.status === "CURSANDO" &&
      (!period || enrollment.semesterCode === period) &&
      !(enrollment.courseId && approvedIds.has(enrollment.courseId))
    )
    .map((enrollment) => enrollment.course.semester?.number)
    .filter((semester): semester is number => semester !== undefined)

  if (activeSemesters.length) return Math.max(...activeSemesters)

  const approvedSemesters = enrollments
    .filter((enrollment) => enrollment.status === "APROBADO")
    .map((enrollment) => enrollment.course.semester?.number)
    .filter((semester): semester is number => semester !== undefined)

  return approvedSemesters.length ? Math.max(...approvedSemesters) : fallback
}

export function getAverageGrade(
  academicHistory: GradeRecord[],
  enrollments: GradeRecord[],
  fallback: number
) {
  const historyGrades = academicHistory
    .filter((record) => record.status !== "PENDIENTE" && Number.isFinite(record.grade))
    .map((record) => ({ grade: record.grade as number, credits: creditsOf(record) }))

  const historyAverage = weightedAverage(historyGrades)
  if (historyAverage !== null) {
    return historyAverage
  }

  const enrollmentGrades = enrollments
    // MANUAL sin aval universitario no contamina el promedio (evita farmeo
    // vía POST /api/curriculum). Solo UNIVERSITY o APROBADO con nota real.
    .filter(
      (record) =>
        Number.isFinite(record.grade) &&
        (record.source !== "MANUAL" || record.status === "APROBADO")
    )
    .map((record) => ({ grade: record.grade as number, credits: creditsOf(record) }))

  const enrollmentAverage = weightedAverage(enrollmentGrades)
  if (enrollmentAverage !== null) {
    return enrollmentAverage
  }

  return fallback
}

export function getCreditLimit(averageGrade: number): number {
  return averageGrade >= 4.0 ? 20 : 18
}

export function filterRewardEligibleCourses(
  enrollments: RewardCourseEnrollment[],
  period?: string
) {
  const officialEnrollments = enrollments.filter((enrollment) => {
    const isOfficialStatus = enrollment.status === "CURSANDO" || enrollment.status === "INSCRITO"
    const isOfficialSource = enrollment.source === "UNIVERSITY"
    const matchesPeriod = !period || enrollment.semesterCode === period
    const hasCourseSemester = enrollment.course?.semester?.number !== undefined

    return isOfficialStatus && isOfficialSource && matchesPeriod && hasCourseSemester
  })

  return officialEnrollments.map((enrollment) => ({
    id: enrollment.courseId ?? enrollment.course?.id ?? "",
    code: enrollment.course?.code ?? "",
    name: enrollment.course?.name ?? "",
    semester: enrollment.course?.semester?.number ?? 0,
    period: enrollment.semesterCode ?? period ?? ""
  }))
}