import { Buffer } from "node:buffer";
import type { APIRoute } from "astro";
import { canAccessClient } from "../../lib/auth";
import { createSnapshotId, readClient, readSnapshot, writeSnapshot } from "../../lib/storage";
import type { MarketBlock, MetricSource, ReportSnapshot } from "../../lib/types";
import { brandedErrorPage } from "../../lib/error-page";
import { exposureBenchmark, recordExposure } from "../../lib/market";
import {
  computeMonthsOfInventory,
  EMPTY_MARKET_VALUES,
  interpretMarket,
  interpretProperty,
  MARKET_VALUE_KEYS,
  MIN_DAYS_FOR_EXPOSURE,
  PROPERTY_TYPES,
  sellerVerdict,
  TYPE_LABELS,
  type MarketValues,
  type PropertyType,
  type Verdict
} from "../../lib/market-rules";

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

// Market figures: blank means "the board doesn't publish it" (null). Anything else must
// be a finite number — year-over-year changes are signed and months of inventory has a
// decimal, so this is looser than numberField. `undefined` = invalid input.
function marketNumber(form: FormData, name: string): number | null | undefined {
  const raw = field(form, name).replace(/,/g, "").replace(/%$/, "");
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: location }
  });
}

// Form POSTs navigate the browser, so a bare 400 is a dead end. Entries survive via
// history back (bfcache) — a fresh GET of the form would be blank — so the primary
// action returns to the populated form and the "start over" link is the fallback.
function errorPage(status: number, message: string, backHref: string) {
  return brandedErrorPage({
    status,
    eyebrow: "Report not created",
    title: "Let’s fix one thing and try again.",
    reason: message,
    reassure: true,
    primaryLabel: "← Back to the report form",
    secondary: { label: "Start over with a blank form", href: backHref }
  });
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
      host === "cdn.realtor.ca" ||
      host === "images.realtor.ca"
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
  // The reporting window is derived (first day on market -> today); end_date defaults to
  // today when the pull didn't set it. start_date must be present (pull-filled or manual).
  const endDate = field(form, "end_date") || todayIso();
  const mlsNumber = field(form, "mls_number");
  const facebookPostUrl = field(form, "facebook_post_url");
  const instagramPostUrl = field(form, "instagram_post_url");
  const realtorUrl = field(form, "realtor_admin_url");

  if (!address || !listingUrl) {
    return errorPage(400, "Address and listing URL are required.", backHref);
  }

  if (!startDate) {
    return errorPage(
      400,
      "The reporting period isn't set. Use Pull data to read it from REALTOR.ca, or set the dates manually.",
      backHref
    );
  }

  if (!validDate(startDate) || !validDate(endDate)) {
    return errorPage(400, "Start and end dates must be valid dates (YYYY-MM-DD).", backHref);
  }

  if (startDate > endDate) {
    return errorPage(400, "The start date must be on or before the end date.", backHref);
  }

  // The website URL is always required; the social post URLs are optional (a listing may
  // have no post yet — the report must still generate). Validate a social URL only when
  // one is present.
  if (!isHttpUrl(listingUrl)) {
    return errorPage(400, "Website URL must be a valid http(s) link.", backHref);
  }
  for (const [label, value] of [
    ["Facebook URL", facebookPostUrl],
    ["Instagram URL", instagramPostUrl]
  ] as const) {
    if (value && !isHttpUrl(value)) {
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

  // Seller Market Update: the reviewed market figures plus the rule-generated
  // interpretation, computed here from the submitted values (never trusted from the
  // browser) and frozen with everything else. No figures at all => no market block,
  // and the update still generates without the market sheet.
  const kind = field(form, "report_kind") === "market" ? "market" : "listing";
  const propertyTypeRaw = field(form, "property_type");
  const propertyType: PropertyType = PROPERTY_TYPES.some((t) => t.value === propertyTypeRaw)
    ? (propertyTypeRaw as PropertyType)
    : "single_family";
  let market: MarketBlock | undefined;
  let verdict: Verdict | undefined;
  if (kind === "market") {
    const property = {
      days_on_market: numbers.days_on_market!,
      realtor_views: numbers.realtor_listing_views!,
      showings: field(form, "showings") === "" ? null : numbers.showings!
    };
    // Exposure against our own archive; the rules only quote it once the sample is big enough.
    const benchmark = await exposureBenchmark().catch(() => null);
    const exposure =
      benchmark && property.days_on_market >= MIN_DAYS_FOR_EXPOSURE && property.realtor_views > 0
        ? { views_per_day: Math.round((property.realtor_views / property.days_on_market) * 10) / 10, ...benchmark }
        : null;
    const values: MarketValues = { ...EMPTY_MARKET_VALUES };
    const badMarket: string[] = [];
    for (const key of MARKET_VALUE_KEYS) {
      const value = marketNumber(form, `market_${key}`);
      if (value === undefined) badMarket.push(key.replaceAll("_", " "));
      else values[key] = value;
    }
    if (badMarket.length > 0) {
      return errorPage(
        400,
        `These market fields must be numbers (leave a field blank when the board doesn't publish it): ${badMarket.join(", ")}.`,
        backHref
      );
    }
    const reportingMonth = field(form, "market_reporting_month");
    const hasFigures =
      values.sales !== null ||
      values.active_inventory !== null ||
      values.months_of_inventory !== null ||
      values.days_to_sell !== null ||
      values.local_active !== null;
    if (hasFigures) {
      if (!/^\d{4}-\d{2}$/.test(reportingMonth)) {
        return errorPage(400, "The market reporting month must look like 2026-08.", backHref);
      }
      values.months_of_inventory ??= computeMonthsOfInventory(values.active_inventory, values.sales);
      const localSourceUrl = field(form, "market_local_source_url");
      const ctx = {
        region_label: field(form, "market_region_label") || "the local market",
        reporting_month: reportingMonth,
        type_label: field(form, "market_type_label") || TYPE_LABELS[propertyType],
        local_label: field(form, "market_local_label")
      };
      const sourceUrl = field(form, "market_source_url");
      market = {
        ...values,
        source: field(form, "market_source") === "board_stats" ? "board_stats" : "manual",
        region_label: ctx.region_label,
        board_label: field(form, "market_board_label"),
        reporting_month: reportingMonth,
        type_label: ctx.type_label,
        price_label: field(form, "market_price_label") || "Benchmark price",
        source_url: isHttpUrl(sourceUrl) ? sourceUrl : "",
        retrieved_at: field(form, "market_retrieved_at"),
        local_label: ctx.local_label,
        local_source_url: isHttpUrl(localSourceUrl) ? localSourceUrl : "",
        interpretation: { market: interpretMarket(values, ctx), property: interpretProperty(values, ctx, property, exposure) },
        exposure
      };
    }
    // The cover's "Where your property stands", frozen like every other sentence. Without market figures it
    // still reads the property's own numbers (exposure, showings).
    verdict = sellerVerdict(
      values,
      market ?? { region_label: field(form, "market_region_label") || "your area", reporting_month: "", type_label: TYPE_LABELS[propertyType] },
      property,
      exposure
    );
  }

  const notes = field(form, "notes").slice(0, MAX_NOTES_CHARS);

  // "Adjust numbers": a form prefilled from an earlier report carries no image bytes (data
  // URIs are refused from the browser), so copy them from that report — same client only,
  // and only where the form supplied nothing new.
  const copyFrom = field(form, "copy_media_from");
  let inherited = { facebook: "", instagram: "", property: "" };
  if (copyFrom) {
    try {
      const source = await readSnapshot(copyFrom);
      if (source.client.slug === client.slug) {
        inherited = { facebook: source.facebook.media_url, instagram: source.instagram.media_url, property: source.report.property_image };
      }
    } catch {
      // unknown snapshot: nothing to inherit
    }
  }

  // A market update shows social views as numbers only, so its snapshot carries no post images.
  const [logo, facebookMedia, instagramMedia, propertyImage] = await Promise.all([
    embedImage(client.logo_url, true),
    kind === "market" ? "" : embedImage(field(form, "facebook_media_url")).then((v) => v || inherited.facebook),
    kind === "market" ? "" : embedImage(field(form, "instagram_media_url")).then((v) => v || inherited.instagram),
    embedImage(field(form, "property_image_url")).then((v) => v || inherited.property)
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
      // start_date is the listing's first day on market, so it doubles as the list date.
      mls_number: mlsNumber || undefined,
      list_date: startDate,
      start_date: startDate,
      end_date: endDate,
      listing_url: listingUrl,
      created_at: new Date().toISOString(),
      notes,
      realtor_url: realtorUrl,
      property_image: propertyImage,
      // Optional blocks: entered => shown on the report, left blank => omitted.
      // An explicit "0" showings is a real value and shows as 0.
      show_showings: field(form, "showings") !== "",
      show_notes: notes !== "",
      kind,
      ...(kind === "market" ? { property_type: propertyType, ...(verdict ? { verdict } : {}) } : {})
    },
    website: {
      source: sourceField(form, "website_source"),
      listing_views: numbers.website_views!,
      site_total_views: numbers.site_total_views!
    },
    facebook: {
      source: sourceField(form, "facebook_source"),
      post_url: facebookPostUrl,
      // Only fall back to a generic caption when there IS a post; a missing post stays blank
      // so the report doesn't imply a post that doesn't exist.
      caption: (field(form, "facebook_caption") || (facebookPostUrl ? "Facebook listing post" : "")).slice(0, MAX_CAPTION_CHARS),
      media_url: facebookMedia,
      views: numbers.facebook_views!
    },
    instagram: {
      source: sourceField(form, "instagram_source"),
      post_url: instagramPostUrl,
      caption: (field(form, "instagram_caption") || (instagramPostUrl ? "Instagram listing post" : "")).slice(0, MAX_CAPTION_CHARS),
      media_url: instagramMedia,
      views: numbers.instagram_views!
    },
    manual: {
      realtor_listing_views: numbers.realtor_listing_views!,
      showings: numbers.showings!,
      days_on_market: numbers.days_on_market!
    },
    ...(market ? { market } : {}),
    warnings: []
  };

  const snapshotId = createSnapshotId();
  await writeSnapshot(snapshotId, snapshot);
  // Feed the exposure benchmark (views per day on market) for future market updates.
  await recordExposure(snapshotId, snapshot).catch((error) => console.warn("[market] exposure ledger not updated:", error));
  return redirect(`/reports/${snapshotId}`);
};
