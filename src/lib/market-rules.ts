// Seller Market Update: the interpretation rules and thresholds. Browser-safe (no Node
// imports): the report form previews these sentences live and /api/snapshot recomputes
// them from the submitted values before freezing them. Deterministic on purpose — every
// number in a sentence traces to a field the coordinator reviewed. The rules never call
// a property overpriced and never recommend a price change.

export type PropertyType = "single_family" | "townhouse" | "condo";
export type RecordType = PropertyType | "all";

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "single_family", label: "Single-family home" },
  { value: "townhouse", label: "Townhouse" },
  { value: "condo", label: "Condo / apartment" }
];

export const TYPE_LABELS: Record<RecordType, string> = {
  single_family: "single-family homes",
  townhouse: "townhouses",
  condo: "condos and apartments",
  all: "all residential properties"
};

export type MarketValues = {
  sales: number | null;
  sales_yoy_pct: number | null;
  new_listings: number | null;
  new_listings_yoy_pct: number | null;
  active_inventory: number | null;
  inventory_yoy_pct: number | null;
  months_of_inventory: number | null;
  days_to_sell: number | null;
  days_to_sell_yoy_pct: number | null;
  price: number | null;
  price_yoy_pct: number | null;
  // Local inventory: active listings of this type in the client's own area right now
  // (e.g. Tofino-Ucluelet), where a board exposes it. Null where it doesn't.
  local_active: number | null;
  local_active_yoy_pct: number | null;
};

export const MARKET_VALUE_KEYS = [
  "local_active",
  "local_active_yoy_pct",
  "sales",
  "sales_yoy_pct",
  "new_listings",
  "new_listings_yoy_pct",
  "active_inventory",
  "inventory_yoy_pct",
  "months_of_inventory",
  "days_to_sell",
  "days_to_sell_yoy_pct",
  "price",
  "price_yoy_pct"
] as const satisfies readonly (keyof MarketValues)[];

export const EMPTY_MARKET_VALUES: MarketValues = {
  sales: null,
  sales_yoy_pct: null,
  new_listings: null,
  new_listings_yoy_pct: null,
  active_inventory: null,
  inventory_yoy_pct: null,
  months_of_inventory: null,
  days_to_sell: null,
  days_to_sell_yoy_pct: null,
  price: null,
  price_yoy_pct: null,
  local_active: null,
  local_active_yoy_pct: null
};

export type MarketContext = { region_label: string; reporting_month: string; type_label: string; local_label?: string };
export type PropertyContext = { days_on_market: number; realtor_views: number; showings: number | null };
export type ExposureBenchmark = { views_per_day: number; benchmark_views_per_day: number; sample_size: number };

// Thresholds (PRD "Interpretation rules").
export const YOY_THRESHOLD_PCT = 10;
export const SMALL_MARKET_SALES = 30;
export const MOI_BUYERS_MARKET = 6;
export const MOI_SELLERS_MARKET = 4;
export const MIN_BENCHMARK_SAMPLE = 30;
export const MIN_DAYS_FOR_EXPOSURE = 7;

