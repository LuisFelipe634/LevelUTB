"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

type Badge = { name: string; category: string }
type Student = { id: string; badges: Badge[] }
type TeacherResponse = { students?: Student[] }

type BadgeGroup = {
  name: string
  code: string
  category: string
  color: string
  softColor: string
}

const GROUPS: BadgeGroup[] = [
  { name: "Core Skills", code: "CS", category: "PROGRESO", color: "#f5ad00", softColor: "#fff7df" },
  { name: "Power Skills", code: "PS", category: "HABITO", color: "#bf16ef", softColor: "#fbe8ff" },
  { name: "Líderes UTB", code: "LU", category: "IMPACTO_SOCIAL", color: "#0794ee", softColor: "#e7f5ff" },
  { name: "Conexiones Profesionales", code: "CP", category: "COMPETENCIA", color: "#35c99b", softColor: "#e7fbf4" },
]

function BadgeRing({ percentage, plus }: { percentage: number; plus?: boolean }) {
  const safePercentage = Math.min(100, Math.max(0, percentage))
  return (
    <div className={`relative flex h-18.5 w-18.5 items-center justify-center rounded-full ${plus ? "border-[7px] border-emerald-500" : ""}`}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(#f39a08 ${safePercentage * 3.6}deg, #f39a08 ${safePercentage * 3.6}deg, transparent ${safePercentage * 3.6}deg)` }}
      />
      <div className="relative h-15 w-15 rounded-full bg-white" />
    </div>
  )
}

function BadgeCard({ group, students, plus }: { group: BadgeGroup; students: Student[]; plus?: boolean }) {
  const earnedStudents = students.filter((student) => {
    const earned = student.badges.filter((badge) => badge.category === group.category && (plus ? badge.name.endsWith("Plus") : !badge.name.endsWith("Plus"))).length
    return earned > 0
  }).length
  const earnedBadges = students.reduce(
    (total, student) => total + student.badges.filter((badge) => badge.category === group.category && (plus ? badge.name.endsWith("Plus") : !badge.name.endsWith("Plus"))).length,
    0
  )
  const totalStudents = plus ? earnedStudents : students.length
  const inProgress = Math.max(0, totalStudents - earnedBadges)
  const percentage = totalStudents ? (earnedBadges / totalStudents) * 100 : 0

  return (
    <article className="overflow-hidden rounded-2xl border border-[#e4e7eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="h-1.5" style={{ backgroundColor: group.color }} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0d1b34]">{group.name}{plus ? " Plus" : ""}</h2>
            <p className="mt-1 text-sm text-[#8792a7]">{group.code}{plus ? "P" : ""}</p>
          </div>
          <span className="mt-1 h-4 w-4 rounded-full" style={{ backgroundColor: group.color }} />
        </div>

        <div className="mt-5 flex items-center gap-5">
          <BadgeRing percentage={percentage} plus={plus} />
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-[#64718a]"><span className="h-2.5 w-2.5 rounded-full bg-[#f5ad00]" />En progreso <strong className="ml-1 text-lg leading-none text-[#0d1b34]">{inProgress}</strong></div>
            <div className="flex items-center gap-2 text-[#64718a]"><span className="h-2.5 w-2.5 rounded-full bg-[#06c98b]" />Ganada <strong className="ml-1 text-lg leading-none text-[#0d1b34]">{earnedBadges}</strong></div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[#edf0f4] pt-4 text-sm">
          <span className="text-[#8792a7]">Total estudiantes</span>
          <strong className="font-medium text-[#243653]">{totalStudents}</strong>
        </div>
      </div>
    </article>
  )
}

export default function TeacherBadgesPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/teacher")
      .then(async (response) => {
        if (!response.ok) throw new Error()
        const data = await response.json() as TeacherResponse
        setStudents(data.students || [])
      })
      .catch(() => setError("No se pudo cargar el resumen de insignias"))
      .finally(() => setLoading(false))
  }, [])

  const uniqueStudents = useMemo(() => Array.from(new Map(students.map((student) => [student.id, student])).values()), [students])

  if (loading) return <div className="flex h-64 items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Cargando insignias...</div>
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700"><AlertTriangle className="mb-2 h-5 w-5" />{error}</div>

  return (
    <div className="mx-auto max-w-375 space-y-10 px-1">
      <section>
        <h1 className="mb-5 text-xl font-semibold text-[#17335c]">Insignias</h1>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {GROUPS.map((group) => <BadgeCard key={group.code} group={group} students={uniqueStudents} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-5 text-xl font-semibold text-[#17335c]">Insignias Plus</h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {GROUPS.map((group) => <BadgeCard key={`${group.code}-plus`} group={group} students={uniqueStudents} plus />)}
        </div>
      </section>
    </div>
  )
}
