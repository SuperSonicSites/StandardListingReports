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
// The view counts per channel, so the cover can add them up and name each one.
export type PropertyContext = {
  days_on_market: number;
  realtor_views: number;
  showings: number | null;
  website_views: number;
  social_views: number;
};
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
// The first month is too soon to judge (owner, 22 September 2026): nothing compares the
// listing's exposure with other listings before this many days on the market.
export const EARLY_DAYS = 30;
// Exposure against our archive: within 10% of typical reads as "typical".
export const EXPOSURE_ABOVE_RATIO = 1.1;
export const EXPOSURE_BELOW_RATIO = 0.9;

const numberFormat = new Intl.NumberFormat("en-CA");
const fmt = (value: number) => numberFormat.format(value);
const pct = (value: number) => `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
const round1 = (value: number) => Math.round(value * 10) / 10;
const plural = (count: number, word: string) => `${fmt(count)} ${word}${count === 1 ? "" : "s"}`;

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
  const moi = v.months_of_inventory;

  // Local inventory leads: those are the homes buyers compare this one against.
  if (v.local_active !== null && ctx.local_label) {
    out.push(
      `${fmt(v.local_active)} ${what} are for sale in ${ctx.local_label} right now${change(v.local_active_yoy_pct)}. Those are the properties buyers compare yours against.`
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
    // The year-over-year move and the pace of sales can point in opposite directions; say
    // both in one breath so "fewer competing" never sits next to "buyer's market" unexplained.
    const meaning =
      b === "same"
        ? " The amount of competition is unchanged."
        : b === "down" || b === "far-down"
          ? moi !== null && moi >= MOI_BUYERS_MARKET
            ? " That is fewer than last year, but still more than buyers are taking up."
            : " Fewer properties are competing for buyers."
          : b === "up" || b === "far-up"
            ? moi !== null && moi <= MOI_SELLERS_MARKET
              ? " That is more than last year, but buyers are still taking them up quickly."
              : " More properties are competing for buyers."
            : "";
    out.push(
      `${fmt(v.active_inventory)} ${what} were for sale at the end of ${month}${change(v.inventory_yoy_pct, "fewer", "more", `than ${lastMonth}`)}.${meaning}`
    );
  }

  if (moi !== null) {
    // The rule itself, so the seller learns it; the Bottom line below says what it means.
    const reading =
      moi >= MOI_BUYERS_MARKET
        ? "Over six months is a buyer's market."
        : moi <= MOI_SELLERS_MARKET
          ? "Under four months is a seller's market."
          : "Between four and six months is a balanced market.";
    out.push(`At ${monthName(ctx.reporting_month)}'s pace of sales it would take ${moi} months to sell every property listed. ${reading}`);
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
      `Properties that sold in ${month} had been on the market for ${fmt(v.days_to_sell)} days on average${change(v.days_to_sell_yoy_pct, "shorter", "longer")}.${meaning}`
    );
  }

  if (moi !== null) {
    out.push(
      moi >= MOI_BUYERS_MARKET
        ? "Bottom line: buyers have the upper hand right now. They can compare many properties, take their time, and walk away from any that don't measure up."
        : moi <= MOI_SELLERS_MARKET
          ? "Bottom line: sellers have the upper hand right now. Buyers have little choice and move quickly on properties they like."
          : "Bottom line: the market is balanced. Properties that match what buyers expect sell at a steady pace."
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

/** Sentences about this home against that market (the listing sheet's list). The cover's verdict says what they mean. */
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
        `Your property has been on the market for ${fmt(dom)} days. Properties that sold in ${month} had been listed for ${fmt(days)} days on average, so it is still early.`
      );
    } else if (days !== null) {
      out.push(
        `Your property has been on the market for ${fmt(dom)} days, longer than the ${fmt(days)} days it took the average ${month} sale.${
          dom >= days * 2 ? " It has now been listed about twice as long as the properties that sold." : " It has now been available longer than most properties that sold."
        }`
      );
    } else if (v.months_of_inventory !== null) {
      out.push(
        `Your property has been on the market for ${fmt(dom)} days, in a market where it would take ${v.months_of_inventory} months to sell every property listed.`
      );
    } else {
      out.push(`Your property has been on the market for ${fmt(dom)} days.`);
    }
  }

  // No comparison in the first month: too soon to judge.
  const level = dom >= EARLY_DAYS ? exposureLevel(exposure) : null;
  if (property.realtor_views > 0 && dom >= MIN_DAYS_FOR_EXPOSURE) {
    const perDay = Math.round(property.realtor_views / dom);
    if (level && exposure) {
      const typical = Math.round(exposure.benchmark_views_per_day);
      // The benchmark only holds listings from the same market, so name it.
      const listings = `${fmt(exposure.sample_size)} ${ctx.local_label || ctx.region_label} listings`;
      out.push(
        level === "above"
          ? `Buyers are seeing your property more than most: about ${fmt(perDay)} views a day on REALTOR.ca, against a typical ${fmt(typical)} a day across the ${listings} we have reported on. Exposure is not the problem.`
          : level === "below"
            ? `Fewer buyers are opening your listing than similar ones: about ${fmt(perDay)} views a day on REALTOR.ca, against a typical ${fmt(typical)} a day across the ${listings} we have reported on.`
            : `Your property is getting typical exposure: about ${fmt(perDay)} views a day on REALTOR.ca, in line with the ${fmt(typical)} a day we see across the ${listings} we have reported on.`
      );
    } else {
      out.push(`Your property has drawn ${fmt(property.realtor_views)} views on REALTOR.ca over ${fmt(dom)} days, about ${fmt(perDay)} a day.`);
    }
  }

  if (property.showings !== null) {
    out.push(
      property.showings > 0
        ? `${fmt(property.showings)} showing${property.showings === 1 ? " has" : "s have"} taken place so far.`
        : "No showings have taken place yet."
    );
  }

  return out;
}

/**
 * The market update cover: this listing's own numbers as plain bullets (owner, 28 September
 * 2026 — the cover used to open with a verdict headline and a paragraph of reasoning, which
 * read as a judgement). Facts only, no interpretation; the sheets that follow do the talking.
 * Formatted from the same reviewed numbers, so nothing here can disagree with them.
 */
export function coverFacts(property: PropertyContext): string[] {
  const out: string[] = [];
  const dom = property.days_on_market;
  const channels: [number, string][] = [
    [property.realtor_views, "on REALTOR.ca"],
    [property.website_views, "on the website"],
    [property.social_views, "on social media"]
  ];
  const seen = channels.filter(([views]) => views > 0);
  const total = channels.reduce((sum, [views]) => sum + views, 0);

  if (dom > 0) out.push(`On the market ${plural(dom, "day")}`);
  // Name every channel that carried views; with only one there is nothing to break down.
  if (seen.length > 1) out.push(`${fmt(total)} views: ${seen.map(([views, where]) => `${fmt(views)} ${where}`).join(", ")}`);
  else if (seen.length === 1) out.push(`${fmt(total)} views ${seen[0][1]}`);
  // A per-day rate needs a few days to mean anything.
  if (property.realtor_views > 0 && dom >= MIN_DAYS_FOR_EXPOSURE) {
    out.push(`${fmt(Math.round(property.realtor_views / dom))} REALTOR.ca views a day`);
  }
  if (property.showings !== null) {
    out.push(property.showings === 0 ? "No showings yet" : `${plural(property.showings, "showing")} so far`);
  }
  return out;
}
