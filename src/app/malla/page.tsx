"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle,
  Lock,
  Unlock,
  Clock,
  ChevronDown,
  ChevronRight,
  BookOpen
} from "lucide-react"

type CurriculumCourse = {
  id: string
  code: string
  name: string
  credits: number
  status: string
  source?: string | null
  inCurrentPeriod?: boolean
  grade?: number | null
  prerequisitesMet?: boolean
  missingPrerequisites?: string[]
}

type CurriculumSemester = {
  semester: number
  name?: string | null
  semesterAverage: number | null
  completedCredits?: number
  inProgressCredits?: number
  courses: CurriculumCourse[]
}

type ProgramData = {
  name: string
  code: string
  version: string
}

// Datos de ejemplo de la malla curricular
const mockCurriculum: CurriculumSemester[] = [
  {
    semester: 1,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-1-1", code: "MAT101", name: "Cálculo I", credits: 4, status: "completed" },
      { id: "mock-1-2", code: "PRO101", name: "Introducción a la Programación", credits: 3, status: "completed" },
      { id: "mock-1-3", code: "FIS101", name: "Física I", credits: 4, status: "completed" },
      { id: "mock-1-4", code: "QUI101", name: "Química General", credits: 3, status: "completed" },
      { id: "mock-1-5", code: "ING101", name: "Inglés I", credits: 2, status: "completed" }
    ]
  },
  {
    semester: 2,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-2-1", code: "MAT102", name: "Cálculo II", credits: 4, status: "completed" },
      { id: "mock-2-2", code: "PRO102", name: "Programación Orientada a Objetos", credits: 3, status: "completed" },
      { id: "mock-2-3", code: "FIS102", name: "Física II", credits: 4, status: "completed" },
      { id: "mock-2-4", code: "MAT103", name: "Álgebra Lineal", credits: 3, status: "completed" },
      { id: "mock-2-5", code: "ING102", name: "Inglés II", credits: 2, status: "completed" }
    ]
  },
  {
    semester: 3,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-3-1", code: "MAT201", name: "Cálculo III", credits: 4, status: "in_progress" },
      { id: "mock-3-2", code: "PRO201", name: "Estructuras de Datos", credits: 3, status: "in_progress" },
      { id: "mock-3-3", code: "FIS201", name: "Física III", credits: 4, status: "available" },
      { id: "mock-3-4", code: "MAT202", name: "Probabilidad y Estadística", credits: 3, status: "available" },
      { id: "mock-3-5", code: "ING201", name: "Inglés III", credits: 2, status: "available" }
    ]
  },
  {
    semester: 4,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-4-1", code: "PRO301", name: "Bases de Datos I", credits: 3, status: "blocked" },
      { id: "mock-4-2", code: "PRO302", name: "Sistemas Operativos", credits: 3, status: "blocked" },
      { id: "mock-4-3", code: "MAT301", name: "Ecuaciones Diferenciales", credits: 4, status: "blocked" },
      { id: "mock-4-4", code: "PRO303", name: "Algoritmos y Complejidad", credits: 3, status: "blocked" },
      { id: "mock-4-5", code: "GEN101", name: "Ética y Sociedad", credits: 2, status: "blocked" }
    ]
  },
  {
    semester: 5,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-5-1", code: "PRO401", name: "Ingeniería de Software", credits: 4, status: "blocked" },
      { id: "mock-5-2", code: "PRO402", name: "Redes de Computadores", credits: 3, status: "blocked" },
      { id: "mock-5-3", code: "PRO403", name: "Inteligencia Artificial", credits: 3, status: "blocked" },
      { id: "mock-5-4", code: "ELE101", name: "Electiva I", credits: 3, status: "blocked" },
      { id: "mock-5-5", code: "GEN102", name: "Emprendimiento", credits: 2, status: "blocked" }
    ]
  },
  {
    semester: 6,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-6-1", code: "PRO501", name: "Proyecto de Grado I", credits: 4, status: "blocked" },
      { id: "mock-6-2", code: "PRO502", name: "Seguridad Informática", credits: 3, status: "blocked" },
      { id: "mock-6-3", code: "ELE102", name: "Electiva II", credits: 3, status: "blocked" },
      { id: "mock-6-4", code: "ELE103", name: "Electiva III", credits: 3, status: "blocked" },
      { id: "mock-6-5", code: "GEN103", name: "Investigación", credits: 2, status: "blocked" }
    ]
  },
  {
    semester: 7,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-7-1", code: "H05A", name: "Ciudadanía Global", credits: 2, status: "blocked" },
      { id: "mock-7-2", code: "M12A", name: "Inteligencia Artificial", credits: 3, status: "blocked" },
      { id: "mock-7-3", code: "A05A", name: "Ingeniería de Software", credits: 3, status: "blocked" },
      { id: "mock-7-4", code: "C10A", name: "Arquitectura del Computador", credits: 3, status: "blocked" },
      { id: "mock-7-5", code: "EC1A", name: "Electiva Complementaria I", credits: 3, status: "blocked" },
      { id: "mock-7-6", code: "C11A", name: "Sistemas Operativos", credits: 3, status: "blocked" }
    ]
  },
  {
    semester: 8,
    name: null,
    semesterAverage: null,
    courses: [
      { id: "mock-8-1", code: "HU1A", name: "Electiva de Humanidades I", credits: 2, status: "blocked" },
      { id: "mock-8-2", code: "A06A", name: "Infraestructura para TI", credits: 3, status: "blocked" },
      { id: "mock-8-3", code: "A07A", name: "Computación en Paralelo", credits: 3, status: "blocked" },
      { id: "mock-8-4", code: "EC2A", name: "Electiva Complementaria II", credits: 3, status: "blocked" },
      { id: "mock-8-5", code: "C12A", name: "Tópicos Especiales de Ciencias Computacionales", credits: 3, status: "blocked" },
      { id: "mock-8-6", code: "P01A", name: "Proyecto de Ingeniería I", credits: 3, status: "blocked" }
    ]
  }
]

