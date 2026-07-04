import type { APIRoute } from "astro";
import { canAccessClient } from "../../lib/auth";
import { readClient } from "../../lib/storage";
import {
  fetchFacebookPostCandidates,
  fetchInstagramMediaCandidates,
  rankCandidates,
  enrichFacebookViews,
  enrichInstagramViews
} from "../../lib/meta";
import { fetchRealtorAdminStats, type RealtorStatsResult } from "../../lib/realtor";
import { fetchRybbitListingViews, fetchRybbitSiteTotalViews } from "../../lib/rybbit";
import { findListingUrl } from "../../lib/listing_search";

export const prerender = false;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 90;

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// The report period is always "first day on market -> today", derived from the scrape.
// Prefer an explicit list date, else back-date from days-on-market; if the scrape gave
// neither, fall back to a default window and flag it so the form can offer manual dates.
function derivePeriod(stats: RealtorStatsResult): { start_date: string; end_date: string; derived: boolean } {
  const end_date = toIsoDate(Date.now());
  if (stats.list_date && ISO_DATE.test(stats.list_date)) {
    return { start_date: stats.list_date, end_date, derived: true };
  }
  if (stats.days_on_market !== null && stats.days_on_market >= 0) {
    return { start_date: toIsoDate(Date.now() - stats.days_on_market * DAY_MS), end_date, derived: true };
  }
  return { start_date: toIsoDate(Date.now() - DEFAULT_WINDOW_DAYS * DAY_MS), end_date, derived: false };
}

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

  const typedListingUrl = String(body.listing_url ?? "");
  const realtorAdminUrl = String(body.realtor_admin_url ?? "");
  // Fallback only — ranking prefers the SCRAPED address, but if the scrape missed it and
  // the coordinator typed one, use that so candidate matching still has an address signal.
  const typedAddress = String(body.address ?? "");

  // Phase A: the period-independent pulls. Each adapter NEVER throws; it returns a typed
  // result carrying its own `source` + optional warning. We LIST social candidates here
  // and rank/enrich them in Phase B (ranking needs the scraped MLS/address). Run concurrently
  // — done sequentially the per-request timeouts stack into a minute-plus hang.
  const [fbList, igList, realtorStats] = await Promise.all([
    fetchFacebookPostCandidates(client.meta_page_id),
    fetchInstagramMediaCandidates(client.meta_instagram_id),
    fetchRealtorAdminStats(realtorAdminUrl)
  ]);

  // The report period is DERIVED, not typed: first day on market -> today. It comes from
  // the REALTOR.ca scrape, so it (and the Rybbit window that depends on it) is computed
  // only after Phase A returns.
  const period = derivePeriod(realtorStats);

  const rankContext = {
    mls: realtorStats.mls_number,
    address: realtorStats.address ?? typedAddress,
    listDate: realtorStats.list_date,
    startDate: period.start_date
  };

  // Auto-find the listing on the CLIENT'S own website (web search by MLS#/address). Rybbit
  // needs a URL, so resolve this before the Rybbit calls; fall back to whatever the form
  // already has if the search is unconfigured or finds nothing.
  const listingSearch = await findListingUrl(client.website_url, {
    mls: realtorStats.mls_number,
    address: realtorStats.address ?? typedAddress
  });
  const resolvedListingUrl = listingSearch.url || typedListingUrl;

  // Phase B: everything that needed the scrape's output — Rybbit (derived window + resolved
  // listing URL) and the ranked+enriched social shortlists (views for the top few only).
  const [web, siteTotal, fbTop, igTop] = await Promise.all([
    fetchRybbitListingViews(client.rybbit_site_id, resolvedListingUrl, period.start_date, period.end_date),
    fetchRybbitSiteTotalViews(client.rybbit_site_id, period.start_date, period.end_date),
    enrichFacebookViews(rankCandidates(fbList.candidates, rankContext), client.meta_page_id),
    enrichInstagramViews(rankCandidates(igList.candidates, rankContext))
  ]);

  const website = {
    source: web.source,
    listing_views: web.listing_views,
    site_total_views: siteTotal.site_total_views,
    // The listing URL we resolved (search hit or the form's own value) + how we got it, so
    // the form can auto-fill the field and show a manual-entry notice when nothing was found.
    listing_url: resolvedListingUrl,
    listing_source: listingSearch.source,
    listing_warning: listingSearch.warning ?? null,
    warnings: [web.warning, siteTotal.warning].filter((w): w is string => Boolean(w))
  };
  const facebook = {
    source: fbList.source,
    candidates: fbTop,
    warnings: fbList.warning ? [fbList.warning] : []
  };
  const instagram = {
    source: igList.source,
    candidates: igTop,
    warnings: igList.warning ? [igList.warning] : []
  };
  const realtor = {
    source: realtorStats.source,
    total_views: realtorStats.total_views,
    days_on_market: realtorStats.days_on_market,
    image_url: realtorStats.image_url,
    address: realtorStats.address,
    mls_number: realtorStats.mls_number,
    list_date: realtorStats.list_date,
    // "terminal" = bad/expired link (re-share); "transient" = try again later.
    failure: realtorStats.failure ?? null,
    period,
    warnings: realtorStats.warning ? [realtorStats.warning] : []
  };

  return new Response(
    JSON.stringify({
      website,
      facebook,
      instagram,
      realtor,
      warnings: [
        ...website.warnings,
        ...(website.listing_warning ? [website.listing_warning] : []),
        ...facebook.warnings,
        ...instagram.warnings,
        ...realtor.warnings
      ]
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
