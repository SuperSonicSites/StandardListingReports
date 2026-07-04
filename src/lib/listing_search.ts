const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 8000;

export type ListingSearchResult = {
  url: string | null;
  source: "search" | "manual" | "mock";
  warning?: string;
};

// `.env` values live on import.meta.env under Astro/Vite; process.env only holds real
// runtime env vars. Prefer a runtime override, fall back to the .env-loaded value.
function braveKey(): string | undefined {
  return process.env.BRAVE_API_KEY ?? import.meta.env.BRAVE_API_KEY;
}

function demoMode(): boolean {
  return (process.env.DEMO_MODE ?? import.meta.env.DEMO_MODE) === "1";
}

// The registrable-ish host we scope the search to, without a leading www.
function siteHost(websiteUrl: string): string | null {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * From a list of Brave web results, return the first URL that lives on the client's own
 * domain (never a third-party aggregator like realtor.ca). Exported for testing. Pure.
 */
export function pickListingOnDomain(results: unknown, host: string): string | null {
  const rows = Array.isArray(results) ? results : [];
  for (const row of rows) {
    const url = row && typeof row === "object" ? (row as { url?: unknown }).url : undefined;
    if (typeof url !== "string") continue;
    try {
      const h = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
      if (h === host || h.endsWith(`.${host}`)) return url.split("#")[0];
    } catch {
      /* skip malformed */
    }
  }
  return null;
}

async function braveSearch(query: string, key: string): Promise<unknown[]> {
  const url = `${BRAVE_ENDPOINT}?${new URLSearchParams({ q: query, count: "5" }).toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`Brave search error ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body?.web?.results) ? body.web.results : [];
}

/**
 * Find the listing's page on the CLIENT'S OWN website via web search (Brave), matching by
 * MLS# first (most unique), then address. Returns only a URL on the client's domain.
 * NEVER throws: missing config / no match / API failure all degrade to a manual entry with
 * a warning (the listing URL stays a manually-editable field on the form).
 */
export async function findListingUrl(
  websiteUrl: string | undefined,
  listing: { mls: string | null; address: string | null }
): Promise<ListingSearchResult> {
  if (!websiteUrl) {
    // No site on file — nothing to search; not an error, just fall through to manual entry.
    return { url: null, source: "manual" };
  }
  const host = siteHost(websiteUrl);
  if (!host) {
    return { url: null, source: "manual", warning: "Client Website URL is invalid — enter the listing URL manually." };
  }

  const key = braveKey();
  if (!key) {
    if (demoMode()) {
      return { url: `${websiteUrl.replace(/\/+$/, "")}/listings/demo-listing`, source: "mock" };
    }
    return { url: null, source: "manual", warning: "Listing search is not configured — enter the listing URL manually." };
  }

  const queries: string[] = [];
  if (listing.mls) queries.push(`site:${host} ${listing.mls}`);
  if (listing.address) queries.push(`site:${host} ${listing.address}`);
  if (queries.length === 0) {
    return { url: null, source: "manual", warning: "No MLS# or address to search — enter the listing URL manually." };
  }

  try {
    for (const query of queries) {
      const results = await braveSearch(query, key);
      const hit = pickListingOnDomain(results, host);
      if (hit) return { url: hit, source: "search" };
    }
    return { url: null, source: "manual", warning: `Couldn't find this listing on ${host} — enter the listing URL manually.` };
  } catch {
    return { url: null, source: "manual", warning: "Listing search unavailable — enter the listing URL manually." };
  }
}
