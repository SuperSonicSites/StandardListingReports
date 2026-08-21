import type { APIRoute } from "astro";
import {
  authCookieHeader,
  createSessionToken,
  emailMatches,
  isAdminEmail,
  safeNext,
  verifyLinkToken
} from "../../lib/auth";
import { readClient, readSnapshot } from "../../lib/storage";

export const prerender = false;

// A client lands only on its own surfaces: the portal, or the client-scoped page
// they were headed to IF their email is on that client's list. Anything else
// (admin pages, another client's form, an unknown slug) becomes the portal.
async function clientDestination(email: string, next: string): Promise<string> {
  const clientMatch = next.match(/^\/c\/([a-z0-9-]+)/);
  const snapshotMatch = next.match(/^\/(?:reports|api\/pdf)\/([a-z0-9-]+)/);
  if (!clientMatch && !snapshotMatch) return "/portal";
  try {
    const slug = clientMatch ? clientMatch[1] : (await readSnapshot(snapshotMatch![1])).client.slug;
    if (!slug) return "/portal";
    return emailMatches(email, (await readClient(slug)).emails) ? next : "/portal";
  } catch {
    return "/portal";
  }
}

// The magic link lands here: exchange a valid link token for a session cookie and
// continue to where the coordinator was headed. Invalid/expired → back to /login
// with a clear reason (no dead-end page).
export const GET: APIRoute = async ({ url }) => {
  const link = verifyLinkToken(url.searchParams.get("token") ?? undefined);
  const session = link && createSessionToken(link.email);
  if (!link || !session) {
    return new Response(null, { status: 303, headers: { Location: "/login?error=expired" } });
  }
  const next = isAdminEmail(link.email)
    ? safeNext(link.next, "/")
    : await clientDestination(link.email, safeNext(link.next, "/portal"));
  return new Response(null, {
    status: 303,
    headers: { Location: next, "Set-Cookie": authCookieHeader(session) }
  });
};
