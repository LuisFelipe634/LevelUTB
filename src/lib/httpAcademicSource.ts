import type { AcademicSource, AcademicStudentData } from "@/lib/academicSource"
import { prisma } from "@/lib/prisma"

function getBaseUrl(): string {
  return (process.env.UNIVERSITY_API_URL || "http://localhost:3001").replace(/\/$/, "")
}
function getApiKey(): string | undefined {
  return process.env.UNIVERSITY_API_KEY || process.env.API_KEY || undefined
}

async function fetchJson(path: string, timeoutMs = 5000): Promise<unknown> {
  const base = getBaseUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const key = getApiKey()
    if (key) headers["x-api-key"] = key
    const res = await fetch(`${base}${path}`, { signal: controller.signal, cache: "no-store", headers })
    if (!res.ok) {
      console.warn(`[httpAcademicSource] ${path} -> ${res.status}`)
      return null
    }
    return (await res.json()) as unknown
  } catch (e) {
    console.warn(`[httpAcademicSource] fetch ${path} failed:`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

type ExternalEnrollment = {
  courseCode: string
  courseName: string
  credits: number
  semester: number
  status: string
  grade: number | null
  source: string
  semesterCode: string
}

type ExternalCourse = {
  code: string
  name: string
  credits: number
  semester: number
  type: string
  prerequisites: string[]
}

export class HttpAcademicSource implements AcademicSource {
  async getStudentAcademicData(userId: string): Promise<AcademicStudentData> {
    // 1. Resolver studentCode desde BD local (identidad sigue en Prisma, solo académico va a HTTP)
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { studentCode: true, programId: true, currentSemester: true, admissionYear: true, totalCredits: true, averageGrade: true, level: true, id: true, userId: true },
    })
    if (!studentProfile) return { profile: null, source: "http" }

    const studentCode = studentProfile.studentCode

    // 2. Fetch enrollments + program/courses en paralelo
    const [enrollmentsRaw, programRaw, coursesRaw] = await Promise.all([
      fetchJson(`/academic/students/${encodeURIComponent(studentCode)}/enrollments`),
      fetchJson(`/academic/programs/ISCO`),
      fetchJson(`/academic/programs/ISCO/courses`),
    ])

    if (enrollmentsRaw === null && programRaw === null) {
      // Backend caído -> señal para que ruta decida 503 o fallback
      // Retornamos null profile para que caller maneje error
      console.error("[httpAcademicSource] external API no disponible (null)")
      // Lanzamos error controlado que ruta capturará como 503
      throw new Error("EXTERNAL_API_UNAVAILABLE")
    }

    const enrollments = (Array.isArray(enrollmentsRaw) ? (enrollmentsRaw as ExternalEnrollment[]) : []) as ExternalEnrollment[]
    const program = programRaw as { code: string; name: string; totalCredits: number; totalSemesters: number; version: string; semesters: unknown } | null
    const courses = (Array.isArray(coursesRaw) ? (coursesRaw as ExternalCourse[]) : []) as ExternalCourse[]

    // Reconstruir semesters con courses agrupados, inyectando IDs sintéticos compatibles con lógica de curriculum
    // IDs = code (suficiente para comparar courseId en lógica de prerequisites)
    const semestersMap = new Map<number, { id: string; number: number; name: string | null; courses: Array<{ id: string; code: string; name: string; credits: number; prerequisites: Array<{ prerequisite: { id: string; code: string; name: string } }> }> }>()
    const courseByCode = new Map<string, ExternalCourse>()
    for (const c of courses) courseByCode.set(c.code, c)

    for (const c of courses) {
      if (!semestersMap.has(c.semester)) {
        semestersMap.set(c.semester, { id: `sem-${c.semester}`, number: c.semester, name: `Semestre ${c.semester}`, courses: [] })
      }
      const sem = semestersMap.get(c.semester)!
      sem.courses.push({
        id: c.code, // usar code como id sintético
        code: c.code,
        name: c.name,
        credits: c.credits,
        prerequisites: c.prerequisites.map((pr) => {
          const prCourse = courseByCode.get(pr)
          return { prerequisite: { id: pr, code: pr, name: prCourse?.name ?? pr } }
        }),
      })
    }

    const sortedSemesters = Array.from(semestersMap.values()).sort((a, b) => a.number - b.number)

    // Mapear enrollments a shape AcademicEnrollment (courseId = code).
    // El tipo de curso se resuelve por join con el catalogo para que los
    // agregados por categoria (stats/malla) coincidan con Prisma.
    const academicEnrollments: import("@/lib/academicSource").AcademicEnrollment[] = enrollments.map((e) => ({
      courseId: e.courseCode,
      course: {
        id: e.courseCode,
        code: e.courseCode,
        name: e.courseName,
        credits: e.credits,
        type: courseByCode.get(e.courseCode)?.type ?? null,
        semester: { number: e.semester },
      },
      status: e.status,
      grade: e.grade,
      source: e.source,
      semesterCode: e.semesterCode,
    }))

    return {
      profile: {
        id: studentProfile.id,
        userId: studentProfile.userId,
        studentCode: studentProfile.studentCode,
        programId: studentProfile.programId,
        currentSemester: studentProfile.currentSemester,
        admissionYear: studentProfile.admissionYear,
        totalCredits: studentProfile.totalCredits,
        averageGrade: studentProfile.averageGrade,
        level: studentProfile.level,
        program: {
          id: program?.code ?? "ISCO",
          code: program?.code ?? "ISCO",
          name: program?.name ?? "Ingeniería de Sistemas",
          version: program?.version ?? "2019",
          semesters: sortedSemesters,
        },
        enrollments: academicEnrollments,
      },
      source: "http",
    }
  }
}
