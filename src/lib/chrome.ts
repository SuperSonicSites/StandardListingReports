import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

// Local Chrome/Edge used for PDF printing and the REALTOR.ca photo capture.
// CHROME_PATH (env or .env) wins; otherwise probe the standard install spots.
const chromeCandidates = [
  process.env.CHROME_PATH ?? import.meta.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean) as string[];

export function browserPath(): string | undefined {
  return chromeCandidates.find((candidate) => existsSync(candidate));
}

// --- Shared headless browser for scraping (REALTOR.ca) -----------------------
// Launching a fresh Chrome per pull is a cold-start + memory hazard on a small
// host (concurrent intakes each spawn a browser and can OOM). Instead keep ONE
// long-lived browser and hand out a page per request, capped so we never run
// more than a couple of tabs at once. A crashed/closed browser self-heals: the
// "disconnected" reset drops the handle so the next call relaunches.
// A current desktop Chrome UA — a stale UA is itself a bot signal. Keep this fresh.
// Set at the browser level (not the deprecated page.setUserAgent) so every scrape page uses it.
const SCRAPER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
  `--user-agent=${SCRAPER_UA}`
];

let sharedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser?.connected) return sharedBrowser;
  if (launching) return launching;

  const executablePath = browserPath();
  if (!executablePath) {
    throw new Error("No Chrome/Edge executable found (set CHROME_PATH).");
  }

  launching = puppeteer
    .launch({ executablePath, headless: true, args: LAUNCH_ARGS })
    .then((browser) => {
      // eslint-disable-next-line no-console
      console.info(`[chrome] shared browser launched (${executablePath})`);
      sharedBrowser = browser;
      // A wedged/killed browser must not poison every future pull — forget it so
      // the next getSharedBrowser() relaunches a clean one.
      browser.on("disconnected", () => {
        if (sharedBrowser === browser) sharedBrowser = null;
      });
      launching = null;
      return browser;
    })
    .catch((error) => {
      launching = null;
      // eslint-disable-next-line no-console
      console.error(`[chrome] browser launch FAILED (${executablePath}): ${(error as Error)?.message ?? error}`);
      throw error;
    });

  return launching;
}

// Small concurrency gate: cap concurrent pages to bound memory on the host.
const MAX_CONCURRENT_PAGES = 2;
let activePages = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages += 1;
    return Promise.resolve();
  }
  // Slot is transferred (not re-counted) when a page is released below.
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    next(); // hand the permit straight to the next waiter — activePages unchanged
  } else {
    activePages -= 1;
  }
}

/**
 * Run `fn` with a fresh page from the shared browser, respecting the concurrency
 * cap and always closing the page afterwards. Throws if no browser is available
 * (missing Chrome) or if the callback throws — callers classify/degrade.
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  await acquireSlot();
  let page: Page | undefined;
  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage();
    return await fn(page);
  } finally {
    if (page) await page.close().catch(() => {});
    releaseSlot();
  }
}
