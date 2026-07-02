import type { APIRoute } from "astro";

export const prerender = false;

// Deploy healthcheck target. Deliberately unauthenticated (see middleware OPEN list):
// every other route now 401s anonymous non-browser requests, which a platform
// healthcheck reads as "deployment failed".
export const GET: APIRoute = async () => {
  return new Response("ok", { headers: { "Content-Type": "text/plain" } });
};
