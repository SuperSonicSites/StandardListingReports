import type { APIRoute } from "astro";
import { canAccessClient } from "../../lib/auth";
import { readClient } from "../../lib/storage";
import { fetchFacebookPostMetrics, fetchInstagramMediaMetrics } from "../../lib/meta";
import { fetchRealtorAdminStats } from "../../lib/realtor";
import { fetchRybbitListingViews, fetchRybbitSiteTotalViews } from "../../lib/rybbit";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // A body of valid-JSON `null` (or a bare number/string) parses fine — coerce anything
  // non-object to {} so this route keeps its "400, never 500" contract.
  const raw = await request.json().catch(() => null);
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const slug = String(body.client_slug ?? "").trim();
  if (!slug) {
    return new Response("Missing client slug.", { status: 400 });
  }

  let client;
  try {
    client = await readClient(slug);
  } catch {
    return new Response("Client profile not found.", { status: 404 });
  }

  if (!canAccessClient(request, client)) {
    return new Response("Sign-in required.", { status: 401 });
  }

  const listingUrl = String(body.listing_url ?? "");
  const facebookUrl = String(body.facebook_post_url ?? "");
  const instagramUrl = String(body.instagram_post_url ?? "");
  const realtorAdminUrl = String(body.realtor_admin_url ?? "");
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");

  // Each adapter call NEVER throws; it returns a typed result carrying its own `source` +
  // optional warning. Run everything concurrently — sequentially the per-request timeouts
  // stack up to a minute-plus hang behind the form's "Pulling..." button.
  const [web, siteTotal, fb, ig, realtorStats] = await Promise.all([
    fetchRybbitListingViews(client.rybbit_site_id, listingUrl, startDate, endDate),
    fetchRybbitSiteTotalViews(client.rybbit_site_id, startDate, endDate),
    fetchFacebookPostMetrics(client.meta_page_id, facebookUrl),
    fetchInstagramMediaMetrics(client.meta_instagram_id, instagramUrl),
    fetchRealtorAdminStats(realtorAdminUrl)
  ]);

  const website = {
    source: web.source,
    listing_views: web.listing_views,
    site_total_views: siteTotal.site_total_views,
    warnings: [web.warning, siteTotal.warning].filter((w): w is string => Boolean(w))
  };
  const facebook = {
    source: fb.source,
    views: fb.views,
    caption: fb.caption ?? "",
    media_url: fb.media_url ?? "",
    warnings: fb.warning ? [fb.warning] : []
  };
  const instagram = {
    source: ig.source,
    views: ig.views,
    caption: ig.caption ?? "",
    media_url: ig.media_url ?? "",
    warnings: ig.warning ? [ig.warning] : []
  };
  const realtor = {
    source: realtorStats.source,
    total_views: realtorStats.total_views,
    days_on_market: realtorStats.days_on_market,
    image_url: realtorStats.image_url,
    warnings: realtorStats.warning ? [realtorStats.warning] : []
  };

  return new Response(
    JSON.stringify({
      website,
      facebook,
      instagram,
      realtor,
      warnings: [...website.warnings, ...facebook.warnings, ...instagram.warnings, ...realtor.warnings]
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
