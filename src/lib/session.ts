import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export type SessionContext = {
  userId: string
  role: string | null
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth()

  if (!session?.user?.id) {
    return null
  }

  return {
    userId: session.user.id,
    role: session.user.role ?? null,
  }
}

export async function getRequiredSessionContext() {
  const context = await getSessionContext()

  if (!context) {
    return {
      error: "No autorizado",
      status: 401,
      data: null,
    }
  }

  return { error: null, status: 200, data: context }
}

export async function requireRole(role: string | string[]) {
  const context = await getSessionContext()

  if (!context) {
    return {
      error: "No autorizado",
      status: 401,
      data: null,
    }
  }

  const allowed = Array.isArray(role) ? role : [role]
  if (!context.role || !allowed.includes(context.role)) {
    let label: string
    if (allowed.includes("STUDENT") && allowed.length === 1) {
      label = "estudiantes"
    } else if (allowed.includes("TEACHER") && allowed.length === 1) {
      label = "docentes"
    } else {
      label = "usuarios autorizados"
    }
    return {
      error: `Acceso exclusivo para ${label}`,
      status: 403,
      data: null,
    }
  }

  return { error: null, status: 200, data: context }
}

export async function requireAdmin() {
  return requireRole("ADMIN")
}

export function jsonUnauthorized(message = "No autorizado") {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function jsonForbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}
