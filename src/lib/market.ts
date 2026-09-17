// Seller Market Update: monthly board statistics for the client's market.
//
// Sources, verified 17 September 2026:
//  - Association of Interior REALTORS dashboard: a private WordPress admin-ajax action
//    guarded by a nonce read from the public statistics page. Returns an HTML fragment
//    with five labelled cards per region, property type and month (any month back to
//    early 2025), so year-over-year is computed from the same month a year earlier.
//  - CREA Stats board pages: Gatsby page-data JSON carrying each board's own release
//    prose. page-data is TRANSPORT ONLY — every board writes differently (VIREB spells
//    percentages under ten as words), so each board has its own parser and fixture.
// Both are undocumented. When one changes, the fetch fails loudly, the coordinator types
// the numbers (every market value is an editable field), and check:market shows what broke.
import {
  computeMonthsOfInventory,
  monthLabel,
  percentChange,
  TYPE_LABELS,
  type MarketValues,
  type PropertyType,
  type RecordType
} from "./market-rules";
import {
  listMarketMonths,
  listSnapshotIds,
  readExposureLedger,
  readMarketAttempt,
  readMarketMonth,
  readSnapshot,
  writeExposureLedger,
  writeMarketAttempt,
  writeMarketMonth
} from "./storage";
import type { ExposureLedger, MarketKey, MarketMonth, MarketRecord, ReportSnapshot } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;
const ATTEMPT_COOLDOWN_MS = 24 * 3_600_000;
const MAX_STALE_MONTHS = 3;

type MarketDef = {
  label: string;
  region_label: string;
  board_label: string;
  crea_slug: string;
  interior_region_id?: string;
  // Live active-listing counts for the client's own area, from the board's public
  // listings site (Xposure portal: the page carries `setListingCount(N)` server-side and
  // filters by property type through `/propertyTypes_<id>` path segments).
  local?: { label: string; url: string };
};

export const MARKETS: Record<MarketKey, MarketDef> = {
  "central-okanagan": {
    label: "Central Okanagan (Association of Interior REALTORS)",
    region_label: "Central Okanagan",
    board_label: "Association of Interior REALTORS®",
    crea_slug: "okan",
    interior_region_id: "1610"
  },
  // Region labels carry no article: they open sheet headings ("Vancouver Island, August
  // 2026") and sit after "in" inside sentences.
  "vancouver-island": {
    label: "Vancouver Island (VIREB, board-wide)",
    region_label: "Vancouver Island",
    board_label: "Vancouver Island Real Estate Board",
    crea_slug: "vani"
  },
  "vancouver-island-west-coast": {
    label: "Tofino-Ucluelet: local inventory + Vancouver Island board-wide (VIREB)",
    region_label: "Vancouver Island",
    board_label: "Vancouver Island Real Estate Board",
    crea_slug: "vani",
    local: { label: "Tofino-Ucluelet", url: "https://listings.vireb.com/tofino-ucluelet" }
  },
  yukon: {
    label: "Yukon (Yukon Real Estate Association)",
    region_label: "Yukon",
    board_label: "Yukon Real Estate Association",
    crea_slug: "yuko"
  }
};

export const MARKET_KEYS = Object.keys(MARKETS) as MarketKey[];
export const isMarketKey = (value: unknown): value is MarketKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(MARKETS, value);

// ---------------------------------------------------------------------------------
// Text helpers (exported for scripts/check-market.mjs)
// ---------------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};
const NUM = "(\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const PCT = "(?:%|per ?cent)";
const CHANGE_VERBS =
  "up|down|increased?|increasing|decreased?|decreasing|gain|gained|drop|dropped|dropping|rise|rose|rising|decline|declined|declining|higher|lower|growth|dip|dipped|fell|falling|jump|jumped|climb|climbed";
const LEADING = new RegExp(`(?:${CHANGE_VERBS})\\s+(?:of\\s+|by\\s+)?(?:a\\s+|an\\s+)?${NUM}\\s*${PCT}`, "gi");
const TRAILING = new RegExp(`${NUM}\\s*${PCT}\\s*(?:${CHANGE_VERBS}|above|below)`, "gi");
const NEGATIVE = /\b(down|decreas|drop|declin|lower|fell|falling|below|dip)/i;
const MONTH_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;
const MONTH_INDEX = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

