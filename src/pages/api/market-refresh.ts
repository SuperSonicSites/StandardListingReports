import type { APIRoute } from "astro";
import { isAdmin } from "../../lib/auth";
import { MARKET_KEYS, MARKETS, refreshMarket } from "../../lib/market";
import { monthLabel } from "../../lib/market-rules";
import { redirectWithFlash } from "../../lib/flash";

export const prerender = false;

// Admin → "Refresh market data": force-fetch every market and overwrite the cached
// month (the cache is replaceable; report snapshots are not). The middleware already
// keeps non-admins out of /api/* routes that aren't self-guarded; checked again here.
export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return new Response("Admin sign-in required.", { status: 401 });
  const results = await Promise.all(
    MARKET_KEYS.map(async (key) => {
      try {
        const month = await refreshMarket(key, { force: true });
        return `${MARKETS[key].region_label}: ${monthLabel(month.reporting_month)}`;
      } catch (error) {
        return `${MARKETS[key].region_label}: failed (${error instanceof Error ? error.message : String(error)})`;
      }
    })
  );
  return redirectWithFlash("/", `Market data refreshed — ${results.join(" · ")}`);
};
