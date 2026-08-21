import type { APIRoute } from "astro";
import {
  appUrl,
  createLinkToken,
  emailMatches,
  isAdminEmail,
  isValidEmail,
  loginCookieHeader,
  normalizeEmail,
  safeNext
} from "../../lib/auth";
import { sendSignInLink } from "../../lib/mail";
import { listClients } from "../../lib/storage";

export const prerender = false;

// ponytail: in-memory, per-process throttle. Per-address: 3 attempts / 10 min
// (counted before the access check, so unknown addresses can't be probed
// faster than known ones). Global: 30 *sent* links / 10 min, because a
// "@domain.com" rule makes unlimited distinct addresses valid. Move to disk if
// the app ever runs >1 instance.
const WINDOW_MS = 10 * 60_000;
const PER_EMAIL_MAX = 3;
const GLOBAL_MAX = 30;
const attempts = new Map<string, number[]>();
let sent: number[] = [];

function recent(times: number[]) {
  const now = Date.now();
  return times.filter((t) => now - t < WINDOW_MS);
}

function throttled(email: string) {
  const hits = recent(attempts.get(email) ?? []);
  hits.push(Date.now());
  attempts.set(email, hits);
  sent = recent(sent);
  return hits.length > PER_EMAIL_MAX || sent.length >= GLOBAL_MAX;
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const next = safeNext(String(form.get("next") ?? ""), "");
  const state = { email, next };
  const back = (error: string) =>
    new Response(null, {
      status: 303,
      headers: { Location: `/login?error=${error}`, "Set-Cookie": loginCookieHeader(state) }
    });

  if (!isValidEmail(email)) return back("invalid");
  if (throttled(email)) return back("rate");

  // Authorized = an agency admin, or listed on at least one client profile.
  const clients = await listClients();
  const authorized = isAdminEmail(email) || clients.some((client) => emailMatches(email, client.emails));
  if (!authorized) return back("unknown");

  const token = createLinkToken(email, next || undefined);
  if (!token) {
    console.error("[auth] Cannot sign a link: AUTH_SECRET is not set.");
    return back("send");
  }

  try {
    await sendSignInLink(email, `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error(`[mail] Sign-in email to ${email} failed:`, error instanceof Error ? error.message : error);
    return back("send");
  }
  sent.push(Date.now());

  const resent = form.get("resend") ? "?resent=1" : "";
  return new Response(null, {
    status: 303,
    headers: { Location: `/login/sent${resent}`, "Set-Cookie": loginCookieHeader(state) }
  });
};
