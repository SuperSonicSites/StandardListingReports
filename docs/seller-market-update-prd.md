# PRD: Seller Market Update (MVP)

Version 1.0, 18 September 2026. Supersedes the "Market Position Report" draft.
Status: approved for build. Implemented in this repository (see "Implementation map").

## Goal

Give a listing agent a fast, factual answer when a seller asks "why isn't my house selling?"

The report puts three things side by side:

1. What the local market is doing this month.
2. How the property is actually performing.
3. A short interpretation written by fixed rules.

No comparables. No pricing advice. The agent holds the conversation; the report gives them the facts.

## User flow

Portal card **Seller Market Update** → the report form in market mode → pick the property type if it is not single-family → paste the REALTOR.ca share link → **Pull data** → the update opens as a report page (owner decision, 18 September 2026: no confirm step on a clean pull). The review form appears only when a source came back without something the report needs; "Adjust numbers" on the report reopens the prefilled form to fix a value and regenerate.

The coordinator never researches or types market statistics. Typing is the fallback when a source is down.

## Report content

Order (owner, 18 September 2026): where the property stands first, then the listing, then the market, then compliance. The update is mostly sent when a seller asks "why hasn't it sold yet?", so the positioning leads and the statistics back it up. One click: the agent types nothing (owner decision, 18 September 2026 — a draft with agent-written feedback and next-step boxes was rejected as asking too much).

### Cover: where your property stands

- One verdict headline and two or three plain sentences under the label "Where your property stands", written by `sellerVerdict()` from the same reviewed numbers and frozen as `report.verdict` (market updates made before it existed compute it at render).
- Three numbers behind it: days on market against the average sale; how much buyers see it (REALTOR.ca views a day against our archive once it holds 30 qualifying reports, otherwise total views); showings when entered, otherwise the market's months of inventory.
- The listing photo fills the rest of the page.

### 1. Market conditions (one sheet)

Only the metrics the market actually publishes. Missing values are omitted, never guessed.

- Sales, with year-over-year change
- Active listings (inventory), with year-over-year change
- Months of inventory (published, or active listings divided by sales)
- New listings, with year-over-year change, when available
- Days to sell, with year-over-year change, when available
- Benchmark or average price, with year-over-year change, when available. The report prints the label the board used.

Every sheet names the board, the region, the property type, the reporting month, the source link and the retrieval date.

### 2. Property performance (existing sheet)

Reused from the listing report: days on market, REALTOR.ca views, website views, Facebook and Instagram views, showings, reporting period, cover photo.

The market update carries the social view counts as numbers only. The listing report's social sheet (post images and captions) is not part of it, the form hides the post pickers in market mode, and the snapshot embeds no post images. Owner decision, 18 September 2026: the seller conversation needs the stats, not the posts.

### 3. Interpretation (on the market sheet)

Two short lists of plain sentences, both produced by deterministic rules in code. No language model.

- "What this means" reads the market numbers.
- "Your listing in this market" reads the property numbers against the market.

The rules never say the property is overpriced and never recommend a price change.

## Data sources

`page-data.json` on CREA Stats is **transport only**. It carries each board's own release prose, and every board writes differently, so each board has its own parser and its own fixture. Verified 17 September 2026:

| Market | Primary source | What it gives | Days to sell |
|---|---|---|---|
| Central Okanagan | Association of Interior REALTORS dashboard: a WordPress `admin-ajax` action guarded by a nonce read from the public statistics page, returning an HTML fragment with five labelled cards per region, property type and month | Sales, new listings, active inventory, price (benchmark or average), days to sell | Yes |
| Vancouver Island | CREA Stats page-data for the VIREB release | Board-wide sales and active listings by property type, benchmark prices. Percentages under ten are written as words | No |
| Yukon | CREA Stats page-data for the Yukon release (CREA-templated prose) | Sales, new listings, active listings, months of inventory, average price, all residential | No |

Fallback for Central Okanagan: the CREA Stats Okanagan page-data, board-wide, labelled as such.

