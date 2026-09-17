import type { APIRoute } from "astro";
import { canAccessClient, sessionEmail } from "../../lib/auth";
import { isRealtorStatsUrl } from "../../lib/listing-ads";
import { fetchRealtorAdminStats } from "../../lib/realtor";
import { readClient } from "../../lib/storage";

export const prerender = false;

// "Fetch listing details" on the order form: address, MLS number, list date and
// first photo from the REALTOR.ca member share link, through the same headless
// capture the report generator uses. Prefill only; everything stays editable.

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export const POST: APIRoute = async ({ request }) => {
  if (!sessionEmail(request)) return json(401, { ok: false, error: "Sign-in required." });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json(415, { ok: false, error: "Unsupported request." });
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  let client;
  try {
    client = await readClient(String(body.client_slug ?? ""));
  } catch {
    // unknown slug: same answer as no access
  }
  if (!client || !canAccessClient(request, client)) return json(403, { ok: false, error: "No access." });

  const url = typeof body.realtor_stats_url === "string" ? body.realtor_stats_url.trim() : "";
  if (!isRealtorStatsUrl(url)) return json(400, { ok: false, error: "Use the Share Listing link from REALTOR.ca." });

  const stats = await fetchRealtorAdminStats(url);
  return json(200, {
    ok: true,
    address: stats.address ?? "",
    mls_number: stats.mls_number ?? "",
    list_date: stats.list_date ?? "",
    image_url: stats.image_url ?? "",
    warning: stats.warning ?? (stats.failure ? "We couldn’t read that listing page. Type the details instead." : "")
  });
};