const numberFormat = new Intl.NumberFormat("en-CA");
const fmt = (value: number) => numberFormat.format(value);
const pct = (value: number) => `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
const upDown = (value: number) => (value < 0 ? "down" : "up");
const round1 = (value: number) => Math.round(value * 10) / 10;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/** "2026-08" -> "August 2026". Anything else passes through unchanged. */
export function monthLabel(yyyyMm: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm ?? "");
  if (!match) return yyyyMm ?? "";
  const name = MONTH_NAMES[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : yyyyMm;
}

/** Active listings divided by the month's sales, one decimal; null when either is missing or sales is 0. */
export function computeMonthsOfInventory(active: number | null, sales: number | null): number | null {
  if (active === null || sales === null || sales <= 0) return null;
  return round1(active / sales);
}

/** Percent change from `previous` to `current`, one decimal; null when the base is missing or 0. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return round1((current / previous - 1) * 100);
}

function yoyWord(value: number | null, lower: string, higher: string, similar: string): string {
  if (value === null) return "";
  if (value <= -YOY_THRESHOLD_PCT) return lower;
  if (value >= YOY_THRESHOLD_PCT) return higher;
  return similar;
}

/** Sentences about the market itself, in reading order. Only what the data supports. */
export function interpretMarket(v: MarketValues, ctx: MarketContext): string[] {
  const out: string[] = [];
  const month = monthLabel(ctx.reporting_month);
  const where = ctx.region_label;
  const what = ctx.type_label;

  // Local inventory leads: it is the competition this seller actually faces.
  if (v.local_active !== null && ctx.local_label) {
    const verdict = yoyWord(
      v.local_active_yoy_pct,
      ", fewer than a year ago",
      ", more than a year ago",
      ", about the same as a year ago"
    );
    out.push(
      `${fmt(v.local_active)} ${what} are listed for sale in ${ctx.local_label} right now${
        verdict ? `${verdict} (${upDown(v.local_active_yoy_pct!)} ${pct(v.local_active_yoy_pct!)})` : ""
      }.`
    );
  }

  if (v.sales !== null) {
    if (v.sales < SMALL_MARKET_SALES) {
      // Small-market guardrail: nine sales can be a 19% swing. State the count, not a verdict.
      out.push(
        `${fmt(v.sales)} ${what} sold in ${where} in ${month}${
          v.sales_yoy_pct !== null ? `, ${upDown(v.sales_yoy_pct)} ${pct(v.sales_yoy_pct)} from a year earlier` : ""
        }. In a market this size a handful of transactions moves the percentages, so month-to-month swings are normal.`
      );
    } else {
      const verdict = yoyWord(
        v.sales_yoy_pct,
        "Buyer activity is lower than during the same period last year",
        "Buyer activity is stronger than during the same period last year",
        "Sales activity is similar to last year"
      );
      out.push(
        verdict
          ? `${verdict}: ${fmt(v.sales)} ${what} sold in ${where} in ${month}, ${upDown(v.sales_yoy_pct!)} ${pct(v.sales_yoy_pct!)}.`
          : `${fmt(v.sales)} ${what} sold in ${where} in ${month}.`
      );
    }
  }

  if (v.active_inventory !== null) {
    const verdict = yoyWord(
      v.inventory_yoy_pct,
      "Available inventory is tighter than one year ago",
      "Buyers have more properties to choose from than a year ago",
      "Available inventory is similar to last year"
    );
    out.push(
      verdict
        ? `${verdict}: ${fmt(v.active_inventory)} ${what} were listed for sale at the end of ${month}, ${upDown(v.inventory_yoy_pct!)} ${pct(v.inventory_yoy_pct!)}.`
        : `${fmt(v.active_inventory)} ${what} were listed for sale at the end of ${month}.`
    );
  }

  if (v.months_of_inventory !== null) {
    const moi = v.months_of_inventory;
    if (moi >= MOI_BUYERS_MARKET) {
      out.push(
        `At ${moi} months of inventory, supply is on the buyer's side: at the current pace of sales it would take about ${moi} months to sell everything currently listed.`
      );
    } else if (moi <= MOI_SELLERS_MARKET) {
      out.push(`At ${moi} months of inventory, supply is tight, which favours sellers.`);
    } else {
      out.push(`At ${moi} months of inventory, the market is roughly balanced between buyers and sellers.`);
    }
  }

  if (v.new_listings !== null && v.new_listings_yoy_pct !== null && Math.abs(v.new_listings_yoy_pct) >= YOY_THRESHOLD_PCT) {
    out.push(
      `${fmt(v.new_listings)} new listings came to market in ${month}, ${upDown(v.new_listings_yoy_pct)} ${pct(v.new_listings_yoy_pct)} from a year earlier.`
    );
  }

  if (v.days_to_sell !== null) {
    const verdict = yoyWord(
      v.days_to_sell_yoy_pct,
      "Homes are selling faster than they were one year ago",
      "Homes are taking longer to sell than they were one year ago",
      ""
    );
    out.push(
      verdict
        ? `${verdict}: ${what} in ${where} took an average of ${fmt(v.days_to_sell)} days to sell in ${month}, ${upDown(v.days_to_sell_yoy_pct!)} ${pct(v.days_to_sell_yoy_pct!)}.`
        : `${what.charAt(0).toUpperCase()}${what.slice(1)} in ${where} took an average of ${fmt(v.days_to_sell)} days to sell in ${month}.`
    );
  }

  return out;
}

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

export type ChannelTotals = { website_views: number; social_views: number; site_total_views: number };

/**
 * The cover "Summary" of a market update: two sentences that digest the sheets below
 * (the market figures, then the listing's own numbers), built only from values the
 * coordinator reviewed. Empty parts are left out, never guessed.
 */
