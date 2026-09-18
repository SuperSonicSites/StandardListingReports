// Fixture check for the Seller Market Update parsers and rules (no network):
//   npm run check:market
// Runs src/lib/market.ts and src/lib/market-rules.ts (TypeScript via Node's type
// stripping) against one real release per board saved under scripts/fixtures/market/
// (CREA Stats page-data prose from 17 Sep 2026, an Interior REALTORS dashboard fragment),
// then the interpretation rules against fixed inputs. It fails the day a board changes
// its wording — the failure that will actually happen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Extensionless TS imports, as Astro/Vite resolve them.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context); }
        catch (error) {
          if (specifier.startsWith(".") && !/\\.[a-z]+$/i.test(specifier)) return next(specifier + ".ts", context);
          throw error;
        }
      }
    `)
);

const root = path.resolve(import.meta.dirname, "..");
const fixture = (name) => readFileSync(path.join(root, "scripts/fixtures/market", name), "utf8");
const market = await import(pathToFileURL(path.join(root, "src/lib/market.ts")).href);
const rules = await import(pathToFileURL(path.join(root, "src/lib/market-rules.ts")).href);
const NOW = new Date("2026-09-17T12:00:00Z");

// --- Vancouver Island Real Estate Board (CREA Stats "vani"), August 2026 ---------------
{
  const parsed = market.parseVirebRelease(market.stripHtml(fixture("crea-vani-2026-08.html")), NOW);
  assert.equal(parsed.reporting_month, "2026-08");
  const all = parsed.by_type.all;
  assert.equal(all.sales, 651);
  assert.equal(all.sales_yoy_pct, -4, '"down four per cent" is a word, not a digit');
  assert.equal(all.active_inventory, 4498);
  assert.equal(all.inventory_yoy_pct, 2);
  const sf = parsed.by_type.single_family;
  assert.equal(sf.sales, 298);
  assert.equal(sf.sales_yoy_pct, -11, "the year-over-year figure, not the month-over-month one that follows it");
  assert.equal(sf.active_inventory, 1468);
  assert.equal(sf.inventory_yoy_pct, 3.1, "computed from 'up from 1,424 one year ago'");
  assert.equal(sf.months_of_inventory, 4.9);
  assert.equal(sf.price, 788100);
  assert.equal(sf.price_yoy_pct, null, '"a slight uptick" carries no number: null, not the month-over-month drop');
  const condo = parsed.by_type.condo;
  assert.equal(condo.sales, 70);
  assert.equal(condo.sales_yoy_pct, -4);
  assert.equal(condo.active_inventory, 356);
  assert.equal(condo.inventory_yoy_pct, -10.1);
  assert.equal(condo.price, 401900);
  assert.equal(condo.price_yoy_pct, -1);
  const town = parsed.by_type.townhouse;
  assert.equal(town.sales, 79);
  assert.equal(town.sales_yoy_pct, 11);
  assert.equal(town.active_inventory, 304);
  assert.equal(town.inventory_yoy_pct, -14.4);
  assert.equal(town.price, 550000);
  assert.equal(town.price_yoy_pct, 1);
  assert.equal(sf.days_to_sell, null, "VIREB publishes no days to sell");
}

// --- Yukon Real Estate Association (CREA Stats "yuko"), August 2026 ---------------------
{
  const parsed = market.parseYukonRelease(market.stripHtml(fixture("crea-yuko-2026-08.html")), NOW);
  assert.equal(parsed.reporting_month, "2026-08");
  const all = parsed.by_type.all;
  assert.equal(all.sales, 56);
  assert.equal(all.sales_yoy_pct, 19.1, "stated in the sentence after the count");
  assert.equal(all.new_listings, 88);
  assert.equal(all.new_listings_yoy_pct, 37.5, "stated in the sentence before the count");
  assert.equal(all.active_inventory, 215);
  assert.equal(all.inventory_yoy_pct, 3.9);
  assert.equal(all.months_of_inventory, 3.8, "published, not computed");
  assert.equal(all.price, 640416);
  assert.equal(all.price_yoy_pct, 8.4);
  assert.equal(all.price_label, "Average price");
}

// --- Association of Interior REALTORS release (CREA Stats "okan"), July 2026 — the fallback
{
  const parsed = market.parseInteriorRelease(market.stripHtml(fixture("crea-okan-2026-07.html")), NOW);
  assert.equal(parsed.reporting_month, "2026-07", "month from the sales sentence; year inferred from today, not from 'July 2025'");
  const all = parsed.by_type.all;
  assert.equal(all.sales, 1496);
  assert.equal(all.sales_yoy_pct, -2.2, "'down from 1,547 in June' is not a percentage");
  assert.equal(all.new_listings, 2569);
  assert.equal(all.new_listings_yoy_pct, -12.1);
  assert.equal(all.active_inventory, 9630);
  assert.equal(all.inventory_yoy_pct, -7.8);
  assert.equal(all.months_of_inventory, 6.4);
  assert.equal(all.price, 1072400);
  assert.equal(all.price_yoy_pct, 2.3);
}

// --- Interior REALTORS dashboard fragments, August 2026 ---------------------------------
{
  const central = market.parseInteriorDashboard(fixture("interior-1610-2026-08.html"));
  assert.equal(central.region, "Central Okanagan");
  assert.deepEqual(
    [central.sales, central.price, central.days_to_sell, central.inventory, central.new_listings],
    [142, 1056700, 60, 1219, 296]
  );
  assert.equal(central.price_label, "Benchmark Price");
  const all = market.parseInteriorDashboard(fixture("interior-1807-2026-08.html"));
  assert.equal(all.region, "All Regions");
  assert.equal(all.sales, 581);
  assert.equal(all.days_to_sell, 73);
}

// --- VIREB public listings site (Xposure portal), Tofino-Ucluelet, September 2026 ----------
{
  const page = market.parseXposureListingCount(fixture("vireb-listings-tofino-ucluelet-2026-09.html"));
  assert.equal(page.count, 145, "server-rendered active-listing count, all types");
  assert.deepEqual(page.types, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], "unfiltered page echoes every residential type");
  const filtered = market.parseXposureListingCount('app.setListingCount(9); app.setSearchFilters([{"name":"propertyTypes","value":[2]},{"name":"statuses","value":[0]}]);');
  assert.deepEqual(filtered, { count: 9, types: [2] }, "a /propertyTypes_2 page echoes the single type it was filtered by");
  assert.deepEqual(market.parseXposureListingCount("<html>changed</html>"), { count: null, types: null });
}

// Every market's CREA board has a parser, and markets sharing a board share it.
for (const key of market.MARKET_KEYS) {
  assert.ok(market.CREA_PARSERS[market.MARKETS[key].crea_slug], `no release parser for market ${key}`);
}
assert.equal(market.CREA_PARSERS[market.MARKETS["vancouver-island-west-coast"].crea_slug], market.parseVirebRelease);

// --- Percent parsing edge cases ---------------------------------------------------------
assert.equal(market.pctChange("Sales were 651, down four per cent from one year ago."), -4);
assert.equal(market.pctChange("Active listings last month were 3,075, up seven per cent year over year."), 7);
assert.equal(market.pctChange("The benchmark price was $788,100 in August 2026, a slight uptick from one year ago and a drop of one per cent from July."), null);
assert.equal(market.pctChange("Months of inventory numbered 3.5, unchanged from a year ago."), 0);
assert.equal(market.pctChange("New listings saw a 12.1% decrease compared to July 2025 with 2,569 new listings."), -12.1);
assert.equal(market.numberAfter("Active listings were 1,468 in August, up from 1,424 one year ago.", /from/), 1424);
assert.equal(market.numberAfter("up 3% from August 2025 to 40", /from/), 40, "a bare year is skipped");
assert.equal(market.expectedMonth(NOW), "2026-08");
assert.equal(market.shiftMonth("2026-01", -12), "2025-01");
assert.equal(market.monthsBetween("2026-08", "2026-05"), 3);

// --- Interpretation rules: plain facts, then what they mean for the seller -----------
{
  const ctx = { region_label: "Central Okanagan", reporting_month: "2026-08", type_label: "single-family homes" };
  const values = {
    ...rules.EMPTY_MARKET_VALUES,
    sales: 142,
    sales_yoy_pct: -12.3,
    active_inventory: 1219,
    inventory_yoy_pct: 15,
    months_of_inventory: 8.6,
    days_to_sell: 60,
    days_to_sell_yoy_pct: 11
  };
  const m = rules.interpretMarket(values, ctx);
  assert.deepEqual(m, [
    "142 single-family homes sold in Central Okanagan in August 2026, 12.3% fewer than a year ago. Buyer demand has softened.",
    "1,219 single-family homes were for sale at the end of August 2026, 15% more than last August. More properties are competing for buyers.",
    "At August's pace of sales it would take 8.6 months to sell every property listed. Over six months is a buyer's market.",
    "Properties that sold in August 2026 had been on the market for 60 days on average, 11% longer than a year ago. Buyers are taking longer to decide than they did last year.",
    "Bottom line: buyers have the upper hand right now. They can compare many properties, take their time, and walk away from any that don't measure up."
  ]);

  // Fewer for sale than last year, yet still a buyer's market: said in one breath, no mixed signal.
  assert.equal(
    rules.interpretMarket({ ...values, inventory_yoy_pct: -17.7 }, ctx)[1],
    "1,219 single-family homes were for sale at the end of August 2026, 17.7% fewer than last August. That is fewer than last year, but still more than buyers are taking up."
  );
  assert.match(
    rules.interpretMarket({ ...values, inventory_yoy_pct: -17.7, months_of_inventory: 5 }, ctx)[1],
    / Fewer properties are competing for buyers\.$/,
    "outside a buyer's market, fewer listings simply means less competition"
  );

  // The words never fight the number: under 5% reads "about the same"; larger moves are stated as the figure.
  assert.match(rules.interpretMarket({ ...values, sales_yoy_pct: -4 }, ctx)[0], /about the same as a year ago\. Buyer demand is steady\.$/);
  assert.match(rules.interpretMarket({ ...values, sales_yoy_pct: 22 }, ctx)[0], /22% more than a year ago\. Buyer demand is stronger\.$/);

  // Small-market guardrail: nine sales can be a 19% swing.
  const small = rules.interpretMarket({ ...values, sales: 22, sales_yoy_pct: 19.1 }, { ...ctx, region_label: "Yukon" });
  assert.equal(
    small[0],
    "22 single-family homes sold in Yukon in August 2026, 19.1% more than a year ago. With this few sales, the percentages swing a lot from month to month, so read them loosely."
  );
  assert.doesNotMatch(small[0], /demand/);

  // New listings only speak when they moved.
  assert.match(
    rules.interpretMarket({ ...values, new_listings: 296, new_listings_yoy_pct: -22.7 }, ctx)[3],
    /^296 single-family homes were newly listed in August 2026, 22.7% fewer than a year ago, so fewer new competitors are arriving\.$/
  );
  assert.equal(rules.interpretMarket({ ...values, new_listings: 296, new_listings_yoy_pct: 2 }, ctx).length, 5);

  // Balanced and tight supply, with the bottom line to match.
  const balanced = rules.interpretMarket({ ...rules.EMPTY_MARKET_VALUES, months_of_inventory: 5 }, ctx);
  assert.match(balanced[0], /Between four and six months is a balanced market\.$/);
  assert.match(balanced[1], /^Bottom line: the market is balanced/);
  const tight = rules.interpretMarket({ ...rules.EMPTY_MARKET_VALUES, months_of_inventory: 3.8 }, ctx);
  assert.match(tight[0], /Under four months is a seller's market\.$/);
  assert.match(tight[1], /^Bottom line: sellers have the upper hand/);

  // Nothing published => nothing said.
  assert.equal(rules.interpretMarket(rules.EMPTY_MARKET_VALUES, ctx).length, 0);

  // The home against the market, without an exposure benchmark (the listing sheet's facts).
  const property = { days_on_market: 90, realtor_views: 900, showings: 3 };
  const p = rules.interpretProperty(values, ctx, property, null);
  assert.deepEqual(p, [
    "Your property has been on the market for 90 days, longer than the 60 days it took the average August 2026 sale. It has now been available longer than most properties that sold.",
    "Your property has drawn 900 views on REALTOR.ca over 90 days, about 10 a day.",
    "3 showings have taken place so far."
  ]);
  assert.match(
    rules.interpretProperty(values, ctx, { ...property, days_on_market: 30 }, null)[0],
    /^Your property has been on the market for 30 days\. Properties that sold in August 2026 had been listed for 60 days on average, so it is still early\.$/
  );
  assert.match(rules.interpretProperty(values, ctx, { ...property, days_on_market: 130 }, null)[0], /about twice as long as the properties that sold\.$/);
  assert.match(
    rules.interpretProperty({ ...values, days_to_sell: null }, ctx, property, null)[0],
    /^Your property has been on the market for 90 days, in a market where it would take 8.6 months to sell every property listed\.$/
  );
  assert.equal(rules.interpretProperty(values, ctx, { ...property, showings: 0 }, null)[2], "No showings have taken place yet.");
  assert.equal(rules.interpretProperty(values, ctx, { ...property, showings: 1 }, null)[2], "1 showing has taken place so far.");

  // Exposure against our archive, only once the sample is big enough.
  const bench = { views_per_day: 10, benchmark_views_per_day: 5, sample_size: rules.MIN_BENCHMARK_SAMPLE };
  const above = rules.interpretProperty(values, ctx, property, bench);
  assert.equal(
    above[1],
    "Buyers are seeing your property more than most: about 10 views a day on REALTOR.ca, against a typical 5 a day across the 30 listings we have reported on. Exposure is not the problem."
  );
  assert.equal(above.length, 3, "the listing sheet states facts; the cover's short answer says what they mean");
  assert.match(rules.interpretProperty(values, ctx, property, { ...bench, benchmark_views_per_day: 10 })[1], /^Your property is getting typical exposure: about 10 views a day/);
  const below = rules.interpretProperty(values, ctx, property, { ...bench, benchmark_views_per_day: 20 });
  assert.match(below[1], /^Fewer buyers than usual are seeing your property.*Exposure is the first thing to fix\.$/);
  const tooFew = rules.interpretProperty(values, ctx, property, { ...bench, sample_size: rules.MIN_BENCHMARK_SAMPLE - 1 });
  assert.equal(tooFew[1], "Your property has drawn 900 views on REALTOR.ca over 90 days, about 10 a day.");

  // The cover's short answer: the most telling signal first.
  const typical = { ...bench, benchmark_views_per_day: 10 };
  const verdict = (overrides, exposure = null, v = values) => rules.sellerVerdict(v, ctx, { ...property, ...overrides }, exposure);
  const verdicts = {
    early: verdict({ days_on_market: 28, realtor_views: 280, showings: null }, typical),
    late: verdict({ showings: null }, typical),
    visits: verdict({}, typical),
    noShowings: verdict({ showings: 0 }, typical),
    below: verdict({}, { ...bench, benchmark_views_per_day: 20 }),
    slow: verdict({ showings: null }, null, { ...values, days_to_sell: null }),
    tight: verdict({ showings: null }, null, { ...rules.EMPTY_MARKET_VALUES, months_of_inventory: 3.8 }),
    nothing: verdict({ showings: null }, null, rules.EMPTY_MARKET_VALUES)
  };
  assert.deepEqual(verdicts.early, {
    headline: "It is still early. Your property is on track.",
    detail: "Properties that sold in August 2026 took 60 days on average; yours has been listed for 28. Buyers are seeing it as much as most listings. The coming weeks will tell."
  });
  assert.deepEqual(verdicts.late, {
    headline: "Buyers are seeing it, but it is taking longer than most.",
    detail:
      "Properties that sold in August 2026 took 60 days on average; yours has been listed for 90. Plenty of buyers have looked, so they are choosing other properties they see as better value. Price and presentation are what they weigh."
  });
  assert.equal(verdicts.visits.headline, "Buyers are visiting, but no one has made an offer yet.");
  assert.match(verdicts.visits.detail, /^3 showings so far show real interest\./);
  assert.equal(verdicts.noShowings.headline, "Buyers are looking online, but no one has booked a showing.");
  assert.match(verdicts.noShowings.detail, /^In 90 days it has drawn about 10 views a day on REALTOR\.ca, but no buyer has asked to see it in person\./);
  assert.equal(verdicts.below.headline, "Not enough buyers are seeing your property yet.");
  assert.match(verdicts.below.detail, /below the typical 20\./);
  assert.equal(verdicts.slow.headline, "It is a slow market, and buyers have plenty of choice.");
  assert.match(verdicts.slow.detail, /^At the current pace it would take 8\.6 months to sell every property listed in Central Okanagan/);
  assert.equal(verdicts.tight.headline, "Buyers are active in your market.");
  assert.equal(verdicts.nothing.headline, "Here is where things stand.");
  assert.equal(
    verdict({ days_on_market: 5, realtor_views: 50, showings: 0 }, typical).headline,
    "It is still early. Your property is on track.",
    "no showings in the first two weeks is not yet a signal"
  );
  assert.match(verdict({ days_on_market: 130, showings: null }, typical).detail, /yours has been listed for 130, about twice as long\./);

  // Local inventory leads every list when the board exposes it.
  const localCtx = { region_label: "Vancouver Island", reporting_month: "2026-08", type_label: "townhouses", local_label: "Tofino-Ucluelet" };
  const localValues = { ...rules.EMPTY_MARKET_VALUES, sales: 79, sales_yoy_pct: 11, local_active: 9 };
  const lm = rules.interpretMarket(localValues, localCtx);
  assert.equal(lm[0], "9 townhouses are for sale in Tofino-Ucluelet right now. Those are the properties buyers compare yours against.");
  assert.equal(lm[1], "79 townhouses sold in Vancouver Island in August 2026, 11% more than a year ago. Buyer demand is stronger.");
  assert.match(rules.interpretMarket({ ...localValues, local_active_yoy_pct: 28.6 }, localCtx)[0], /^9 townhouses are for sale in Tofino-Ucluelet right now, 28.6% more than a year ago\./);
  const lp = rules.interpretProperty(localValues, localCtx, { days_on_market: 15, realtor_views: 432, showings: null }, null);
  assert.equal(lp[0], "Buyers shopping for townhouses in Tofino-Ucluelet right now have 9 to choose from.");
  // Without a local label the local figure is silent, even if a value sneaks in.
  assert.doesNotMatch(rules.interpretMarket(localValues, { ...localCtx, local_label: "" })[0], /right now/);

  // Never a price recommendation, in any branch.
  const verdictText = Object.values(verdicts).flatMap((v) => [v.headline, v.detail]);
  const everything = [...m, ...small, ...p, ...above, ...below, ...lm, ...lp, ...verdictText];
  for (const sentence of everything) assert.doesNotMatch(sentence, /overpriced|reduce (the|your) price|price reduction|lower (the|your) price|drop (the|your) price/i);

  assert.equal(rules.computeMonthsOfInventory(1219, 142), 8.6);
  assert.equal(rules.computeMonthsOfInventory(10, 0), null);
  assert.equal(rules.percentChange(1468, 1424), 3.1);
  assert.equal(rules.monthLabel("2026-08"), "August 2026");
}

console.log("check:market OK — 3 board parsers, the dashboard fragment, percent edge cases, the rules and the cover verdicts all pass.");
