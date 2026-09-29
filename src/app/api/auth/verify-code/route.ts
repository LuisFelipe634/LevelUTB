import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  deriveAdmissionYearFromCode,
  normalizeInstitutionalEmail,
  parseInstitutionalEmail,
  validatePassword,
  validateStudentCode,
} from "@/lib/institutionalEmail";
import { hashOtpCode } from "@/lib/emailProvider";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";

/** Resultado de un paso del registro que puede cortar el flujo con un 4xx/5xx. */
type Resolved<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

type RegistrationInput = {
  email: string | null;
  code: string;
  name: string;
  password: string;
  rawStudentCode: string;
};

type ValidatedRegistration = {
  email: string;
  code: string;
  name: string;
  password: string;
  rawStudentCode: string;
};

type VerificationToken = {
  id: string;
  email: string;
  consumedAt: Date | null;
  expiresAt: Date;
  attempts: number;
};

type AcademicIdentity = {
  studentCode: string;
  admissionYear: number | null;
  programId: string | null;
  displayName: string;
};

function failResponse(error: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

function fail<T>(error: string, status: number, extra?: Record<string, unknown>): Resolved<T> {
  return { ok: false, response: failResponse(error, status, extra) };
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRegistrationInput(body: unknown): RegistrationInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  return {
    email: normalizeInstitutionalEmail(readText(raw.email)),
    code: readText(raw.code),
    name: readText(raw.name),
    // La contraseña no se recorta: los espacios pueden ser parte del secreto.
    password: typeof raw.password === "string" ? raw.password : "",
    rawStudentCode: readText(raw.studentCode),
  };
}

function validateRegistrationInput(input: RegistrationInput): Resolved<ValidatedRegistration> {
  if (!input.email) return fail("Correo institucional inválido", 400);
  if (!/^\d{6}$/.test(input.code)) return fail("Código de 6 dígitos inválido", 400);
  if (input.name.length < 3 || input.name.length > 100) {
    return fail("Nombre inválido (3-100 caracteres)", 400);
  }

  const pwdError = validatePassword(input.password);
  if (pwdError) return fail(pwdError, 400);

  return {
    ok: true,
    value: {
      email: input.email,
      code: input.code,
      name: input.name,
      password: input.password,
      rawStudentCode: input.rawStudentCode,
    },
  };
}

async function verifyOtpToken(code: string, email: string): Promise<Resolved<VerificationToken>> {
  const token = await prisma.emailVerificationToken.findUnique({
    where: { codeHash: hashOtpCode(code) },
  });

  if (!token || token.email !== email || token.consumedAt || token.expiresAt < new Date()) {
    return fail("Código inválido o vencido", 400);
  }
  if (token.attempts >= 5) {
    return fail("Código bloqueado por intentos. Solicita uno nuevo.", 400);
  }

  return { ok: true, value: token };
}

async function incrementTokenAttempts(tokenId: string): Promise<void> {
  await prisma.emailVerificationToken
    .update({ where: { id: tokenId }, data: { attempts: { increment: 1 } } })
    .catch(() => undefined);
}

// Resolver studentCode + programId + admissionYear (correo = código)
async function resolveAcademicIdentity(
  input: ValidatedRegistration,
  tokenId: string,
): Promise<Resolved<AcademicIdentity>> {
  const parsed = parseInstitutionalEmail(input.email);
  if (!parsed) return fail("Correo institucional no reconocido", 400);

  // 1) Allowlist PROA/Banner tiene prioridad si existe
  const allowed = await prisma.allowedStudent
    .findUnique({ where: { email: input.email } })
    .catch(() => null);

  if (allowed) {
    return {
      ok: true,
      value: {
        studentCode: allowed.studentCode,
        admissionYear: allowed.admissionYear,
        programId: allowed.programId,
        displayName: allowed.fullName && !input.name ? allowed.fullName : input.name,
      },
    };
  }

  if (parsed.kind === "code") {
    return {
      ok: true,
      value: {
        studentCode: parsed.studentCode,
        admissionYear: parsed.admissionYear,
        programId: null,
        displayName: input.name,
      },
    };
  }

  // Email nominal sin allowlist: exige studentCode manual
  const codeError = validateStudentCode(input.rawStudentCode);
  if (codeError) {
    await incrementTokenAttempts(tokenId);
    return fail("Tu correo no contiene el código. Ingresa tu código estudiantil (8-10 dígitos).", 400, {
      code: "STUDENT_CODE_REQUIRED",
    });
  }

  return {
    ok: true,
    value: {
      studentCode: input.rawStudentCode,
      admissionYear: deriveAdmissionYearFromCode(input.rawStudentCode),
      programId: null,
      displayName: input.name,
    },
  };
}

// Programa: del allowlist o default ISCO activo; ampliable a multi-programa
// por prefijo de código o dominio cuando PROA lo provea.
async function resolveProgramId(allowlisted: string | null): Promise<Resolved<string>> {
  if (allowlisted) return { ok: true, value: allowlisted };

  const program =
    (await prisma.program.findFirst({ where: { code: "ISCO", isActive: true } })) ??
    (await prisma.program.findFirst({ where: { isActive: true } }));
  if (!program) return fail("Sin programas académicos configurados", 500);

  return { ok: true, value: program.id };
}

// Unicidad de código (evita colisión con seed demo)
async function isStudentCodeAvailable(studentCode: string): Promise<boolean> {
  const taken = await prisma.studentProfile.findUnique({ where: { studentCode } }).catch(() => null);
  return taken === null;
}

function createRegisteredUser(input: {
  email: string;
  displayName: string;
  passwordHash: string;
  studentCode: string;
  admissionYear: number;
  programId: string;
  tokenId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        name: input.displayName,
        passwordHash: input.passwordHash,
        role: "STUDENT",
        studentProfile: {
          create: {
            studentCode: input.studentCode,
            programId: input.programId,
            currentSemester: 1,
            admissionYear: input.admissionYear,
            totalCredits: 0,
            averageGrade: 0,
            level: 1,
          },
        },
      },
      include: { studentProfile: true },
    });

    await tx.emailVerificationToken.update({
      where: { id: input.tokenId },
      data: { consumedAt: new Date() },
    });

    await tx.notification
      .create({
        data: {
          userId: created.id,
          title: "¡Bienvenido a UTB Gamificación!",
          message: `Tu cuenta ${input.email} fue verificada. Completa tu malla y empieza a ganar puntos.`,
          type: "INFO",
          link: "/malla",
        },
      })
      .catch(() => undefined);

    return created;
  });
}