const statusConfig = {
  completed: {
    label: "Aprobada",
    color: "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-400",
    icon: CheckCircle
  },
  in_progress: {
    label: "Cursando",
    color: "bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400",
    icon: Clock
  },
  available: {
    label: "Habilitada",
    color: "bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-400",
    icon: Unlock
  },
  blocked: {
    label: "Bloqueada",
    color: "bg-gray-100 border-gray-400 text-gray-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400",
icon: Lock
  }
}

function formatProgramTitle(program: { name: string; version: string } | null, currentSemester: number | null, period: string): string {
  const base = program ? `${program.name} - Plan ${program.version}` : "Ingeniería de Sistemas - Plan 2019"
  const semesterPart = currentSemester ? ` · Semestre actual ${currentSemester}` : ""
  const periodPart = period ? ` · Periodo ${period}` : ""
  return `${base}${semesterPart}${periodPart}`
}

function formatHeaderTitle(program: { version: string } | null, period: string, currentSemester: number | null): string {
  const versionPart = `Plan ${program ? program.version : "2019"}`
  const periodPart = period ? ` · ${period}` : ""
  const semesterPart = currentSemester ? ` · Semestre actual ${currentSemester}` : " · Semestre actual -"
  return `${versionPart}${periodPart}${semesterPart}`
}

