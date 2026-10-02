import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const userId = session.user.id

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ notifications })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const userId = session.user.id
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Cuerpo JSON inválido" },
        { status: 400 }
      )
    }
    const { notificationId, isRead } = body as { notificationId?: unknown; isRead?: unknown }

    if (!notificationId || typeof notificationId !== "string") {
      return NextResponse.json(
        { error: "ID de notificación requerido" },
        { status: 400 }
      )
    }

    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json(
        { error: "Notificación no encontrada" },
        { status: 404 }
      )
    }

    const notification = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: typeof isRead === "boolean" ? isRead : true }
    })

    return NextResponse.json({ notification })
  } catch (error) {
    console.error("Error updating notification:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const notificationId = searchParams.get("id")

    if (!notificationId) {
      return NextResponse.json(
        { error: "ID de notificación requerido" },
        { status: 400 }
      )
    }

    await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId: userId
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting notification:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