/** Tags and entities out, whitespace collapsed. Good enough for release prose. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
}

/** First sentence matching every pattern. */
export function findSentence(text: string, ...patterns: RegExp[]): string | null {
  return sentencesOf(text).find((sentence) => patterns.every((pattern) => pattern.test(sentence))) ?? null;
}

export function sentenceAfter(text: string, sentence: string | null): string | null {
  if (!sentence) return null;
  const list = sentencesOf(text);
  const index = list.indexOf(sentence);
  return index >= 0 ? (list[index + 1] ?? null) : null;
}

const parseNumber = (raw: string) => Number(raw.replace(/,/g, ""));

/** First number in the sentence (commas and decimals allowed). */
export function firstNumber(sentence: string | null): number | null {
  const match = sentence?.match(/\d[\d,]*(?:\.\d+)?/);
  const value = match ? parseNumber(match[0]) : NaN;
  return Number.isFinite(value) ? value : null;
}

/** First number after `marker`; years (2000-2099) are skipped so "from August 2025" is not a count. */
export function numberAfter(sentence: string | null, marker: RegExp): number | null {
  if (!sentence) return null;
  const at = sentence.search(marker);
  if (at < 0) return null;
  const rest = sentence.slice(at);
  for (const match of rest.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = parseNumber(match[0]);
    if (!Number.isFinite(value)) continue;
    if (Number.isInteger(value) && value >= 2000 && value <= 2099 && !match[0].includes(",")) continue;
    return value;
  }
  return null;
}

