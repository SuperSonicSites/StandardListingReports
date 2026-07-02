import puppeteer, { type Page } from "puppeteer-core";
import { browserPath } from "./chrome";

const TIMEOUT_MS = 45_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type RealtorStatsResult = {
  source: "realtor_page" | "manual";
  total_views: number | null; // all-time REALTOR.ca listing views (null = not captured)
  days_on_market: number | null; // days on REALTOR.ca (null = not captured)
  image_url: string; // first listing photo ("" = not captured)
  warning?: string;
};

function degraded(warning: string): RealtorStatsResult {
  return { source: "manual", total_views: null, days_on_market: null, image_url: "", warning };
}

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
 * Scrape the REALTOR.ca member stats page ("share listing" link) in headless Chrome:
 *  - all-time listing views (the "All" pills tab's reportViews widget),
 *  - days on market (the "N days on REALTOR.ca" strip; public-page fallback),
 *  - the listing's first photo (followed via the "view on REALTOR.ca" link).
 * NEVER throws; partial capture returns whatever was found plus a warning. A real
 * browser is required — realtor.ca blocks plain HTTP clients but passes headless
 * Chrome (verified live 2026-07 against a real share link).
 */
export async function fetchRealtorAdminStats(adminUrl: string): Promise<RealtorStatsResult> {
  if (!adminUrl) {
    return degraded("No REALTOR.ca Admin URL provided — enter views and days on market manually.");
  }
  if (!isRealtorAdminUrl(adminUrl)) {
    return degraded(
      "Link not recognized — paste the SHARE LISTING link from the member portal (member.realtor.ca/...)."
    );
  }

  const executablePath = browserPath();
  if (!executablePath) {
    return degraded("REALTOR.ca capture needs Chrome/Edge (or CHROME_PATH) on the server.");
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        `--user-agent=${UA}`
      ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const response = await page.goto(adminUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    if (!response || response.status() >= 400) {
      return degraded("REALTOR.ca stats page not found — the share link may have expired. Re-share and try again.");
    }

    // The report widgets hydrate client-side; the "All" pills tab is our readiness signal.
    const pillsTab = await page
      .waitForSelector("#ui_report_all_pillsTab", { timeout: 20_000 })
      .catch(() => null);
    if (!pillsTab) {
      return degraded(
        "REALTOR.ca stats page did not load its report — the share link may have expired. Re-share and try again."
      );
    }
    // All-time scope. The 7/30-day panes stay in the DOM, so extraction below still
    // filters to visible widgets and takes the max (all-time >= any window).
    await pillsTab.click().catch(() => {});

    let stats = { totalViews: null as number | null, daysOnMarket: null as number | null, listingHref: "" };
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      stats = await page.evaluate(() => {
        const parseCount = (text: string | null | undefined) => {
          const match = (text ?? "").match(/\d[\d,]*/);
          return match ? parseInt(match[0].replace(/,/g, ""), 10) : null;
        };
        // Several reportViews widgets exist (one per time scope, ids are widget ids,
        // not the listing id). Prefer the visible ones after the All click; all-time
        // is always the maximum.
        const viewEls = [...document.querySelectorAll('[id^="data_report_"][id$="_reportViews"]')];
        const visible = viewEls.filter((el) => (el as HTMLElement).offsetParent !== null);
        const counts = (visible.length ? visible : viewEls)
          .map((el) => parseCount(el.textContent))
          .filter((n): n is number => n !== null);
        const dom = document.querySelector('[id^="data_report_"][id$="_daysOnRealtor"]');
        const link = document.querySelector<HTMLAnchorElement>("#hyp_reportRight_viewOnRealtor");
        return {
          totalViews: counts.length ? Math.max(...counts) : null,
          daysOnMarket: dom ? parseCount(dom.textContent) : null,
          listingHref: link?.href ?? ""
        };
      });
      if (stats.totalViews !== null && stats.daysOnMarket !== null && stats.listingHref) break;
    }

    // Follow "view on REALTOR.ca" to the public listing page for the hero photo
    // (and days on market, if the stats page didn't have it).
    let imageUrl = "";
    if (stats.listingHref) {
      try {
        // The link resolves at ".../text" and then CLIENT-SIDE redirects to the
        // canonical listing URL — an evaluate racing that redirect throws
        // "Execution context was destroyed". Tolerate it per attempt and keep polling.
        await page.goto(stats.listingHref, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
        for (let attempt = 0; attempt < 12 && !imageUrl; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          imageUrl = await extractListingPhoto(page).catch(() => "");
        }
        // Rarely the page stalls behind the bot wall on first paint — one reload
        // usually clears it and is cheaper than losing the cover photo.
        if (!imageUrl) {
          await page.reload({ waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
          for (let attempt = 0; attempt < 8 && !imageUrl; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            imageUrl = await extractListingPhoto(page).catch(() => "");
          }
        }
        if (stats.daysOnMarket === null) {
          stats.daysOnMarket = await page
            .evaluate(() => {
              const value = [...document.querySelectorAll(".propertyDetailsSectionContentValue")].find((el) =>
                /time on realtor/i.test(el.previousElementSibling?.textContent ?? "")
              );
              const match = (value?.textContent ?? "").match(/\d[\d,]*/);
              return match ? parseInt(match[0].replace(/,/g, ""), 10) : null;
            })
            .catch(() => null);
        }
      } catch {
        // keep whatever the stats page yielded
      }
    }

    const missing = [
      stats.totalViews === null ? "total views" : null,
      stats.daysOnMarket === null ? "days on market" : null,
      imageUrl ? null : "listing photo"
    ].filter((m): m is string => m !== null);

    if (missing.length === 3) {
      return degraded("REALTOR.ca capture found no data — check the share link or enter the numbers manually.");
    }
    return {
      source: "realtor_page",
      total_views: stats.totalViews,
      days_on_market: stats.daysOnMarket,
      image_url: imageUrl,
      warning: missing.length
        ? `REALTOR.ca capture could not read: ${missing.join(", ")}. Fill those in manually.`
        : undefined
    };
  } catch {
    return degraded("REALTOR.ca capture failed — enter views and days on market manually.");
  } finally {
    await browser?.close().catch(() => {});
  }
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
