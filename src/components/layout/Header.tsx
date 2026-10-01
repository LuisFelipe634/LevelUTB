"use client"

import { Bell, Search, Moon, Sun, LogOut, BookOpen, Trophy, Target, BarChart3, Users, UserRound, LayoutDashboard, Lightbulb, Menu } from "lucide-react"
import { useTheme } from "next-themes"
import { useRef, useState, useEffect, useEffectEvent, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"

type SearchResult = {
  id: string
  type: string
  label: string
  description: string
  href: string
  keywords: string
  icon: React.ComponentType<{ className?: string }>
  roles: string[]
}

const searchOptions: SearchResult[] = [
  { id: "dashboard", type: "page", label: "Dashboard", description: "Resumen de tu avance", href: "/dashboard", keywords: "inicio resumen avance", icon: LayoutDashboard, roles: ["STUDENT"] },
  { id: "curriculum", type: "page", label: "Malla Curricular", description: "Consulta y selecciona materias", href: "/malla", keywords: "malla curricular cursos materias semestre", icon: BookOpen, roles: ["STUDENT"] },
  { id: "missions", type: "page", label: "Misiones", description: "Retos y puntos", href: "/misiones", keywords: "misiones retos puntos", icon: Target, roles: ["STUDENT"] },
  { id: "badges", type: "page", label: "Insignias", description: "Insignias y progreso", href: "/logros", keywords: "insignias premios", icon: Trophy, roles: ["STUDENT"] },
  { id: "notifications", type: "page", label: "Notificaciones", description: "Revisa tus avisos", href: "/notificaciones", keywords: "notificaciones avisos alertas", icon: Bell, roles: ["STUDENT", "TEACHER"] },
  { id: "stats", type: "page", label: "Estadísticas", description: "Métricas de tu progreso", href: "/estadisticas", keywords: "estadisticas métricas progreso", icon: BarChart3, roles: ["STUDENT"] },
  { id: "profile", type: "page", label: "Mi perfil", description: "Información académica", href: "/perfil", keywords: "perfil estudiante datos", icon: UserRound, roles: ["STUDENT"] },
  { id: "students", type: "page", label: "Acompañamiento docente", description: "Seguimiento de estudiantes", href: "/docentes", keywords: "docentes estudiantes seguimiento acompañamiento", icon: Users, roles: ["TEACHER"] },
  { id: "teacher-profile", type: "page", label: "Mi perfil docente", description: "Información profesional", href: "/perfil-docente", keywords: "perfil docente profesor datos", icon: UserRound, roles: ["TEACHER"] }
]

const resultIcons = { course: BookOpen, mission: Target, badge: Trophy, notification: Bell, recommendation: Lightbulb, student: Users }

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function getInitials(name?: string | null) {
  if (!name) return "U"
  const names = name.trim().split(/\s+/)
  return (names.length >= 2
    ? `${names[0][0]}${names.at(-1)?.[0]}`
    : names[0].substring(0, 2)
  ).toUpperCase()
}

export function Header({ onToggleSidebar }: Readonly<{ onToggleSidebar: () => void }>) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const [unreadCount, setUnreadCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [dynamicSearchResults, setDynamicSearchResults] = useState<SearchResult[]>([])
  const searchRequestRef = useRef(0)
  const { data: session, status } = useSession()
  const profileRole = session?.user?.role
  const availableSearchOptions = searchOptions.filter((option) => option.roles.includes(profileRole || "STUDENT"))
  const normalizedSearchTerm = normalizeSearchText(searchTerm.trim())
  const navigationResults = normalizedSearchTerm
    ? availableSearchOptions.filter((option) => normalizeSearchText(`${option.label} ${option.description} ${option.keywords}`).includes(normalizedSearchTerm))
    : []
  const searchResults = [...dynamicSearchResults, ...navigationResults].filter((result, index, results) => results.findIndex((item) => `${item.type}-${item.id}` === `${result.type}-${result.id}`) === index).slice(0, 8)

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

  const fetchSearchResults = async (term: string) => {
    const query = term.trim()
    const requestId = ++searchRequestRef.current
    setDynamicSearchResults([])
    if (query.length < 2) {
      return
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      if (!response.ok) return
      const data = await response.json() as { results: { id: string; type: string; title: string; description: string; href: string }[] }
      if (requestId !== searchRequestRef.current) return
      setDynamicSearchResults(data.results.map((result) => ({
        ...result,
        label: result.title,
        keywords: "",
        icon: resultIcons[result.type as keyof typeof resultIcons] || Search,
        roles: ["STUDENT", "TEACHER"]
      })))
    } catch {
      if (requestId === searchRequestRef.current) setDynamicSearchResults([])
    }
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false)
      return
    }

    if (event.key === "Enter" && searchResults[0]) {
      router.push(searchResults[0].href)
      setSearchTerm("")
      setSearchOpen(false)
    }
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
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4 px-4 sm:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Mostrar u ocultar menú de navegación"
        title="Mostrar u ocultar menú de navegación"
        className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cursos, misiones, insignias..."
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setSearchOpen(true)
              void fetchSearchResults(event.target.value)
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Buscar en la aplicación"
            aria-controls="global-search-results"
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        {searchOpen && normalizedSearchTerm && (
          <div id="global-search-results" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {searchResults.length > 0 ? searchResults.map((result) => {
              const Icon = result.icon
              return (
                <Link
                  key={result.href}
                  href={result.href}
                  role="option"
                  onClick={() => {
                    setSearchTerm("")
                    setSearchOpen(false)
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Icon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{result.label}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{result.description}</span>
                  </span>
                </Link>
              )
            }) : (
              <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No se encontraron opciones</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={themeLabel}
          title={themeLabel}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {themeIcon}
        </button>

        {/* Notifications */}
        <Link
          href="/notificaciones"
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Bell className="w-5 h-5 text-gray-400" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {unreadCountDisplay}
            </span>
          )}
        </Link>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700">
          {/* Profile link removed - now accessible from Sidebar */}
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="ml-1 p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
