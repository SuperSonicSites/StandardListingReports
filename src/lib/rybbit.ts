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
  // NEVER count the homepage as "listing views" — a listing page always has a slug, and
  // homepage traffic frozen into a client PDF is the worst kind of wrong number.
  const basePath = pathname.replace(/\/+$/, "");
  if (basePath === "") {
    return {
      source: "manual",
      listing_views: 0,
      warning: "That looks like the site's homepage, not a listing page — paste the listing's own URL."
    };
  }
  // Confirmed against Rybbit's API (docs + rybbit-io/rybbit source, live-verified on site 8725):
  // GET /metric?parameter=pathname returns per-path rows whose `pageviews` is the true listing
  // view total. Rybbit records paths WITH a trailing slash (e.g. "/listings/123-main-st/") while
  // new URL(...).pathname yields none for a slash-less listing URL, so match BOTH variants
  // (a filter value array is OR'd) to avoid a false 0.
  const pathValues = [basePath, `${basePath}/`];
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

export type RybbitListingResolveResult = {
  source: "rybbit_api" | "manual" | "mock";
  listing_views: number;
  // Canonical pathname of the listing page (busiest matched row, no trailing slash).
  // null = not resolved; the caller falls back to the coordinator's typed URL.
  path: string | null;
  warning?: string;
};

// Rows of the /metric?parameter=pathname response: one {value: pathname, pageviews} each.
function extractRows(body: unknown): { value: string; pageviews: number }[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const outer = (body as Record<string, unknown>).data;
  if (!outer || typeof outer !== "object") return undefined;
  const rows = (outer as Record<string, unknown>).data;
  if (!Array.isArray(rows)) return undefined;
  const out: { value: string; pageviews: number }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = (row as Record<string, unknown>).value;
    const pv = (row as Record<string, unknown>).pageviews;
    if (typeof value === "string" && typeof pv === "number" && Number.isFinite(pv)) {
      out.push({ value, pageviews: pv });
    }
  }
  return out;
}

// Whole alphanumeric tokens of a pathname/address, lowercased ("/listing/3-15-goldeneye"
// -> {listing, 3, 15, goldeneye}). Mixed tokens like a postal "y1a" stay whole, so a
// stray digit inside them can never satisfy a numeric match.
function tokensOf(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * Resolve the listing page on the client's own site AND its view count in ONE Rybbit
 * query — no web-search dependency. Rybbit already tracks every path, so we filter
 * pathnames containing the MLS# / street-name and keep only rows that GENUINELY match
 * (same philosophy as the social rankCandidates): the MLS® number as a whole token, OR a
 * street-name token plus EVERY number from the address as whole tokens — so
 * "3-15 Goldeneye" keeps /3-15-goldeneye-place-... and excludes the 4-15 / 1-15
 * neighbours, and slug schemes that don't carry the MLS (e.g. Yukon's
 * /listing/<address>-<postal>-<feedid>/) still resolve. It can never return a homepage
 * or category page (which a web search happily does — eval 2026-08: homepage frozen as
 * 18,830 "listing views"). Views are summed across the matched variants (trailing-slash
 * + legacy slug of the SAME listing); the busiest row is the canonical path. NEVER throws.
 */
export async function resolveRybbitListing(
  siteId: string | undefined,
  match: { mls: string | null; nameTokens: string[]; addressNumbers: string[] },
  startDate: string,
  endDate: string
): Promise<RybbitListingResolveResult> {
  const apiKey = process.env.RYBBIT_API_KEY ?? import.meta.env.RYBBIT_API_KEY;
  if (!apiKey) {
    if ((process.env.DEMO_MODE ?? import.meta.env.DEMO_MODE) === "1") {
      return { source: "mock", listing_views: 1801, path: "/listings/demo-listing" };
    }
    return { source: "manual", listing_views: 0, path: null, warning: "Rybbit API key is not configured — enter the listing URL and views manually." };
  }
  if (!siteId) {
    return { source: "manual", listing_views: 0, path: null, warning: "Rybbit is not configured for this client — enter the listing URL and views manually." };
  }
  // Cast the Rybbit-side net wide (contains on MLS / street-name), then keep only rows
  // that genuinely match, below.
  const values = [match.mls, ...match.nameTokens.slice(0, 2)].filter((v): v is string => Boolean(v));
  if (values.length === 0) {
    return { source: "manual", listing_views: 0, path: null, warning: "No MLS® number or address captured to look the listing up — paste the listing URL below." };
  }

  const apiUrl = (
    process.env.RYBBIT_API_URL ??
    import.meta.env.RYBBIT_API_URL ??
    DEFAULT_RYBBIT_API_URL
  ).replace(/\/+$/, "");
  // A filter value array is OR'd, so one query covers both the MLS-suffix canonical and
  // the legacy civic-streetname slug.
  const filters = JSON.stringify([{ parameter: "pathname", type: "contains", value: values }]);
  const params = new URLSearchParams({
    parameter: "pathname",
    start_date: startDate,
    end_date: endDate,
    time_zone: "UTC",
    filters
  });

  try {
    const response = await fetch(`${apiUrl}/api/sites/${siteId}/metric?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`metric ${response.status}`);
    const rows = extractRows(await response.json());
    if (!rows) throw new Error("bad shape");
    // Genuine-match filter: MLS as a whole token, OR street-name token + EVERY address
    // number as whole tokens (excludes same-street neighbours like 305- vs 308-).
    const mls = match.mls?.toLowerCase();
    const matched = rows.filter((row) => {
      const toks = tokensOf(row.value);
      if (mls && toks.has(mls)) return true;
      if (match.addressNumbers.length === 0) return false;
      return (
        match.nameTokens.some((t) => toks.has(t)) &&
        match.addressNumbers.every((n) => toks.has(n))
      );
    });
    if (matched.length === 0) {
      return {
        source: "manual",
        listing_views: 0,
        path: null,
        warning: "This listing isn't in the website analytics yet — paste the listing URL below if it's live."
      };
    }
    let total = 0;
    let best = matched[0];
    for (const row of matched) {
      total += row.pageviews;
      if (row.pageviews > best.pageviews) best = row;
    }
    const path = best.value.replace(/\/+$/, "");
    // Invariant: NEVER the homepage. A listing page always has a slug; the contains
    // filter can't match "/" anyway, but a client-facing number must not depend on that.
    if (!path) {
      return { source: "manual", listing_views: 0, path: null, warning: "Couldn't pin down the listing page — paste the listing URL below." };
    }
    return { source: "rybbit_api", listing_views: Math.round(total), path };
  } catch {
    return {
      source: "manual",
      listing_views: 0,
      path: null,
      warning: "Rybbit auto-fetch unavailable for listing views. Please enter manually."
    };
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
