import { createHash } from "node:crypto";
import type { ClientProfile } from "./types";

/**
 * Password gate. Two scopes:
 *  - admin: one password from ADMIN_PASSWORD (env), unlocks everything.
 *  - client:<slug>: per-client password set in the admin form, stored as a
 *    sha256 hash in the client profile, unlocks that client's form + reports.
 * The cookie carries a derived token (never the password), so changing a
 * password invalidates outstanding cookies with no session state on disk.
 */
export const AUTH_COOKIE = "srg_auth";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function adminPassword(): string | undefined {
  // Trim: platform variable UIs love to smuggle in trailing whitespace/newlines.
  const value = (process.env.ADMIN_PASSWORD ?? import.meta.env.ADMIN_PASSWORD)?.trim();
  return value || undefined;
}

// One log line at boot so "is the variable actually set on this deployment?"
// is answerable from the host logs without guessing. Never logs the value.
console.log(`[auth] ADMIN_PASSWORD is ${adminPassword() ? "set" : "NOT set — admin sign-in will always fail"}`);

export function adminCookieValue(): string | undefined {
  const password = adminPassword();
  return password ? `admin:${sha256(`admin:${password}`)}` : undefined;
}

export function clientCookieValue(slug: string, passwordHash: string) {
  return `client:${slug}:${sha256(`${slug}:${passwordHash}`)}`;
}

function cookieValue(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === AUTH_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function isAdmin(request: Request): boolean {
  const value = cookieValue(request);
  const expected = adminCookieValue();
  return Boolean(value && expected && value === expected);
}

/** Admin passes everywhere; a client cookie only matches its own slug. */
export function canAccessClient(request: Request, client: Pick<ClientProfile, "slug" | "password_hash">): boolean {
  if (isAdmin(request)) return true;
  if (!client.password_hash) return false;
  return cookieValue(request) === clientCookieValue(client.slug, client.password_hash);
}

export function authCookieHeader(value: string) {
  return `${AUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS}`;
}
