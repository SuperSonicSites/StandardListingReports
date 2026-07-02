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
  // --- v0.2 integration IDs (optional; committed to git; NON-SECRET) ---
  meta_page_id?: string;
  meta_instagram_id?: string;
  rybbit_site_id?: string;
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
    start_date: string;
    end_date: string;
    listing_url: string;
    created_at: string;
    notes: string;
  };
  website: {
    source: MetricSource;
    listing_views: number;
  };
  facebook: {
    source: MetricSource;
    post_url: string;
    caption: string;
    media_url: string;
    views: number;
    engagements: number;
  };
  instagram: {
    source: MetricSource;
    post_url: string;
    caption: string;
    media_url: string;
    views: number;
    engagements: number;
  };
  manual: {
    realtor_listing_views: number;
    inquiries: number;
    showings: number;
    days_on_market: number;
  };
  warnings: string[];
};
