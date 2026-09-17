# Red-team report: Listing Landing Page Service PRD v1.0

**Reviewed:** `Supersonic_Listing_Service_PRD.docx` (v1.0, 15 September 2026)
**Against:** this codebase at commit `163e0f7` (Listing Ads live in Zoho CRM), the platform docs the PRD cites (fetched 2026-09-15), and the operating constraints in `README.md` and `CLAUDE.md`.
**Companion:** [prd-v2.md](prd-v2.md) is the rewritten PRD that applies every accepted finding and, in revision 2.1, the owner's decisions of 15 September (next section).

## Verdict

The PRD is a careful design for the *automated* version of a service that has never been delivered manually. It specifies a workflow engine, two AI research agents, an asset pipeline, a twelve-state machine and roughly a dozen external integrations for a six-order pilot. It assumes a payment provider and a database that this app does not have. Its QA gate demands things (real 404s, third-party scripts, sitemap and robots control) that the chosen production platform's own documentation never mentions. And it contains no evidence that anyone will buy the page, at what price, or who will build the software.

Recommendation: sell the service now as a **concierge product inside the app** (order, intake, pay, one CRM record, human build from a qualified template), run **Gate 0** (qualify the site platform against the QA checklist with one hand-built page) before writing code, and automate only what the pilot measures as repetitive. Roughly 80 percent of v1's requirements move to a "later, if measured" list without losing anything a client would notice.

## Owner decisions received after the review (15 September 2026)

Five decisions arrived after the findings below were written. They are applied in [prd-v2.md](prd-v2.md) revision 2.1, and the affected findings carry an *Owner decision* note.

