import { prisma } from "@/lib/prisma"
import { getCreditLimit, getCurrentSemester } from "@/lib/academic"

type RecommendationItem = {
  type: "CURSO_SUGERIDO" | "ALERTA_ATRASO" | "ELECTIVA_RECOMENDADA" | "MEJORA_PROMEDIO" | "RUTA_ACademica" | "RELLENAR_CREDITOS"
  title: string
  description: string
  priority: number
}

type CourseStatus = {
  approved: Set<string>
  failed: Set<string>
  inProgress: Set<string>
}

type UnlockedCourse = {
  course: Awaited<ReturnType<typeof prisma.course.findMany>>[0]
  unlocksCount: number
}

async function fetchStudentData(studentProfileId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: {
      program: true,
      enrollments: {
        include: {
          course: {
            include: {
              semester: true,
              prerequisites: { include: { prerequisite: true } },
              requiredBy: { include: { course: true } },
            },
          },
        },
      },
      academicHistory: true,
    },
  })

  const allCourses = await prisma.course.findMany({
    where: { programId: profile!.programId, isActive: true },
    include: {
      semester: true,
      prerequisites: { include: { prerequisite: true } },
      requiredBy: { include: { course: true } },
    },
  })

  return { profile: profile!, allCourses }
}

function getCourseIdFromHistory(record: typeof profile.academicHistory[0], allCourses: Awaited<ReturnType<typeof fetchStudentData>>["allCourses"]): string | null {
  return allCourses.find((c) => c.code === record.courseCode)?.id ?? null
}

function buildCourseStatus(profile: Awaited<ReturnType<typeof fetchStudentData>>["profile"], allCourses: Awaited<ReturnType<typeof fetchStudentData>>["allCourses"]): CourseStatus {
  const approved = new Set<string>()
  const failed = new Set<string>()
  const inProgress = new Set<string>()

  for (const enrollment of profile.enrollments) {
    switch (enrollment.status) {
      case "APROBADO":
        approved.add(enrollment.courseId)
        break
      case "REPROBADO":
        failed.add(enrollment.courseId)
        break
      case "CURSANDO":
      case "INSCRITO":
        inProgress.add(enrollment.courseId)
        break
    }
  }

  for (const record of profile.academicHistory) {
    const courseId = getCourseIdFromHistory(record, allCourses)
    if (!courseId) continue

    if (record.status === "APROBADO") {
      approved.add(courseId)
    } else if (record.status === "REPROBADO" && !approved.has(courseId)) {
      failed.add(courseId)
    }
  }

  return { approved, failed, inProgress }
}

function findUnlockedCourses(allCourses: Awaited<ReturnType<typeof fetchStudentData>>["allCourses"], status: CourseStatus, currentSemester: number) {
  return allCourses.filter((course) => {
    if (status.approved.has(course.id)) return false
    if (status.inProgress.has(course.id)) return false

    if (course.prerequisites.length === 0) {
      return (course.semester?.number ?? 0) <= currentSemester + 1
    }

    return course.prerequisites.every((prereq) => status.approved.has(prereq.prerequisiteId))
  })
}

function findBottleneckCourses(unlockedCourses: ReturnType<typeof findUnlockedCourses>): UnlockedCourse[] {
  return unlockedCourses
    .map((course) => ({ course, unlocksCount: course.requiredBy.length }))
    .sort((a, b) => b.unlocksCount - a.unlocksCount)
}

function addBottleneckRecommendations(bottleneckCourses: UnlockedCourse[], recommendations: RecommendationItem[]) {
  for (const item of bottleneckCourses.slice(0, 2)) {
    if (item.unlocksCount > 0) {
      const pluralSuffix = item.unlocksCount > 1 ? "s" : ""
      recommendations.push({
        type: "CURSO_SUGERIDO",
        title: `📚 Prioriza: ${item.course.name}`,
        description: `Esta materia desbloquea ${item.unlocksCount} curso${pluralSuffix} más. Tomarla el próximo semestre acelera tu avance en la carrera.`,
        priority: 1,
      })
    }
  }
}

