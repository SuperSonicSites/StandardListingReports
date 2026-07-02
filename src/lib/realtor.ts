import puppeteer from "puppeteer-core";
import { browserPath } from "./chrome";

const TIMEOUT_MS = 45_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type RealtorPhotoResult = {
  source: "realtor_page" | "manual";
  image_url: string;
  warning?: string;
};

function degraded(warning: string): RealtorPhotoResult {
  return { source: "manual", image_url: "", warning };
}

function isRealtorListingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.hostname === "www.realtor.ca" || url.hostname === "realtor.ca") &&
      url.pathname.startsWith("/real-estate/")
    );
  } catch {
    return false;
  }
}

/**
 * Load the listing's REALTOR.ca page in headless Chrome and capture the URL of its
 * first photo (the og:image / hero image on cdn.realtor.ca). NEVER throws — any
 * failure degrades to a warning and the report simply renders without the photo.
 * A real browser is required: realtor.ca sits behind bot protection that blocks
 * plain HTTP clients but passes headless Chrome (verified live 2026-07).
 */
export async function fetchRealtorListingPhoto(listingUrl: string): Promise<RealtorPhotoResult> {
  if (!listingUrl) {
    return degraded("No REALTOR.ca link provided — the report will render without a listing photo.");
  }
  if (!isRealtorListingUrl(listingUrl)) {
    return degraded("REALTOR.ca link not recognized — paste the listing page URL (realtor.ca/real-estate/...).");
  }

  const executablePath = browserPath();
  if (!executablePath) {
    return degraded("Photo capture needs Chrome/Edge (or CHROME_PATH) on the server.");
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
    const response = await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    if (!response || response.status() >= 400) {
      return degraded("REALTOR.ca listing page not found — check the link.");
    }
    // The hero/gallery images hydrate after DOMContentLoaded; poll briefly.
    let imageUrl = "";
    for (let attempt = 0; attempt < 10 && !imageUrl; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      imageUrl = await page.evaluate(() => {
        // Prefer a real gallery image over og:image (og is a 512x256 crop).
        const hero = [...document.querySelectorAll("img")]
          .map((img) => img.currentSrc || img.src)
          .find((src) => /cdn\.realtor\.ca\/listings\//i.test(src));
        if (hero) return hero.split("?")[0]; // strip resize params -> highres original
        const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
        return /cdn\.realtor\.ca/i.test(og) ? og : "";
      });
    }
    if (!imageUrl) {
      return degraded("Could not find a photo on the REALTOR.ca page — the report will render without one.");
    }
    return { source: "realtor_page", image_url: imageUrl };
  } catch {
    return degraded("REALTOR.ca photo capture failed — the report will render without a listing photo.");
  } finally {
    await browser?.close().catch(() => {});
  }
}
