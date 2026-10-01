import { createHash, randomInt } from "node:crypto";

/**
 * Proveedor de envío de OTP con fallback por entorno:
 * 1) RESEND_API_KEY => API Resend (prod recomendado sin SMTP propio).
 * 2) SMTP_HOST => log estructurado (conectar nodemailer en despliegue real).
 * 3) dev => console.log con el código (DX). En prod sin proveedor => error controlado.
 */

export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function sendVerificationCode(email: string, code: string): Promise<{ sent: boolean; via: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const smtpHost = process.env.SMTP_HOST;

  if (resendKey) {
    const from = process.env.EMAIL_FROM || "UTB Gamificación <no-reply@utb.edu.co>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Tu código de verificación UTB",
          text: `Tu código de verificación es ${code}. Vence en 15 minutos. Si no lo solicitaste, ignora este mensaje.`,
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
      return { sent: true, via: "resend" };
    } catch (error) {
      console.error("Error enviando OTP vía Resend:", error);
      throw new Error("No se pudo enviar el correo de verificación");
    }
  }

  if (smtpHost) {
    // Punto de integración SMTP institucional: conectar nodemailer con
    // SMTP_HOST/PORT/USER/PASS. Por ahora log estructurado para no añadir deps.
    console.log(`[SMTP ${smtpHost}] OTP para ${email}: ${code}`);
    return { sent: true, via: "smtp-log" };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Código de verificación para ${email}: ${code}`);
    return { sent: true, via: "console-dev" };
  }

  throw new Error("Sin proveedor de correo configurado (RESEND_API_KEY o SMTP_HOST)");
}