function addFailedCourseRecommendations(failedCourseIds: Set<string>, allCourses: Awaited<ReturnType<typeof fetchStudentData>>["allCourses"], approvedCourseIds: Set<string>, recommendations: RecommendationItem[]) {
  for (const courseId of failedCourseIds) {
    if (approvedCourseIds.has(courseId)) continue

    const course = allCourses.find((c) => c.id === courseId)
    if (!course) continue

    const prereqCount = course.requiredBy.length
    const prereqText = prereqCount > 0
      ? `, ya que es prerrequisito de ${prereqCount} curso${prereqCount > 1 ? "s" : ""}`
      : ""

    recommendations.push({
      type: "ALERTA_ATRASO",
      title: `⚠️ Repetir: ${course.name}`,
      description: `Reprobaste esta materia anteriormente. Te recomendamos inscribirla de nuevo lo antes posible${prereqText}.`,
      priority: 1,
    })
  }
}

function addElectiveRecommendations(unlockedCourses: ReturnType<typeof findUnlockedCourses>, recommendations: RecommendationItem[]) {
  const electivas = unlockedCourses.filter(
    (c) => c.type === "ELECTIVA" || c.type === "LIBRE_ELECCION"
  )
  if (electivas.length > 0) {
    const names = electivas.slice(0, 3).map((c) => c.name).join(", ")
    recommendations.push({
      type: "ELECTIVA_RECOMENDADA",
      title: "💡 Electivas disponibles",
      description: `Puedes inscribir las siguientes electivas: ${names}. Estas suman créditos valiosos para tu avance.`,
      priority: 3,
    })
  }
}

function addNextSemesterRecommendations(unlockedCourses: ReturnType<typeof findUnlockedCourses>, bottleneckCourses: UnlockedCourse[], failedCourseIds: Set<string>, recommendations: RecommendationItem[]) {
  const nextSemesterCourses = unlockedCourses.filter(
    (c) =>
      c.type === "OBLIGATORIO" &&
      !bottleneckCourses.slice(0, 2).some((b) => b.course.id === c.id) &&
      !failedCourseIds.has(c.id)
  )

  if (nextSemesterCourses.length > 0) {
    const names = nextSemesterCourses.slice(0, 4).map((c) => c.name).join(", ")
    recommendations.push({
      type: "RUTA_ACademica",
      title: "🗺️ Materias sugeridas para el próximo semestre",
      description: `Basado en tu progreso, puedes inscribir: ${names}.`,
      priority: 2,
    })
  }
}

function addLowGpaRecommendation(profile: Awaited<ReturnType<typeof fetchStudentData>>["profile"], recommendations: RecommendationItem[]) {
  if (profile.averageGrade > 0 && profile.averageGrade < 3.5) {
    recommendations.push({
      type: "MEJORA_PROMEDIO",
      title: "📉 Tu promedio necesita atención",
      description: `Tu promedio actual es ${profile.averageGrade.toFixed(1)}. Considera reducir la carga académica el próximo semestre y enfocarte en mejorar tus calificaciones.`,
      priority: 1,
    })
  }
}

