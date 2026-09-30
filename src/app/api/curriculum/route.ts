import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCreditLimit, getCurrentSemester } from "@/lib/academic"
import { getAcademicSource } from "@/lib/getAcademicSource"

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() < 6 ? 1 : 2}`
}

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  if (session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Información exclusiva para estudiantes" }, { status: 403 })
  }

  try {
    const source = getAcademicSource()
    let profile
    try {
      const data = await source.getStudentAcademicData(session.user.id)
      profile = data.profile
    } catch (e) {
      if (e instanceof Error && e.message === "EXTERNAL_API_UNAVAILABLE") {
        return NextResponse.json({ error: "Fuente académica externa no disponible" }, { status: 503 })
      }
      throw e
    }

    if (!profile) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

    const period = currentPeriod()
    const currentSemester = getCurrentSemester(profile.enrollments, profile.currentSemester, period)
    // Precedencia determinista cuando un curso tiene varias inscripciones:
    // APROBADO > CURSANDO del periodo vigente > CURSANDO de otro periodo > REPROBADO > resto
    const rankEnrollment = (status: string, semesterCode: string) => {
      if (status === "APROBADO") return 0
      if (status === "CURSANDO" && semesterCode === period) return 1
      if (status === "CURSANDO") return 2
      if (status === "REPROBADO") return 3
      return 4
    }
    const enrollmentByCourse = new Map<string, (typeof profile.enrollments)[number]>()
    for (const enrollment of profile.enrollments) {
      const current = enrollmentByCourse.get(enrollment.courseId)
      if (!current || rankEnrollment(enrollment.status, enrollment.semesterCode) < rankEnrollment(current.status, current.semesterCode)) {
        enrollmentByCourse.set(enrollment.courseId, enrollment)
      }
    }
    const approvedIds = new Set(profile.enrollments.filter((enrollment) => enrollment.status === "APROBADO").map((enrollment) => enrollment.courseId))

    const creditLimit = getCreditLimit(profile.averageGrade)

    // Promedio ponderado por créditos (mismo método que averageGrade del perfil)
    const gradesBySemester = new Map<number, { weightedSum: number; credits: number }>()
    for (const enrollment of profile.enrollments) {
      if (enrollment.status === "APROBADO" && enrollment.grade != null && enrollment.course.semester && enrollment.course.credits > 0) {
        const sem = enrollment.course.semester.number
        const entry = gradesBySemester.get(sem) || { weightedSum: 0, credits: 0 }
        entry.weightedSum += enrollment.grade * enrollment.course.credits
        entry.credits += enrollment.course.credits
        gradesBySemester.set(sem, entry)
      }
    }

    const semesters = profile.program.semesters.map((semester) => {
      const entry = gradesBySemester.get(semester.number)
      const semesterAverage = entry && entry.credits > 0 ? Math.round((entry.weightedSum / entry.credits) * 100) / 100 : null
      const courses = semester.courses.map((course) => {
        const enrollment = enrollmentByCourse.get(course.id)
        let status: string
        if (enrollment?.status === "APROBADO") status = "completed"
        else if (enrollment?.status === "CURSANDO") status = "in_progress"
        else if (enrollment?.status === "REPROBADO") status = "available"
        else status = "blocked"
        const prerequisitesMet = course.prerequisites.every(({ prerequisite }) => approvedIds.has(prerequisite.id))
        const missingPrerequisites = course.prerequisites
          .filter(({ prerequisite }) => !approvedIds.has(prerequisite.id))
          .map(({ prerequisite }) => `${prerequisite.code} - ${prerequisite.name}`)
        return { id: course.id, code: course.code, name: course.name, credits: course.credits, status: status === "blocked" && prerequisitesMet ? "available" : status, grade: enrollment?.grade ?? null, source: enrollment?.source ?? null, inCurrentPeriod: enrollment ? enrollment.semesterCode === period : false, prerequisitesMet, missingPrerequisites }
      })
      const completedCredits = courses
        .filter((course) => course.status === "completed")
        .reduce((total, course) => total + course.credits, 0)
      const inProgressCredits = courses
        .filter((course) => course.status === "in_progress" && course.inCurrentPeriod)
        .reduce((total, course) => total + course.credits, 0)

      return {
        semester: semester.number,
        name: semester.name,
        semesterAverage,
        completedCredits,
        inProgressCredits,
        courses
      }
    })

    const totalSemesters = profile.program.semesters.length || 10
    const nextSemester = Math.min(currentSemester + 1, totalSemesters)
    const nextSemesterAvailableCourses = semesters
      .filter((s) => s.semester === nextSemester)
      .flatMap((s) => s.courses.filter((c) => c.status === "available" && c.prerequisitesMet))
      .map((c) => ({ id: c.id, code: c.code, name: c.name, credits: c.credits }))

    return NextResponse.json({ program: { name: profile.program.name, code: profile.program.code, version: profile.program.version }, period, currentSemester, nextSemester, nextSemesterAvailableCourses, creditLimit, semesters })
  } catch (error) {
    console.error("Error fetching curriculum:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

