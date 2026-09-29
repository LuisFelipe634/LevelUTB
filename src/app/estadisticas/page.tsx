"use client"

import { useState, useEffect } from "react"
import {
  TrendingUp,
  BookOpen,
  Trophy,
  Target,
  Clock,
  Award,
  Loader2
} from "lucide-react"

interface StatsData {
  overall: {
    creditsApproved: number
    totalCredits: number
    averageGrade: number
    coursesCompleted: number
    totalCourses: number
    currentSemester: number
    totalSemesters: number
    gradeTrend: number
  }
  byCategory: Array<{
    category: string
    approved: number
    total: number
    credits: number
    totalCredits: number
    percentage: number
  }>
  semesterProgress: Array<{
    semester: number
    creditsApproved: number
    totalCredits: number
    coursesApproved: number
    totalCourses: number
  }>
  achievements: {
    totalBadges: number
    earnedBadges: number
    totalMissions: number
    completedMissions: number
    totalPoints: number
    level: number
    levelName: string
    nextLevel: string | null
    nextLevelPoints: number
    pointsToNextLevel: number
  }
  pointsBySource: Array<{
    source: string
    total: number
    count: number
  }>
}

export async function fetchStatsData(
  setStats: React.Dispatch<React.SetStateAction<StatsData | null>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
) {
  try {
    const response = await fetch("/api/stats")
    if (!response.ok) throw new Error("Error al cargar estadísticas")
    const data = (await response.json()) as StatsData
    setStats(data)
  } catch (error) {
    console.error("Error:", error)
  } finally {
    setLoading(false)
  }
}

export default function Estadisticas() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStatsData(setStats, setLoading)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando estadísticas...</span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Error al cargar las estadísticas</p>
        <button
          onClick={() => fetchStatsData(setStats, setLoading)}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const creditProgress = Math.round(
    (stats.overall.creditsApproved / stats.overall.totalCredits) * 100
  )

  const courseProgress = Math.round(
    (stats.overall.coursesCompleted / stats.overall.totalCourses) * 100
  )
  const maxApprovedCredits = Math.max(
    ...stats.semesterProgress.map((semester) => semester.creditsApproved),
    1
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estadísticas</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Tus métricas académicas y de gamificación
        </p>
      </div>

      {/* Main Stats */}
      <div className="order-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Créditos</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.overall.creditsApproved}/{stats.overall.totalCredits}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${creditProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{creditProgress}% completado</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Promedio</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.overall.averageGrade.toFixed(1)}
              </p>
            </div>
          </div>
          <p className={`mt-3 text-sm ${stats.overall.gradeTrend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {stats.overall.gradeTrend >= 0 ? '↑' : '↓'} {Math.abs(stats.overall.gradeTrend).toFixed(1)} desde el último semestre
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <Award className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Nivel</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.achievements.level}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full"
              style={{
                width: stats.achievements.nextLevelPoints > 0
                  ? `${(stats.achievements.totalPoints / stats.achievements.nextLevelPoints) * 100}%`
                  : "100%"
              }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {stats.achievements.totalPoints}/{stats.achievements.nextLevelPoints} pts
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Insignias</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.achievements.earnedBadges}/{stats.achievements.totalBadges}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-yellow-600 dark:text-yellow-400">
            {stats.achievements.completedMissions} misiones completadas
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="order-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress by Category */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
            Progreso por Categoría
          </h2>
          <div className="space-y-4">
            {stats.byCategory.map((category) => (
              <div key={category.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{category.category}</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {category.credits}/{category.totalCredits} ({category.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-blue-500 to-purple-600 rounded-full"
                    style={{ width: `${category.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Course Progress */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
            Avance de Cursos
          </h2>
          <div className="flex items-center justify-center">
            <div className="relative">
              <svg className="w-40 h-40 transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - courseProgress / 100)}`}
                  className="text-blue-500"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {courseProgress}%
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">completado</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              {stats.overall.coursesCompleted} de {stats.overall.totalCourses} cursos aprobados
            </p>
          </div>
        </div>
      </div>

      {/* Semester Progress */}
      <div className="order-3 bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
          Créditos aprobados por semestre
        </h2>
        <div className="flex items-end justify-between h-40">
          {stats.semesterProgress.map((semester) => {
            const percentage = semester.totalCredits > 0
              ? Math.round((semester.creditsApproved / semester.totalCredits) * 100)
              : 0
            const height = Math.max(
              Math.round((semester.creditsApproved / maxApprovedCredits) * 100),
              semester.creditsApproved > 0 ? 8 : 0
            )
            return (
              <div key={semester.semester} className="flex h-full flex-1 min-w-0 flex-col items-center justify-end">
                <span className="mb-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {semester.creditsApproved} cr
                </span>
                <div
                  className="w-full max-w-10 bg-linear-to-t from-blue-500 to-cyan-400 rounded-t-lg transition-all duration-500"
                  style={{ height: `${height}%` }}
                  title={`Semestre ${semester.semester}: ${semester.creditsApproved}/${semester.totalCredits} créditos aprobados (${percentage}%)`}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  S{semester.semester}
                </span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {semester.creditsApproved}/{semester.totalCredits} cr
                </span>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>Créditos aprobados por semestre</span>
        </div>
      </div>

      {/* Points by Source */}
      <div className="order-6 bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-1">
          Distribución de puntos
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Indica de qué actividades provienen tus puntos de gamificación.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.pointsBySource.map((source) => (
            <div key={source.source} className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <Target className="w-8 h-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {source.total.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {source.source.replace(/_/g, " ").toLowerCase()}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {source.count} veces
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Gamification Summary */}
      <div className="order-5 bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
          Resumen de gamificación
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Target className="w-8 h-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.achievements.totalPoints.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Puntos Totales</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Trophy className="w-8 h-8 text-yellow-600 dark:text-yellow-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.achievements.earnedBadges}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Insignias</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.achievements.completedMissions}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Misiones</p>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Award className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              Nivel {stats.achievements.level}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{stats.achievements.levelName}</p>
          </div>
        </div>
      </div>
    </div>
  )
}