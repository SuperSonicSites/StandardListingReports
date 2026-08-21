import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ClientProfile } from "./types";

/**
 * Magic-link gate. No passwords, no session store.
 *
 *  - A sign-in link carries a short-lived HMAC-signed token for one email
 *    address; opening it exchanges the token for a 30-day signed session cookie.
 *  - Authorization is decided on EVERY request from the signed-in email:
 *    ADMIN_EMAILS (env) opens everything; a client profile's `emails` list
 *    (addresses, or "@domain.com" for a whole team) opens that client's form
 *    and reports. Removing an email revokes access immediately — nothing to
 *    invalidate, because the cookie only proves "who", never "what".
 *  - Tokens are stateless (base64url payload + HMAC). A link is therefore
 *    reusable until it expires (15 min), which is the deliberate trade for
 *    having no token table. ponytail: add data/auth/used-links.json if
 *    single-use links ever matter.
 */
export const AUTH_COOKIE = "srg_auth";
// The address typed on /login (and where they were headed) rides this
// short-lived cookie to the next page — prefill on error, "we sent it to …" on
// success, and a resend that still lands on the right page. Never a query string.
export const LOGIN_COOKIE = "ss_login";
export type LoginState = { email: string; next: string };

export function loginCookieHeader(state: LoginState) {
  return `${LOGIN_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
}

export function readLoginCookie(raw: string | undefined): LoginState {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw ?? ""));
    return { email: String(parsed.email ?? ""), next: safeNext(String(parsed.next ?? ""), "") };
  } catch {
    return { email: "", next: "" };
  }
}
export const LINK_MINUTES = 15;
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function env(name: "AUTH_SECRET" | "ADMIN_EMAILS" | "APP_URL"): string | undefined {
  // Trim: platform variable UIs love to smuggle in trailing whitespace/newlines.
  const value = (process.env[name] ?? import.meta.env[name])?.trim();
  return value || undefined;
}

// Signing key for links + sessions. Fail closed in production; dev gets a
// throwaway key so `npm run dev` works out of the box (sessions reset on restart).
const SECRET = env("AUTH_SECRET") ?? (import.meta.env.DEV ? randomBytes(32).toString("hex") : undefined);

// One log line each at boot so "is the deployment configured?" is answerable
// from the host logs without guessing. Never logs the values.
console.log(
  `[auth] AUTH_SECRET is ${env("AUTH_SECRET") ? "set" : import.meta.env.DEV ? "NOT set — using a random dev key" : "NOT set — sign-in will always fail"}`
);
console.log(`[auth] ADMIN_EMAILS: ${adminEmails().length} address(es)`);
console.log(`[auth] APP_URL: ${appUrl()}`);

/** Public base URL used in sign-in links (never the request's own origin — host headers are client-controlled). */
export function appUrl(): string {
  return (env("APP_URL") ?? "https://supersonicrealtors.com").replace(/\/+$/, "");
}

// The agency's own sign-in address. ADMIN_EMAILS (comma-separated) overrides it;
// this is agency config, not client data, so a default does not break white-label.
const DEFAULT_ADMIN_EMAILS = "dev@supersonicsites.com";

export function adminEmails(): string[] {
  return (env("ADMIN_EMAILS") ?? DEFAULT_ADMIN_EMAILS)
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/** Access-list entries are full addresses or "@domain.com" (everyone at that domain). */
export function isValidAccessEntry(value: string) {
  return isValidEmail(value) || /^@[^\s@]+\.[^\s@]+$/.test(value);
}

export function emailMatches(email: string, entries: string[] | undefined): boolean {
  const normalized = normalizeEmail(email);
  return (entries ?? []).some((entry) => {
    const rule = normalizeEmail(entry);
    return rule.startsWith("@") ? normalized.endsWith(rule) : rule === normalized;
  });
}

export function isAdminEmail(email: string) {
  return emailMatches(email, adminEmails());
}

// --- Signed tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256) ---
type TokenKind = "link" | "session";
type Payload = { k: TokenKind; e: string; x: number; n?: string };

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: Payload): string | undefined {
  if (!SECRET) return undefined;
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verifyToken(token: string | undefined, kind: TokenKind): Payload | undefined {
  if (!token || !SECRET) return undefined;
  const dot = token.indexOf(".");
  if (dot === -1) return undefined;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  // Compare byte lengths, not string lengths — timingSafeEqual throws on a mismatch.
  const given = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as Payload;
    if (payload.k !== kind || typeof payload.e !== "string" || payload.x < Date.now()) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

/**
 * Same-origin relative paths only — never an open redirect. One leading slash,
 * not followed by another slash/backslash (protocol-relative), and no whitespace
 * or control characters anywhere (browsers strip TAB/LF inside a URL, so
 * "/<TAB>/evil.com" would otherwise become "//evil.com").
 */
export function safeNext(value: string | null | undefined, fallback: string) {
  const next = (value ?? "").trim();
  return /^\/(?![/\\])[^\s\\\x00-\x1f]*$/.test(next) ? next : fallback;
}

export function createLinkToken(email: string, next?: string) {
  return signPayload({
    k: "link",
    e: normalizeEmail(email),
    x: Date.now() + LINK_MINUTES * 60_000,
    ...(next ? { n: next } : {})
  });
}

export function verifyLinkToken(token: string | undefined): { email: string; next?: string } | undefined {
  const payload = verifyToken(token, "link");
  return payload ? { email: payload.e, next: payload.n } : undefined;
}

export function createSessionToken(email: string) {
  return signPayload({ k: "session", e: normalizeEmail(email), x: Date.now() + SESSION_SECONDS * 1000 });
}

function cookieValue(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === AUTH_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined; // malformed percent-encoding is just "not signed in"
      }
    }
  }
  return undefined;
}

/** The signed-in email, or undefined. Proves identity only — check access separately. */
export function sessionEmail(request: Request): string | undefined {
  return verifyToken(cookieValue(request), "session")?.e;
}

export function isAdmin(request: Request): boolean {
  const email = sessionEmail(request);
  return Boolean(email && isAdminEmail(email));
}

/** Admin passes everywhere; a client session only matches clients that list its email. */
export function canAccessClient(request: Request, client: Pick<ClientProfile, "emails">): boolean {
  const email = sessionEmail(request);
  if (!email) return false;
  return isAdminEmail(email) || emailMatches(email, client.emails);
}

// `Secure` only when the public URL is https — local `npm run preview` is plain http
// and a Secure cookie there would silently never be stored (an instant login loop).
const SECURE = appUrl().startsWith("https:") ? "; Secure" : "";

export function authCookieHeader(token: string) {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${SECURE}`;
}

export function clearAuthCookieHeader() {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE}`;
}
