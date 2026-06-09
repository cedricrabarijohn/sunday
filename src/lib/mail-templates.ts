/**
 * Tiny, dependency-free HTML email templates. Inline styles only (email
 * clients ignore <style>/external CSS and CSS variables), table-free layout
 * kept simple. Every builder returns { subject, html }.
 */

const BRAND = "#5b5bd6"; // iris, matches the app accent (light value)

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(opts: { heading: string; body: string; cta?: { label: string; href: string }; footer?: string }): string {
  const { heading, body, cta, footer } = opts;
  const button = cta
    ? `<a href="${escape(cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">${escape(cta.label)}</a>`
    : "";
  const fallback = cta
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#71717a;">Or paste this link into your browser:<br><span style="color:#52525b;word-break:break-all;">${escape(cta.href)}</span></p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
      <div style="font-weight:700;font-size:18px;letter-spacing:-0.02em;color:#09090b;margin-bottom:24px;">
        sunday<span style="color:${BRAND};">.</span>
      </div>
      <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px 26px;">
        <h1 style="margin:0 0 12px;font-size:19px;font-weight:700;color:#09090b;letter-spacing:-0.01em;">${escape(heading)}</h1>
        <div style="font-size:14px;line-height:1.6;color:#52525b;">${body}</div>
        ${button ? `<div style="margin-top:22px;">${button}</div>` : ""}
        ${fallback}
      </div>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;text-align:center;">
        ${escape(footer ?? "You received this because someone used your address on Sunday.")}
      </p>
    </div>
  </body>
</html>`;
}

export function inviteEmail(opts: {
  inviterName: string;
  resourceKind: "workspace" | "board";
  resourceName: string;
  acceptUrl: string;
}): { subject: string; html: string } {
  const { inviterName, resourceKind, resourceName, acceptUrl } = opts;
  return {
    subject: `${inviterName} invited you to a ${resourceKind} on Sunday`,
    html: layout({
      heading: `Join “${resourceName}”`,
      body: `<strong>${escape(inviterName)}</strong> invited you to collaborate on the ${escape(resourceKind)} <strong>${escape(resourceName)}</strong>. Accept the invite to get started.`,
      cta: { label: "Accept invite", href: acceptUrl },
      footer: "If you weren't expecting this, you can ignore this email.",
    }),
  };
}

export function passwordResetEmail(opts: { resetUrl: string; minutes: number }): { subject: string; html: string } {
  return {
    subject: "Reset your Sunday password",
    html: layout({
      heading: "Reset your password",
      body: `We got a request to reset your password. This link expires in ${opts.minutes} minutes. If you didn't ask for this, just ignore this email — your password stays the same.`,
      cta: { label: "Choose a new password", href: opts.resetUrl },
      footer: "This link only works once.",
    }),
  };
}

export function verifyEmail(opts: { verifyUrl: string }): { subject: string; html: string } {
  return {
    subject: "Confirm your email for Sunday",
    html: layout({
      heading: "Confirm your email",
      body: "Welcome to Sunday. Confirm your email address to finish setting up your account.",
      cta: { label: "Confirm email", href: opts.verifyUrl },
      footer: "If you didn't create a Sunday account, you can ignore this.",
    }),
  };
}

export function notificationEmail(opts: {
  actorName: string;
  action: string; // e.g. "assigned you to", "mentioned you on", "commented on"
  cardTitle: string;
  boardName: string;
  preview?: string;
  cardUrl: string;
}): { subject: string; html: string } {
  const { actorName, action, cardTitle, boardName, preview, cardUrl } = opts;
  const previewHtml = preview
    ? `<div style="margin-top:14px;padding:12px 14px;background:#f4f4f5;border-radius:8px;font-size:13px;color:#52525b;">${escape(preview)}</div>`
    : "";
  return {
    subject: `${actorName} ${action} “${cardTitle}”`,
    html: layout({
      heading: cardTitle,
      body: `<strong>${escape(actorName)}</strong> ${escape(action)} <strong>${escape(cardTitle)}</strong> in ${escape(boardName)}.${previewHtml}`,
      cta: { label: "Open card", href: cardUrl },
      footer: "You're getting this because you're involved on this card.",
    }),
  };
}
