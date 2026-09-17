// Seller Market Update: the interpretation rules and thresholds. Browser-safe (no Node
// imports): the report form previews these sentences live and /api/snapshot recomputes
// them from the submitted values before freezing them. Deterministic on purpose — every
// number in a sentence traces to a field the coordinator reviewed.
//
// Voice: written for the seller, not the agent. Each sentence is a plain fact followed by
// what it means, in everyday words (no "inventory", "absorption", "supply-side"). The
// rules describe what buyers are doing; they never call a home overpriced and never
// recommend a price change — that conversation belongs to the agent.

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
// Year-over-year changes read in three bands so the words never fight the number:
// under 5% is "about the same", 5–15% is "somewhat", 15% and over is "far".
export const YOY_SAME_PCT = 5;
export const YOY_FAR_PCT = 15;
export const SMALL_MARKET_SALES = 30;
export const MOI_BUYERS_MARKET = 6;
export const MOI_SELLERS_MARKET = 4;
export const MIN_BENCHMARK_SAMPLE = 30;
export const MIN_DAYS_FOR_EXPOSURE = 7;
// Exposure against our archive: within 10% of typical reads as "typical".
export const EXPOSURE_ABOVE_RATIO = 1.1;
export const EXPOSURE_BELOW_RATIO = 0.9;

const numberFormat = new Intl.NumberFormat("en-CA");
const fmt = (value: number) => numberFormat.format(value);
const pct = (value: number) => `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
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

/** "2026-08" -> "August" (for "last August"). */
function monthName(yyyyMm: string): string {
  const match = /^\d{4}-(\d{2})$/.exec(yyyyMm ?? "");
  return (match && MONTH_NAMES[Number(match[1]) - 1]) || "the same month";
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

type Band = "same" | "down" | "far-down" | "up" | "far-up";

function band(value: number | null): Band | null {
  if (value === null) return null;
  const size = Math.abs(value);
  if (size < YOY_SAME_PCT) return "same";
  if (size < YOY_FAR_PCT) return value < 0 ? "down" : "up";
  return value < 0 ? "far-down" : "far-up";
}

/** ", 9.6% fewer than a year ago" / ", about the same as a year ago" — or "" when unknown. */
function change(value: number | null, fewer = "fewer", more = "more", than = "than a year ago"): string {
  const b = band(value);
  if (b === null) return "";
  if (b === "same") return `, about the same as a year ago`;
  return `, ${pct(value!)} ${value! < 0 ? fewer : more} ${than}`;
}

/** Sentences about the market itself, in reading order, each a fact then its meaning. */
export function interpretMarket(v: MarketValues, ctx: MarketContext): string[] {
  const out: string[] = [];
  const month = monthLabel(ctx.reporting_month);
  const lastMonth = `last ${monthName(ctx.reporting_month)}`;
  const where = ctx.region_label;
  const what = ctx.type_label;

  // Local inventory leads: those are the homes buyers compare this one against.
  if (v.local_active !== null && ctx.local_label) {
    out.push(
      `${fmt(v.local_active)} ${what} are for sale in ${ctx.local_label} right now${change(v.local_active_yoy_pct)}. Those are the homes buyers compare yours against.`
    );
  }

  if (v.sales !== null) {
    if (v.sales < SMALL_MARKET_SALES) {
      // Small-market guardrail: nine sales can be a 19% swing. State the count, not a verdict.
      out.push(
        `${fmt(v.sales)} ${what} sold in ${where} in ${month}${change(v.sales_yoy_pct)}. With this few sales, the percentages swing a lot from month to month, so read them loosely.`
      );
    } else {
      const b = band(v.sales_yoy_pct);
      const meaning =
        b === "same"
          ? " Buyer demand is steady."
          : b === "down" || b === "far-down"
            ? " Buyer demand has softened."
            : b === "up" || b === "far-up"
              ? " Buyer demand is stronger."
              : "";
      out.push(`${fmt(v.sales)} ${what} sold in ${where} in ${month}${change(v.sales_yoy_pct)}.${meaning}`);
    }
  }

  if (v.active_inventory !== null) {
    const b = band(v.inventory_yoy_pct);
    const meaning =
      b === "same"
        ? " The amount of competition is unchanged."
        : b === "down" || b === "far-down"
          ? " Fewer homes are competing for buyers."
          : b === "up" || b === "far-up"
            ? " More homes are competing for buyers."
            : "";
    out.push(
      `${fmt(v.active_inventory)} ${what} were for sale at the end of ${month}${change(v.inventory_yoy_pct, "fewer", "more", `than ${lastMonth}`)}.${meaning}`
    );
  }

  if (v.months_of_inventory !== null) {
    const moi = v.months_of_inventory;
    // The rule itself, so the seller learns it; the Bottom line below says what it means.
    const reading =
      moi >= MOI_BUYERS_MARKET
        ? "Over six months is a buyer's market."
        : moi <= MOI_SELLERS_MARKET
          ? "Under four months is a seller's market."
          : "Between four and six months is a balanced market.";
    out.push(`At ${monthName(ctx.reporting_month)}'s pace of sales it would take ${moi} months to sell every home listed. ${reading}`);
  }

  if (v.new_listings !== null) {
    const b = band(v.new_listings_yoy_pct);
    if (b && b !== "same") {
      const fewer = b === "down" || b === "far-down";
      out.push(
        `${fmt(v.new_listings)} ${what} were newly listed in ${month}${change(v.new_listings_yoy_pct)}, so ${fewer ? "fewer" : "more"} new competitors are arriving.`
      );
    }
  }

  if (v.days_to_sell !== null) {
    const b = band(v.days_to_sell_yoy_pct);
    const meaning =
      b === "up" || b === "far-up"
        ? " Buyers are taking longer to decide than they did last year."
        : b === "down" || b === "far-down"
          ? " Buyers are deciding faster than they did last year."
          : "";
    out.push(
      `Homes that sold in ${month} had been on the market for ${fmt(v.days_to_sell)} days on average${change(v.days_to_sell_yoy_pct, "shorter", "longer")}.${meaning}`
    );
  }

  if (v.months_of_inventory !== null) {
    const moi = v.months_of_inventory;
    out.push(
      moi >= MOI_BUYERS_MARKET
        ? "Bottom line: buyers have the upper hand right now. They can compare many homes, take their time, and walk away from any that don't measure up."
        : moi <= MOI_SELLERS_MARKET
          ? "Bottom line: sellers have the upper hand right now. Buyers have little choice and move quickly on homes they like."
          : "Bottom line: the market is balanced. Homes that match what buyers expect sell at a steady pace."
    );
  }

  return out;
}

