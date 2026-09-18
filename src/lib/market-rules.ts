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
// The cover's "Where your property stands": one headline, then the reason in two or three plain sentences.
export type Verdict = { headline: string; detail: string };

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
// Two weeks online with no showing booked is a signal worth leading with.
export const NO_SHOWINGS_DAYS = 14;

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

  const level = exposureLevel(exposure);
  if (property.realtor_views > 0 && dom >= MIN_DAYS_FOR_EXPOSURE) {
    const perDay = Math.round(property.realtor_views / dom);
    if (level && exposure) {
      const typical = Math.round(exposure.benchmark_views_per_day);
      const sample = fmt(exposure.sample_size);
      out.push(
        level === "above"
          ? `Buyers are seeing your property more than most: about ${fmt(perDay)} views a day on REALTOR.ca, against a typical ${fmt(typical)} a day across the ${sample} listings we have reported on. Exposure is not the problem.`
          : level === "below"
            ? `Fewer buyers than usual are seeing your property: about ${fmt(perDay)} views a day on REALTOR.ca, against a typical ${fmt(typical)} a day across the ${sample} listings we have reported on. Exposure is the first thing to fix.`
            : `Your property is getting typical exposure: about ${fmt(perDay)} views a day on REALTOR.ca, in line with the ${fmt(typical)} a day we see across the ${sample} listings we have reported on.`
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
 * Where the property stands, for the cover (the seller asking "why hasn't it sold yet?"). Leads with the most
 * telling signal: too few buyers seeing the property, then buyers looking online but not
 * booking visits, then visits without an offer, then time on market against the average
 * sale, then the pace of the market when the board publishes no days to sell. Built from
 * the same reviewed numbers as the sheets. Never calls the price wrong and never
 * recommends a price change: "Price and presentation are what they weigh." is the ceiling.
 */
export function sellerVerdict(
  v: MarketValues,
  ctx: MarketContext,
  property: PropertyContext,
  exposure: ExposureBenchmark | null
): Verdict {
  const month = monthLabel(ctx.reporting_month);
  const dom = property.days_on_market;
  const days = v.days_to_sell;
  const moi = v.months_of_inventory;
  const showings = property.showings;
  const level = dom >= MIN_DAYS_FOR_EXPOSURE && property.realtor_views > 0 ? exposureLevel(exposure) : null;
  const perDay = dom > 0 ? Math.round(property.realtor_views / dom) : 0;
  const seen = level === "above" || level === "typical";
  const weigh = "Price and presentation are what they weigh.";
  const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

  if (level === "below" && exposure) {
    return {
      headline: "Not enough buyers are seeing your property yet.",
      detail: `It is getting about ${fmt(perDay)} views a day on REALTOR.ca, below the typical ${fmt(Math.round(exposure.benchmark_views_per_day))}. Until more buyers see it, nothing else can be judged, so reaching more buyers comes first.`
    };
  }

  if (showings === 0 && dom >= NO_SHOWINGS_DAYS) {
    return {
      headline: "Buyers are looking online, but no one has booked a showing.",
      detail: `In ${fmt(dom)} days it has drawn${perDay > 0 ? ` about ${fmt(perDay)} views a day on REALTOR.ca` : " views online"}, but no buyer has asked to see it in person. Buyers are comparing it with other listings and visiting those first. ${weigh}`
    };
  }

  if (days !== null && dom > days) {
    const when = `Properties that sold in ${month} took ${fmt(days)} days on average; yours has been listed for ${fmt(dom)}${dom >= days * 2 ? ", about twice as long" : ""}.`;
    if (showings !== null && showings > 0) {
      return {
        headline: "Buyers are visiting, but no one has made an offer yet.",
        detail: `${plural(showings, "showing")} so far show real interest. ${when} When visits don't turn into offers, buyers are choosing other properties they see as better value. ${weigh}`
      };
    }
    return {
      headline: seen ? "Buyers are seeing it, but it is taking longer than most." : "It is taking longer than most properties that sold.",
      detail: `${when} ${seen ? "Plenty of buyers have looked, so they are" : "Buyers are"} choosing other properties they see as better value. ${weigh}`
    };
  }

  if (days !== null) {
    return {
      headline: "It is still early. Your property is on track.",
      detail: `Properties that sold in ${month} took ${fmt(days)} days on average; yours has been listed for ${fmt(dom)}.${
        seen ? " Buyers are seeing it as much as most listings." : ""
      }${showings !== null && showings > 0 ? ` Buyers have booked ${plural(showings, "showing")} already.` : ""} The coming weeks will tell.`
    };
  }

  // No days to sell published (VIREB, Yukon): the pace of the market is the context.
  const listed = dom > 0 ? ` Your property has been listed for ${fmt(dom)} days.` : "";
  const where = ctx.region_label;
  if (moi !== null && moi >= MOI_BUYERS_MARKET) {
    return {
      headline: "It is a slow market, and buyers have plenty of choice.",
      detail: `At the current pace it would take ${moi} months to sell every property listed in ${where}, so properties are taking longer to sell.${listed}${
        seen ? " Buyers are seeing yours as much as most listings." : ""
      } With this much choice, buyers compare carefully. ${weigh}`
    };
  }
  if (moi !== null && moi <= MOI_SELLERS_MARKET) {
    return {
      headline: "Buyers are active in your market.",
      detail: `At the current pace it would take ${moi} months to sell every property listed in ${where}, so properties are selling steadily.${listed}${
        seen ? " Buyers are seeing yours as much as most listings." : ""
      }`
    };
  }
  if (moi !== null) {
    return {
      headline: "The market is balanced.",
      detail: `At the current pace it would take ${moi} months to sell every property listed in ${where}. Properties that match what buyers expect sell at a steady pace.${listed}`
    };
  }

  return {
    headline: "Here is where things stand.",
    detail: `Your property has been listed for ${fmt(dom)} days${property.realtor_views > 0 ? ` and has drawn ${fmt(property.realtor_views)} views on REALTOR.ca` : ""}. The pages that follow show where the interest is coming from.`
  };
}
