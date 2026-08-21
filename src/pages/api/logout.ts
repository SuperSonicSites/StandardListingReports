import type { APIRoute } from "astro";
import { clearAuthCookieHeader } from "../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async () =>
  new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": clearAuthCookieHeader() }
  });
