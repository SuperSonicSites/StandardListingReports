const DEFAULT_RYBBIT_API_URL = "https://app.rybbit.io";
const TIMEOUT_MS = 8000;

export type RybbitViewsResult = {
  source: "rybbit_api" | "manual" | "mock";
  listing_views: number;
  warning?: string;
};

function notConfigured(reason: string): RybbitViewsResult {
  return {
    source: "manual",
    listing_views: 0,
    warning: `${reason} — enter numbers manually.`
  };
}

function fetchFailed(): RybbitViewsResult {
  return {
    source: "manual",
    listing_views: 0,
    warning: "Rybbit auto-fetch unavailable for listing views. Please enter manually."
  };
}

// The /metric endpoint wraps rows as { data: { data: [ { value, pageviews, ... } ], totalCount } }.
// We sum `pageviews` across the returned pathname rows (one per matched trailing-slash variant).
// Verified against site 8725: /metric reports the true per-path pageview total, whereas /overview
// returns a lower session-scoped figure that under-counts listing views (see docs/auth.md §8).
// An empty rows array is a valid "0 views" (e.g. an untracked REALTOR.ca URL), not a failure.
function extractPageviews(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const outer = (body as Record<string, unknown>).data;
  if (!outer || typeof outer !== "object") return undefined;
  const rows = (outer as Record<string, unknown>).data;
  if (!Array.isArray(rows)) return undefined;
  let total = 0;
  for (const row of rows) {
    const pv = row && typeof row === "object" ? (row as Record<string, unknown>).pageviews : undefined;
    if (typeof pv === "number" && Number.isFinite(pv)) total += pv;
  }
  return total;
}

/**
 * Fetch listing-page views for one listing path within a date range.
 * NEVER throws. On any error or missing config, returns a degraded result
 * with listing_views: 0 and a warning.
 */
export async function fetchRybbitListingViews(
  siteId: string | undefined,
  listingUrl: string,
  startDate: string,
  endDate: string
): Promise<RybbitViewsResult> {
  // `.env` values live on import.meta.env under Astro/Vite; process.env only holds real
  // runtime env vars. Prefer a runtime override, fall back to the .env-loaded value.
  const apiKey = process.env.RYBBIT_API_KEY ?? import.meta.env.RYBBIT_API_KEY;

  if (!apiKey) {
    // Demo stub: fabricate data honestly labeled "mock", but ONLY when explicitly opted in.
    // In production a missing credential must degrade to a warning, never to fake numbers.
    if ((process.env.DEMO_MODE ?? import.meta.env.DEMO_MODE) === "1") {
      return { source: "mock", listing_views: 1801 };
    }
    return notConfigured("Rybbit API key is not configured");
  }

  if (!siteId) {
    return notConfigured("Rybbit is not configured for this client");
  }

  // No listing URL yet (e.g. the auto-find didn't resolve one) — Rybbit is keyed on the
  // page path, so there's nothing to query. Say that plainly instead of "auto-fetch
  // unavailable", which reads like Rybbit itself failed.
  if (!listingUrl.trim()) {
    return notConfigured("No listing URL to check yet — set the Website URL, then Pull again");
  }

  let pathname: string;
  try {
    pathname = new URL(listingUrl).pathname;
  } catch {
    return fetchFailed();
  }

  // Strip any trailing slash so a configured RYBBIT_API_URL like "https://app.rybbit.io/"
  // does not produce a double slash ("...io//api/...") that 404s.
  const apiUrl = (
    process.env.RYBBIT_API_URL ??
    import.meta.env.RYBBIT_API_URL ??
    DEFAULT_RYBBIT_API_URL
  ).replace(/\/+$/, "");
  // Confirmed against Rybbit's API (docs + rybbit-io/rybbit source, live-verified on site 8725):
  // GET /metric?parameter=pathname returns per-path rows whose `pageviews` is the true listing
  // view total. Rybbit records paths WITH a trailing slash (e.g. "/listings/123-main-st/") while
  // new URL(...).pathname yields none for a slash-less listing URL, so match BOTH variants
  // (a filter value array is OR'd) to avoid a false 0. Root ("/") stays a single value.
  const basePath = pathname.replace(/\/+$/, "");
  const pathValues = basePath === "" ? ["/"] : [basePath, `${basePath}/`];
  const filters = JSON.stringify([{ parameter: "pathname", type: "equals", value: pathValues }]);
  const params = new URLSearchParams({
    parameter: "pathname",
    start_date: startDate,
    end_date: endDate,
    time_zone: "UTC",
    filters
  });
  const url = `${apiUrl}/api/sites/${siteId}/metric?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok) {
      return fetchFailed();
    }

    const body = await response.json();
    const listingViews = extractPageviews(body);
    if (typeof listingViews !== "number" || !Number.isFinite(listingViews)) {
      return fetchFailed();
    }

    return { source: "rybbit_api", listing_views: Math.round(listingViews) };
  } catch {
    return fetchFailed();
  }
}

export type RybbitSiteTotalResult = {
  source: "rybbit_api" | "manual" | "mock";
  site_total_views: number;
  warning?: string;
};

/**
 * Fetch SITE-WIDE pageviews for the reporting window (the whole client website,
 * not just the listing page) — used by the report summary to frame the audience
 * the client's site brings. NEVER throws; degrades to 0 with a warning, and the
 * summary simply omits the sentence. /overview's data.pageviews is the site
 * total (verified live against site 8725, 2026-07).
 */
export async function fetchRybbitSiteTotalViews(
  siteId: string | undefined,
  startDate: string,
  endDate: string
): Promise<RybbitSiteTotalResult> {
  const apiKey = process.env.RYBBIT_API_KEY ?? import.meta.env.RYBBIT_API_KEY;
  if (!apiKey) {
    if ((process.env.DEMO_MODE ?? import.meta.env.DEMO_MODE) === "1") {
      return { source: "mock", site_total_views: 38101 };
    }
    return { source: "manual", site_total_views: 0, warning: "Rybbit API key is not configured — site-traffic summary will be omitted." };
  }
  if (!siteId) {
    return { source: "manual", site_total_views: 0, warning: "Rybbit is not configured for this client — site-traffic summary will be omitted." };
  }

  const apiUrl = (
    process.env.RYBBIT_API_URL ??
    import.meta.env.RYBBIT_API_URL ??
    DEFAULT_RYBBIT_API_URL
  ).replace(/\/+$/, "");
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, time_zone: "UTC" });
  const url = `${apiUrl}/api/sites/${siteId}/overview?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`overview ${response.status}`);
    const body = await response.json();
    const pageviews = body?.data?.pageviews;
    if (typeof pageviews !== "number" || !Number.isFinite(pageviews)) throw new Error("no pageviews");
    return { source: "rybbit_api", site_total_views: Math.round(pageviews) };
  } catch {
    return { source: "manual", site_total_views: 0, warning: "Rybbit site-traffic fetch unavailable — the summary will omit it." };
  }
}
