// Listing website order rules, shared by the order form (instant feedback) and
// /api/site-order (the trust boundary, which re-checks everything). Browser-safe:
// no Node imports here.
import { isRealtorStatsUrl } from "./listing-ads";
import type { OrderListing, SiteOrderIntake, SiteOrderPackage } from "./types";

export const PACKAGES: { value: SiteOrderPackage; label: string }[] = [
  { value: "single", label: "Single listing" },
  { value: "project", label: "Project (a development with several listings)" }
];
export const LIMITS = { text: 255, short: 100, url: 450, notes: 2000, points: 600, route: 60, listings: 40 };
// Paths the portfolio site uses for itself; never sellable as a micro-site route.
export const PROTECTED_ROUTES = ["thank-you", "privacy", "sitemap.xml", "robots.txt", "sold", "index", "assets", "api", "admin", "portfolio"];
export const TERMS_VERSION = "2026.09.1";
export const PRICE_LINE = "$599 today, then $99 per year starting one year after purchase, plus applicable tax.";
export const FOLDER_NOTICE =
  "Only complete this order when your photo folder is final and shared. Production starts from the folder as it is when we open it.";

export type SiteOrderInput = SiteOrderIntake & {
  package: SiteOrderPackage;
  route: string;
  terms_accepted: boolean;
};

export type SiteOrderErrors = Partial<Record<keyof SiteOrderInput | `listings.${number}.${keyof OrderListing}`, string>>;

/** "985 Academy Way Unit 208, Kelowna" -> "985-academy-way-unit-208-kelowna" (60 chars max). */
export function routeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.route)
    .replace(/-+$/g, "");
}

export function isRouteAllowed(route: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route) && route.length <= LIMITS.route && !PROTECTED_ROUTES.includes(route) && !route.startsWith("_");
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** A shared photo folder: Dropbox or Google Drive only (the server never fetches it). */
export function isFolderUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return /(^|\.)(dropbox\.com|dropboxusercontent\.com|drive\.google\.com|docs\.google\.com)$/.test(host) && isHttpUrl(value);
  } catch {
    return false;
  }
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const isMoney = (value: string) => /^\d{1,9}(\.\d{1,2})?$/.test(value);
const isInt = (value: string, max: number) => /^\d+$/.test(value) && Number(value) <= max;
const isDecimal = (value: string) => /^\d{1,3}(\.\d)?$/.test(value);

function text(raw: Record<string, unknown>, key: string, max: number) {
  const value = typeof raw[key] === "string" ? (raw[key] as string) : "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function normalizeListing(raw: Record<string, unknown>): OrderListing {
  return {
    unit_name: text(raw, "unit_name", LIMITS.short).replace(/\s+/g, " "),
    mls_number: text(raw, "mls_number", 20).replace(/\s+/g, ""),
    realtor_stats_url: text(raw, "realtor_stats_url", LIMITS.url),
    price: text(raw, "price", 12).replace(/[$,\s]/g, ""),
    beds: text(raw, "beds", 3),
    baths: text(raw, "baths", 5),
    area: text(raw, "area", 7).replace(/[,\s]/g, ""),
    plan_name: text(raw, "plan_name", 40),
    photos_subfolder: text(raw, "photos_subfolder", LIMITS.url),
    floor_plan_link: text(raw, "floor_plan_link", LIMITS.url)
  };
}

/** Trimmed strings only — anything that isn't a string (from a hand-made request) becomes "". */
export function normalizeSiteOrder(raw: Record<string, unknown>): SiteOrderInput {
  const pkg = raw.package === "project" ? "project" : "single";
  const listings = (Array.isArray(raw.listings) ? raw.listings : [])
    .slice(0, LIMITS.listings)
    .map((row) => normalizeListing(row && typeof row === "object" ? (row as Record<string, unknown>) : {}));
  const property_address = text(raw, "property_address", LIMITS.text).replace(/\s+/g, " ");
  const typedRoute = text(raw, "route", LIMITS.route).toLowerCase();
  return {
    package: pkg,
    route: typedRoute ? routeSlug(typedRoute) : routeSlug(property_address),
    property_address,
    property_type: text(raw, "property_type", 60),
    source_url: text(raw, "source_url", LIMITS.url),
    photos_url: text(raw, "photos_url", LIMITS.url),
    video_url: text(raw, "video_url", LIMITS.url),
    hero_preference: text(raw, "hero_preference", 200),
    selling_points: text(raw, "selling_points", LIMITS.points),
    client_notes: text(raw, "client_notes", LIMITS.notes),
    target_date: text(raw, "target_date", 10),
    agent_name: text(raw, "agent_name", LIMITS.short),
    agent_email: text(raw, "agent_email", 254).toLowerCase(),
    agent_phone: text(raw, "agent_phone", 30),
    listings,
    terms_accepted: raw.terms_accepted === true || raw.terms_accepted === "on" || raw.terms_accepted === "true"
  };
}

