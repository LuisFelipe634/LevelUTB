"use client"

import { Bell, Moon, Sun, LogOut, Menu } from "lucide-react"
import { useTheme } from "next-themes"
import { useState, useEffect, useEffectEvent, useSyncExternalStore } from "react"
import Link from "next/link"
import { signOut, useSession } from "next-auth/react"

export function Header({ onToggleSidebar }: Readonly<{ onToggleSidebar: () => void }>) {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const [unreadCount, setUnreadCount] = useState(0)
  const { data: session, status } = useSession()
  const profileRole = session?.user?.role

  const fetchUserData = async () => {
    try {
      const response = await fetch("/api/student")
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.unreadCount)
      }
    } catch (error) {
      console.error("Error fetching user data:", error)
    }
  }

  const loadAuthenticatedUser = useEffectEvent(fetchUserData)

  useEffect(() => {
    if (status === "authenticated" && profileRole === "STUDENT") {
      // The event loads external session data and updates the header state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAuthenticatedUser()
    }
  }, [status, profileRole])

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" })
  }

  let themeLabel: string
  if (!mounted) {
    themeLabel = "Cambiar tema"
  } else if (theme === "dark") {
    themeLabel = "Activar modo claro"
  } else {
    themeLabel = "Activar modo oscuro"
  }

  const themeIcon = mounted && theme === "dark" ? (
    <Sun className="w-5 h-5 text-gray-400" />
  ) : (
    <Moon className="w-5 h-5 text-gray-400" />
  )

  const unreadCountDisplay = unreadCount > 9 ? "9+" : unreadCount

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-[#e4eaf3] bg-background/95 px-4 backdrop-blur-sm dark:border-gray-700 sm:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Mostrar u ocultar menú de navegación"
        title="Mostrar u ocultar menú de navegación"
        className="shrink-0 rounded-xl p-2 text-gray-500 hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" aria-hidden="true" />

      {/* Actions */}
      <div className="flex items-center gap-1 rounded-2xl border border-[#e4eaf3] bg-white/70 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800/70">
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={themeLabel}
          title={themeLabel}
          className="rounded-xl p-2.5 text-gray-500 hover:bg-[#eef2f8] hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-300"
        >
          {themeIcon}
        </button>

        {/* Notifications */}
        <Link
          href="/notificaciones"
          className="relative rounded-xl p-2.5 text-gray-500 hover:bg-[#eef2f8] hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-300"
        >
          <Bell className="w-5 h-5 text-gray-400" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {unreadCountDisplay}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="ml-1 rounded-xl border-l border-[#e4eaf3] p-2.5 pl-3 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