**Local inventory (Tofino-Ucluelet).** VIREB publishes nothing at town level in its releases, and its 14-page stats package only breaks out single-family sales and prices for "Zone 6, Port Alberni-West Coast", a zone Port Alberni dominates. What is Ucluelet-relevant is the live count of active listings on VIREB's own public listings site (`listings.vireb.com/tofino-ucluelet`): the page carries the count server-side and filters by property type through `/propertyTypes_<id>` path segments (0 single-family, 2 townhouse, 3 condo). The market `vancouver-island-west-coast` fetches these four counts with the monthly release, records them against the reporting month so a year-over-year change becomes available a year in, and leads every list and the summary with them. Board-wide pace figures stay, labelled Vancouver Island. Sales and days to sell at town level do not exist anywhere public; the app does not pretend otherwise. Owner decision, 18 September 2026: the zone table from the PDF is not worth a PDF-parsing dependency.

Year-over-year for Central Okanagan is computed by fetching the same month one year earlier from the dashboard. The other two boards state the change in their prose.

Dead ends, recorded so nobody re-checks them: the Yukon association site has no statistics section; the Yukon government statistics pages sit behind a Cloudflare bot challenge; VIREB publishes no days to sell and no zone-level inventory anywhere, including its 14-page stats package.

## Normalized market record

One file per market and reporting month: `data/market/<market>-<YYYY-MM>.json`, holding one record per property type.

```text
key                    central-okanagan | vancouver-island | yukon
reporting_month        YYYY-MM
region_label, board_label
source                 interior_dashboard | crea_stats
source_url, retrieved_at
local                  { label, source_url, retrieved_at } where the board exposes local inventory
by_type[<type>]:
  local_active, local_active_yoy_pct
  sales, sales_yoy_pct
  new_listings, new_listings_yoy_pct
  active_inventory, inventory_yoy_pct
  months_of_inventory
  days_to_sell, days_to_sell_yoy_pct
  price, price_yoy_pct, price_label
```

Types: `single_family`, `townhouse`, `condo`, and `all` where the board only publishes a residential total. Any field can be null.

## Refresh strategy

No scheduler. Market data changes monthly and a report is generated on demand.

When a market pull runs:

1. Expected month is the previous calendar month.
2. If that month is cached, use it.
3. Otherwise, if the last fetch attempt is less than 24 hours old, use the newest cached month and warn. This stops the first days of a month, before boards publish, from re-fetching on every report.
4. Otherwise fetch, parse, validate, save, and record the attempt.
5. A cached month older than three months is not used; the section is omitted with a warning.

**Admin → Refresh market data** forces a fetch for every market and overwrites the cached month. The cache is replaceable. Report snapshots are not: a generated report keeps its frozen copy forever.

If on-demand refresh ever proves insufficient, the same function can be called by a Railway cron service through an authenticated endpoint. Not built.

## Interpretation rules

Thresholds are constants in `src/lib/market-rules.ts`.

Voice (owner, 18 September 2026): written for the seller, so the agent never has to translate. Every sentence is a plain fact followed by what it means, in everyday words. No "inventory", "absorption" or "supply-side". "Your property", never "your home" (client feedback, 18 September 2026: not every listing is someone's home; it may be a rental or a secondary dwelling). "Single-family homes" stays only as the board's category name.

Year-over-year changes read in three bands so the words never fight the number: under 5 percent is "about the same as a year ago", 5 to 15 percent is stated as the figure ("9.6% fewer than a year ago"), 15 percent and over likewise. The meaning clause follows from the direction.

Market sentences, in order:

- Local inventory (where a board exposes it): the count of homes of this type for sale in the local area right now, then "Those are the properties buyers compare yours against."
- Sales: the count and change, then "Buyer demand is steady / has softened / is stronger."
- **Small-market guardrail:** under 30 sales in the month, the sentence gives the count and says the percentages swing a lot with this few sales, and draws no demand conclusion.
- Homes for sale at month end: the count and change against the same month last year, then "Fewer / More properties are competing for buyers." When the count fell but it is still a buyer's market, one sentence says both: "That is fewer than last year, but still more than buyers are taking up." (and the mirror case in a seller's market).
- Months of inventory, said as "at August's pace of sales it would take 8.6 months to sell every property listed", then the rule: over six months is a buyer's market; under four a seller's market; between is balanced. The thresholds are spelled out so the seller learns the rule; the Bottom line says what it means.
- New listings, only when they moved by 5 percent or more: the count and change, then "so fewer / more new competitors are arriving."
- Days to sell: "Properties that sold in August had been on the market for 60 days on average", with the change, then whether buyers are taking longer or deciding faster than last year.
- **Bottom line**, from months of inventory: buyers have the upper hand / sellers have the upper hand / the market is balanced, in one sentence.

