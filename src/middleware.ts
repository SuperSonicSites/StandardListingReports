import { defineMiddleware } from "astro:middleware";
import { canAccessClient, isAdmin } from "./lib/auth";
import { readClient, readSnapshot } from "./lib/storage";

// /login and /api/login must stay reachable, and /api/health is the deploy
// healthcheck; the three body-parsing API routes authorize themselves after
// extracting the client slug from their payload (the middleware cannot read
// the body without consuming it).
const OPEN = /^\/(login|api\/login|api\/health)$/;
const SELF_GUARDED = /^\/api\/(pull|snapshot|client)$/;

function challenge(url: URL, request: Request): Response {
  const wantsHtml = request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml) {
    const next = encodeURIComponent(url.pathname + url.search);
    return new Response(null, { status: 303, headers: { Location: `/login?next=${next}` } });
  }
  return new Response("Sign-in required.", { status: 401 });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (OPEN.test(pathname) || SELF_GUARDED.test(pathname)) return next();

  const request = context.request;

  // Client-scoped surfaces: the coordinator form and anything snapshot-addressed.
  const clientMatch = pathname.match(/^\/c\/([a-z0-9-]+)/);
  const snapshotMatch = pathname.match(/^\/(?:reports|api\/pdf)\/([a-z0-9-]+)/);
  if (clientMatch || snapshotMatch) {
    try {
      const slug = clientMatch ? clientMatch[1] : (await readSnapshot(snapshotMatch![1])).client.slug;
      if (slug && canAccessClient(request, await readClient(slug))) return next();
    } catch {
      // Unknown client/snapshot: fall through to the same challenge as a wrong
      // password, so unauthenticated requests can't probe which slugs exist.
    }
    if (isAdmin(request)) return next(); // admin reaches 404 pages too
    return challenge(context.url, request);
  }

  // Everything else (home, /admin/*) is agency-only.
  if (isAdmin(request)) return next();
  return challenge(context.url, request);
});
