"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  LayoutDashboard,
  BookOpen,
  Trophy,
  Target,
  BarChart3,
  Users,
  UserRound,
  Gift,
  Clock,
  CheckCircle,
  Medal
} from "lucide-react"
import { useSession } from "next-auth/react"
import { Suspense, useEffect, useState } from "react"

const navigation = [
  { name: "Resumen", href: "/dashboard", icon: LayoutDashboard },
  { name: "Plan de estudios", href: "/malla", icon: BookOpen },
  { name: "Insignias", href: "/logros", icon: Trophy },
  { name: "Misiones & desafíos", href: "/misiones", icon: Target },
  { name: "Recompensas", href: "/recompensas", icon: Gift },
  { name: "Estadísticas", href: "/estadisticas", icon: BarChart3 },
]

function SidebarContent({ isOpen, onClose }: Readonly<{ isOpen: boolean; onClose: () => void }>) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === "TEACHER"
  const [points, setPoints] = useState<number | null>(null)
  const searchParams = useSearchParams()
  const teacherSection = searchParams.get("section")
  const selectedCourseQuery = searchParams.get("course")
  const [teacherCourses, setTeacherCourses] = useState<{ id: string; code: string; name: string; semester: number; period: string }[]>([])
  const [pendingMissions, setPendingMissions] = useState(0)
  const [pendingRewards, setPendingRewards] = useState(0)
  const [reviewedItems, setReviewedItems] = useState(0)

  useEffect(() => {
    if (session?.user?.role !== "STUDENT") return

    fetch("/api/student")
      .then(async (response) => {
        if (!response.ok) return
        const data = await response.json() as { stats?: { totalPoints?: number } }
        setPoints(data.stats?.totalPoints ?? 0)
      })
      .catch(() => setPoints(null))
  }, [session?.user?.role])

  useEffect(() => {
    if (!isTeacher) return

    Promise.all([fetch("/api/teacher"), fetch("/api/teacher/rewards")])
      .then(async ([teacherResponse, rewardsResponse]) => {
        if (!teacherResponse.ok) return
        const teacherData = await teacherResponse.json()
        setTeacherCourses(teacherData.courses || [])
        setPendingMissions((teacherData.pendingMissions || []).length)

        if (rewardsResponse.ok) {
          const rewardsData = await rewardsResponse.json()
          setPendingRewards((rewardsData.pending || []).length)
          setReviewedItems((rewardsData.reviewed || []).length + (teacherData.missionHistory || []).length)
        }
      })
      .catch(() => {})
  }, [isTeacher])

  const displayName = session?.user?.name || "Estudiante"
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  const buildTeacherHref = (section: string | null, courseId?: string | null) => {
    const params = new URLSearchParams()
    if (section) params.set("section", section)
    const course = courseId ?? selectedCourseQuery
    if (course) params.set("course", course)
    const query = params.toString()
    return query ? `/docentes?${query}` : "/docentes"
  }

  return (
    <>
      {isOpen && <button type="button" aria-label="Cerrar menú de navegación" onClick={onClose} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex-col overflow-hidden border-r border-[#e4eaf3] bg-[#fbfcfe] dark:border-gray-700 dark:bg-gray-900 lg:flex lg:z-40 ${isOpen ? "flex" : "hidden"}`}>
      <div className="px-7 pb-2 pt-3">
            <div className="flex flex-col items-center gap-2">
          <Image
            src="/utb-logotipo.png"
            alt="UTB Logo"
            width={96}
            height={40}
            className="h-auto w-24 object-contain dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
          />
          <span className="text-center text-[11px] font-medium text-blue-600 dark:text-blue-300">
            Universidad Tecnológica de Bolívar
          </span>
        </div>
      </div>

      <div className="mx-5 rounded-[22px] border-2 border-[#edf1f7] bg-white px-4 py-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#abc3ff] text-lg font-bold text-blue-600 dark:bg-blue-900 dark:text-blue-200">
          {initials || <UserRound className="h-6 w-6" />}
        </div>
        <p className="mt-2.5 truncate text-base font-semibold text-[#111b38] dark:text-white">{displayName}</p>
        {isTeacher ? (
          <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Docente</p>
        ) : (
          <div className="mt-2.5 flex items-center justify-center gap-2 rounded-full bg-[#f0f3f8] px-3 py-1.5 text-[#111b38] dark:bg-gray-700 dark:text-gray-100">
            <Trophy className="h-4 w-4 fill-current" />
            <span className="text-sm font-semibold">{points === null ? "--" : points.toLocaleString("es-CO")} XP</span>
          </div>
        )}
        <Link
          href={isTeacher ? "/perfil-docente" : "/perfil"}
          className="mt-2 w-full rounded-lg px-4 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
          aria-label={isTeacher ? "Mi perfil docente" : "Mi perfil"}
        >
          {isTeacher ? "Mi perfil docente" : "Mi perfil"}
        </Link>
      </div>

      {/* Navigation */}
<nav className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {isTeacher ? (() => {
          const activeSection = teacherSection || "cursos"
          const teacherLink = (href: string, label: string, Icon: typeof Users, active: boolean, badge?: number) => (
            <Link
              href={href}
              onClick={onClose}
              className={`relative flex items-center gap-4 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                active
                  ? "bg-[#edf2f9] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-[#17335c] hover:bg-[#f0f4fa] dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {active && <span className="absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#1646d8]" />}
              <Icon className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge !== undefined && (
                <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold ${badge === 0 ? "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500" : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"}`}>
                  {badge}
                </span>
              )}
            </Link>
          )

          return (
            <div className="space-y-6">
              <div>
                <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wider text-[#7893b6] dark:text-blue-300">Panel docente</p>
                <div className="space-y-1">
                  {teacherLink(buildTeacherHref(null), "Mis estudiantes", Users, pathname === "/docentes" && activeSection === "cursos", teacherCourses.length)}
                  {teacherLink(buildTeacherHref("misiones"), "Misiones por revisar", Clock, pathname === "/docentes" && activeSection === "misiones", pendingMissions)}
                  {teacherLink(buildTeacherHref("recompensas"), "Recompensas por revisar", Gift, pathname === "/docentes" && activeSection === "recompensas", pendingRewards)}
                  {teacherLink(buildTeacherHref("historial"), "Historial", CheckCircle, pathname === "/docentes" && activeSection === "historial", reviewedItems)}
                  {teacherLink("/docentes/insignias", "Insignias", Medal, pathname === "/docentes/insignias")}
                </div>
              </div>
            </div>
          )
        })() : (<>
        <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wider text-[#7893b6] dark:text-blue-300">Trayectoria académica</p>
        {(navigation).map((item) => {
          const itemPath = item.href.split("?")[0]
          const itemSection = item.href.includes("?") ? "recompensas" : null
          const isActive = pathname === itemPath && (itemSection ? teacherSection === itemSection : !teacherSection)
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={`relative flex items-center gap-4 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                isActive
                  ? "bg-[#edf2f9] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-[#17335c] hover:bg-[#f0f4fa] dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {isActive && <span className="absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#1646d8]" />}
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.name}</span>
            </Link>
          )
        })}
        </>)}
</nav>

      </aside>
    </>
  )
}

export function Sidebar({ isOpen, onClose }: Readonly<{ isOpen: boolean; onClose: () => void }>) {
  return (
    <Suspense fallback={<aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-[#e4eaf3] bg-[#fbfcfe] dark:border-gray-700 dark:bg-gray-900 lg:flex ${isOpen ? "flex" : "hidden"}`} aria-hidden />}>
      <SidebarContent isOpen={isOpen} onClose={onClose} />
    </Suspense>
  )
}