/**
 * POST /api/auth/verify-code
 * { email, code, name, password, studentCode? }
 * - Prueba de posesión del buzón institucional (OTP).
 * - Aprovisionamiento JIT: crea User(STUDENT) + StudentProfile.
 * - Docentes NO se auto-registran: solo vía /api/admin/teachers.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const validated = validateRegistrationInput(readRegistrationInput(body));
    if (!validated.ok) return validated.response;
    const { email, code, password } = validated.value;

    const rl = rateLimit(rateLimitKey("verify", email), 10, 60 * 60 * 1000);
    if (!rl.allowed) {
      return failResponse("Demasiados intentos. Solicita un código nuevo.", 429);
    }

    const verified = await verifyOtpToken(code, email);
    if (!verified.ok) return verified.response;
    const token = verified.value;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.emailVerificationToken
        .update({ where: { id: token.id }, data: { consumedAt: new Date() } })
        .catch(() => undefined);
      return failResponse("Este correo ya está registrado. Inicia sesión.", 409, {
        code: "ALREADY_REGISTERED",
      });
    }

    const identity = await resolveAcademicIdentity(validated.value, token.id);
    if (!identity.ok) return identity.response;
    const { studentCode, admissionYear, programId: allowlistedProgramId, displayName } = identity.value;

    if (!studentCode || !admissionYear) {
      return failResponse("No se pudo derivar tu información académica del correo", 400);
    }

    const programId = await resolveProgramId(allowlistedProgramId);
    if (!programId.ok) return programId.response;

    if (!(await isStudentCodeAvailable(studentCode))) {
      return failResponse("Ese código estudiantil ya está vinculado a otra cuenta", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createRegisteredUser({
      email,
      displayName,
      passwordHash,
      studentCode,
      admissionYear,
      programId: programId.value,
      tokenId: token.id,
    });

    return NextResponse.json(
      {
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        studentCode: user.studentProfile?.studentCode,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error verify-code:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
