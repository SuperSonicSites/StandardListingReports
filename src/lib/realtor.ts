import { type Page } from "puppeteer-core";
import { browserPath, withPage } from "./chrome";

const NAV_TIMEOUT_MS = 45_000;
const READY_TIMEOUT_MS = 20_000;
const DATA_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
// A current desktop Chrome UA — a stale UA is itself a bot signal. Keep this fresh.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type RealtorStatsResult = {
  source: "realtor_page" | "manual";
  total_views: number | null; // all-time REALTOR.ca listing views (null = not captured)
  days_on_market: number | null; // days on REALTOR.ca (null = not captured)
  image_url: string; // first listing photo ("" = not captured)
  address: string | null; // listing street address (null = not captured)
  mls_number: string | null; // MLS® number (null = not captured)
  list_date: string | null; // first day on market, YYYY-MM-DD (null = not captured)
  // Distinguishes an unusable link (invalid host / expired share token — the coordinator
  // must re-share) from a transient reach failure (timeout / bot wall — retry later).
  failure?: "terminal" | "transient";
  warning?: string;
};

function degraded(warning: string, failure?: "terminal" | "transient"): RealtorStatsResult {
  return {
    source: "manual",
    total_views: null,
    days_on_market: null,
    image_url: "",
    address: null,
    mls_number: null,
    list_date: null,
    failure,
    warning
  };
}

// An unusable link — the coordinator must fix it; retrying won't help.
class TerminalScrapeError extends Error {}
// A transient reach failure (timeout, bot wall, empty page) — worth a retry.
class TransientScrapeError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The coordinator pastes the tokenized "share listing" link from the member portal
// (member.realtor.ca/Reports/ListingDestination/<token>), not the public listing URL.
function isRealtorAdminUrl(value: string): boolean {
  try {
    return new URL(value).hostname === "member.realtor.ca";
  } catch {
    return false;
  }
}

type ScrapeStrategy = "json-ld" | "og" | "dom" | "miss";

/**
 * Scrape the REALTOR.ca member stats page ("share listing" link) in headless Chrome:
 *  - all-time listing views + days on market (report widgets),
 *  - the listing's address, MLS® number and first photo (from the public listing page,
 *    preferring JSON-LD/OpenGraph over brittle DOM ids).
 * NEVER throws. Retries transient failures; a bad/expired link fails fast with a
 * "re-share" message. Partial capture returns whatever was found plus a warning. A real
 * browser is required — realtor.ca blocks plain HTTP clients but passes headless Chrome.
 */
