import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeInstitutionalEmail, validatePassword } from "@/lib/institutionalEmail";
import { requireAdmin, jsonForbidden, jsonUnauthorized } from "@/lib/session";

/**
 * Alta de docentes SOLO por ADMIN.
 * Los docentes nunca se auto-registran (evita escalada de rol).
 * Bootstrap inicial: crear un ADMIN vía seed/env, luego usar este endpoint.
 */
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session.error) {
    return session.status === 401 ? jsonUnauthorized(session.error) : jsonForbidden(session.error);
  }

  try {
    const body = await request.json().catch(() => null);
    const email = normalizeInstitutionalEmail(typeof body?.email === "string" ? body.email : "");
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const department = typeof body?.department === "string" ? body.department.trim() : null;
    const faculty = typeof body?.faculty === "string" ? body.faculty.trim() : null;

    if (!email) {
      return NextResponse.json({ error: "Correo institucional inválido" }, { status: 400 });
    }
    if (name.length < 3 || name.length > 100) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }
    const pwdError = validatePassword(password);
    if (pwdError) {
      return NextResponse.json({ error: pwdError }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Ese correo ya está registrado" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const teacher = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "TEACHER",
        teacherProfile: {
          create: {
            department,
            faculty,
            isActive: true,
          },
        },
      },
      include: { teacherProfile: true },
    });

    return NextResponse.json(
      { ok: true, user: { id: teacher.id, email: teacher.email, name: teacher.name } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creando docente:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
