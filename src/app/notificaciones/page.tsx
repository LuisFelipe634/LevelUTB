"use client"

import { useState, useEffect } from "react"
import {
  Bell,
  AlertTriangle,
  Info,
  Trophy,
  Target,
  Clock,
  X,
  Loader2
} from "lucide-react"

interface Notification {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  link: string | null
  createdAt: string
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  INFO: { icon: Info, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-700/50" },
  WARNING: { icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" },
  ALERTA_RIESGO: { icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
  LOGRO_OBTENIDO: { icon: Trophy, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
  MISION_DISPONIBLE: { icon: Target, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
  RECORDATORIO: { icon: Clock, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" }
}

export async function fetchNotificationsData(
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
) {
  try {
    const response = await fetch("/api/notifications")
    if (!response.ok) throw new Error("Error al cargar notificaciones")
    const data = (await response.json()) as { notifications: Notification[] }
    setNotifications(data.notifications)
  } catch (error) {
    console.error("Error:", error)
  } finally {
    setLoading(false)
  }
}

export default function Notificaciones() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchNotificationsData(setNotifications, setLoading)
  }, [])

  const unreadCount = notifications.filter((n) => !n.isRead).length

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === "all") return true
    if (filter === "unread") return !notification.isRead
    return notification.type === filter
  })

  const markAsRead = async (id: string) => {
    setActionLoading(id)
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id, isRead: true })
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const markAllAsRead = async () => {
    setActionLoading("all")
    try {
      const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id)
      await Promise.all(
        unreadIds.map((id) =>
          fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationId: id, isRead: true })
          })
        )
      )
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setActionLoading(null)
    }
  }

  const deleteNotification = async (id: string) => {
    setActionLoading(id)
    try {
      await fetch(`/api/notifications?id=${id}`, {
        method: "DELETE"
      })
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando notificaciones...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notificaciones</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {unreadCount > 0
              ? `Tienes ${unreadCount} notificación${unreadCount > 1 ? "es" : ""} sin leer`
              : "No tienes notificaciones nuevas"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={actionLoading === "all"}
            className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading === "all" ? (
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            ) : null}
            Marcar todo como leído
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all", label: "Todas" },
          { key: "unread", label: "No leídas" },
          { key: "ALERTA_RIESGO", label: "Alertas" },
          { key: "MISION_DISPONIBLE", label: "Misiones" },
          { key: "LOGRO_OBTENIDO", label: "Insignias" }
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.map((notification) => {
          const isUrgentRoute = notification.title.includes("Ruta recomendada")
          const config = typeConfig[notification.type] || typeConfig.INFO
          const Icon = config.icon
          const isActionLoading = actionLoading === notification.id

          return (
            <div
              key={notification.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-xs border p-4 transition-all ${
                isUrgentRoute && !notification.isRead
                  ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-900/10 shadow-sm"
                  : notification.isRead
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-blue-300 dark:border-blue-600 shadow-sm"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.bg}`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className={`font-medium ${
                        notification.isRead
                          ? "text-gray-700 dark:text-gray-300"
                          : "text-gray-900 dark:text-white"
                      }`}>
                        {notification.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(notification.createdAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    {!notification.isRead && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        disabled={isActionLoading}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                      >
                        Marcar como leído
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      disabled={isActionLoading}
                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                    >
                      {isActionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {filteredNotifications.length === 0 && (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No hay notificaciones</p>
          </div>
        )}
      </div>
    </div>
  )
}