export async function fetchRealtorAdminStats(adminUrl: string): Promise<RealtorStatsResult> {
  if (!adminUrl) {
    return degraded("No REALTOR.ca Admin URL provided — enter the numbers manually.");
  }
  if (!isRealtorAdminUrl(adminUrl)) {
    return degraded(
      "Link not recognized — paste the SHARE LISTING link from the member portal (member.realtor.ca/...).",
      "terminal"
    );
  }
  if (!browserPath()) {
    return degraded("REALTOR.ca capture needs Chrome/Edge (or CHROME_PATH) on the server.");
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await withPage((page) => scrapeOnce(page, adminUrl));
    } catch (error) {
      if (error instanceof TerminalScrapeError) {
        return degraded(error.message, "terminal");
      }
      // Transient (or unexpected) — retry with backoff, then degrade softly.
      if (attempt >= MAX_ATTEMPTS) {
        const message =
          error instanceof TransientScrapeError
            ? error.message
            : "REALTOR.ca capture failed — enter the numbers manually.";
        return degraded(message, "transient");
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  // Unreachable, but keeps the type checker happy.
  return degraded("REALTOR.ca capture failed — enter the numbers manually.", "transient");
}

async function scrapeOnce(page: Page, adminUrl: string): Promise<RealtorStatsResult> {
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-CA,en;q=0.9" });
  await page.setViewport({ width: 1280, height: 900 });

  const response = await page.goto(adminUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  const status = response?.status() ?? 0;
  if (status === 404 || status === 410) {
    throw new TerminalScrapeError(
      "REALTOR.ca share link is invalid or expired — re-share the listing and paste a new link."
    );
  }
  if (status >= 400) {
    throw new TransientScrapeError("Couldn't reach REALTOR.ca right now — try Pull again in a minute.");
  }

  // The report widgets hydrate client-side; the "All" pills tab is our readiness signal.
  const pillsTab = await page
    .waitForSelector("#ui_report_all_pillsTab", { timeout: READY_TIMEOUT_MS })
    .catch(() => null);
  if (!pillsTab) {
    await classifyLoadFailure(page); // throws Terminal or Transient
  } else {
    // All-time scope. The 7/30-day panes stay in the DOM, so extraction still filters to
    // visible widgets and takes the max (all-time >= any window).
    await pillsTab.click().catch(() => {});
  }

  // Wait for the views widget to actually hold a number rather than polling on a fixed
  // clock — a slow-but-successful load stops being counted as a failure.
  await page
    .waitForFunction(
      () => {
        const els = [...document.querySelectorAll('[id^="data_report_"][id$="_reportViews"]')];
        return els.some((el) => /\d/.test(el.textContent ?? ""));
      },
      { timeout: DATA_TIMEOUT_MS, polling: 500 }
    )
    .catch(() => {});

  const stats = await page.evaluate(() => {
    const parseCount = (text: string | null | undefined) => {
      const match = (text ?? "").match(/\d[\d,]*/);
      return match ? parseInt(match[0].replace(/,/g, ""), 10) : null;
    };
    // Several reportViews widgets exist (one per time scope). Prefer the visible ones
    // after the All click; all-time is always the maximum.
    const viewEls = [...document.querySelectorAll('[id^="data_report_"][id$="_reportViews"]')];
    const visible = viewEls.filter((el) => (el as HTMLElement).offsetParent !== null);
    const counts = (visible.length ? visible : viewEls)
      .map((el) => parseCount(el.textContent))
      .filter((n): n is number => n !== null);
    const dom = document.querySelector('[id^="data_report_"][id$="_daysOnRealtor"]');
    const link = document.querySelector<HTMLAnchorElement>("#hyp_reportRight_viewOnRealtor");
    const imgEl = document.querySelector<HTMLImageElement>('[id^="img_report_"][id$="_propertyImage"]');
    const imgSrc = imgEl ? imgEl.currentSrc || imgEl.src : "";
    const adminImage =
      imgEl && imgEl.naturalWidth > 0 && /^https:\/\/(images|cdn)\.realtor\.ca\//i.test(imgSrc)
        ? imgSrc.split("?")[0]
        : "";
    return {
      totalViews: counts.length ? Math.max(...counts) : null,
      daysOnMarket: dom ? parseCount(dom.textContent) : null,
      listingHref: link?.href ?? "",
      adminImage
    };
  });

  let imageUrl = stats.adminImage;
  let address: string | null = null;
  let mlsNumber: string | null = null;
  let listDate: string | null = null;
  let daysOnMarket = stats.daysOnMarket;
  const strategy: Record<string, ScrapeStrategy> = { address: "miss", mls: "miss", photo: imageUrl ? "dom" : "miss" };

  // The public listing page is the reliable source for address / MLS / list date, so we
  // always follow the link when present (the photo may already be captured above).
  if (stats.listingHref) {
    try {
      await page.goto(stats.listingHref, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      // Two extraction passes: the page occasionally stalls behind the bot wall on first
      // paint, and one reload usually clears it (cheaper than losing address/MLS/photo).
      for (let pass = 0; pass < 2; pass++) {
        await page
          .waitForFunction(
            () =>
              document.querySelector('script[type="application/ld+json"]') !== null ||
              document.querySelector('meta[property="og:image"]') !== null,
            { timeout: DATA_TIMEOUT_MS, polling: 500 }
          )
          .catch(() => {});

        const structured = await extractListingStructured(page);
        if (!address && structured.address) {
          address = structured.address;
          strategy.address = structured.addressStrategy;
        }
        if (!mlsNumber && structured.mls) {
          mlsNumber = structured.mls;
          strategy.mls = structured.mlsStrategy;
        }
        if (!listDate && structured.listDate) listDate = structured.listDate;
        if (!imageUrl && structured.image) {
          imageUrl = structured.image;
          strategy.photo = structured.imageStrategy;
        }
        if (!imageUrl) {
          imageUrl = await extractListingPhoto(page).catch(() => "");
          if (imageUrl) strategy.photo = "dom";
        }
        if (daysOnMarket === null) {
          daysOnMarket = await page
            .evaluate(() => {
              const value = [...document.querySelectorAll(".propertyDetailsSectionContentValue")].find((el) =>
                /time on realtor/i.test(el.previousElementSibling?.textContent ?? "")
              );
              const match = (value?.textContent ?? "").match(/\d[\d,]*/);
              return match ? parseInt(match[0].replace(/,/g, ""), 10) : null;
            })
            .catch(() => null);
        }

        if (address && imageUrl) break; // got the essentials
        if (pass === 0) {
          await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => {});
        }
      }
    } catch {
      // keep whatever the stats page yielded
    }
  }

  // eslint-disable-next-line no-console
  console.info(
    `[realtor] strategy address=${strategy.address} mls=${strategy.mls} photo=${strategy.photo} ` +
      `views=${stats.totalViews ?? "miss"} days=${daysOnMarket ?? "miss"}`
  );

  const missing = [
    stats.totalViews === null ? "total views" : null,
    daysOnMarket === null ? "days on market" : null,
    address ? null : "address",
    mlsNumber ? null : "MLS number",
    imageUrl ? null : "listing photo"
  ].filter((m): m is string => m !== null);

  // Nothing at all came back — almost always a bot wall / wrong page. Retry.
  if (stats.totalViews === null && daysOnMarket === null && !address && !imageUrl) {
    throw new TransientScrapeError("Couldn't read the REALTOR.ca listing — try Pull again in a minute.");
  }

  return {
    source: "realtor_page",
    total_views: stats.totalViews,
    days_on_market: daysOnMarket,
    image_url: imageUrl,
    address,
    mls_number: mlsNumber,
    list_date: listDate,
    warning: missing.length ? `REALTOR.ca capture could not read: ${missing.join(", ")}. Fill those in manually.` : undefined
  };
}

// When the report never appears, tell an expired/unusable link (terminal) apart from a
// bot wall / transient blip. Ambiguous cases default to transient (safe: we retry).
async function classifyLoadFailure(page: Page): Promise<never> {
  const text = await page.evaluate(() => (document.body?.innerText ?? "").toLowerCase()).catch(() => "");
  if (/report not found|no longer available|link has expired|listing (is )?not available/.test(text)) {
    throw new TerminalScrapeError(
      "REALTOR.ca share link is invalid or expired — re-share the listing and paste a new link."
    );
  }
  throw new TransientScrapeError(
    "Couldn't reach REALTOR.ca right now — try Pull again in a minute, or enter the numbers manually."
  );
}

type StructuredResult = {
  address: string | null;
  addressStrategy: ScrapeStrategy;
  mls: string | null;
  mlsStrategy: ScrapeStrategy;
  image: string;
  imageStrategy: ScrapeStrategy;
  listDate: string | null;
};

// Prefer machine-readable JSON-LD (least likely to churn), then og: tags, then DOM
// label/value pairs — take the first that yields a value for each field.
async function extractListingStructured(page: Page): Promise<StructuredResult> {
  return page.evaluate(() => {
    const out = {
      address: null as string | null,
      addressStrategy: "miss",
      mls: null as string | null,
      mlsStrategy: "miss",
      image: "",
      imageStrategy: "miss",
      listDate: null as string | null
    };

    // --- JSON-LD ---
    const nodes: any[] = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent ?? "");
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item && typeof item === "object") {
            nodes.push(item);
            if (Array.isArray(item["@graph"])) nodes.push(...item["@graph"]);
          }
        }
      } catch {
        /* ignore malformed ld+json */
      }
    }
    const composeAddress = (a: any): string | null => {
      if (!a) return null;
      if (typeof a === "string") return a.trim() || null;
      const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => p.trim());
      return parts.length ? parts.join(", ") : null;
    };
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      if (out.address === null && node.address) {
        const composed = composeAddress(node.address);
        if (composed) {
          out.address = composed;
          out.addressStrategy = "json-ld";
        }
      }
      if (out.mls === null) {
        const raw = node.sku ?? node.productID ?? node.mlsNumber ?? node.identifier;
        const value = typeof raw === "string" ? raw : raw && typeof raw === "object" ? raw.value : undefined;
        if (typeof value === "string" && value.trim()) {
          out.mls = value.trim();
          out.mlsStrategy = "json-ld";
        }
      }
      if (!out.image) {
        const img = Array.isArray(node.image) ? node.image[0] : node.image;
        const src = typeof img === "string" ? img : img && typeof img === "object" ? img.url : "";
        if (typeof src === "string" && /realtor\.ca/i.test(src)) {
          out.image = src.split("?")[0];
          out.imageStrategy = "json-ld";
        }
      }
      if (out.listDate === null) {
        const d = node.datePosted ?? node.availabilityStarts ?? node.dateCreated;
        if (typeof d === "string") {
          const m = d.match(/\d{4}-\d{2}-\d{2}/);
          if (m) out.listDate = m[0];
        }
      }
    }

    // --- og: image fallback ---
    if (!out.image) {
      const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
      if (/realtor\.ca/i.test(og)) {
        out.image = og.split("?")[0];
        out.imageStrategy = "og";
      }
    }

    // --- DOM label/value fallback (address, MLS) ---
    const labelValue = (labelRe: RegExp): string | null => {
      const el = [...document.querySelectorAll(".propertyDetailsSectionContentValue")].find((node) =>
        labelRe.test(node.previousElementSibling?.textContent ?? "")
      );
      const text = el?.textContent?.trim();
      return text ? text : null;
    };
    if (out.address === null) {
      const heading = document.querySelector("h1")?.textContent?.trim();
      if (heading) {
        out.address = heading;
        out.addressStrategy = "dom";
      }
    }
    if (out.mls === null) {
      const mls = labelValue(/mls|listing id/i);
      if (mls) {
        out.mls = mls.replace(/^[^0-9A-Za-z]+/, "");
        out.mlsStrategy = "dom";
      }
    }

    return out;
  }) as Promise<StructuredResult>;
}

// Prefer a real gallery image (#heroImage or any cdn.realtor.ca listing image) over
// og:image, which is a low-res 512x256 crop. Query params stripped -> highres original.
async function extractListingPhoto(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hero = document.querySelector<HTMLImageElement>("#heroImage");
    const heroSrc = hero ? hero.currentSrc || hero.src : "";
    if (/cdn\.realtor\.ca/i.test(heroSrc)) return heroSrc.split("?")[0];
    const gallery = [...document.querySelectorAll("img")]
      .map((img) => img.currentSrc || img.src)
      .find((src) => /cdn\.realtor\.ca\/listings\//i.test(src));
    if (gallery) return gallery.split("?")[0];
    const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
    return /cdn\.realtor\.ca/i.test(og) ? og : "";
  });
}
