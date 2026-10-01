"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Flame,
  Loader2,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";

type ProfileData = {
  user: { name: string; email: string };
  profile: {
    studentCode: string;
    currentSemester: number;
    totalCredits: number;
    averageGrade: number;
    level: number;
    program: { name: string; totalCredits: number };
  };
  stats: {
    totalPoints: number;
    currentLevel: string;
    nextLevel: string | null;
    pointsToNextLevel: number;
    activeMissionsCount: number;
    completedMissionsCount: number;
    badgesCount: number;
    streak: { current: number; best: number; activeToday: boolean };
  };
  recentBadges: { id: string; name: string; icon: string; earned: string }[];
};

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/student")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to fetch student profile");
        setData(await response.json());
      })
      .catch(() => setError("No se pudo cargar el perfil"));
  }, []);

  if (error)
    return <div className="rounded-xl bg-red-50 p-6 text-red-700">{error}</div>;
  if (!data)
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando perfil...
      </div>
    );

  const progress =
    data.profile.program.totalCredits > 0
      ? Math.round(
          (data.profile.totalCredits / data.profile.program.totalCredits) * 100,
        )
      : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-2xl bg-linear-to-r from-blue-600 to-cyan-500 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <UserRound className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm text-blue-100">PERFIL DEL ESTUDIANTE</p>
            <h1 className="text-3xl font-bold">{data.user.name}</h1>
            <p className="text-blue-100">
              {data.user.email} · {data.profile.studentCode}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "Puntos acumulados",
            value: data.stats.totalPoints.toLocaleString(),
            icon: TrendingUp,
            color: "text-blue-600",
          },
          {
            label: "Insignias obtenidas",
            value: data.stats.badgesCount,
            icon: Award,
            color: "text-blue-600",
          },
          {
            label: "Semestre actual",
            value: data.profile.currentSemester,
            icon: BookOpen,
            color: "text-blue-600",
          },
          {
            label: "Misiones completadas",
            value: data.stats.completedMissionsCount,
            icon: Target,
            color: "text-blue-600",
          },
          {
            label: "Racha académica",
            value: `${data.stats.streak.current} días`,
            icon: Flame,
            color: "text-orange-600",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white shadow-xs p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <Icon className={`mb-2 h-5 w-5 ${color}`} />
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {label === "Racha académica"
                ? `Mejor: ${data.stats.streak.best} días`
                : " "}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-gray-200 bg-white shadow-xs p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Resumen académico</h2>
              <p className="mt-1 text-sm text-gray-500">
                {data.profile.program.name}
              </p>
            </div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Nivel {data.profile.level}
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">Promedio acumulado</p>
              <p className="text-2xl font-bold">
                {data.profile.averageGrade.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Progreso de carrera</p>
              <p className="text-2xl font-bold">{progress}%</p>
            </div>
          </div>
          <div className="mt-5 h-3 rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-3 rounded-full bg-blue-600"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {data.profile.totalCredits} de {data.profile.program.totalCredits}{" "}
            créditos aprobados
          </p>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white shadow-xs p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-xl font-bold">Nivel de gamificación</h2>
          <p className="mt-1 text-sm text-gray-500">
            {data.stats.currentLevel}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-semibold">
                {data.stats.totalPoints.toLocaleString()} puntos
              </p>
              <p className="text-sm text-gray-500">
                {data.stats.nextLevel
                  ? `${data.stats.pointsToNextLevel} para ${data.stats.nextLevel}`
                  : "Has alcanzado el nivel máximo"}
              </p>
            </div>
          </div>
          <Link
            href="/estadisticas"
            className="mt-6 flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm font-semibold text-blue-700 dark:bg-gray-700/60 dark:text-blue-300"
          >
            Ver estadísticas detalladas <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-xs p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Insignias recientes</h2>
          <Link href="/logros" className="text-sm font-semibold text-blue-600">
            Ver todas
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.recentBadges.map((badge) => (
            <div
              key={badge.id}
              className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20"
            >
              <span className="text-2xl">{badge.icon}</span>
              <div>
                <p className="font-semibold">{badge.name}</p>
                <p className="text-xs text-gray-500">Obtenida</p>
              </div>
            </div>
          ))}
          {!data.recentBadges.length && (
            <p className="text-sm text-gray-500">
              Aún no tienes insignias obtenidas.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
