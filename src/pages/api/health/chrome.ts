import os from "node:os";
import { readFileSync } from "node:fs";
import type { APIRoute } from "astro";
import puppeteer from "puppeteer-core";
import { isAdmin } from "../../../lib/auth";
import { browserPath, resolveBrowserLaunch } from "../../../lib/chrome";

export const prerender = false;

function readSysctl(path: string): string {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return "n/a";
  }
}

// One-shot Chromium launch diagnostic (admin-only). Hitting this on the deploy host runs
// the REAL puppeteer.launch under three flag sets and reports the full error + exit
// code/signal for each, plus container memory — so a launch failure is diagnosed from
// data (missing lib? OOM SIGKILL? which flags work?) instead of guessed at from afar.
// Temporary: remove once the deploy's browser launch is sorted.
async function tryLaunch(label: string, args: string[], executablePath: string | undefined) {
  if (!executablePath) {
    return { label, ok: false, error: "no executablePath resolved" };
  }
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

  const systemPath = browserPath();
  const report: Record<string, unknown> = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    totalMemMB: Math.round(os.totalmem() / 1_048_576),
    freeMemMB: Math.round(os.freemem() / 1_048_576),
    cpus: os.cpus().length,
    CHROME_PATH: process.env.CHROME_PATH ?? null,
    systemBrowserPath: systemPath ?? null,
    // Confirms the root cause: "1" = the kernel restricts unprivileged user namespaces, so
    // recent system Chromium can't create its sandbox and dies at startup ("Code: null").
    "kernel.apparmor_restrict_unprivileged_userns": readSysctl(
      "/proc/sys/kernel/apparmor_restrict_unprivileged_userns"
    ),
    "kernel.unprivileged_userns_clone": readSysctl("/proc/sys/kernel/unprivileged_userns_clone"),
    "user.max_user_namespaces": readSysctl("/proc/sys/user/max_user_namespaces")
  };

  // The bundled @sparticuz/chromium launch — this is the real production path.
  const sparticuz = await resolveBrowserLaunch();
  report.sparticuzExecutablePath = sparticuz.executablePath ?? null;
  const attempts: unknown[] = [];
  attempts.push(await tryLaunch("sparticuz (production path)", sparticuz.args, sparticuz.executablePath));

  // For contrast, the old system-Chromium attempts (expected to fail on the deploy host).
  if (systemPath) {
    const base = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
    attempts.push(await tryLaunch("system base", base, systemPath));
    attempts.push(
      await tryLaunch("system single-process", [...base, "--disable-gpu", "--single-process", "--no-zygote"], systemPath)
    );
  }
  report.attempts = attempts;

  return new Response(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};
