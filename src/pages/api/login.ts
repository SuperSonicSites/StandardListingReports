import type { APIRoute } from "astro";
import {
  adminCookieValue,
  authCookieHeader,
  clientCookieValue,
  sha256
} from "../../lib/auth";
import { readClient, readSnapshot } from "../../lib/storage";

export const prerender = false;

// The destination decides which client password is acceptable.
async function slugForPath(path: string): Promise<string | undefined> {
  const clientMatch = path.match(/^\/c\/([a-z0-9-]+)/);
  if (clientMatch) return clientMatch[1];
  const snapshotMatch = path.match(/^\/(?:reports|api\/pdf)\/([a-z0-9-]+)/);
  if (snapshotMatch) {
    try {
      return (await readSnapshot(snapshotMatch[1])).client.slug;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "").trim();
  let next = String(form.get("next") ?? "/");
  // Same-origin relative paths only — never an open redirect.
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";

  let cookie: string | undefined;

  // The admin password unlocks every scope.
  const adminPassword = (process.env.ADMIN_PASSWORD ?? import.meta.env.ADMIN_PASSWORD)?.trim();
  if (adminPassword && password === adminPassword) {
    cookie = adminCookieValue();
  } else {
    const slug = await slugForPath(next);
    if (slug) {
      try {
        const client = await readClient(slug);
        if (client.password_hash && sha256(password) === client.password_hash) {
          cookie = clientCookieValue(slug, client.password_hash);
        }
      } catch {
        // unknown client — same failure as a wrong password
      }
    }
  }

  if (!cookie) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/login?next=${encodeURIComponent(next)}&error=1` }
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: next, "Set-Cookie": authCookieHeader(cookie) }
  });
};
