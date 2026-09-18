import type { ExposureBenchmark, MarketValues, PropertyType, RecordType, Verdict } from "./market-rules";

export type ClientProfile = {
  slug: string;
  name: string;
  logo_url: string;
  brand_primary: string;
  brand_accent: string;
  footer_text: string;
  brokerage_name: string;
  brokerage_address: string;
  brokerage_contact: string;
  // Who may sign in to this client (magic link): full addresses, or "@domain.com"
  // for everyone at the team's domain. Optional so older profiles still parse;
  // without it the client's form is admin-only.
  emails?: string[];
  // The client's brokerage Account in Zoho CRM (record id). Listing-ad requests
  // from /c/<slug>/ads are filed under it — set by the agency here, never taken
  // from the browser. Optional: without it the portal shows listing ads as not set up.
  zoho_account_id?: string;
  // The client's analytics dashboard (GA4, social media, etc.). Optional — the
  // portal only shows the "Dashboard" card when this is set.
  dashboard_url?: string;
  // Listing websites: the client's portfolio host (e.g. portfolio.grayteam.ca).
  // Every micro-site is a path under it. The portal shows "Order a Listing
  // Website" only when this and zoho_account_id are set.
  portfolio_host?: string;
  // The client's Stripe Customer (cus_…). Checkout always attaches to it, so a
  // client never gets a second Customer. Admin-set; created once by the app
  // only when blank.
  stripe_customer_id?: string;
  // --- v0.2 integration IDs (optional; NON-SECRET addressing ids) ---
  meta_page_id?: string;
  meta_instagram_id?: string;
  rybbit_site_id?: string;
  // The client's public website (e.g. https://acmerealty.com). Its origin + the
  // Rybbit-resolved listing path builds the listing link; documents the site the
  // Rybbit id tracks.
  website_url?: string;
  // Seller Market Update: which board's monthly statistics this client's market updates
  // use (a key of MARKETS in src/lib/market.ts). Admin-set. Without it the market
  // section degrades to manual entry.
  market?: MarketKey;
};

export type MetricSource = "rybbit_api" | "meta_api" | "manual" | "mock";

// --- Seller Market Update -----------------------------------------------------------
export type MarketKey = "central-okanagan" | "vancouver-island" | "vancouver-island-west-coast" | "yukon";

export type MarketRecord = MarketValues & { type: RecordType; type_label: string; price_label: string };

// One cached month for one market: data/market/<key>-<YYYY-MM>.json. Replaceable by an
// admin refresh; snapshots copy what they need, so a refresh never changes a report.
export type MarketMonth = {
  key: MarketKey;
  reporting_month: string;
  region_label: string;
  board_label: string;
  source: "interior_dashboard" | "crea_stats";
  source_url: string;
  retrieved_at: string;
  by_type: Partial<Record<RecordType, MarketRecord>>;
  // Local inventory (active listings in the client's own area, by type, in by_type[*].local_active).
  local?: { label: string; source_url: string; retrieved_at: string };
};

export type MarketAttempt = { at: string; ok: boolean; error: string; month?: string };

// REALTOR.ca views per day on market for every qualifying report, so the exposure
// benchmark never has to reopen the (image-carrying) snapshot files.
export type ExposureLedger = { entries: { id: string; views_per_day: number }[] };

// Frozen into a snapshot: the reviewed market figures, their provenance, and the
// rule-generated interpretation computed at creation time.
export type MarketBlock = MarketValues & {
  source: "board_stats" | "manual";
  region_label: string;
  board_label: string;
  reporting_month: string;
  type_label: string;
  price_label: string;
  source_url: string;
  retrieved_at: string;
  local_label: string;
  local_source_url: string;
  interpretation: { market: string[]; property: string[] };
  exposure: ExposureBenchmark | null;
};