function addCreditFillRecommendation(
  profile: Awaited<ReturnType<typeof fetchStudentData>>["profile"],
  unlockedCourses: ReturnType<typeof findUnlockedCourses>,
  recommendations: RecommendationItem[]
) {
  const now = new Date()
  const period = `${now.getFullYear()}-${now.getMonth() < 6 ? 1 : 2}`
  const currentSemester = getCurrentSemester(profile.enrollments, profile.currentSemester, period)
  const creditLimit = getCreditLimit(profile.averageGrade)
  let selectedCredits = 0

  for (const enrollment of profile.enrollments) {
    if ((enrollment.status === "CURSANDO" || enrollment.status === "INSCRITO") && enrollment.semesterCode === period && enrollment.course.semester?.number === currentSemester) {
      selectedCredits += enrollment.course.credits
    }
  }

  const remainingCredits = creditLimit - selectedCredits

  if (remainingCredits > 0 && profile.averageGrade >= 3.5) {
    const nextSemesterNumber = currentSemester + 1
    const nextSemesterCourses = unlockedCourses.filter(
      (c) => c.semester?.number === nextSemesterNumber && c.credits <= remainingCredits
    )
    const bestFitCourse = nextSemesterCourses.sort((a, b) => b.credits - a.credits)[0]

    if (bestFitCourse) {
      const creditBonusText = profile.averageGrade >= 4.0 ? " Tu promedio ≥ 4.0 te da derecho a 20 créditos." : ""
      recommendations.push({
        type: "RELLENAR_CREDITOS",
        title: `💰 Rellena tu semestre con ${remainingCredits} créditos disponibles`,
        description: `Te quedan ${remainingCredits} créditos disponibles este semestre. Puedes reemplazar una materia por "${bestFitCourse.name}" (${bestFitCourse.credits} créditos) para aprovechar tu cupo y terminar la carrera más rápido.${creditBonusText}`,
        priority: 2,
      })
    }
  }
}

function addFallbackRecommendation(unlockedCourses: ReturnType<typeof findUnlockedCourses>, recommendations: RecommendationItem[]) {
  if (recommendations.length === 0 && unlockedCourses.length > 0) {
    const names = unlockedCourses.slice(0, 4).map((c) => c.name).join(", ")
    recommendations.push({
      type: "CURSO_SUGERIDO",
      title: "📚 Materias disponibles",
      description: `Tienes ${unlockedCourses.length} materias desbloqueadas. Algunas opciones: ${names}.`,
      priority: 2,
    })
  }
}

async function saveRecommendations(studentProfileId: string, recommendations: RecommendationItem[]) {
  await prisma.recommendation.deleteMany({
    where: { studentId: studentProfileId, isRead: false },
  })

  for (const rec of recommendations) {
    await prisma.recommendation.create({
      data: {
        studentId: studentProfileId,
        type: rec.type,
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        isRead: false,
      },
    })
  }
}

function generateAllRecommendations(
  profile: Awaited<ReturnType<typeof fetchStudentData>>["profile"],
  allCourses: Awaited<ReturnType<typeof fetchStudentData>>["allCourses"],
  status: CourseStatus,
  unlockedCourses: ReturnType<typeof findUnlockedCourses>,
  bottleneckCourses: ReturnType<typeof findBottleneckCourses>
): RecommendationItem[] {
  const recommendations: RecommendationItem[] = []

  addBottleneckRecommendations(bottleneckCourses, recommendations)
  addFailedCourseRecommendations(status.failed, allCourses, status.approved, recommendations)
  addElectiveRecommendations(unlockedCourses, recommendations)
  addNextSemesterRecommendations(unlockedCourses, bottleneckCourses, status.failed, recommendations)
  addLowGpaRecommendation(profile, recommendations)
  addCreditFillRecommendation(profile, unlockedCourses, recommendations)
  addFallbackRecommendation(unlockedCourses, recommendations)

  return recommendations
}

/**
 * Generates smart recommendations for a student based on:
 * - Which prerequisites they've completed (unlocked courses)
 * - Failed courses they need to retake
 * - Bottleneck courses that unlock many others
 * - Low GPA warnings
 * - Remaining credit slots to maximize semester load
 */
export async function generateRecommendations(studentProfileId: string): Promise<void> {
  const { profile, allCourses } = await fetchStudentData(studentProfileId)
  if (!profile) return

  const status = buildCourseStatus(profile, allCourses)
  const unlockedCourses = findUnlockedCourses(allCourses, status, profile.currentSemester)
  const bottleneckCourses = findBottleneckCourses(unlockedCourses)

  const recommendations = generateAllRecommendations(profile, allCourses, status, unlockedCourses, bottleneckCourses)

  await saveRecommendations(studentProfileId, recommendations)
}