| Decision | Effect on this review |
| --- | --- |
| A custom Zoho CRM module tracks each website; no Zoho Projects | Resolves H1 as recommended. One record per micro-site in `Listing_Websites`; the app writes every field and the stage; nothing is tracked by hand. |
| One domain per client: `portfolio.<clientdomain>/<page>` | Resolves M2 and changes the shape of production. On ChatGPT Sites a custom domain attaches to one Site, so each client gets one **portfolio Site** and every micro-site is a route inside it. Every deploy publishes the whole portfolio, so the PRD adds a one-candidate-at-a-time rule and a smoke test of a live page in every candidate. Domain work becomes one DNS record per client, none per order. |
| `portfolio.<clientdomain>` is a gallery of all micro-sites | Adds a per-client onboarding deliverable (portfolio setup) and a gallery that must change on every launch, sale and archive. It also makes the live address predictable at order time, which fills `Listing_Ads.Destination_URL` before the campaign runs, and it puts the micro-site under the client's own Rybbit site, so the seller report generator may pick up its views with no new integration (Gate 0 checks this). |
| ChatGPT Sites, definitely | C1 stays open as a risk, but Gate 0 changes from "choose a platform" to "inventory what Sites can do and strike what it cannot, in writing". The residual risks (beta usage limits, one Site per client so one bad deploy touches every page, vendor continuity) are in the PRD's risk table with their mitigations. |
| "We would need a Stripe checkout?" | Yes, if clients are to pay inside the app at order time. Stripe Checkout Sessions keep card data out of the app (the client pays on Stripe's hosted page), need no SDK (one POST to create the session, one signed webhook, one GET to confirm on return), and cost about 2.9 percent plus 30 cents per domestic card payment. The pilot alternative with zero payment code is an invoice from Zoho Books and an admin marking the order paid. Resolves C2. |

## How this was reviewed

1. Every functional requirement was checked against what exists in the code: auth ([src/lib/auth.ts](../../src/lib/auth.ts)), storage ([src/lib/storage.ts](../../src/lib/storage.ts)), the Zoho client ([src/lib/zoho.ts](../../src/lib/zoho.ts)), and the Listing Ads form and route that are the closest existing analog ([src/pages/api/listing-ad.ts](../../src/pages/api/listing-ad.ts)).
2. The PRD's platform references 1 to 5 were fetched today and compared with what the requirements need from them.
3. The operating arithmetic was checked: the per-site QA gate against the 30-minute handling target.
4. The document was read for what is absent: demand, price, owner, estimate, backups, advertising compliance, privacy law, portability.

## Findings

Severity: **Critical** blocks the plan as written. **High** causes a failed pilot or a lost client. **Medium** costs time or money. **Low** is hygiene.

### Critical

**C1. The production platform is unproven against the PRD's own QA gate.**
What v1 says: build every site on ChatGPT Sites (FR16, FR17), then require a real 404 status (FR21), third-party scripts for GA4, Rybbit and Turnstile (FR19, FR20, FR25), sitemap and robots control (FR21), schema (FR22) and Lighthouse 95 with tracking installed (FR24).
Evidence: the Sites documentation fetched today confirms custom domains (not for Enterprise at launch), saved versions and deployments, private sharing tiers, editor invitations, and that the product is in beta with "plan-specific usage limits". It does not mention custom scripts, form handling, HTTP status control, sitemaps, robots, canonicals, or any management API. Reference note 2 in the PRD says the same thing more politely.
Consequence: either the gate cannot be met by construction, or nobody has checked. Every site also lives inside the agency's ChatGPT workspace subscription: a beta feature of a chat product now carries the "hosting term" promise, client portability, and business continuity.
Fix: Gate 0. Build one portfolio Site with a gallery and two listing routes by hand and run the full checklist before any code is written. Strike, in writing, every requirement Sites cannot meet.
*Owner decision:* Sites is fixed, so Gate 0 qualifies it rather than compares it with the stack the agency already uses for websites. The checklist in the PRD (section 9) is now Sites-specific: whether one Site serves many routes under `portfolio.<clientdomain>`, whether the client can preview a saved but undeployed version, whether a deploy of one new page leaves existing pages byte-identical, and what the beta usage limits mean in numbers.

**C2. "Use the existing payment provider" names something that does not exist.**
What v1 says: FR02, "use the existing payment provider where practical".
Evidence: `package.json` has four runtime dependencies (Astro, the Node adapter, puppeteer-core, a Chromium build). There is no billing code, no Stripe, no Zoho Checkout, nothing that has ever taken money.
Consequence: entitlement, event deduplication, refunds and the "production clock" all hang off a decision that has not been made.
Fix: decide first. *Owner decision:* Stripe Checkout (hosted payment page, session created server-side with the order id in metadata, signed webhook). It needs no SDK: one form-encoded POST to create the session and about fifteen lines of `node:crypto` to verify the webhook, in the same style as [src/lib/mail.ts](../../src/lib/mail.ts). Prerequisites: a Stripe account in CAD, one Price per SKU, test-mode keys, and a registered webhook endpoint. If the pilot should carry no payment code at all, invoice through Zoho Books and let an admin flip the order to paid.

**C3. "The existing app database" is a folder of JSON files on one volume with no backup.**
What v1 says: the app database owns order state, payments, versions and integration mappings (Data and integration architecture); webhook handlers enqueue durable jobs, workers retry within budgets, exhausted failures route to owned exception tasks, and an audit log records every write (FR07).
Evidence: storage is `data/*.json` written atomically to a Railway volume ([src/lib/storage.ts](../../src/lib/storage.ts)). The only deduplication state in the app is an in-memory map that resets on every deploy ([src/pages/api/listing-ad.ts:19](../../src/pages/api/listing-ad.ts)). The launch runbook has no backup step. `README.md` lists workflow engines and premature databases under "Avoid".
Consequence: FR07 is a job system. Building it means a database, a queue and a worker process, which is a different application than the one that exists.
Fix: make the systems that already exist the records of record. Stripe is the payment ledger. Zoho CRM mirrors every order field and its production stage (one record per order, exactly like `Listing_Ads` today). The app keeps one JSON file per order for intake, entitlement and approvals. Losing the volume then loses nothing that cannot be re-entered from Stripe and CRM.

**C4. The scope is a quarter of engineering for a six-order pilot, with no owner, estimate or date.**
What v1 says: 28 requirements; integrations with a payment provider, Zoho CRM, Zoho Projects, Zoho Cliq, the Dropbox API, OpenAI workspace agents, ChatGPT Sites, Basin, Turnstile, the GA4 Admin API, the Search Console API, Rybbit provisioning, Ubersuggest, and an uptime monitor. Phase one alone includes payment-to-order handling, CRM-prefilled intake, Dropbox import, source extraction, fact confirmation and a Zoho task template.
Evidence: the git log shows what one integration costs here. Getting Chromium to launch inside the Railway container took eight commits over successive deploys. Each integration in the list also brings its own credential, plan tier, scope review and failure mode.
Consequence: months of work before the first dollar, on a product with no demand evidence (C5).
Fix: the MVP needs four integrations, three of which exist: Stripe (new), Zoho CRM `createRecord` (exists), Resend email (exists), and the REALTOR.ca scrape for prefill (exists).

**C5. There is no evidence anyone will buy this, or at what price.**
What v1 says: "Marketing claims, prices, and supported markets must be approved before sales begin"; price and unit caps are set after the pilot.
Evidence: nothing in the PRD records a client conversation, a competitor price, or a reason a client would pay. Single-property websites are a commodity that listing photographers and MLS marketing tools often bundle at no charge.
Consequence: a pilot that measures handling time but not willingness to pay answers the wrong question.
Fix: sell two by email to the three existing clients at a proposed price before building checkout. Position the page as the destination for the ad campaign the agency already runs for them: `Listing_Ads.Destination_URL` is left blank for staff to fill today, and a landing page order is the natural way to fill it. A bundle ("ad campaign plus landing page") has a reason to exist that a standalone page does not.

### High

**H1. Two systems own production status.**
v1 gives the app a twelve-state machine and gives Zoho Projects "assignments, due dates, blockers, revisions, and approvals" (FR06). They will drift within a week because the team lives in Zoho. Zoho Projects is also a separate product with its own OAuth client. The CRM token's scopes are narrow and its refresh budget of ten tokens per ten minutes is shared with the REALTOR import Worker ([src/lib/zoho.ts:8](../../src/lib/zoho.ts)).
Fix: one stage picklist on the CRM record, written by the app on every transition and never edited by hand. No Zoho Projects integration in the pilot. If the team wants a Cliq ping, configure a CRM workflow rule; that is configuration, not code.
*Owner decision:* a custom CRM module tracks each website; no Zoho Projects. The PRD names it `Listing_Websites`, one record per micro-site, with the field list in its section 8.

**H2. The research agents are the most speculative, most expensive and least safe part.**
FR10 to FR14 describe a listing researcher, an asset reviewer, a coordinator and an independent fact-checker, with per-package token, runtime and retry budgets. The PRD itself concedes external listing access is best effort (FR11). REALTOR.ca's public pages are bot-walled; the app only reads the agent's own member share-listing report through headless Chrome ([src/lib/realtor.ts](../../src/lib/realtor.ts)). Developer portals are all different. And an agent that fetches attacker-controllable pages and then holds a write tool is the textbook prompt-injection surface. FR08's "treat page text as data, never as instructions" is a wish, not a control.
For six orders, a producer reads the listing in ten minutes.
Fix: no agents in the MVP. Reuse the existing scrape to prefill address, MLS number, list date and the first photo from the same share link the ads form already collects. The client types the rest; they know their listing. The producer confirms before build.

**H3. The Dropbox pipeline is a second product.**
FR13 and FR14: validate folder access, enumerate, copy to durable storage, checksum, deduplicate, inspect resolution, prepare responsive sizes, pick hero candidates, assign to units, flag ambiguities. That is a Dropbox API integration, an image pipeline, and storage the Railway volume should not hold. It is also a regression: the current ads form accepts "Dropbox / Google Drive" and the PRD accepts Dropbox only.
Fix: accept a shared-folder link from Dropbox or Google Drive (host validated, stored, never fetched by the server). The producer downloads by hand. The site platform's own asset store serves the optimized copies.

**H4. The QA gate and the handling-time target contradict each other.**
FR24 per deployed version: six viewport widths plus intermediate resizing, four browsers including real iOS Safari, keyboard, focus, contrast, zoom, reduced motion, three controlled Lighthouse runs, schema validation, unique metadata, sitemap and robots checks, favicon, social preview. FR25 to FR27 add a GA4 property, a web stream, event receipt verification, Search Console verification, sitemap submission, a live-domain check, rollback notes, a launch notification and an uptime task.
That is two to four hours of human time per site. The pilot target is a 30-minute median.
Fix: qualify the **template** once with the full gate and record the results. Per-site QA becomes a fifteen-item checklist (links, phone, form delivery to the real recipient, thank-you noindex, metadata, preview card, two widths, one Lighthouse run, analytics event received, brokerage block, facts match, no placeholders). Re-run the full gate only when the template changes.

**H5. The Development package is where every model balloons.**
Unit records with their own price, area, status, photos and plans; unit-aware inquiries; floor-plan-to-unit mapping; conflicting-price resolution (Client X example); "do not infer that every unit has a photographed view". Each of these is an intake screen, a data structure, a QA item and a support conversation.
Fix: the MVP sells the Single Listing page online. Development is "request a quote" on the same form: it creates the CRM record and skips checkout. Design the unit model after three developments have been built by hand and you know which fields actually vary.

**H6. Pay-first manufactures the "paid, intake never completed" state.**
FR04 exists only because payment precedes intake: save progress, resume without paying again, remind, and eventually refund a paid order that never became complete.
Fix: intake first, checkout last. The order is a draft until payment is confirmed, and "paid" means "complete and ready for production". An abandoned draft owes nothing and needs no refund rule. If the owner wants payment as a commitment device, keep pay-first, but then FR04 stays and needs a reminder cadence and a refund policy for the never-completed case.

**H7. Anyone at the client's email domain can spend the client's money.**
Access entries may be `@domain.com` ([src/lib/auth.ts:88](../../src/lib/auth.ts)), which today grants a form and reports. With payments, it grants purchasing under the brokerage's CRM Account.
Fix: store the purchaser's email on every order; send the confirmation to the purchaser and to the profile's coordinator list; for ordering, prefer named addresses over domain-wide entries. Card details are entered only on the payment provider's hosted page, so the app never handles card data.

**H8. Real estate advertising rules are absent from the template and the QA gate.**
A listing landing page is licensee advertising. BC's Real Estate Services Rules require the brokerage name to appear prominently on all advertising (confirm the current wording with each client's managing broker; the Yukon client falls under a different regulator). REALTOR.ca listing remarks are copyrighted content and its terms restrict automated reuse. MLS and REALTOR marks have usage rules.
Fix: the brokerage identification block is a mandatory template element sourced from the profile fields that already exist (`brokerage_name`, `brokerage_address`, `brokerage_contact`). Copy is original, never pasted remarks (v1 says this; keep it). The rights checkbox at intake names photos, floor plans and brokerage advertising compliance. Add a QA line item.

