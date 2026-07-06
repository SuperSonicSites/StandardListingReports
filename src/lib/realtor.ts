import puppeteer, { type Page } from "puppeteer-core";
import { browserPath, browserLaunchOptions, launchErrorDetail } from "./chrome";

const NAV_TIMEOUT_MS = 45_000;
const READY_TIMEOUT_MS = 20_000;
const DATA_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
// A current desktop Chrome UA — a stale UA is itself a bot signal. Keep this fresh.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
// The scraper's stealth extras, layered onto the shared hardened flags/options.
const EXTRA_ARGS = ["--disable-blink-features=AutomationControlled", `--user-agent=${UA}`];

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

/**
 * Scrape the REALTOR.ca member stats page ("share listing" link) in headless Chrome.
 * Everything we need is server-rendered on that ONE page: all-time listing views + days
 * on market (report widgets), and the listing's address, MLS® number and first photo.
 * (The public listing page is bot-walled — a ~1 KB stub with no data — so we never leave
 * the stats page.) NEVER throws. Retries transient failures; a bad/expired link fails fast
 * with a "re-share" message. Partial capture returns whatever was found plus a warning. A
 * real browser is required — realtor.ca blocks plain HTTP clients but passes headless Chrome.
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
  const executablePath = browserPath();
  if (!executablePath) {
    return degraded("REALTOR.ca capture needs Chrome/Edge (or CHROME_PATH) on the server.");
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Launch a fresh browser per attempt — the SAME per-call model the PDF route uses and
    // that captured REALTOR.ca photos before. (An earlier shared long-lived browser broke
    // this on the deploy host; the launch itself is cheap for this low-volume tool.)
    let browser;
    try {
      browser = await puppeteer.launch({ executablePath, ...browserLaunchOptions(EXTRA_ARGS) });
    } catch (error) {
      // A genuine launch failure won't fix itself on retry — surface it and stop.
      // launchErrorDetail digs out Chromium's real stderr (missing lib / kill signal),
      // which the generic first line hides; log the whole thing server-side too.
      // eslint-disable-next-line no-console
      console.error(`[realtor] browser launch failed (${executablePath}): ${(error as Error)?.message ?? error}`);
      return degraded(
        `Couldn't start the browser to read REALTOR.ca. ${launchErrorDetail(error)} — enter the numbers manually below.`,
        "terminal"
      );
    }

    try {
      const page = await browser.newPage();
      return await scrapeOnce(page, adminUrl);
    } catch (error) {
      if (error instanceof TerminalScrapeError) {
        return degraded(error.message, "terminal");
      }
      const err = error as Error;
      // Log the REAL cause server-side (the user-facing message is deliberately generic).
      // eslint-disable-next-line no-console
      console.error(`[realtor] scrape attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err?.name || "Error"} - ${err?.message || String(error)}`);
      if (attempt >= MAX_ATTEMPTS) {
        const message =
          error instanceof TransientScrapeError
            ? error.message
            : "REALTOR.ca capture failed — enter the numbers manually.";
        return degraded(message, "transient");
      }
      await sleep(500 * 2 ** (attempt - 1));
    } finally {
      await browser.close().catch(() => {});
    }
  }
  // Unreachable, but keeps the type checker happy.
  return degraded("REALTOR.ca capture failed — enter the numbers manually.", "transient");
}

async function scrapeOnce(page: Page, adminUrl: string): Promise<RealtorStatsResult> {
  // UA is set via the --user-agent launch arg (LAUNCH_ARGS); just add locale hints here.
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-CA,en;q=0.9" });
  await page.setViewport({ width: 1280, height: 900 });

  const response = await page.goto(adminUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  const status = response?.status() ?? 0;
  // eslint-disable-next-line no-console
  console.info(`[realtor] loaded status=${status} url=${page.url().slice(0, 90)}`);
  if (status === 404 || status === 410) {
    throw new TerminalScrapeError(
      "REALTOR.ca share link is invalid or expired — re-share the listing and paste a new link."
    );
  }
  if (status >= 400) {
    throw new TransientScrapeError("Couldn't reach REALTOR.ca right now — try Pull again in a minute.");
  }

  // The report widgets can hydrate client-side; the "All" pills tab is our readiness signal.
  const pillsTab = await page
    .waitForSelector("#ui_report_all_pillsTab", { timeout: READY_TIMEOUT_MS })
    .catch(() => null);
  // eslint-disable-next-line no-console
  console.info(`[realtor] report readiness: pillsTab=${pillsTab ? "found" : "absent"}`);
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
    const clean = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
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
    const imgEl = document.querySelector<HTMLImageElement>('[id^="img_report_"][id$="_propertyImage"]');
    const imgSrc = imgEl ? imgEl.currentSrc || imgEl.src : "";
    const adminImage =
      imgEl && imgEl.naturalWidth > 0 && /^https:\/\/(images|cdn)\.realtor\.ca\//i.test(imgSrc)
        ? imgSrc.split("?")[0]
        : "";
    // Address, MLS and photo are all server-rendered on the member stats page itself —
    // the public listing page is bot-walled (a ~1 KB stub), so we never leave this page.
    const address = clean(document.querySelector('[id^="data_report_"][id$="_propertyAddress"]')) || null;
    let mls: string | null = null;
    for (const el of document.querySelectorAll('[id^="data_report_"][id$="_mlsNumber"]')) {
      // The element reads "MLS® Number <value>" — strip the label, keep the value.
      const value = clean(el).replace(/^.*?number\s*/i, "").trim();
      if (value) {
        mls = value;
        break;
      }
    }
    return {
      totalViews: counts.length ? Math.max(...counts) : null,
      daysOnMarket: dom ? parseCount(dom.textContent) : null,
      adminImage,
      address,
      mls
    };
  });

  const imageUrl = stats.adminImage;
  const address = stats.address;
  const mlsNumber = stats.mls;
  const daysOnMarket = stats.daysOnMarket;

  // eslint-disable-next-line no-console
  console.info(
    `[realtor] address=${address ? "ok" : "miss"} mls=${mlsNumber ? "ok" : "miss"} ` +
      `photo=${imageUrl ? "ok" : "miss"} views=${stats.totalViews ?? "miss"} days=${daysOnMarket ?? "miss"}`
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
    list_date: null, // no explicit list date on the stats page; period derives from days_on_market
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
