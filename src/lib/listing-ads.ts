// Listing-ad request rules, shared by the form script (instant feedback) and
// /api/listing-ad (the trust boundary, which re-checks everything). Browser-safe:
// no Node imports here.

export const AD_BUDGETS = ["$50", "$100", "$150", "$200"];
export const CAMPAIGN_TYPES = ["New Ad Campaign", "Extend Existing Campaign"];
export const MAX_CITIES = 10;
// Character caps, within the Listing_Ads field lengths in Zoho CRM (settings/fields metadata:
// Listing_Address 255, Location_Targeting 2000, website fields 450, Notes_Special_Requests 2000).
export const LIMITS = { address: 255, location: 255, url: 450, notes: 2000 };
// The city list is re-joined with ", " (up to 9 characters longer than what was typed), so its
// length rule is the CRM field's, not the input's maxlength — typed input can never trip it.
const LOCATION_FIELD_MAX = 2000;

export type ListingAdInput = {
  listing_address: string;
  ad_budget: string;
  campaign_type: string;
  location_targeting: string;
  photos_url: string;
  realtor_stats_url: string;
  special_notes: string;
};

export type ListingAdErrors = Partial<Record<keyof ListingAdInput, string>>;

/** "Whitehorse, Kelowna;Ucluelet" -> ["Whitehorse", "Kelowna", "Ucluelet"]. */
export function splitCities(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((city) => city.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// The REALTOR import Worker only reads the member "share listing" stats link, so
// accept exactly that shape — anything else would be filed but never imported.
export function isRealtorStatsUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "member.realtor.ca" &&
      url.pathname.startsWith("/Reports/ListingDestination/")
    );
  } catch {
    return false;
  }
}

/** Trimmed strings only — anything that isn't a string (from a hand-made request) becomes "". */
export function normalizeListingAd(raw: Record<string, unknown>): ListingAdInput {
  const text = (key: keyof ListingAdInput) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
  return {
    listing_address: text("listing_address").replace(/\s+/g, " "),
    ad_budget: text("ad_budget"),
    campaign_type: text("campaign_type"),
    location_targeting: splitCities(text("location_targeting")).join(", "),
    photos_url: text("photos_url"),
    realtor_stats_url: text("realtor_stats_url"),
    special_notes: text("special_notes").replace(/\r\n/g, "\n")
  };
}

export function validateListingAd(input: ListingAdInput): ListingAdErrors {
  const errors: ListingAdErrors = {};

  if (!input.listing_address) errors.listing_address = "Enter the listing address.";
  else if (input.listing_address.length > LIMITS.address)
    errors.listing_address = `Keep the address to ${LIMITS.address} characters or fewer.`;

  if (!AD_BUDGETS.includes(input.ad_budget)) errors.ad_budget = "Choose an ad budget.";
  if (!CAMPAIGN_TYPES.includes(input.campaign_type)) errors.campaign_type = "Choose a campaign type.";

  const cities = splitCities(input.location_targeting).length;
  if (cities === 0) errors.location_targeting = "List at least one target city.";
  else if (cities > MAX_CITIES) errors.location_targeting = `List up to ${MAX_CITIES} cities — this has ${cities}.`;
  else if (input.location_targeting.length > LOCATION_FIELD_MAX)
    errors.location_targeting = `Keep the city list to ${LOCATION_FIELD_MAX} characters or fewer.`;

  if (input.photos_url && (!isHttpUrl(input.photos_url) || input.photos_url.length > LIMITS.url))
    errors.photos_url = "Paste the full folder link, starting with https://.";

  if (!input.realtor_stats_url) errors.realtor_stats_url = "Paste the REALTOR.ca report stats link.";
  else if (!isRealtorStatsUrl(input.realtor_stats_url) || input.realtor_stats_url.length > LIMITS.url)
    errors.realtor_stats_url =
      "Use the Share Listing link from REALTOR.ca — it starts with https://member.realtor.ca/Reports/ListingDestination/.";

  if (input.special_notes.length > LIMITS.notes)
    errors.special_notes = `Keep notes to ${LIMITS.notes} characters or fewer.`;

  return errors;
}