**H9. Lead data has no defined owner, path or retention.**
Leads (name, email, phone, message) will pass through Basin, a US processor, on their way to the agent. v1 has a privacy template (FR23) and correctly keeps PII out of analytics (FR25), but never says where leads live, for how long, or who can see them. PIPEDA and BC's PIPA apply.
Fix: decide the lead path (Basin to the agent's inbox, with or without a copy to the agency or the CRM), set Basin's retention, and name the processors in the privacy page. Put the retention decision in the client terms.

### Medium

**M1. SEO investment on a page that lives sixty to ninety days.** A national keyword study per country and language, Search Console verification, sitemap submission and schema validation for a page that will not be indexed and ranked within a listing's life. Its traffic comes from the paid campaign and the agent's channels. Keep the cheap hygiene as template defaults (title, description, canonical, Open Graph, alt text, robots). Cut the study and per-site Search Console work.

**M2. Domain strategy drives cost, DNS work and lifecycle.** Per-listing custom domains would mean purchase, DNS, TLS, renewal and expiry handling per order.
*Owner decision:* one subdomain per client on the client's own domain (`portfolio.<clientdomain>`), each micro-site a path under it. That is one DNS record per client, set up once, and it removes per-page domain work and per-page hosting terms entirely. It also means one Site per client on ChatGPT Sites, because a custom domain attaches to one Site; every deploy therefore publishes the whole portfolio, and the PRD adds a one-candidate-at-a-time rule, a live-page smoke test in every candidate, and a rule that foundation updates deploy on their own.

**M3. Unattended builds through triggered workspace agents.** The trigger API's own documentation says the agent's response cannot be retrieved and does not mention Sites tools. v1 correctly defers this; the improved PRD removes it entirely and keeps one line under "Later".

**M4. Notifications as code.** Cliq webhooks, "resolve Josh", an uptime task. Configure inside Zoho (workflow rule to Cliq or email). Client-facing emails go through Resend, which is already integrated.

**M5. Twelve states plus side states.** Every extra state is a screen, an email and a test. Six orders need six states: draft, paid, in production, in review, live, archived, with cancelled reachable before live.

**M6. "Prefilled from CRM" requires reading CRM Accounts.** The app does not read Accounts and the token scopes are narrow. The client profile already holds the name, logo, brand colours, brokerage name, address and contact, and website ([src/lib/types.ts](../../src/lib/types.ts)). Prefill from the profile; that is zero integration. Ask for the agent on the form; the profile has no agent list.

**M7. The pilot measures handling time and reliability but no business number.** Add revenue per order, producer minutes, gross margin, and the go/no-go thresholds before the pilot starts, not after.

**M8. Security principles need concrete anchors in this codebase.** Webhook signature verification over the raw body. JSON-only POST bodies for every new API route, because `checkOrigin` is disabled app-wide and the JSON content-type is the CSRF control ([src/pages/api/listing-ad.ts:147](../../src/pages/api/listing-ad.ts)). A fetch allowlist for anything the server retrieves, following `embedImage` in the snapshot route. Order ids through `assertSafeId`. A per-client order-creation throttle, like the login throttle. Client review and approval pages under `/c/<slug>/` so the middleware's client scoping applies without new code.

**M9. No backup of the volume.** With paid orders on it, either add a nightly export or, as recommended in C3, keep the records of record in Stripe and CRM and treat the volume as a cache.

### Low

- **L1.** Terminology drifts between site, landing page, Site candidate, order, listing record and build. The improved PRD uses order, page and version.
- **L2.** The no-em-dash and banned-phrase rules are one regex in the agency's existing copy QA tooling, not a requirement section.
- **L3.** Ubersuggest is already connected to this workspace; per-order keyword research is still unnecessary (M1).
- **L4.** "Never verify a single-use Turnstile token twice through competing handlers" only matters if a proxy exists. With direct posting to Basin there is no proxy; Basin lists Turnstile as a supported spam option. Cut the proxy path.

## What v1 gets right (kept in v2)

- A verified server-side payment event confirms purchase; a browser redirect does not (FR02).
- The CRM Account comes from the session and the profile, never from the request (FR01). This is exactly how [src/pages/api/listing-ad.ts](../../src/pages/api/listing-ad.ts) works today.
- Approved facts are frozen at build time (the app's snapshot principle).
- No invented awards, testimonials, distances, school claims, completion dates or pricing; prices and availability carry a date (FR12).
- Publication is tied to approval of an exact version, with rollback notes (FR05, FR27).
- No PII in analytics (FR25).
- A URL provides context, not rights; do not bypass access controls (FR11).
- Honesty about the trigger API's limits (Reference notes 1 and 2).

## Decisions the owner must make now

| Decision | Proposed default | Why it cannot wait |
| --- | --- | --- |
| Payment provider | **Decided:** Stripe Checkout, CAD; automatic tax to confirm | Every ordering requirement depends on it |
| Order of operations | Intake first, pay last | Removes resume-after-payment logic and the never-completed refund case |
| MVP package | Single Listing online; Development = quote request | Keeps the unit model out of the pilot |
| Price; setup fee or included with the first order | Set after two manual sales | Nothing is known yet |
| Production platform | **Decided:** ChatGPT Sites; Gate 0 now qualifies it | Half the requirements depend on what it can do |
| Tracking | **Decided:** custom CRM module `Listing_Websites`, one record per micro-site | Removes Zoho Projects |
| Domain | **Decided:** `portfolio.<clientdomain>/<page>`, one Site per client, gallery at the root | One DNS record per client, none per order |
| Hosting term | Portfolio hosted while the client is active; pages archived by listing status | Per-page renewals are no longer needed |
| Revisions | One consolidated round included | Bounds producer time |
| Refunds | Full until production starts; none after the review link is sent | Must be shown before checkout |
| Who may order | Named coordinator addresses, not `@domain` entries | Spending authority |
| Lead path and retention | Basin to the agent's inbox; retention set in Basin; named in the privacy page | Privacy law |
| Pilot economics | Pilot orders paid at the proposed price | Willingness to pay is the question |

## Summary of changes made in the improved PRD

| v1 area | v2 disposition |
| --- | --- |
| Product decision, packages | Kept; Development becomes quote-only; positioned as the ad-campaign destination; one portfolio Site per client with a gallery at `portfolio.<clientdomain>` (owner decision) |
| FR01 to FR03 ordering and payment | Kept; provider named; intake-then-pay; JSON order file plus CRM record plus Stripe |
| FR04 resume after payment | Cut (not needed once intake precedes payment) |
| FR05 client review | Kept, moved into the app under `/c/<slug>/orders/<id>` |
| FR06 Zoho Projects tasks | Cut (owner decision); one record per micro-site in the custom CRM module `Listing_Websites`, stage written by the app |
| FR07 durable jobs, workers, audit log | Cut; one webhook, idempotent by event id, plus an order history array |
| FR08 access and fetch controls | Kept, made concrete for this codebase |
| FR09 team access to Sites | Moved to Gate 0 |
| FR10 to FR14 agents and assets | Cut; REALTOR.ca prefill reused; folder link stored, not processed |
| Research budget (SEO study) | Cut |
| FR15 to FR16 triggers and team-initiated build | Team-initiated build kept as the only path; triggers cut |
| Proof of concept for automation | Cut; one line under "Later" |
| State transitions | Reduced to six states |
| FR17 to FR18 template | Kept, platform-agnostic |
| FR19 to FR20 forms | Kept, simplified to Basin with Turnstile enabled; no proxy |
| FR21 to FR23 SEO, schema, privacy | Reduced to template hygiene; privacy page names the actual processors |
| FR24 QA gate | Split into template qualification (once) and per-site checklist |
| FR25 to FR27 launch | GA4 and Rybbit snippets in the template; no per-site property or Search Console work; notifications by CRM workflow |
| FR28 lifecycle | Kept: sold, renewal, archive, deletion, portability |
| Delivery plan | Gate 0 first; MVP in one slice; pilot of six; Phase 2 items each tied to a measured trigger |
| Success measures | Business numbers added; go/no-go thresholds defined |
| Decisions and discovery | Table with defaults and owners |