export function validateSiteOrder(input: SiteOrderInput): SiteOrderErrors {
  const errors: SiteOrderErrors = {};

  if (!input.property_address) errors.property_address = "Enter the property or development address.";
  if (!input.route) errors.route = "Enter a page address, letters and numbers with hyphens.";
  else if (!isRouteAllowed(input.route)) errors.route = "That page address is reserved or has characters we can't use. Letters, numbers and hyphens only.";

  if (input.source_url && !isHttpUrl(input.source_url)) errors.source_url = "Paste the full listing or development link, starting with https://.";
  if (!input.photos_url) errors.photos_url = "Paste the shared photo folder link (Dropbox or Google Drive).";
  else if (!isFolderUrl(input.photos_url)) errors.photos_url = "The photo folder must be a Dropbox or Google Drive share link.";
  if (input.video_url && !isHttpUrl(input.video_url)) errors.video_url = "Paste the full video link, starting with https://.";
  if (input.target_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.target_date)) errors.target_date = "Pick a date.";

  if (!input.agent_name) errors.agent_name = "Enter the agent's name as it should appear on the page.";
  if (!input.agent_email || !isEmail(input.agent_email)) errors.agent_email = "Enter the agent's email address.";
  if (!input.agent_phone) errors.agent_phone = "Enter the agent's phone number.";

  if (input.listings.length === 0) errors.listings = "Add at least one listing.";
  if (input.package === "single" && input.listings.length > 1) errors.listings = "A single listing has one row. Choose Project for several listings.";
  input.listings.forEach((row, i) => {
    const at = (key: keyof OrderListing) => `listings.${i}.${key}` as const;
    if (input.package === "project" && !row.unit_name) errors[at("unit_name")] = "Name this listing (for example #201 or Plan C6).";
    if (row.realtor_stats_url && !isRealtorStatsUrl(row.realtor_stats_url))
      errors[at("realtor_stats_url")] = "Use the Share Listing link from REALTOR.ca (it starts with https://member.realtor.ca/Reports/ListingDestination/).";
    if (!row.price || !isMoney(row.price)) errors[at("price")] = "Enter the price as a number.";
    if (row.beds && !isInt(row.beds, 99)) errors[at("beds")] = "Beds must be a whole number.";
    if (row.baths && !isDecimal(row.baths)) errors[at("baths")] = "Baths must be a number like 2 or 2.5.";
    if (row.area && !isInt(row.area, 999999)) errors[at("area")] = "Area must be a whole number of square feet.";
    if (row.photos_subfolder && !isFolderUrl(row.photos_subfolder)) errors[at("photos_subfolder")] = "Subfolder links must be Dropbox or Google Drive links.";
    if (row.floor_plan_link && !isHttpUrl(row.floor_plan_link)) errors[at("floor_plan_link")] = "Paste the full floor plan link, starting with https://.";
  });

  if (!input.terms_accepted) errors.terms_accepted = "Please accept the Listing Website Terms to continue.";
  return errors;
}

/** Plain-language labels for the error summary (shared with the form script). */
export const LABELS: Record<string, string> = {
  package: "Package",
  route: "Page address",
  property_address: "Property address",
  property_type: "Property type",
  source_url: "Listing or development link",
  photos_url: "Photo folder link",
  video_url: "Video link",
  hero_preference: "Hero photo",
  selling_points: "Selling points",
  client_notes: "Notes",
  target_date: "Target date",
  agent_name: "Agent name",
  agent_email: "Agent email",
  agent_phone: "Agent phone",
  listings: "Listings",
  terms_accepted: "Terms"
};