export type ReportSnapshot = {
  client: {
    name: string;
    logo_url: string;
    brand_primary: string;
    brand_accent: string;
    footer_text: string;
    slug?: string;
    brokerage_name?: string;
    brokerage_address?: string;
    brokerage_contact?: string;
  };
  report: {
    address: string;
    // MLS number and first-day-on-market date, both derived from the REALTOR.ca
    // scrape (editable fallback in the form). Optional so older snapshots parse.
    mls_number?: string;
    list_date?: string;
    start_date: string;
    end_date: string;
    listing_url: string;
    created_at: string;
    notes: string;
    // REALTOR.ca listing page + its first photo, frozen as a data URI like the
    // social media images. Empty string when capture failed/was unavailable.
    realtor_url: string;
    property_image: string;
    // Derived at creation time: true when the coordinator entered a value — blank
    // showings/notes are simply omitted from the report (an explicit 0 still shows).
    show_showings: boolean;
    show_notes: boolean;
    // "market" = Seller Market Update (adds the market sheet). Older snapshots have
    // neither key and render as listing reports.
    kind?: "listing" | "market";
    property_type?: PropertyType;
    // Market update cover: where the property stands, written by the rules (frozen at
    // creation; older market updates compute it at render).
    verdict?: Verdict;
  };
  website: {
    source: MetricSource;
    listing_views: number;
    // Site-wide pageviews for the window (whole client site) — powers the
    // audience-opportunity sentence in the summary. 0 = unknown, omit sentence.
    site_total_views: number;
  };
  facebook: {
    source: MetricSource;
    post_url: string;
    caption: string;
    media_url: string;
    views: number;
  };
  instagram: {
    source: MetricSource;
    post_url: string;
    caption: string;
    media_url: string;
    views: number;
  };
  manual: {
    realtor_listing_views: number;
    showings: number;
    days_on_market: number;
  };
  // Present only on a Seller Market Update whose market figures were available.
  market?: MarketBlock;
  warnings: string[];
};

// --- Listing websites (micro-site orders) -----------------------------------
// One order = one route on the client's portfolio site. Listings inside it are
// rows (one for a single listing, several for a project). The app owns intake,
// payment and fulfilment evidence; production stages live in Zoho CRM.

export type OrderListing = {
  unit_name: string;
  mls_number: string;
  realtor_stats_url: string;
  price: string;
  beds: string;
  baths: string;
  area: string;
  plan_name: string;
  photos_subfolder: string;
  floor_plan_link: string;
};

export type SiteOrderPackage = "single" | "project";
export type SiteOrderState = "draft" | "paid" | "expired" | "cancelled";

export type SiteOrderIntake = {
  property_address: string;
  property_type: string;
  source_url: string;
  photos_url: string;
  video_url: string;
  hero_preference: string;
  selling_points: string;
  client_notes: string;
  target_date: string;
  agent_name: string;
  agent_email: string;
  agent_phone: string;
  listings: OrderListing[];
};

export type SiteOrder = {
  id: string;
  client_slug: string;
  purchaser_email: string;
  package: SiteOrderPackage;
  route: string;
  page_url: string;
  state: SiteOrderState;
  created_at: string;
  updated_at: string;
  intake: SiteOrderIntake;
  agreement: { terms_version: string; terms_hash: string; accepted_at: string };
  payment: {
    provider: "stripe";
    customer_id: string;
    session_id: string;
    session_url: string;
    session_expires_at: string;
    attempts: number;
    payment_intent: string;
    invoice: string;
    amount_total: number;
    currency: string;
    paid_at: string;
    event_id: string;
  };
  hosting: {
    subscription_id: string;
    status: string;
    current_period_end: string;
    trial_end: string;
    cancel_at_period_end: boolean;
    ended_at: string;
  };
  // Persisted step ladder: a step with a result recorded is never repeated.
  fulfillment: {
    paid_recorded_at: string;
    crm_record_id: string;
    crm_error: string;
    email_message_id: string;
    email_error: string;
  };
  history: { at: string; by: string; note: string }[];
};