type ExposureLevel = "above" | "typical" | "below";

function exposureLevel(exposure: ExposureBenchmark | null): ExposureLevel | null {
  if (!exposure || exposure.sample_size < MIN_BENCHMARK_SAMPLE || exposure.benchmark_views_per_day <= 0) return null;
  const ratio = exposure.views_per_day / exposure.benchmark_views_per_day;
  return ratio >= EXPOSURE_ABOVE_RATIO ? "above" : ratio <= EXPOSURE_BELOW_RATIO ? "below" : "typical";
}

/** Sentences about this home against that market, ending with what it means for the seller. */
export function interpretProperty(
  v: MarketValues,
  ctx: MarketContext,
  property: PropertyContext,
  exposure: ExposureBenchmark | null
): string[] {
  const out: string[] = [];
  const month = monthLabel(ctx.reporting_month);
  const dom = property.days_on_market;
  const days = v.days_to_sell;

  // Never assumes this home is inside the count (it may be listed under another type).
  if (v.local_active !== null && v.local_active > 0 && ctx.local_label) {
    out.push(`Buyers shopping for ${ctx.type_label} in ${ctx.local_label} right now have ${fmt(v.local_active)} to choose from.`);
  }

  const longerThanMost = days !== null && dom > days;
  if (dom > 0) {
    if (days !== null && !longerThanMost) {
      out.push(
        `Your home has been on the market for ${fmt(dom)} days. Homes that sold in ${month} had been listed for ${fmt(days)} days on average, so it is still early.`
      );
    } else if (days !== null) {
      out.push(
        `Your home has been on the market for ${fmt(dom)} days, longer than the ${fmt(days)} days it took the average ${month} sale.${
          dom >= days * 2 ? " It has now been listed about twice as long as the homes that sold." : " It has now been available longer than most homes that sold."
        }`
      );
    } else if (v.months_of_inventory !== null) {
      out.push(
        `Your home has been on the market for ${fmt(dom)} days, in a market where it would take ${v.months_of_inventory} months to sell every home listed.`
      );
    } else {
      out.push(`Your home has been on the market for ${fmt(dom)} days.`);
    }
  }

  const level = exposureLevel(exposure);
  if (property.realtor_views > 0 && dom >= MIN_DAYS_FOR_EXPOSURE) {
    const perDay = Math.round(property.realtor_views / dom);
    if (level && exposure) {
      const typical = Math.round(exposure.benchmark_views_per_day);
      const sample = fmt(exposure.sample_size);
      out.push(
        level === "above"
          ? `Buyers are seeing your home more than most: about ${fmt(perDay)} views a day on REALTOR.ca, against a typical ${fmt(typical)} a day across the ${sample} listings we have reported on. Exposure is not the problem.`
          : level === "below"
            ? `Fewer buyers than usual are seeing your home: about ${fmt(perDay)} views a day on REALTOR.ca, against a typical ${fmt(typical)} a day across the ${sample} listings we have reported on. Exposure is the first thing to fix.`
            : `Your home is getting typical exposure: about ${fmt(perDay)} views a day on REALTOR.ca, in line with the ${fmt(typical)} a day we see across the ${sample} listings we have reported on.`
      );
    } else {
      out.push(`Your home has drawn ${fmt(property.realtor_views)} views on REALTOR.ca over ${fmt(dom)} days, about ${fmt(perDay)} a day.`);
    }
  }

  if (property.showings !== null) {
    out.push(
      property.showings > 0
        ? `${fmt(property.showings)} showing${property.showings === 1 ? " has" : "s have"} taken place so far.`
        : "No showings have taken place yet."
    );
  }

  // What this means for the seller: exposure and time on market, read together.
  if (level && days !== null) {
    if (level === "below") {
      out.push("What this means for you: until more buyers see the home, nothing else can be judged. Exposure comes first.");
    } else if (longerThanMost) {
      out.push(
        "What this means for you: plenty of buyers have looked, yet the home has been available longer than most that sold. When that happens, buyers are choosing other homes they see as better value. Price and presentation are what they weigh."
      );
    } else {
      out.push(
        `What this means for you: exposure is strong and it is early. Most homes that sold took about ${fmt(days)} days, so the coming weeks will tell.`
      );
    }
  }

  return out;
}

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

