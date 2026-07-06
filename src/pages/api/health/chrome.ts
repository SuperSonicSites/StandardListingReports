import os from "node:os";
import { existsSync } from "node:fs";
import type { APIRoute } from "astro";
import puppeteer from "puppeteer-core";
import { isAdmin } from "../../../lib/auth";
import { browserPath } from "../../../lib/chrome";

export const prerender = false;

// One-shot Chromium launch diagnostic (admin-only). Hitting this on the deploy host runs
// the REAL puppeteer.launch under three flag sets and reports the full error + exit
// code/signal for each, plus container memory — so a launch failure is diagnosed from
// data (missing lib? OOM SIGKILL? which flags work?) instead of guessed at from afar.
// Temporary: remove once the deploy's browser launch is sorted.
async function tryLaunch(label: string, args: string[]) {
  const executablePath = browserPath();
  const start = Date.now();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args,
      timeout: 40_000,
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "/dev/null" }
    });
    const version = await browser.version();
    return { label, ok: true, ms: Date.now() - start, version };
  } catch (error) {
    const e = error as { name?: string; message?: string; code?: unknown; signal?: unknown };
    return {
      label,
      ok: false,
      ms: Date.now() - start,
      name: e?.name ?? "Error",
      code: e?.code ?? null,
      signal: e?.signal ?? null,
      // The FULL message, all lines — this carries chromium's real stderr and any
      // "Code:/Signal:" the truncated user-facing message drops.
      message: String(e?.message ?? error)
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return new Response("Admin sign-in required.", { status: 401 });
  }

  const executablePath = browserPath();
  const base = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
  const report: Record<string, unknown> = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    totalMemMB: Math.round(os.totalmem() / 1_048_576),
    freeMemMB: Math.round(os.freemem() / 1_048_576),
    cpus: os.cpus().length,
    CHROME_PATH: process.env.CHROME_PATH ?? null,
    resolvedBrowserPath: executablePath ?? null,
    browserExists: executablePath ? existsSync(executablePath) : false
  };

  if (!executablePath) {
    report.attempts = "No browser binary found — nothing to launch.";
    return new Response(JSON.stringify(report, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Run sequentially (never two Chromium at once) so a launch OOM in one doesn't skew the next.
  report.attempts = [
    await tryLaunch("base", base),
    await tryLaunch("gpu-off", [...base, "--disable-gpu", "--disable-software-rasterizer"]),
    await tryLaunch("single-process", [...base, "--disable-gpu", "--single-process", "--no-zygote"])
  ];

  return new Response(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};
