import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP mailer. Configured entirely from env so it works with any provider
 * (local Mailpit in dev, your own SMTP / Mailgun / SES in prod):
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"),
 *   SMTP_USER, SMTP_PASSWORD            (user/pass optional — Mailpit needs none)
 *   MAIL_FROM   e.g. 'Sunday <no-reply@sunday.app>'
 *   APP_URL     absolute base URL used to build links in emails
 *
 * If SMTP_HOST is missing we no-op (and log) so a misconfigured environment
 * never crashes a request — sending mail is always best-effort.
 */

const globalForMail = globalThis as unknown as { __mailer?: Transporter | null };

function getTransport(): Transporter | null {
  if (globalForMail.__mailer !== undefined) return globalForMail.__mailer;

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn("[mail] SMTP_HOST not set — emails are disabled.");
    globalForMail.__mailer = null;
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = (process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  globalForMail.__mailer = nodemailer.createTransport({
    host,
    port,
    secure, // true for 465, false for 587/1025 (STARTTLS or none)
    auth: user ? { user, pass } : undefined,
  });
  return globalForMail.__mailer;
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

/**
 * Best-effort send. Returns true on success, false if disabled or it failed —
 * callers should not block their flow on the result.
 */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;

  const from = process.env.MAIL_FROM || "Sunday <no-reply@sunday.local>";
  try {
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      replyTo: input.replyTo,
    });
    return true;
  } catch (err) {
    console.error("[mail] send failed:", err);
    return false;
  }
}

/** Crude HTML -> text fallback for clients that don't render HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