/** Number written immediately before `marker` ("2,569 new listings" -> 2569). */
export function numberBefore(sentence: string | null, marker: RegExp): number | null {
  const match = sentence?.match(new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s+(?:${marker.source})`, "i"));
  const value = match ? parseNumber(match[1]) : NaN;
  return Number.isFinite(value) ? value : null;
}

/**
 * The year-over-year percentage in a sentence, sign included. Handles "down four per
 * cent", "a 12.1% decrease", "increase of 19.1% (nine sales)". A percentage whose
 * trailing context is month-over-month ("from July", "last month") is skipped; one that
 * mentions a year wins over one that mentions nothing. "unchanged" is 0; "a slight
 * uptick" is null (no number, no guess).
 */
export function pctChange(sentence: string | null): number | null {
  if (!sentence) return null;
  if (/\b(unchanged|no change|flat)\b/i.test(sentence)) return 0;
  type Hit = { value: number; index: number; trailing: string };
  const hits: Hit[] = [];
  for (const re of [LEADING, TRAILING]) {
    for (const match of sentence.matchAll(re)) {
      const raw = match[1].toLowerCase();
      const magnitude = WORD_NUMBERS[raw] ?? Number(raw);
      if (!Number.isFinite(magnitude)) continue;
      const value = NEGATIVE.test(match[0]) ? -magnitude : magnitude;
      hits.push({ value, index: match.index ?? 0, trailing: sentence.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 45) });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const yearly = hits.find((hit) => /year|20\d\d/i.test(hit.trailing));
  if (yearly) return yearly.value;
  const monthly = (hit: Hit) => /\bmonth\b|\blast month\b|\bfrom (January|February|March|April|May|June|July|August|September|October|November|December)\b(?!\s+20)/i.test(hit.trailing);
  return hits.find((hit) => !monthly(hit))?.value ?? null;
}

/**
 * The month a release reports on: the first month named in the text, with the year
 * inferred from today (a month later than the current one belongs to last year — a
 * release is never more than a few months old). Returns "YYYY-MM".
 */
export function reportingMonthFromText(text: string, now = new Date()): string | null {
  const match = text.match(MONTH_RE);
  if (!match) return null;
  const monthIndex = MONTH_INDEX.indexOf(match[1].toLowerCase());
  const year = monthIndex > now.getUTCMonth() ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" shifted by `delta` months. */
export function shiftMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return Math.abs(ay * 12 + am - (by * 12 + bm));
}

/** The month boards are expected to have published: the previous calendar month. */
export function expectedMonth(now = new Date()): string {
  return shiftMonth(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, -1);
}

function record(type: RecordType, values: Partial<MarketValues>, priceLabel = "Benchmark price"): MarketRecord {
  const merged: MarketValues = {
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
    local_active_yoy_pct: null,
    ...values
  };
  merged.months_of_inventory ??= computeMonthsOfInventory(merged.active_inventory, merged.sales);
  return { ...merged, type, type_label: TYPE_LABELS[type], price_label: priceLabel };
}

/** Year-over-year from "were 1,468 in August, up from 1,424 one year ago" when no percentage is stated. */
function yoyFromPrior(sentence: string | null, current: number | null): number | null {
  const stated = pctChange(sentence);
  if (stated !== null) return stated;
  return percentChange(current, numberAfter(sentence, /\b(?:from|compared (?:to|with))\b/i));
}

// ---------------------------------------------------------------------------------
// Board parsers. Input: the release prose as plain text. Output: records by type.
// ---------------------------------------------------------------------------------

export type ParsedRelease = { reporting_month: string | null; by_type: Partial<Record<RecordType, MarketRecord>> };

/** Vancouver Island Real Estate Board release (via CREA Stats "vani"). Board-wide, by property type. */
export function parseVirebRelease(text: string, now = new Date()): ParsedRelease {
  const total = findSentence(text, /unit sales/i, /recorded/i);
  const totalActive = findSentence(text, /active listings/i, /all property types/i);
  const sfSales = findSentence(text, /single-family category/i, /sold/i);
  const condoSales = findSentence(text, /sales of condo/i);
  const townSales = findSentence(text, /row\/ ?townhouse category/i);
  const sfActive = findSentence(text, /active listings of single-family/i);
  const condoActive = findSentence(text, /inventory of condo/i);
  const townActive = findSentence(text, /row\/ ?townhouses for sale/i);
  const sfPrice = findSentence(text, /benchmark price/i, /single-family/i);
  const condoPrice = findSentence(text, /apartment category/i, /benchmark/i);
  const townPrice = findSentence(text, /benchmark price of a townhouse/i);

  const sf = { sales: firstNumber(sfSales), active: firstNumber(sfActive) };
  const condo = { sales: firstNumber(condoSales), active: firstNumber(condoActive) };
  const town = { sales: firstNumber(townSales), active: firstNumber(townActive) };
  const all = { sales: firstNumber(total), active: firstNumber(totalActive) };

  return {
    reporting_month: reportingMonthFromText(total ?? text, now),
    by_type: {
      all: record("all", {
        sales: all.sales,
        sales_yoy_pct: pctChange(total),
        active_inventory: all.active,
        inventory_yoy_pct: yoyFromPrior(totalActive, all.active)
      }),
      single_family: record("single_family", {
        sales: sf.sales,
        sales_yoy_pct: pctChange(sfSales),
        active_inventory: sf.active,
        inventory_yoy_pct: yoyFromPrior(sfActive, sf.active),
        price: numberAfter(sfPrice, /\$/),
        price_yoy_pct: pctChange(sfPrice)
      }),
      condo: record("condo", {
        sales: condo.sales,
        sales_yoy_pct: pctChange(condoSales),
        active_inventory: condo.active,
        inventory_yoy_pct: yoyFromPrior(condoActive, condo.active),
        price: numberAfter(condoPrice, /\$/),
        price_yoy_pct: pctChange(condoPrice)
      }),
      townhouse: record("townhouse", {
        sales: town.sales,
        sales_yoy_pct: pctChange(townSales),
        active_inventory: town.active,
        inventory_yoy_pct: yoyFromPrior(townActive, town.active),
        price: numberAfter(townPrice, /\$/),
        price_yoy_pct: pctChange(townPrice)
      })
    }
  };
}

/** Yukon Real Estate Association release (CREA-templated prose, via CREA Stats "yuko"). All residential. */
export function parseYukonRelease(text: string, now = new Date()): ParsedRelease {
  const sales = findSentence(text, /homes sold/i, /total+ed/i);
  const newListings = findSentence(text, /new residential listings/i);
  const newListingsPct = findSentence(text, /new listings/i, /%|per ?cent/i);
  const active = findSentence(text, /active residential listings/i);
  const moi = findSentence(text, /months of inventory numbered/i);
  const price = findSentence(text, /average price of homes sold/i);
  return {
    reporting_month: reportingMonthFromText(sales ?? text, now),
    by_type: {
      all: record(
        "all",
        {
          sales: firstNumber(sales),
          sales_yoy_pct: pctChange(sales) ?? pctChange(sentenceAfter(text, sales)),
          new_listings: firstNumber(newListings),
          new_listings_yoy_pct: pctChange(newListings) ?? pctChange(newListingsPct),
          active_inventory: firstNumber(active),
          inventory_yoy_pct: pctChange(active),
          months_of_inventory: firstNumber(moi),
          price: numberAfter(price, /\$/),
          price_yoy_pct: pctChange(price)
        },
        "Average price"
      )
    }
  };
}

/** Association of Interior REALTORS release (via CREA Stats "okan"). Board-wide; the fallback for Central Okanagan. */
export function parseInteriorRelease(text: string, now = new Date()): ParsedRelease {
  const sales = findSentence(text, /residential sales/i, /recorded/i);
  const newListings = findSentence(text, /new (residential )?listings/i, /%|per ?cent/i);
  const active = findSentence(text, /active listings/i, /%|per ?cent/i);
  const centralPrice = findSentence(text, /Central Okanagan/i, /single-family/i, /\$/);
  return {
    reporting_month: reportingMonthFromText(sales ?? text, now),
    by_type: {
      all: record("all", {
        sales: firstNumber(sales),
        sales_yoy_pct: pctChange(sales),
        new_listings: numberBefore(newListings, /new (?:residential )?listings/i),
        new_listings_yoy_pct: pctChange(newListings),
        active_inventory: numberBefore(active, /recorded/i) ?? numberAfter(active, /\bwith\b/i),
        inventory_yoy_pct: pctChange(active),
        price: numberAfter(centralPrice, /Central Okanagan region, coming in at/i),
        price_yoy_pct: centralPrice ? pctChange(centralPrice) : null
      })
    }
  };
}

export type InteriorCards = {
  region: string | null;
  sales: number | null;
  price: number | null;
  price_label: string;
  days_to_sell: number | null;
  inventory: number | null;
  new_listings: number | null;
};

/** The dashboard fragment: five cards, each an <h5> label followed by the big number. */
export function parseInteriorDashboard(html: string): InteriorCards {
  const region = html.match(/<h1[^>]*>([^<]*)/)?.[1]?.trim() ?? null;
  const cards = new Map<string, number>();
  let priceLabel = "Benchmark price";
  for (const match of html.matchAll(/<h5[^>]*>([^<]*)<\/h5>[\s\S]*?<p class="text-6xl[^"]*">([^<]*)<\/p>/g)) {
    const label = match[1].trim().toLowerCase();
    const value = parseNumber(match[2].replace(/[^0-9.,]/g, ""));
    if (!Number.isFinite(value)) continue;
    cards.set(label, value);
    if (label.includes("price")) priceLabel = match[1].trim();
  }
  const get = (label: string) => cards.get(label) ?? null;
  return {
    region,
    sales: get("sales"),
    price: get("benchmark price") ?? get("average price"),
    price_label: priceLabel,
    days_to_sell: get("days to sell"),
    inventory: get("inventory"),
    new_listings: get("new listings")
  };
}

/** A board's Xposure listings page: the active-listing count and the type filter it echoes. */
export function parseXposureListingCount(html: string): { count: number | null; types: number[] | null } {
  const count = html.match(/setListingCount\((\d+)\)/)?.[1];
  const types = html.match(/"propertyTypes","value":\[([\d,]*)\]/)?.[1];
  return {
    count: count === undefined ? null : Number(count),
    types: types === undefined ? null : types.split(",").filter(Boolean).map(Number)
  };
}

// ---------------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------------

// Xposure property type ids (from the portal's type menu): 0 Single Family, 2 Townhouse,
// 3 Condo/Apartment. The unfiltered page counts every type, land and commercial included.
const XPOSURE_TYPES: Record<PropertyType, number> = { single_family: 0, townhouse: 2, condo: 3 };

/** Active listings in the local area, all types and per residential type. A failed type is null. */
export async function fetchLocalActive(url: string): Promise<Record<RecordType, number | null>> {
  const base = url.replace(/\/$/, "");
  const one = async (path: string, expectType: number | null) => {
    try {
      const parsed = parseXposureListingCount(await getText(base + path));
      // The page must echo the filter back, or the count is for every type.
      if (expectType !== null && !(parsed.types?.length === 1 && parsed.types[0] === expectType)) return null;
      return parsed.count;
    } catch {
      return null;
    }
  };
  const [all, single_family, townhouse, condo] = await Promise.all([
    one("", null),
    one(`/propertyTypes_${XPOSURE_TYPES.single_family}`, XPOSURE_TYPES.single_family),
    one(`/propertyTypes_${XPOSURE_TYPES.townhouse}`, XPOSURE_TYPES.townhouse),
    one(`/propertyTypes_${XPOSURE_TYPES.condo}`, XPOSURE_TYPES.condo)
  ]);
  return { all, single_family, townhouse, condo };
}

async function getText(url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** The board's release prose from its CREA Stats page-data (transport only). */
export async function fetchCreaReleaseText(slug: string): Promise<{ text: string; url: string }> {
  const raw = await getText(`https://creastats.crea.ca/page-data/board/${slug}/page-data.json`);
  const json = JSON.parse(raw) as { result?: { data?: { contentfulBoards?: { mainContent?: { childContentfulRichText?: { html?: string } } } } } };
  const html = json.result?.data?.contentfulBoards?.mainContent?.childContentfulRichText?.html ?? "";
  if (!html) throw new Error(`CREA Stats page-data for "${slug}" carried no release text`);
  return { text: stripHtml(html), url: `https://creastats.crea.ca/board/${slug}/` };
}

const INTERIOR_PAGE = "https://www.interiorrealtors.ca/market-statistics/";
const INTERIOR_AJAX = "https://www.interiorrealtors.ca/wp-admin/admin-ajax.php";
const INTERIOR_TYPES: Record<PropertyType, string> = {
  single_family: "single-family",
  townhouse: "townhouse",
  condo: "condo-apartment"
};

export async function fetchInteriorPage(): Promise<{ nonce: string; latest_month: string }> {
  const html = await getText(INTERIOR_PAGE);
  const nonce = html.match(/market_stats_ajax\s*=\s*\{[^}]*nonce:\s*'([^']+)'/)?.[1];
  const latest = html.match(/<option value="(\d{4}-\d{2})"\s+selected/)?.[1];
  if (!nonce || !latest) throw new Error("Interior REALTORS statistics page changed: nonce or month list not found");
  return { nonce, latest_month: latest };
}