export type ChannelTotals = { website_views: number; social_views: number; site_total_views: number };

/**
 * The cover "Summary" of a market update: short sentences that digest the sheets below
 * (the market figures, then the home's own numbers), built only from values the
 * coordinator reviewed. Empty parts are left out, never guessed.
 */
export function summarizeMarketUpdate(
  v: MarketValues,
  ctx: MarketContext,
  property: PropertyContext & ChannelTotals,
  exposure: ExposureBenchmark | null = null
): string[] {
  const out: string[] = [];
  const month = monthLabel(ctx.reporting_month);
  const lastMonth = `last ${monthName(ctx.reporting_month)}`;

  if (v.local_active !== null && ctx.local_label) {
    out.push(`${fmt(v.local_active)} ${ctx.type_label} are for sale in ${ctx.local_label} right now${change(v.local_active_yoy_pct)}.`);
  }

  const market: string[] = [];
  if (v.sales !== null) market.push(`In ${month}, ${fmt(v.sales)} ${ctx.type_label} sold in ${ctx.region_label}${change(v.sales_yoy_pct)}.`);
  const supply: string[] = [];
  if (v.active_inventory !== null) supply.push(`${fmt(v.active_inventory)} were for sale at month end${change(v.inventory_yoy_pct, "fewer", "more", `than ${lastMonth}`)}`);
  if (v.months_of_inventory !== null) supply.push(`at that pace it would take ${v.months_of_inventory} months to sell them all`);
  if (supply.length > 0) market.push(`${supply.join(", and ")}.`);
  if (v.days_to_sell !== null) market.push(`The average sale took ${fmt(v.days_to_sell)} days${change(v.days_to_sell_yoy_pct, "shorter", "longer")}.`);
  if (market.length > 0) out.push(market.join(" "));

  const channels: string[] = [];
  if (property.realtor_views > 0) channels.push(`${fmt(property.realtor_views)} REALTOR.ca views`);
  if (property.website_views > 0) channels.push(`${fmt(property.website_views)} website views`);
  if (property.social_views > 0) channels.push(`${fmt(property.social_views)} social media views`);
  let home = property.days_on_market > 0 ? `Your home has been on the market for ${fmt(property.days_on_market)} days` : "Your home";
  if (channels.length > 0) home += ` and has drawn ${joinList(channels)}`;
  if (property.showings !== null && property.showings > 0) {
    home += `, with ${fmt(property.showings)} showing${property.showings === 1 ? "" : "s"}`;
  }
  home += ".";
  const level = property.days_on_market >= MIN_DAYS_FOR_EXPOSURE && property.realtor_views > 0 ? exposureLevel(exposure) : null;
  if (level === "above") home += " That is more exposure than most listings get.";
  if (level === "below") home += " That is less exposure than most listings get.";
  if (level === "typical") home += " That is typical exposure for a listing.";
  out.push(home);
  return out;
}
