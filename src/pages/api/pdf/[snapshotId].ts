import type { APIRoute } from "astro";
import puppeteer from "puppeteer-core";
import { browserPath, BROWSER_LAUNCH_ARGS } from "../../../lib/chrome";
import { readSnapshot, slugify } from "../../../lib/storage";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const snapshotId = params.snapshotId ?? "";

  let snapshot;
  try {
    snapshot = await readSnapshot(snapshotId);
  } catch {
    return new Response("Snapshot not found.", { status: 404 });
  }

  const executablePath = browserPath();
  if (!executablePath) {
    return new Response("PDF generation needs Chrome, Edge, or CHROME_PATH set.", { status: 500 });
  }

  // Self-fetch over loopback, never via the request's own origin: the Host header is
  // client-controlled (an SSRF vector), and behind a TLS proxy the public origin
  // redirects or serves the access-gate login page instead of the report.
  const port = process.env.PORT ?? "4321";
  const reportUrl = `http://127.0.0.1:${port}/reports/${snapshotId}?print=1`;

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: BROWSER_LAUNCH_ARGS
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1600, deviceScaleFactor: 1 });
    // The loopback self-fetch must carry the caller's auth cookie, or the
    // middleware would bounce the report page to /login and we'd print that.
    const cookie = request.headers.get("cookie");
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0"
      }
    });

    const filename = `seller-report-${slugify(snapshot.report.address) || snapshotId}-${snapshot.report.end_date}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error(`PDF generation failed for ${snapshotId}:`, error);
    return new Response("PDF generation failed. Check the server logs and try again.", { status: 500 });
  } finally {
    await browser?.close();
  }
};