Property sentences, in order:

- Local choice: "Buyers shopping for townhouses in Tofino-Ucluelet right now have 9 to choose from." Never assumes this home is inside the count.
- Days on market against the average sale: "still early" when under it; "longer than most properties that sold" when over it; "about twice as long" at double. Against months of inventory when the board publishes no days to sell.
- Exposure: REALTOR.ca views per day compared with the median of Supersonic's own archive, **only when the archive holds at least 30 qualifying reports**; whole numbers, sample size stated. Above typical ends "Exposure is not the problem." Below typical ends "Exposure is the first thing to fix." Without a benchmark the sentence states the home's own views per day and nothing more.
- Showings, when entered, including "No showings have taken place yet" for an explicit zero.
- The cover's **short answer** (`sellerVerdict`) says what these mean and picks the most telling signal, in order: too few buyers seeing it (below the archive's typical); looking online but no showing booked after 14 days; showings but no offer, and longer than the average sale; longer than the average sale; still early; and, where the board publishes no days to sell, the pace of the market. "Price and presentation are what they weigh." is the ceiling. (The listing sheet's list states the facts only.)

The rules never call the home overpriced and never recommend a price change. Only sentences supported by available data are produced.

## Review step

The market section of the form shows the region, the reporting month, every extracted metric as an editable input, the source link, and a live preview of the interpretation. Editing any market value marks the market source as manual on the snapshot. The coordinator approves, then everything freezes into the report snapshot. Historical reports never change.

## Failure behaviour

- Source fails: use the newest cached month within three months, print that month, warn the coordinator.
- No market data at all: the market section is omitted, the report still generates, nothing is guessed.
- A failed market source can never break the standard listing report. The market pull is a separate block with its own warnings.

## Storage

`data/market/` on the existing volume, next to clients, snapshots and orders. JSON files only. Ids stay within the safe-id rule.

## Client profile and form changes

- Client profile: `market` (one of the three keys), set by an admin in the client form under Data sources.
- Report form: `property_type` select in market mode, default single-family.
- Snapshot: `report.kind` (`listing` or `market`), `report.property_type`, optional `market` block.

## Fixture check

`npm run check:market` runs the parsers against saved copies of one real release per board and one dashboard fragment, and the interpretation rules against fixed inputs. It fails the day a board changes its wording, which is the failure that will happen.

## Non-goals

Comparables, sold history, CMA tools, automated pricing advice, AI forecasts, mortgage-rate analysis, dashboards, a generic scraping framework, scheduled jobs.

## Acceptance criteria

- Central Okanagan pulls from the Interior dashboard with computed year-over-year; CREA Stats works as its fallback.
- Vancouver Island and Yukon pull from CREA Stats with their own parsers, including the words-to-digits case.
- Months of inventory is present for every market.
- Market data is cached by month, refresh attempts are throttled, the admin can force a refresh.
- Existing listing data is reused; the coordinator never types market statistics when a source works.
- Missing data is omitted; source, region, type and reporting month appear on the report.
- Interpretation is deterministic, with the small-market guardrail and the archive-size guard on exposure.
- Reports stay frozen once generated.
- A failed market source cannot break the listing-report flow.
- The fixture check passes.

## Launch task, not code

Email each board once to confirm that members may cite the monthly figures in seller reports. The report already names the board as the source and reproduces numbers only, never charts or text.

## Implementation map

- `src/lib/market-rules.ts`: browser-safe rules and thresholds, shared by the form preview and the snapshot route.
- `src/lib/market.ts`: markets table, fetchers, per-board parsers, cache and throttle, exposure benchmark.
- `src/scripts/market-form.ts`: the form's market section behaviour.
- `src/pages/api/pull.ts`: `include_market` returns the market block.
- `src/pages/api/snapshot.ts`: freezes the market block and the interpretation.
- `src/pages/api/market-refresh.ts`: admin force refresh.
- `src/pages/reports/[snapshotId].astro`: the market sheet.
- `scripts/check-market.mjs` and `scripts/fixtures/market/`: the fixture check.
