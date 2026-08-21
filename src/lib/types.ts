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
  // Where the portal's "Submit Listing Ads" card sends this client (their
  // nowforsale.co intake form). Optional — the card explains when it's unset.
  ads_form_url?: string;
  // --- v0.2 integration IDs (optional; NON-SECRET addressing ids) ---
  meta_page_id?: string;
  meta_instagram_id?: string;
  rybbit_site_id?: string;
  // The client's public website (e.g. https://acmerealty.com). Its origin + the
  // Rybbit-resolved listing path builds the listing link; documents the site the
  // Rybbit id tracks.
  website_url?: string;
};

export type MetricSource = "rybbit_api" | "meta_api" | "manual" | "mock";

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
  warnings: string[];
};
