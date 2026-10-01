"use client"

import { useEffect, useState } from "react"
import { Activity, BriefcaseBusiness, CheckCircle2, GraduationCap, Mail, Users } from "lucide-react"

type TeacherData = {
  name: string
  email: string
  profile: { faculty: string | null; profession: string | null; department: string | null; title: string | null; isActive: boolean } | null
}

type TeacherResponse = {
  teacher: TeacherData | null
  students: { id: string }[]
  pendingMissions: { id: string }[]
}

export default function TeacherProfilePage() {
  const [data, setData] = useState<TeacherResponse | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/teacher").then(async (response) => {
      if (!response.ok) throw new Error("Failed to fetch teacher profile")
      setData(await response.json())
    }).catch(() => setError("No se pudo cargar el perfil docente"))
  }, [])

  if (error) return <div className="rounded-xl bg-red-50 p-6 text-red-700">{error}</div>
  if (!data?.teacher) return <div className="flex h-64 items-center justify-center text-gray-500">Cargando perfil docente...</div>

  const { teacher } = data
  const profile = teacher.profile

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-2xl bg-linear-to-r from-slate-800 to-blue-700 p-6 text-white sm:p-8"><div className="flex flex-wrap items-center gap-5"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15"><GraduationCap className="h-10 w-10" /></div><div><p className="text-sm font-semibold text-blue-200">PERFIL DOCENTE</p><h1 className="text-3xl font-bold">{teacher.name}</h1><p className="mt-1 flex items-center gap-2 text-blue-100"><Mail className="h-4 w-4" />{teacher.email}</p></div></div></header>
      <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-gray-200 bg-white shadow-xs p-5 dark:border-gray-700 dark:bg-gray-800"><BriefcaseBusiness className="mb-3 h-5 w-5 text-blue-600" /><p className="text-sm text-gray-500">Profesión</p><p className="mt-1 font-bold">{profile?.profession || "No registrada"}</p></div><div className="rounded-xl border border-gray-200 bg-white shadow-xs p-5 dark:border-gray-700 dark:bg-gray-800"><GraduationCap className="mb-3 h-5 w-5 text-blue-600" /><p className="text-sm text-gray-500">Facultad</p><p className="mt-1 font-bold">{profile?.faculty || "No registrada"}</p></div><div className="rounded-xl border border-gray-200 bg-white shadow-xs p-5 dark:border-gray-700 dark:bg-gray-800"><CheckCircle2 className="mb-3 h-5 w-5 text-emerald-600" /><p className="text-sm text-gray-500">Estado</p><p className={`mt-1 font-bold ${profile?.isActive ? "text-emerald-600" : "text-red-600"}`}>{profile?.isActive ? "Activo" : "Inactivo"}</p></div></section>
      <section className="rounded-xl border border-gray-200 bg-white shadow-xs p-6 dark:border-gray-700 dark:bg-gray-800"><h2 className="text-xl font-bold">Información profesional</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm text-gray-500">Cargo</dt><dd className="mt-1 font-semibold">{profile?.title || "No registrado"}</dd></div><div><dt className="text-sm text-gray-500">Departamento</dt><dd className="mt-1 font-semibold">{profile?.department || "No registrado"}</dd></div><div><dt className="text-sm text-gray-500">Correo institucional</dt><dd className="mt-1 font-semibold">{teacher.email}</dd></div><div><dt className="text-sm text-gray-500">Responsabilidad</dt><dd className="mt-1 font-semibold">Acompañamiento y seguimiento académico</dd></div></dl></section>
      <section className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-gray-200 bg-white shadow-xs p-5 dark:border-gray-700 dark:bg-gray-800"><Users className="mb-3 h-5 w-5 text-blue-600" /><p className="text-sm text-gray-500">Estudiantes acompañados</p><p className="mt-1 text-3xl font-bold">{data.students.length}</p><p className="mt-1 text-sm text-gray-500">Consulta sus perfiles desde Acompañamiento docente.</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-900/20"><Activity className="mb-3 h-5 w-5 text-amber-600" /><p className="text-sm text-amber-800 dark:text-amber-200">Misiones pendientes</p><p className="mt-1 text-3xl font-bold text-amber-900 dark:text-amber-100">{data.pendingMissions.length}</p><p className="mt-1 text-sm text-amber-800 dark:text-amber-200">Entregas que requieren revisión.</p></div></section>
    </div>
  )
}