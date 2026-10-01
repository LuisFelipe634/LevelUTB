/**
 * Correo institucional como llave canónica.
 * - Local-part numérico (2019123456@utb.edu.co) => studentCode directo.
 * - Local-part nominal (juan.perez@utb.edu.co) => se resuelve vía AllowedStudent (PROA/Banner) o studentCode manual.
 */

export const INSTITUTIONAL_DOMAIN = "@utb.edu.co";

// Regex exacta: evita subdominios y sufijos tipo @utb.edu.co.evil.com
const INSTITUTIONAL_RE = /^[a-z0-9._-]+@utb\.edu\.co$/;

export function normalizeInstitutionalEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!INSTITUTIONAL_RE.test(normalized)) return null;
  return normalized;
}

export function isInstitutionalEmail(email: string | null | undefined): boolean {
  return normalizeInstitutionalEmail(email) !== null;
}

export type ParsedInstitutionalEmail =
  | { kind: "code"; studentCode: string; admissionYear: number }
  | { kind: "named"; localPart: string };

/**
 * Parsea el local-part:
 * - 8-10 dígitos => código universitario. Año = primeros 4 dígitos.
 * - otro => nombre (requiere AllowedStudent o studentCode manual).
 */
export function parseInstitutionalEmail(normalizedEmail: string): ParsedInstitutionalEmail | null {
  const at = normalizedEmail.indexOf("@");
  if (at <= 0) return null;
  const local = normalizedEmail.slice(0, at);
  if (/^\d{8,10}$/.test(local)) {
    const admissionYear = Number(local.slice(0, 4));
    if (!Number.isFinite(admissionYear) || admissionYear < 1990 || admissionYear > new Date().getFullYear() + 1) {
      return null;
    }
    return { kind: "code", studentCode: local, admissionYear };
  }
  if (/^[a-z0-9._-]{2,64}$/.test(local)) {
    return { kind: "named", localPart: local };
  }
  return null;
}

export function deriveAdmissionYearFromCode(studentCode: string): number | null {
  if (!/^\d{8,10}$/.test(studentCode)) return null;
  const year = Number(studentCode.slice(0, 4));
  const now = new Date().getFullYear();
  if (year < 1990 || year > now + 1) return null;
  return year;
}

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || !PASSWORD_RE.test(password)) {
    return "La contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número";
  }
  return null;
}

export function validateStudentCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!/^\d{8,10}$/.test(trimmed)) {
    return "Código estudiantil inválido (8-10 dígitos)";
  }
  return null;
}