export function summarizeMarketUpdate(v: MarketValues, ctx: MarketContext, property: PropertyContext & ChannelTotals): string[] {
  const out: string[] = [];
  let saidYear = false;
  const yoy = (value: number | null) => {
    if (value === null) return "";
    const clause = ` (${upDown(value)} ${pct(value)}${saidYear ? "" : " from a year ago"})`;
    saidYear = true;
    return clause;
  };
  if (v.local_active !== null && ctx.local_label) {
    out.push(`${fmt(v.local_active)} ${ctx.type_label} are for sale in ${ctx.local_label} right now${yoy(v.local_active_yoy_pct)}.`);
  }
  const marketParts: string[] = [];
  if (v.sales !== null) marketParts.push(`${fmt(v.sales)} ${ctx.type_label} sold in ${ctx.region_label}${yoy(v.sales_yoy_pct)}`);
  if (v.active_inventory !== null) marketParts.push(`${fmt(v.active_inventory)} were listed for sale at month end${yoy(v.inventory_yoy_pct)}`);
  if (v.months_of_inventory !== null) marketParts.push(`inventory stood at ${v.months_of_inventory} months`);
  if (v.days_to_sell !== null) marketParts.push(`the average sale took ${fmt(v.days_to_sell)} days${yoy(v.days_to_sell_yoy_pct)}`);
  if (marketParts.length > 0) out.push(`In ${monthLabel(ctx.reporting_month)}, ${joinList(marketParts)}.`);

  const channels: string[] = [];
  if (property.realtor_views > 0) channels.push(`${fmt(property.realtor_views)} REALTOR.ca views`);
  if (property.website_views > 0) channels.push(`${fmt(property.website_views)} website views`);
  if (property.social_views > 0) channels.push(`${fmt(property.social_views)} social media views`);
  let listing = property.days_on_market > 0 ? `Your listing has been on the market for ${fmt(property.days_on_market)} days` : "Your listing";
  if (channels.length > 0) listing += ` and has drawn ${joinList(channels)}`;
  if (property.showings !== null && property.showings > 0) {
    listing += `, with ${fmt(property.showings)} showing${property.showings === 1 ? "" : "s"}`;
  }
  if (property.site_total_views > 0) listing += `, on a site that attracted ${fmt(property.site_total_views)} page views over the same period`;
  out.push(`${listing}.`);
  return out;
}

/** Sentences about this listing against that market. */
export function interpretProperty(
  v: MarketValues,
  ctx: MarketContext,
  property: PropertyContext,
  exposure: ExposureBenchmark | null
): string[] {
  const out: string[] = [];
  const where = ctx.region_label;
  const dom = property.days_on_market;

  // Never assumes this listing is inside the count (it may be listed under another type).
  if (v.local_active !== null && v.local_active > 0 && ctx.local_label) {
    out.push(
      `Buyers looking at ${ctx.type_label} in ${ctx.local_label} right now have ${fmt(v.local_active)} to choose from.`
    );
  }

  if (dom > 0) {
    if (v.days_to_sell !== null) {
      out.push(
        dom > v.days_to_sell
          ? `Your listing has been on the market for ${fmt(dom)} days, longer than the ${fmt(v.days_to_sell)}-day average sale in ${where} last month.`
          : `Your listing has been on the market for ${fmt(dom)} days, within the ${fmt(v.days_to_sell)}-day average sale time in ${where} last month.`
      );
    } else if (v.months_of_inventory !== null) {
      out.push(
        `Your listing has been on the market for ${fmt(dom)} days, in a market carrying ${v.months_of_inventory} months of supply.`
      );
    } else {
      out.push(`Your listing has been on the market for ${fmt(dom)} days.`);
    }
  }

  if (property.realtor_views > 0 && dom >= MIN_DAYS_FOR_EXPOSURE) {
    const perDay = round1(property.realtor_views / dom);
    if (exposure && exposure.sample_size >= MIN_BENCHMARK_SAMPLE && exposure.benchmark_views_per_day > 0) {
      const ratio = exposure.views_per_day / exposure.benchmark_views_per_day;
      const level = ratio >= 1.1 ? "above" : ratio <= 0.9 ? "below" : "in line with";
      out.push(
        `Online exposure is ${level} typical: ${exposure.views_per_day} REALTOR.ca views per day on market, against a typical ${exposure.benchmark_views_per_day} for the ${fmt(exposure.sample_size)} listings we have reported on.`
      );
    } else {
      out.push(
        `The listing has drawn ${fmt(property.realtor_views)} REALTOR.ca views over ${fmt(dom)} days on market, about ${perDay} per day.`
      );
    }
  }

  if (property.showings !== null && property.showings > 0) {
    out.push(`${fmt(property.showings)} showing${property.showings === 1 ? "" : "s"} ${property.showings === 1 ? "has" : "have"} taken place so far.`);
  }

  return out;
}