export async function fetchInteriorDashboard(nonce: string, regionId: string, month: string, type: PropertyType): Promise<InteriorCards> {
  const body = new URLSearchParams({
    action: "get_market_statistics_dashboard",
    nonce,
    region_id: regionId,
    month,
    property_type: INTERIOR_TYPES[type]
  });
  const raw = await getText(INTERIOR_AJAX, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const json = JSON.parse(raw) as { success?: boolean; data?: { html?: string } | string };
  if (!json.success || typeof json.data !== "object" || !json.data?.html) {
    throw new Error(`Interior REALTORS dashboard refused ${month}/${type}: ${typeof json.data === "string" ? json.data : "no html"}`);
  }
  return parseInteriorDashboard(json.data.html);
}

// ---------------------------------------------------------------------------------
// Refresh + cache
// ---------------------------------------------------------------------------------

async function refreshInterior(key: MarketKey, regionId: string, now: Date): Promise<MarketMonth> {
  const page = await fetchInteriorPage();
  const month = page.latest_month;
  const priorMonth = shiftMonth(month, -12);
  const types: PropertyType[] = ["single_family", "townhouse", "condo"];
  const [current, prior] = await Promise.all([
    Promise.all(types.map((type) => fetchInteriorDashboard(page.nonce, regionId, month, type))),
    Promise.all(types.map((type) => fetchInteriorDashboard(page.nonce, regionId, priorMonth, type).catch(() => null)))
  ]);
  const by_type: Partial<Record<RecordType, MarketRecord>> = {};
  types.forEach((type, i) => {
    const cur = current[i];
    const prev = prior[i];
    by_type[type] = record(
      type,
      {
        sales: cur.sales,
        sales_yoy_pct: percentChange(cur.sales, prev?.sales ?? null),
        new_listings: cur.new_listings,
        new_listings_yoy_pct: percentChange(cur.new_listings, prev?.new_listings ?? null),
        active_inventory: cur.inventory,
        inventory_yoy_pct: percentChange(cur.inventory, prev?.inventory ?? null),
        days_to_sell: cur.days_to_sell,
        days_to_sell_yoy_pct: percentChange(cur.days_to_sell, prev?.days_to_sell ?? null),
        price: cur.price,
        price_yoy_pct: percentChange(cur.price, prev?.price ?? null)
      },
      cur.price_label
    );
  });
  const market = MARKETS[key];
  return {
    key,
    reporting_month: month,
    region_label: current[0].region ?? market.region_label,
    board_label: market.board_label,
    source: "interior_dashboard",
    source_url: INTERIOR_PAGE,
    retrieved_at: now.toISOString(),
    by_type
  };
}

// One parser per board release, keyed by the CREA Stats board slug (several markets can
// share a board: Vancouver Island board-wide and Tofino-Ucluelet both read "vani").
export const CREA_PARSERS: Record<string, (text: string, now: Date) => ParsedRelease> = {
  vani: parseVirebRelease,
  yuko: parseYukonRelease,
  okan: parseInteriorRelease
};

async function refreshCrea(key: MarketKey, now: Date): Promise<MarketMonth> {
  const market = MARKETS[key];
  const { text, url } = await fetchCreaReleaseText(market.crea_slug);
  const parse = CREA_PARSERS[market.crea_slug];
  if (!parse) throw new Error(`No release parser for CREA board "${market.crea_slug}"`);
  const parsed = parse(text, now);
  if (!parsed.reporting_month) throw new Error(`Could not read the reporting month from the ${market.board_label} release`);
  const anyValue = Object.values(parsed.by_type).some((rec) => rec && (rec.sales !== null || rec.active_inventory !== null));
  if (!anyValue) throw new Error(`No sales or inventory figures found in the ${market.board_label} release`);
  const month: MarketMonth = {
    key,
    reporting_month: parsed.reporting_month,
    region_label: key === "central-okanagan" ? "Interior BC (board-wide)" : market.region_label,
    board_label: market.board_label,
    source: "crea_stats",
    source_url: url,
    retrieved_at: now.toISOString(),
    by_type: parsed.by_type
  };
  if (market.local) await addLocalInventory(month, market.local, now);
  return month;
}

/**
 * Local inventory: today's active-listing counts, recorded against the reporting month
 * so next year's refresh can state a year-over-year change. A failed local fetch leaves
 * the board-wide figures intact (the counts are an addition, never a dependency).
 */
async function addLocalInventory(month: MarketMonth, local: NonNullable<MarketDef["local"]>, now: Date) {
  const counts = await fetchLocalActive(local.url);
  if (Object.values(counts).every((value) => value === null)) {
    console.warn(`[market] ${month.key}: local inventory for ${local.label} unavailable (${local.url})`);
    return;
  }
  const prior = await readMarketMonth(month.key, shiftMonth(month.reporting_month, -12));
  for (const type of Object.keys(counts) as RecordType[]) {
    const rec = month.by_type[type] ?? (month.by_type[type] = record(type, {}));
    rec.local_active = counts[type];
    rec.local_active_yoy_pct = percentChange(counts[type], prior?.by_type[type]?.local_active ?? null);
  }
  month.local = { label: local.label, source_url: local.url, retrieved_at: now.toISOString() };
}

/**
 * Fetch the newest month for a market and cache it. The Interior dashboard is tried
 * first for Central Okanagan, CREA Stats otherwise (and as the Interior fallback).
 * Records the attempt either way. Never overwrites a cached month unless `force`.
 */
export async function refreshMarket(key: MarketKey, options: { force?: boolean; now?: Date } = {}): Promise<MarketMonth> {
  const now = options.now ?? new Date();
  const market = MARKETS[key];
  const errors: string[] = [];
  let month: MarketMonth | null = null;
  if (market.interior_region_id) {
    try {
      month = await refreshInterior(key, market.interior_region_id, now);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!month) {
    try {
      month = await refreshCrea(key, now);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!month) {
    const message = errors.join("; ");
    await writeMarketAttempt(key, { at: now.toISOString(), ok: false, error: message });
    throw new Error(message);
  }
  const existing = await readMarketMonth(key, month.reporting_month);
  if (!existing || options.force) await writeMarketMonth(month);
  await writeMarketAttempt(key, { at: now.toISOString(), ok: true, error: "", month: month.reporting_month });
  console.info(`[market] ${key}: ${month.reporting_month} from ${month.source}${errors.length ? ` (after: ${errors.join("; ")})` : ""}`);
  return existing && !options.force ? existing : month;
}

/**
 * The month a report should use, from the cache when possible. On-demand refresh with a
 * 24-hour attempt throttle; a cached month up to three months old stands in with a warning.
 * Never throws — a market failure degrades to a warning, like every other pull block.
 */
export async function getMarketForReport(key: MarketKey, now = new Date()): Promise<{ month: MarketMonth | null; warnings: string[] }> {
  const market = MARKETS[key];
  const wanted = expectedMonth(now);
  const warnings: string[] = [];
  const cached = await readMarketMonth(key, wanted);
  if (cached) return { month: cached, warnings };

  const attempt = await readMarketAttempt(key);
  const recentAttempt = attempt && now.getTime() - Date.parse(attempt.at) < ATTEMPT_COOLDOWN_MS;
  if (!recentAttempt) {
    try {
      const fresh = await refreshMarket(key, { now });
      if (fresh.reporting_month === wanted) return { month: fresh, warnings };
    } catch (error) {
      warnings.push(`Couldn't fetch ${market.board_label} statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const months = await listMarketMonths(key);
  const newest = months[0];
  if (newest && monthsBetween(newest, wanted) <= MAX_STALE_MONTHS) {
    const month = await readMarketMonth(key, newest);
    if (month) {
      warnings.push(
        `Latest available figures are for ${monthLabel(newest)} — ${market.board_label} hasn't published ${monthLabel(wanted)} yet.`
      );
      return { month, warnings };
    }
  }
  warnings.push(`No market statistics are available for ${market.label} yet — enter them below or leave the section blank to omit it.`);
  return { month: null, warnings };
}

/** For the admin panel: newest cached month and last attempt per market. */
export async function marketStatus() {
  return Promise.all(
    MARKET_KEYS.map(async (key) => ({
      key,
      label: MARKETS[key].label,
      months: await listMarketMonths(key),
      attempt: await readMarketAttempt(key)
    }))
  );
}

// ---------------------------------------------------------------------------------
// Exposure benchmark: REALTOR.ca views per day on market, median over our own archive.
// Kept in a small ledger so a report never has to open every snapshot (they embed images).
// ---------------------------------------------------------------------------------

export function exposureOf(snapshot: Pick<ReportSnapshot, "manual" | "website">): number | null {
  const views = snapshot.manual?.realtor_listing_views ?? 0;
  const days = snapshot.manual?.days_on_market ?? 0;
  if (views <= 0 || days < 7 || snapshot.website?.source === "mock") return null;
  return Math.round((views / days) * 10) / 10;
}

async function loadLedger(): Promise<ExposureLedger> {
  const ledger = await readExposureLedger();
  if (ledger) return ledger;
  // First use: build from the snapshots already on disk, once.
  const entries: ExposureLedger["entries"] = [];
  for (const id of await listSnapshotIds()) {
    try {
      const views_per_day = exposureOf(await readSnapshot(id));
      if (views_per_day !== null) entries.push({ id, views_per_day });
    } catch {
      // a corrupt snapshot is not a reason to lose the benchmark
    }
  }
  const built = { entries };
  await writeExposureLedger(built);
  return built;
}

export async function exposureBenchmark(): Promise<{ benchmark_views_per_day: number; sample_size: number } | null> {
  const ledger = await loadLedger();
  const values = ledger.entries.map((entry) => entry.views_per_day).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return { benchmark_views_per_day: Math.round(median * 10) / 10, sample_size: values.length };
}

export async function recordExposure(id: string, snapshot: ReportSnapshot): Promise<void> {
  const views_per_day = exposureOf(snapshot);
  if (views_per_day === null) return;
  const ledger = await loadLedger();
  if (ledger.entries.some((entry) => entry.id === id)) return;
  ledger.entries.push({ id, views_per_day });
  await writeExposureLedger(ledger);
}
