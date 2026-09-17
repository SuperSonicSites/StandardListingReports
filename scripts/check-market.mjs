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

// --- Interpretation rules ---------------------------------------------------------------
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
  assert.match(m[0], /^Buyer activity is lower/);
  assert.match(m[0], /142 single-family homes sold in Central Okanagan in August 2026, down 12.3%/);
  assert.match(m[1], /more properties to choose from/);
  assert.match(m[2], /buyer's side/);
  assert.match(m[3], /taking longer to sell/);
  assert.equal(m.length, 4, "no new-listings sentence without a figure");

  // Small-market guardrail: nine sales can be a 19% swing.
  const small = rules.interpretMarket({ ...values, sales: 22, sales_yoy_pct: 19.1 }, { ...ctx, region_label: "Yukon" });
  assert.match(small[0], /^22 single-family homes sold in Yukon in August 2026, up 19.1%/);
  assert.doesNotMatch(small[0], /stronger|lower/);
  assert.match(small[0], /handful of transactions/);

  // Balanced and tight supply.
  assert.match(rules.interpretMarket({ ...rules.EMPTY_MARKET_VALUES, months_of_inventory: 5 }, ctx)[0], /roughly balanced/);
  assert.match(rules.interpretMarket({ ...rules.EMPTY_MARKET_VALUES, months_of_inventory: 3.8 }, ctx)[0], /favours sellers/);

  // Nothing published => nothing said.
  assert.equal(rules.interpretMarket(rules.EMPTY_MARKET_VALUES, ctx).length, 0);

  // Property against the market.
  const property = { days_on_market: 90, realtor_views: 900, showings: 3 };
  const p = rules.interpretProperty(values, ctx, property, null);
  assert.match(p[0], /90 days, longer than the 60-day average sale in Central Okanagan/);
  assert.match(p[1], /900 REALTOR.ca views over 90 days on market, about 10 per day/);
  assert.match(p[2], /3 showings have taken place/);

  const within = rules.interpretProperty(values, ctx, { ...property, days_on_market: 30 }, null);
  assert.match(within[0], /within the 60-day average/);

  // No days to sell => months of inventory stands in.
  const noDays = rules.interpretProperty({ ...values, days_to_sell: null }, ctx, property, null);
  assert.match(noDays[0], /8.6 months of supply/);

  // Exposure benchmark only once the archive is big enough.
  const bench = { views_per_day: 10, benchmark_views_per_day: 5, sample_size: rules.MIN_BENCHMARK_SAMPLE };
  assert.match(rules.interpretProperty(values, ctx, property, bench)[1], /above typical: 10 REALTOR.ca views per day/);
  assert.match(rules.interpretProperty(values, ctx, property, { ...bench, benchmark_views_per_day: 10 })[1], /in line with typical/);
  assert.match(rules.interpretProperty(values, ctx, property, { ...bench, sample_size: rules.MIN_BENCHMARK_SAMPLE - 1 })[1], /about 10 per day/);

  // Cover summary: a digest of the sheets, market first, then the listing's own numbers.
  const summary = rules.summarizeMarketUpdate(values, ctx, {
    ...property,
    showings: null,
    website_views: 52,
    social_views: 920,
    site_total_views: 8746
  });
  assert.equal(summary.length, 2);
  assert.equal(
    summary[0],
    "In August 2026, 142 single-family homes sold in Central Okanagan (down 12.3% from a year ago), 1,219 were listed for sale at month end (up 15%), inventory stood at 8.6 months, and the average sale took 60 days (up 11%)."
  );
  assert.equal(
    summary[1],
    "Your listing has been on the market for 90 days and has drawn 900 REALTOR.ca views, 52 website views, and 920 social media views, on a site that attracted 8,746 page views over the same period."
  );
  const sparse = rules.summarizeMarketUpdate({ ...rules.EMPTY_MARKET_VALUES, sales: 56 }, { ...ctx, region_label: "Yukon", type_label: "all residential properties" }, { days_on_market: 0, realtor_views: 0, showings: null, website_views: 0, social_views: 0, site_total_views: 0 });
  assert.deepEqual(sparse, ["In August 2026, 56 all residential properties sold in Yukon.", "Your listing."]);

  // Local inventory leads every list when the board exposes it.
  const localCtx = { region_label: "Vancouver Island", reporting_month: "2026-08", type_label: "townhouses", local_label: "Tofino-Ucluelet" };
  const localValues = { ...rules.EMPTY_MARKET_VALUES, sales: 79, sales_yoy_pct: 11, local_active: 9 };
  const lm = rules.interpretMarket(localValues, localCtx);
  assert.equal(lm[0], "9 townhouses are listed for sale in Tofino-Ucluelet right now.");
  assert.match(lm[1], /^Buyer activity is stronger/);
  assert.equal(
    rules.interpretMarket({ ...localValues, local_active_yoy_pct: 28.6 }, localCtx)[0],
    "9 townhouses are listed for sale in Tofino-Ucluelet right now, more than a year ago (up 28.6%)."
  );
  const lp = rules.interpretProperty(localValues, localCtx, { days_on_market: 15, realtor_views: 432, showings: null }, null);
  assert.equal(lp[0], "Buyers looking at townhouses in Tofino-Ucluelet right now have 9 to choose from.");
  const ls = rules.summarizeMarketUpdate(localValues, localCtx, { days_on_market: 15, realtor_views: 432, showings: null, website_views: 0, social_views: 0, site_total_views: 0 });
  assert.equal(ls[0], "9 townhouses are for sale in Tofino-Ucluelet right now.");
  assert.match(ls[1], /^In August 2026, 79 townhouses sold in Vancouver Island \(up 11% from a year ago\)\.$/);
  // Without a local label the local figure is silent, even if a value sneaks in.
  assert.doesNotMatch(rules.interpretMarket(localValues, { ...localCtx, local_label: "" })[0], /right now/);

  // Never pricing advice.
  for (const sentence of [...m, ...p, ...summary, ...lm, ...lp, ...ls]) assert.doesNotMatch(sentence, /overpriced|reduce (the|your) price|price reduction/i);

  assert.equal(rules.computeMonthsOfInventory(1219, 142), 8.6);
  assert.equal(rules.computeMonthsOfInventory(10, 0), null);
  assert.equal(rules.percentChange(1468, 1424), 3.1);
  assert.equal(rules.monthLabel("2026-08"), "August 2026");
}

console.log("check:market OK — 3 board parsers, the dashboard fragment, percent edge cases, and the rules all pass.");