export default function MallaCurricular() {
  const [expandedSemesters, setExpandedSemesters] = useState<number[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumSemester[] | null>(null)
  const [program, setProgram] = useState<ProgramData | null>(null)
  const [period, setPeriod] = useState("")
  const [currentSemester, setCurrentSemester] = useState<number | null>(null)
  const [loadError, setLoadError] = useState("")

  const [retryKey, setRetryKey] = useState(0)

  const retryLoad = () => {
    setLoadError("")
    setRetryKey((key) => key + 1)
  }

  useEffect(() => {
    fetch("/api/curriculum").then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar la malla")
      const data = await response.json()
      setCurriculum(data.semesters as CurriculumSemester[])
      setProgram({ name: data.program.name, code: data.program.code, version: data.program.version })
      setPeriod(data.period || "")
      setCurrentSemester(data.currentSemester || null)
      setExpandedSemesters(data.currentSemester ? [data.currentSemester] : [])
    }).catch(() => {
      setLoadError("No se pudo cargar la malla curricular. Verifica tu conexión e intenta de nuevo.")
    })
  }, [retryKey])

  const toggleSemester = (semester: number) => {
    setExpandedSemesters((prev) =>
      prev.includes(semester) ? prev.filter((s) => s !== semester) : [...prev, semester]
    )
  }

  const displayedCurriculum = curriculum || mockCurriculum
  const displayedTotalCredits = displayedCurriculum.reduce(
    (acc, semester) => acc + semester.courses.reduce((total, course) => total + course.credits, 0),
    0
  )
  const displayedCompletedCredits = displayedCurriculum
    .flatMap((semester) => semester.courses)
    .filter((course) => course.status === "completed")
    .reduce((acc, course) => acc + course.credits, 0)
  const displayedInProgressCredits = displayedCurriculum
    .flatMap((semester) => semester.courses)
    .filter((course) => course.status === "in_progress")
    .reduce((acc, course) => acc + course.credits, 0)
  const approvedPercentage = displayedTotalCredits ? Math.round((displayedCompletedCredits / displayedTotalCredits) * 100) : 0
  const inProgressPercentage = displayedTotalCredits ? Math.round((displayedInProgressCredits / displayedTotalCredits) * 100) : 0

  // Materias matriculadas este periodo — solo lectura (sin botón de agregar)
  const enrolledCourses = displayedCurriculum
    .flatMap((s) => s.courses)
    .filter((c) => c.status === "in_progress")
  const enrolledCredits = enrolledCourses.reduce((acc, c) => acc + c.credits, 0)

  // Si la carga falló y no hay datos, no mostrar la malla de ejemplo como si fuera real
  if (loadError && !curriculum) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Malla Curricular
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Tu plan de estudios
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{loadError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Malla Curricular
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {formatProgramTitle(program, currentSemester, period)}
        </p>
      </div>

      {/* Plan actual + Resumen de Avance — bloque único */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-gray-700 dark:bg-gray-800">
        {/* Cabecera unificada */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
                {formatHeaderTitle(program, period, currentSemester)}
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                Plan de estudios y avance
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                {displayedCompletedCredits} aprobados + {displayedInProgressCredits} en curso / {displayedTotalCredits} créditos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {approvedPercentage}%
            </span>
          </div>
        </div>

        {/* Barra de progreso: aprobados + en curso */}
        <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700">
          <div
            className="h-2.5 bg-blue-600 transition-all"
            style={{ width: `${approvedPercentage}%` }}
          />
          <div
            className="h-2.5 bg-sky-400 transition-all"
            style={{ width: `${inProgressPercentage}%` }}
          />
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" />Aprobados</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />En curso ({displayedInProgressCredits} cr)</span>
        </div>

        {/* Materias matriculadas este periodo — solo lectura, sin botón */}
        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400">
            Materias matriculadas este periodo {enrolledCourses.length ? `· ${enrolledCourses.length} materias · ${enrolledCredits} créditos` : "· sin materias"}
          </p>
          {enrolledCourses.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {enrolledCourses.map((course) => (
                <div
                  key={course.code}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-700/60"
                >
                  <p className="font-mono text-[11px] text-slate-400">{course.code}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white leading-tight">{course.name}</p>
                  <p className="mt-2 text-xs text-slate-500">{course.credits} créditos · Cursando</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-gray-400">No hay materias matriculadas para este periodo.</p>
          )}
        </div>



        {/* Leyenda */}
        <div className="mt-6 flex flex-wrap gap-4 border-t border-slate-100 pt-4 dark:border-gray-700">
          {Object.entries(statusConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <config.icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Curriculum Grid — solo lectura */}
      <div className="space-y-4">
        {displayedCurriculum.map((semester) => {
          const isExpanded = expandedSemesters.includes(semester.semester)
          const completedCount = semester.courses.filter((c) => c.status === "completed").length
          const totalCount = semester.courses.length

          return (
            <div
              key={semester.semester}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xs border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Semester Header */}
              <button
                onClick={() => toggleSemester(semester.semester)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                  <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                     <span className="text-white font-bold text-sm">{semester.semester}</span>
                   </div>
                   <div className="text-left">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Semestre {semester.semester}
                      </h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400">
                       {completedCount}/{totalCount} cursos completados · {semester.completedCredits ?? 0} créditos aprobados
                       {(semester.inProgressCredits ?? 0) > 0 && ` · ${semester.inProgressCredits} créditos cursando`}
                       {semester.semesterAverage != null && (
                         <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-xs font-medium text-blue-700 dark:text-blue-300">
                           ★ {semester.semesterAverage.toFixed(1)}
                         </span>
                       )}
                     </p>
                   </div>
                 </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Courses */}
              {isExpanded && (
                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {semester.courses.map((course) => {
                    const config = statusConfig[course.status as keyof typeof statusConfig] || statusConfig.blocked
                    return (
                      <div
                        key={course.code}
                        className={`p-4 rounded-lg border-l-4 ${config.color}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-mono text-xs opacity-75">{course.code}</p>
                            <p className="font-medium">{course.name}</p>
                            <p className="text-sm opacity-75">{course.credits} créditos</p>
                            {course.status === "blocked" && course.missingPrerequisites?.length ? (
                              <p className="mt-2 text-xs font-medium">Requiere: {course.missingPrerequisites.join(", ")}</p>
                            ) : null}
                            {course.status === "available" && (
                              <p className="mt-2 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                                Habilitada {course.missingPrerequisites?.length ? "" : "· prerrequisitos cumplidos"}
                              </p>
                            )}
                          </div>
                          <config.icon className="w-5 h-5 opacity-75" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
