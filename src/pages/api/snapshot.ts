import { Buffer } from "node:buffer";
import type { APIRoute } from "astro";
import { canAccessClient } from "../../lib/auth";
import { createSnapshotId, readClient, writeSnapshot } from "../../lib/storage";
import type { MetricSource, ReportSnapshot } from "../../lib/types";

export const prerender = false;

const MAX_IMAGE_BYTES = 6_000_000;
const IMAGE_TIMEOUT_MS = 8000;
const MAX_CAPTION_CHARS = 300;
const MAX_NOTES_CHARS = 600;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function field(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

// Invalid input must be rejected, not silently frozen as 0 in a client-facing PDF.
function numberField(form: FormData, name: string): number | null {
  const raw = field(form, name).replace(/,/g, "");
  if (raw === "") return 0; // empty is a legitimate "no value yet"
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function sourceField(form: FormData, name: string): MetricSource {
  const value = field(form, name);
  return value === "rybbit_api" || value === "meta_api" || value === "mock" ? value : "manual";
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validDate(value: string) {
  return ISO_DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: location }
  });
}

// Form POSTs navigate the browser, so a bare text/plain 400 is a dead end. Entries are
// only preserved via history back (bfcache) — a fresh GET of the form would be blank,
// so the copy steers to the Back button and the link is a last resort.
function errorPage(status: number, message: string, backHref: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Report not created</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;">
<h1 style="font-size:1.25rem;">Report not created</h1>
<p>${message}</p>
<p>Use your browser's <strong>Back</strong> button to return to the form — your entries are preserved there.</p>
<p><a href="${backHref}">Or start over with a blank form</a>.</p>
</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Only Meta CDN hosts may be fetched from form-supplied media URLs — everything else is
// an SSRF vector once this app is hosted. The client logo (trusted: set by the agency in
// the client profile, never by the coordinator form) skips the host check.
function allowedMediaHost(url: string) {
  try {
    const host = new URL(url).hostname;
    return (
      host === "fbcdn.net" ||
      host.endsWith(".fbcdn.net") ||
      host === "cdninstagram.com" ||
      host.endsWith(".cdninstagram.com") ||
      host === "cdn.realtor.ca"
    );
  } catch {
    return false;
  }
}

/**
 * Freeze a remote image into the snapshot as a base64 data URI. Facebook/Instagram CDN
 * URLs are signed and expire within days, and the client logo file can change on disk —
 * but a snapshot must render unchanged forever, so we embed the bytes at creation time.
 * Non-http values (local /clients/... paths) pass through as-is. Any failure returns ""
 * and the report template renders without the image rather than with a broken one.
 */
async function embedImage(url: string, trusted = false): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    // Only the trusted client-profile logo may pass a non-http value through (a local
    // /clients/... path). An untrusted form value that isn't http(s) — e.g. a smuggled
    // data: URI that would bypass the size cap — is dropped.
    return trusted ? url : "";
  }
  if (!trusted && !allowedMediaHost(url)) return "";
  try {
    // redirect: "error" — an allowlisted CDN host must not be able to bounce the fetch
    // to an arbitrary (e.g. internal) address via an open redirect.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      redirect: trusted ? "follow" : "error"
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return "";
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const clientSlug = field(form, "client_slug");

  if (!clientSlug) {
    return errorPage(400, "Missing client slug.", "/");
  }

  let client;
  try {
    client = await readClient(clientSlug);
  } catch {
    return errorPage(404, "Client profile not found.", "/");
  }

  if (!canAccessClient(request, client)) {
    return errorPage(401, "Sign-in required.", `/c/${client.slug}/`);
  }

  const backHref = `/c/${client.slug}/`;
  const address = field(form, "address");
  const listingUrl = field(form, "listing_url");
  const startDate = field(form, "start_date");
  const endDate = field(form, "end_date");
  const facebookPostUrl = field(form, "facebook_post_url");
  const instagramPostUrl = field(form, "instagram_post_url");
  const realtorUrl = field(form, "realtor_admin_url");

  if (!address || !listingUrl || !startDate || !endDate) {
    return errorPage(400, "Address, listing URL, start date, and end date are required.", backHref);
  }

  if (!validDate(startDate) || !validDate(endDate)) {
    return errorPage(400, "Start and end dates must be valid dates (YYYY-MM-DD).", backHref);
  }

  if (startDate > endDate) {
    return errorPage(400, "The start date must be on or before the end date.", backHref);
  }

  if (!facebookPostUrl || !instagramPostUrl) {
    return errorPage(400, "Facebook and Instagram post URLs are required.", backHref);
  }

  for (const [label, value] of [
    ["Website URL", listingUrl],
    ["Facebook URL", facebookPostUrl],
    ["Instagram URL", instagramPostUrl]
  ] as const) {
    if (!isHttpUrl(value)) {
      return errorPage(400, `${label} must be a valid http(s) link.`, backHref);
    }
  }
  if (realtorUrl && !isHttpUrl(realtorUrl)) {
    return errorPage(400, "REALTOR.ca Admin URL must be a valid http(s) link.", backHref);
  }

  const numbers = {
    website_views: numberField(form, "website_views"),
    facebook_views: numberField(form, "facebook_views"),
    instagram_views: numberField(form, "instagram_views"),
    site_total_views: numberField(form, "site_total_views"),
    realtor_listing_views: numberField(form, "realtor_listing_views"),
    showings: numberField(form, "showings"),
    days_on_market: numberField(form, "days_on_market")
  };
  const badNumbers = Object.entries(numbers)
    .filter(([, value]) => value === null)
    .map(([name]) => name.replaceAll("_", " "));
  if (badNumbers.length > 0) {
    return errorPage(400, `These fields must be non-negative numbers: ${badNumbers.join(", ")}.`, backHref);
  }

  if (field(form, "approved") !== "yes") {
    return errorPage(400, "Report data must be reviewed and approved before creation.", backHref);
  }

  const [logo, facebookMedia, instagramMedia, propertyImage] = await Promise.all([
    embedImage(client.logo_url, true),
    embedImage(field(form, "facebook_media_url")),
    embedImage(field(form, "instagram_media_url")),
    embedImage(field(form, "property_image_url"))
  ]);

  const snapshot: ReportSnapshot = {
    client: {
      slug: client.slug,
      name: client.name,
      logo_url: logo,
      brand_primary: client.brand_primary,
      brand_accent: client.brand_accent,
      footer_text: client.footer_text,
      brokerage_name: client.brokerage_name,
      brokerage_address: client.brokerage_address,
      brokerage_contact: client.brokerage_contact
    },
    report: {
      address,
      start_date: startDate,
      end_date: endDate,
      listing_url: listingUrl,
      created_at: new Date().toISOString(),
      notes: field(form, "notes").slice(0, MAX_NOTES_CHARS),
      realtor_url: realtorUrl,
      property_image: propertyImage,
      // Checkboxes are "hide" so an unticked (absent) box means "display".
      show_showings: field(form, "hide_showings") !== "yes",
      show_notes: field(form, "hide_notes") !== "yes"
    },
    website: {
      source: sourceField(form, "website_source"),
      listing_views: numbers.website_views!,
      site_total_views: numbers.site_total_views!
    },
    facebook: {
      source: sourceField(form, "facebook_source"),
      post_url: facebookPostUrl,
      caption: (field(form, "facebook_caption") || "Facebook listing post").slice(0, MAX_CAPTION_CHARS),
      media_url: facebookMedia,
      views: numbers.facebook_views!
    },
    instagram: {
      source: sourceField(form, "instagram_source"),
      post_url: instagramPostUrl,
      caption: (field(form, "instagram_caption") || "Instagram listing post").slice(0, MAX_CAPTION_CHARS),
      media_url: instagramMedia,
      views: numbers.instagram_views!
    },
    manual: {
      realtor_listing_views: numbers.realtor_listing_views!,
      showings: numbers.showings!,
      days_on_market: numbers.days_on_market!
    },
    warnings: []
  };

  const snapshotId = createSnapshotId();
  await writeSnapshot(snapshotId, snapshot);
  return redirect(`/reports/${snapshotId}`);
};
