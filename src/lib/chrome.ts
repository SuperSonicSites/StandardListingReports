import { existsSync } from "node:fs";

// Local Chrome/Edge used for PDF printing and the REALTOR.ca capture.
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

// Hardened base flags for headless Chromium on a server/container, shared by the PDF
// route and the REALTOR.ca scraper so both launch identically.
//   --no-sandbox / --disable-setuid-sandbox: containers run as root without a sandbox.
//   --disable-dev-shm-usage: container /dev/shm is often 64MB and Chrome crashes without it.
//   --disable-gpu / --disable-software-rasterizer: with no GPU, Chromium's GPU/SwiftShader
//     init can crash the process at startup ("Failed to launch the browser process") — the
//     most common cause of a launch that dies immediately on a headless host.
export const BROWSER_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer"
];

// Common puppeteer.launch options shared by the PDF route and the scraper. Callers add
// their own `executablePath` and any extra args.
export function browserLaunchOptions(extraArgs: string[] = []) {
  return {
    headless: true as const,
    args: [...BROWSER_LAUNCH_ARGS, ...extraArgs],
    // A memory-pressured container can take well over puppeteer's default 30s to bring up
    // the DevTools endpoint (the benign dbus stderr prints while it's still starting) — so
    // the launch times out and reports a failure that isn't one. Give it more room.
    timeout: 60_000,
    // There's no system D-Bus in the container; point Chromium at a dead address so it
    // doesn't keep trying the missing /run/dbus socket (the source of the noisy — and
    // misleading — "Failed to connect to the bus" line) and stall startup on the retries.
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "/dev/null" }
  };
}

// A launch error whose Chromium stderr matches this is a real "the browser won't start"
// problem (missing lib, killed process, bad binary) — not a page/nav failure. Retrying
// won't help; surface it. Shared so the PDF route and scraper classify identically.
export function isBrowserStartupError(message: string): boolean {
  return /failed to launch|spawn|ENOENT|Target closed|Protocol error|Browser was not found|shared librar|error while loading|cannot open shared object|No usable sandbox/i.test(
    message
  );
}

// Pull the *informative* line out of a puppeteer launch error. The message's first line is
// a generic "Failed to launch the browser process!"; Chromium's real stderr (the missing
// library, or a kill signal) is on the lines after it — keep those, drop the boilerplate.
export function launchErrorDetail(error: unknown): string {
  const raw = (error as Error)?.message ?? String(error);
  const meaningful = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^Failed to launch the browser process/i.test(line) &&
        !/^TROUBLESHOOTING/i.test(line) &&
        !/pptr\.dev|puppeteer|for help|for more/i.test(line)
    );
  return (meaningful.slice(0, 2).join(" ") || raw.split("\n")[0]).slice(0, 240);
}
