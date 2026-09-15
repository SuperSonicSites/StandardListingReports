import { defineMiddleware } from "astro:middleware";
import { canAccessClient, isAdminEmail, sessionEmail } from "./lib/auth";
import { brandedErrorPage } from "./lib/error-page";
import { readClient, readSnapshot } from "./lib/storage";

// The sign-in flow and the deploy healthcheck stay reachable; the body-parsing
// API routes authorize themselves after extracting the client slug from their
// payload (the middleware cannot read the body without consuming it).
const OPEN = /^\/(login|login\/sent|auth\/verify|api\/login|api\/logout|api\/health)$/;
const SELF_GUARDED = /^\/api\/(pull|snapshot|client|listing-ad)$/;

function wantsHtml(request: Request) {
  return request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
}

// Not signed in: browsers go to /login and come back; API callers get a 401.
function challenge(url: URL, request: Request): Response {
  if (wantsHtml(request)) {
    const next = encodeURIComponent(url.pathname + url.search);
    return new Response(null, { status: 303, headers: { Location: `/login?next=${next}` } });
  }
  return new Response("Sign-in required.", { status: 401 });
}

// Signed in, but this email isn't on that client's access list (or the client
// doesn't exist — same answer, so slugs can't be probed).
function forbidden(request: Request): Response {
  if (wantsHtml(request)) {
    return brandedErrorPage({
      status: 403,
      eyebrow: "No access",
      title: "This account can't open that page.",
      reason:
        "That page belongs to another client or to the Supersonic team. If your email should have access, ask us at hello@supersonicsites.com.",
      primaryLabel: "← Go back",
      secondary: { label: "Back to the portal", href: "/portal" }
    });
  }
  return new Response("Forbidden.", { status: 403 });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (OPEN.test(pathname) || SELF_GUARDED.test(pathname)) return next();

  const request = context.request;
  const email = sessionEmail(request);
  if (!email) return challenge(context.url, request);
  const admin = isAdminEmail(email);

  // Client-scoped surfaces: the coordinator form and anything snapshot-addressed.
  const clientMatch = pathname.match(/^\/c\/([a-z0-9-]+)/);
  const snapshotMatch = pathname.match(/^\/(?:reports|api\/pdf)\/([a-z0-9-]+)/);
  if (clientMatch || snapshotMatch) {
    try {
      const slug = clientMatch ? clientMatch[1] : (await readSnapshot(snapshotMatch![1])).client.slug;
      if (slug && canAccessClient(request, await readClient(slug))) return next();
    } catch {
      // Unknown client/snapshot: fall through to the same 403 as a wrong client.
    }
    if (admin) return next(); // admin reaches 404 pages too
    return forbidden(request);
  }

  // The portal is for everyone who is signed in; the home dashboard and
  // /admin/* are agency-only (a client session is sent to its portal instead).
  if (pathname === "/portal" || admin) return next();
  if (pathname === "/") return context.redirect("/portal", 303);
  return forbidden(request);
});
