import { LINK_MINUTES } from "./auth";

// Sign-in email via Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
// Plain fetch — no SDK for one POST. Server-side only; the key never leaves the server.

function env(name: "RESEND_API_KEY" | "MAIL_FROM"): string | undefined {
  const value = (process.env[name] ?? import.meta.env[name])?.trim();
  return value || undefined;
}

const SUPPORT_EMAIL = "hello@supersonicsites.com";
const DEFAULT_FROM = "Supersonic Realtors <login@supersonicrealtors.com>";

/** The display name coordinators should look for in their inbox. */
export function mailFromName() {
  const from = env("MAIL_FROM") ?? DEFAULT_FROM;
  return from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from;
}

console.log(`[mail] RESEND_API_KEY is ${env("RESEND_API_KEY") ? "set" : import.meta.env.DEV ? "NOT set — sign-in links will be printed to this console" : "NOT set — sign-in emails will fail"}`);

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One transactional email through Resend. Returns Resend's message id ("dev-console" when printed instead). */
export async function sendMail(message: { to: string[]; subject: string; text: string; html: string }): Promise<{ id: string }> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    if (import.meta.env.DEV) {
      console.log(`[mail] (dev, no RESEND_API_KEY) "${message.subject}" to ${message.to.join(", ")}:\n${message.text}`);
      return { id: "dev-console" };
    }
    throw new Error("not configured: RESEND_API_KEY is not set — cannot send email.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM") ?? DEFAULT_FROM, to: message.to, reply_to: SUPPORT_EMAIL, subject: message.subject, text: message.text, html: message.html }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await response.json().catch(() => ({}))) as { id?: string };
  return { id: String(body.id ?? "") };
}

export { esc as escapeHtml };

export async function sendSignInLink(to: string, url: string): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    if (import.meta.env.DEV) {
      console.log(`[mail] (dev, no RESEND_API_KEY) sign-in link for ${to}:\n       ${url}`);
      return;
    }
    throw new Error("not configured: RESEND_API_KEY is not set — cannot send sign-in emails.");
  }

  const subject = "Your Supersonic Realtors sign-in link";
  const text = [
    "Here is your secure sign-in link for the Supersonic Realtors portal:",
    "",
    url,
    "",
    `It expires in ${LINK_MINUTES} minutes. If you didn't request it, you can ignore this email.`,
    "",
    `Need a hand? ${SUPPORT_EMAIL}`
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f5f6f8;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="520" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb" cellspacing="0" cellpadding="0">
<tr><td style="padding:36px 40px 8px">
  <p style="margin:0 0 18px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#c8102e">Secure team access</p>
  <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-.02em;color:#0f172a">Ready for takeoff?</h1>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">Here is your secure sign-in link for the Supersonic Realtors portal. It expires in ${LINK_MINUTES} minutes.</p>
  <a href="${esc(url)}" style="display:inline-block;background:#0b5fd7;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:10px">Sign in securely &rarr;</a>
  <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b">If the button doesn't work, paste this link into your browser:<br><a href="${esc(url)}" style="color:#0b5fd7;word-break:break-all">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:20px 40px 32px;border-top:1px solid #eef0f3;margin-top:16px">
  <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">If you didn't request this, you can safely ignore it. Need a hand? <a href="mailto:${SUPPORT_EMAIL}" style="color:#64748b">${SUPPORT_EMAIL}</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("MAIL_FROM") ?? DEFAULT_FROM,
      to: [to],
      reply_to: SUPPORT_EMAIL,
      subject,
      text,
      html
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    // Resend returns {message} on failure; never log the recipient's link.
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
  }
}
