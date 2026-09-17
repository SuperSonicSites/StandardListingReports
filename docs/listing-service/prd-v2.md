# Listing Landing Page Service

> **Superseded on 15 September 2026** by the production plan (current: [production-plan-v3.3.md](production-plan-v3.3.md)), which absorbed this PRD and the owner's later decisions (per-route hosting subscriptions, checkbox agreement, unlisted staged review, email-only communication, WorkDrive assets, one Rybbit site and one Basin form per portfolio). Kept for the reasoning behind the requirements.

**Product requirements document, version 2.1 (draft for approval)**
Supersonic Realtors | 15 September 2026 | Supersedes v1.0
Revision 2.1 applies the owner's decisions of 15 September: a custom Zoho CRM module per website, one `portfolio.<clientdomain>` per client with each micro-site as a path, the portfolio root as a gallery, ChatGPT Sites as the platform, and Stripe Checkout for payment.
Companion: [red-team-report.md](red-team-report.md) explains every change from v1.

Status legend for requirements: **MUST** ships in the MVP; **SHOULD** ships in the MVP unless it costs more than a day; **LATER** is listed in section 13 with the evidence that would justify it.

---

## 1. Product decision

Sell fixed-scope **listing micro-sites** through the existing Supersonic app at supersonicrealtors.com.

Each client gets one **portfolio site** on ChatGPT Sites, reached at `portfolio.<clientdomain>` (for example `portfolio.stonesisters.com`), set up once. Its root is a gallery of the client's micro-sites. Every order adds one micro-site as a page inside that portfolio site, at `portfolio.<clientdomain>/<page-slug>`, and a card in the gallery.

A signed-in client fills in one intake form, pays on Stripe's hosted checkout page, and receives a confirmation that already shows the page's future address. The app files one record per micro-site in a custom Zoho CRM module under the client's Account, exactly as Listing Ads files its records today. The Supersonic team builds the page by hand from the portfolio's template, the client approves a named version from a link in the app, and the team deploys.

Nothing in production is automated in this version. Automation is added in section 13 only when the pilot measures a step as repetitive and expensive. The software change is small: one order form, one payment integration, one CRM record, one status page, one admin page, and four emails.

The Development package (shared amenities plus units) is sold by quote through the same form and built by hand until three have been delivered.

## 2. Problem and positioning

- Clients already order ad campaigns through the portal (`/c/<slug>/ads`). Every campaign needs a destination page, and the CRM field for it (`Listing_Ads.Destination_URL`) is filled by staff today because nothing reliable exists at order time. With a per-client portfolio, the micro-site address is known the moment the order is placed, before the page exists.
- The portfolio is a marketing asset the client keeps: every active listing in one place on their own domain, with the option of a sold section as a track record.
- The micro-site lives under the client's domain, so its traffic can be tracked by the client's existing Rybbit site. The seller report generator already resolves a listing's page by MLS number or address slug in Rybbit, which means micro-site views can appear in the seller report without any new integration. Gate 0 confirms this.
- The offer is fixed-scope and prepaid so that producer time is predictable.

**Assumption to confirm before sale:** at least two of the three current clients say yes to the proposed price when asked by email. If neither does, stop here.

## 3. Goals and non-goals

**Goals**
1. A returning client can order and pay in under five minutes.
2. Intake is completed in one sitting and the producer never has to email the client for missing basics.
3. Every deployed page is tied to an approval of a named version by a named person.
4. A client's portfolio is set up once, in a measured number of hours, and never needs per-order domain or DNS work.
5. The cost of each order (producer minutes, fees, platform cost) is recorded so the price can be set on evidence.
6. No client can see, order for, or approve anything belonging to another client.

**Non-goals for this version**
- Development pages online (quote only).
- A separate Site or a separate domain per listing.
- AI research agents, automated fact extraction, or automated asset processing.
- Dropbox or Google Drive API integration.
- Zoho Projects, Zoho Cliq, GA4 Admin API, Search Console API, or Rybbit provisioning integrations.
- Unattended or agent-triggered builds and deploys.
- Per-site SEO campaigns or keyword research.
- Multi-language pages, custom design, full brokerage websites, IDX or MLS synchronization, inventory feeds, listing syndication, unlimited revisions.

## 4. The offer

### 4.1 Portfolio setup (once per client)

Delivered by the team before the client's first order is accepted: the portfolio Site created from the foundation; brand preset from the client profile (logo, colours, brokerage block); `portfolio.<clientdomain>` connected (one DNS record on the client's domain, done by the agency where it manages the client's DNS, otherwise sent to the client with instructions); gallery page; shared privacy and thank-you pages; analytics installed with the client's existing GA4 and Rybbit ids; a default Basin form; team editors invited; the template qualification (section 11.1) recorded.

Priced either as a one-time setup fee or included with the first order. Owner decides (section 14).

### 4.2 Single Listing micro-site (sold online)

Included: one property; hero; photo gallery (up to 30 photos); key facts; original description; location section with map embed; optional floor plan and video embed; agent block; mandatory brokerage identification block; inquiry form with spam protection; a card in the portfolio gallery; page title, description, canonical and social preview; analytics with a confirmed-lead event.

Address: `portfolio.<clientdomain>/<page-slug>`, where the slug is derived from the listing address and shown on the confirmation.

Revisions: **one consolidated round** after the first review. Further rounds are priced.

Not included: additional pages, copy beyond the listing description, print material, ad management (sold separately as Listing Ads), a separate domain.

### 4.3 Development micro-site (quote request)

The same form with the package set to Development creates the CRM record with state `quote_requested` and no checkout. The team replies with a quote by email. Nothing else changes in the app.

### 4.4 Commercial terms shown before checkout (proposed defaults, owner to approve)

| Term | Default |
| --- | --- |
| Price | CAD, set after two manual sales; taxes calculated at checkout |
| Production starts | When payment is confirmed. Intake is complete by construction, since payment is the last step |
| Delivery time | Not promised until the pilot has measured it; the page shows "we will email you when your review link is ready" |
| Refund | Full refund until production starts (state `paid`); none once the review link has been sent |
| Cancellation | Client cancels from the order page while state is `paid`; refund is issued in Stripe by an admin |
| Missing or unusable material | The producer emails the client; the order pauses in `in_production`; after 14 days without a reply the order is offered a refund minus the work done, at the owner's discretion |
| Hosting | The portfolio is hosted while the client is an active Supersonic client. There is no per-page hosting term and no per-page renewal |
| Sold, leased or withdrawn | Client marks it from the order page. Within two business days the team moves the card to the gallery's sold section (default: shown for 12 months) or removes it, per the client's choice |
| Archive | Archived pages leave the gallery and their address redirects to the gallery. Source material the team holds is deleted 90 days after archive |
| Portability | The portfolio's source is kept in the agency's Git organisation. A static export is provided on request. The portfolio is not transferable to another host as a running site |

## 5. Customer journey

0. **Portfolio setup** (team, once per client): the admin records `portfolio_host` on the client profile; the team builds and connects the portfolio Site (section 10.1). Until then the portal card reads "Not set up yet", like the ads card.
1. **Portal** (`/portal`): the card "Order a Listing Page" appears when the profile has a Zoho Account ID and a portfolio host, and Stripe is configured on the server.
2. **Order form** (`/c/<slug>/site`): package, listing details, photos link, agent and lead recipients, extras, rights confirmation. Prefilled from the client profile where the profile knows the answer. The form shows the address the page will have.
3. **Review and pay**: a summary of what was entered, the price and the terms, then a "Pay" button that sends the client to Stripe Checkout.
4. **Confirmation** (`/c/<slug>/orders/<id>`): "Paid, in the queue", the reference, the future page address, and what happens next. A confirmation email goes to the purchaser and the client's coordinator list.
5. **Production** (human): the producer picks up the CRM record, adds the page and its gallery card to the portfolio in a candidate version, runs the per-page checklist, and pastes the review link into the admin order page. The client gets a "your page is ready to review" email.
6. **Review**: the client opens the order page, views the review link, and either approves the named version or requests changes in one message (the included round). Both actions are recorded with who and when.
7. **Deploy**: the team deploys the approved version of the portfolio and records the live URL. The client gets a "your page is live" email. The Listing Ads record for the same listing, if any, gets the destination URL.
8. **Lifecycle**: the client marks the listing sold or withdrawn from the order page; the team updates the gallery; archive follows the terms.

### Example: Client X orders a micro-site

Client X's portfolio at `portfolio.clientx.com` was set up last month. Client X signs in, opens "Order a Listing Page", pastes the REALTOR.ca share link, presses "Fetch listing details", and the address, MLS number, list date and first photo appear. The form shows the page will live at `portfolio.clientx.com/985-academy-way-unit-208`. They add the price, beds, baths, area, three selling points, the Dropbox folder link, the agent's name and phone, and the two email addresses that should receive leads. They tick the rights confirmation, review the summary, pay by card, and see the confirmation. The team gets the CRM record and an email, and points last week's ad campaign at the future address. Two days later Client X receives the review link, asks for one photo to be swapped, approves version 2, and the team deploys. The gallery now shows the new listing first.

## 6. Requirements

### A. Ordering and payment

- **R1 (MUST)** The order form is available only to a signed-in email that the client's profile lists, on `/c/<slug>/site`. The middleware's existing client scoping applies to every page under `/c/<slug>/`; the API routes authorize inside the route after reading `client_slug` from a JSON body, as `/api/listing-ad` does.
- **R2 (MUST)** The CRM Account for the order is the profile's `zoho_account_id` and the page host is the profile's `portfolio_host`. Neither is ever read from the request. Without both, the portal card and the form say "Not set up yet".
- **R3 (MUST)** Submitting the form creates an order file in state `draft`, assigns a page slug (the address through the existing `slugify`, cut to 60 characters, made unique among the client's orders with a numeric suffix, admin-overridable before production), computes the expected live URL from the host and slug, and returns a Stripe Checkout URL. The order id is generated server-side, passes `assertSafeId`, and is carried to Stripe as `client_reference_id` and in `metadata.order_id` with `metadata.client_slug`.
- **R4 (MUST)** Payment is confirmed server-side only. Two paths, both idempotent on the order file: (a) when the client returns to the order page with the Checkout session id, the server retrieves the session with the secret key and marks the order `paid` if `payment_status` is `paid`; (b) the Stripe webhook does the same for clients who close the tab. A browser redirect alone never marks an order paid.
- **R5 (MUST)** The webhook verifies the `Stripe-Signature` header over the raw request body with the endpoint secret, rejects timestamps older than five minutes, and answers 200 for events it has already applied (event id stored on the order). The webhook path is on the middleware's open list and accepts nothing else.
- **R6 (MUST)** A second "Pay" click on a draft with an unexpired Checkout session returns the same session. A session that has expired is replaced. A paid order cannot be paid again because the form is no longer offered for it.
- **R7 (MUST)** Marking an order `paid` triggers, in order: write the order file; create the CRM record; send the confirmation emails. A CRM or email failure is recorded on the order (`needs_crm`, `needs_email`) and shown on the admin page with a retry button; it never un-pays the order and never fails the webhook response.
- **R8 (MUST)** Refunds and cancellations are done by an admin in the Stripe dashboard, then recorded on the admin order page as state `cancelled` with a note. The app does not call refund APIs in this version.
- **R9 (SHOULD)** The price shown on the form is read from the Stripe Price object (cached ten minutes) so there is one source of truth. If the read fails, the form shows "price at checkout".

### B. Intake

- **R10 (MUST)** Required fields: package; REALTOR.ca member share link (same validator as the ads form) or, when the listing is not on REALTOR.ca, the address and MLS number typed; listing price; beds; baths; area (with unit); property type; photos folder link (Dropbox or Google Drive, host validated); agent name, email and phone; lead recipient emails (one to five); rights and compliance confirmation (checkbox, stored with a timestamp).
- **R11 (SHOULD)** Optional fields: up to five selling points (60 characters each); floor plan or brochure link; video URL; hero photo preference (free text, 200 characters); target launch date (informational); notes (2000 characters).
- **R12 (MUST)** Prefill from the client profile: brokerage name, address and contact, logo, brand colours, website, portfolio host. The client sees them read-only with "wrong? email us", so listing orders never overwrite profile data.
- **R13 (MUST)** "Fetch listing details" reuses the existing REALTOR.ca capture to prefill address, MLS number, list date and first photo from the share link. Every prefilled value stays editable. A failed fetch shows a warning and the client types the values; it never blocks the order.
- **R14 (MUST)** The intake is the fact sheet. At approval time (R27) the intake as it stands is copied into `facts_approved` on the order and frozen; the page is built from that copy, and later edits to the intake do not change it. This is the app's snapshot principle applied to orders.
- **R15 (MUST)** Character caps mirror the Listing Ads limits (URLs 450, notes 2000, address 255). Anything that is not a string becomes empty. Validation rules live in one browser-safe module shared by the form script and the route, as `src/lib/listing-ads.ts` does.
- **R16 (MUST)** Folder links, video links and brochure links are stored and shown to the producer. The server never fetches them.

### C. Portfolio site and micro-site production (human, from a runbook)

- **R17 (MUST)** One ChatGPT Site per client, connected once to `portfolio.<clientdomain>`. Every micro-site is a route in that Site. No per-listing Sites and no per-listing domains.
- **R18 (MUST)** The gallery at the portfolio root shows a card for every live micro-site (hero, address, price, beds and baths, status badge), newest first, and a sold section per the client's choice. The gallery change ships in the same candidate version as the page it concerns.
- **R19 (MUST)** One versioned foundation with two visual presets; each portfolio's template is the foundation plus the client's preset. Facts render from the approved record; missing optional content removes its section cleanly. Because a portfolio is one Site, a foundation update applies to every page in that portfolio on its next deploy. This replaces v1's rule that live pages never inherit updates: the per-page checklist therefore includes a smoke test of the gallery and one previously live page, and foundation updates are deployed on their own, never bundled with a client's new page.
- **R20 (MUST)** The brokerage identification block (name, address, contact, from the profile) is present on every micro-site and on the gallery and cannot be removed by a preset.
- **R21 (MUST)** Copy is original, written from the approved facts. No pasted listing remarks. No invented awards, testimonials, distances, school claims, completion dates or prices. Prices and availability carry a date. The agency's existing copy checks (no em dashes, banned phrases, Canadian spelling) run before review.
- **R22 (MUST)** The inquiry form posts directly to a Basin form whose recipients are the lead emails from the order; Turnstile is enabled in Basin's settings and validated by Basin. No proxy. Hidden fields carry the order id for context only; recipients are never chosen by a field the browser can edit. One Basin form per micro-site; if the Basin plan caps forms, one per client with the order id as context and the client's default recipients. The shared thank-you page is `noindex`.
- **R23 (MUST)** The portfolio carries the client's existing GA4 measurement id and Rybbit site id from the profile, and fires a confirmed-lead event on the thank-you page. Names, emails, phone numbers and messages are never sent to analytics.
- **R24 (SHOULD)** Per-route hygiene: unique title and description, canonical URL, Open Graph image and text, alt text on images, robots rules, favicon; a real 404 and a sitemap where Sites allows them (Gate 0 decides). Structured data for the listing is included only if it validates.
- **R25 (MUST)** Deploy discipline: one candidate version at a time per portfolio; every deploy publishes the whole portfolio; the version label is recorded on the order before deploy; rollback is a redeploy of the previous version, and the previous label is noted on the order.

### D. Review and approval

- **R26 (MUST)** `/c/<slug>/orders/<id>` shows the order's state, summary, the future or live address, the review link when set, and the history (who did what, when). While `in_review` it offers "Approve version <label>" and "Request changes" (one message, 1000 characters). "Request changes" moves the order back to `in_production` and increments `revision_count`; the included allowance is one.
- **R27 (MUST)** Approval records the version label the admin entered, the approver's email and the time. The admin deploys only that version, then records the live URL.
- **R28 (MUST)** The client previews a candidate one of two ways, decided at Gate 0: (a) as an invited external viewer of the saved, undeployed version, if Sites supports that; otherwise (b) the page is deployed unlisted at its final address with `noindex` and no gallery card until approval, and "deploy" then means adding the card and removing `noindex`. Under (b) the terms tell the client that the review address is reachable by anyone who has it.
- **R29 (MUST)** `/c/<slug>/orders` lists that client's orders. Admins see every client's orders on the dashboard, grouped by state.

### E. Admin

- **R30 (MUST)** `/admin/orders/<id>`: change state, override the page slug before production, paste the review URL, the live URL and the version label, record producer minutes (build, QA) and notes, retry CRM or email, mark cancelled. Every change appends to the order history.
- **R31 (MUST)** Every state change and every listing-status change the app makes is mirrored to the CRM record. The mirror is best effort and its failure is flagged on the admin page; the app is the source of truth.

### F. Lifecycle

- **R32 (MUST)** Listing status (`active`, `sold`, `leased`, `withdrawn`) is separate from order state. The client sets it from the order page and chooses "keep in the sold section" or "remove". The team updates the gallery within two business days and records it.
- **R33 (MUST)** Archive: an order moves to `archived` when the client asks for removal, or 12 months after it was marked sold (default), or when the client stops being a Supersonic client. The address redirects to the gallery. Source material the team holds is deleted 90 days later. The terms say so.
- **R34 (SHOULD)** Portability: on request, the client receives a static export of the micro-site. The terms state that the portfolio is hosted by the agency and is not transferable as a running site.

### G. Security, privacy and tenancy

- **R35 (MUST)** Every new API route accepts JSON only and checks `canAccessClient` after reading the slug, because origin checking is disabled app-wide and the content type is the CSRF control.
- **R36 (MUST)** The purchaser's email is stored on the order and receives every order email, together with the profile's coordinator list. Clients who can order should list named addresses rather than `@domain` entries; the admin form explains this.
- **R37 (MUST)** Card details are entered only on Stripe's hosted page. The app stores the session id, payment intent id, amount, currency and time; never card data.
- **R38 (MUST)** Server-side fetches are limited to the existing REALTOR.ca capture and Stripe's API. No other URL from the order is retrieved by the server.
- **R39 (MUST)** Order creation is throttled per client (20 per day, in memory, like the login throttle) so an abusive session cannot fill the volume with drafts.
- **R40 (MUST)** Logs carry order ids, states and HTTP statuses. No links, emails or intake content in logs, following `src/lib/zoho.ts`.
- **R41 (MUST)** Leads go from Basin to the lead emails on the order. Basin's retention is set to the agreed period. The portfolio's privacy page names Basin, Google Analytics and Rybbit as processors and states the retention period. PIPEDA and BC PIPA wording is reviewed by the owner once, for the foundation.
- **R42 (MUST)** The rights confirmation text names photos, floor plans and video, and states that the client is responsible for their brokerage's advertising rules. It is stored with a timestamp on the order.
- **R43 (MUST)** `portfolio_host` is validated as a bare hostname (letters, digits, dots, hyphens) when the admin saves the profile, so it can never inject a scheme, path or credentials into the addresses the app displays.

### H. Operations

- **R44 (MUST)** Records of record: Stripe for money; Zoho CRM for the micro-site and its stage (every intake field mirrored); the app's order file for intake, approvals and history; Git for the portfolio source. The runbook gains a recovery step: if the volume is lost, orders are re-entered from CRM and payments checked in Stripe.
- **R45 (MUST)** Boot logs state whether the Stripe variables are set, in the style of the `[auth]` and `[mail]` lines.
- **R46 (MUST)** A runnable check exercises the order route and the webhook against a fake Stripe and a fake CRM, like `npm run check:listing-ad`.
- **R47 (SHOULD)** Team notifications (new paid order, changes requested, approved, listing status changed) are CRM workflow rules to email or Cliq, configured in Zoho, not code.

## 7. Implementation map (this codebase)

Reuse first. Every item below copies an existing pattern.

| Piece | Where | Pattern it copies |
| --- | --- | --- |
| `SiteOrder` type; `portfolio_host` and optional `portfolio_site_id` on `ClientProfile` | `src/lib/types.ts` | `ClientProfile` optional integration ids |
| `readOrder`, `writeOrder`, `listOrders`, `createOrderId` | `src/lib/storage.ts` | snapshots (`data/orders/<id>.json`, atomic write, `assertSafeId`) |
| Order rules (packages, limits, normalize, validate, page slug) | `src/lib/site-orders.ts` | `src/lib/listing-ads.ts` (browser-safe, shared) and `slugify` |
| Stripe client: create session, retrieve session, verify webhook signature, read a Price | `src/lib/stripe.ts` | `src/lib/mail.ts` (plain fetch, no SDK, env via `process.env ?? import.meta.env`) |
| Order form page and script | `src/pages/c/[clientSlug]/site.astro`, `src/scripts/site-order-form.ts` | the ads form and `ads-form.ts` (submission id, locked pending state, sessionStorage) |
| Create order and checkout | `src/pages/api/site-order.ts` | `src/pages/api/listing-ad.ts` (JSON only, self-guarded, `canAccessClient`) |
| Webhook | `src/pages/api/stripe-webhook.ts` | new; added to the middleware `OPEN` list |
| Client order pages | `src/pages/c/[clientSlug]/orders/index.astro`, `[orderId].astro` | report pages; middleware `clientMatch` already covers the path |
| Client actions (approve, request changes, listing status, cancel) | `src/pages/api/site-order-action.ts` | `listing-ad.ts` |
| Admin order page and route | `src/pages/admin/orders/[orderId].astro`, `src/pages/api/order-admin.ts` | `admin/clients/[slug]/edit.astro` and `api/client.ts` (form POST, flash) |
| Admin client form: portfolio host field with hostname validation | `src/components/ClientForm.astro`, `src/pages/api/client.ts` | `dashboard_url` handling |
| Dashboard orders panel | `src/pages/index.astro` | client grid |
| Portal card | `src/pages/portal.astro` | the ads card, gated on `zoho_account_id`, `portfolio_host` and Stripe configured |
| Emails | `src/lib/mail.ts` gains a generic `sendMail` used by `sendSignInLink` and the four order emails | existing template |
| CRM record and stage mirror | `src/lib/zoho.ts` gains `updateRecord`; module `Listing_Websites` (created in the CRM UI) | `createRecord` |
| REALTOR.ca prefill | a small `api/listing-details.ts` that calls `src/lib/realtor.ts` | existing |
| Check script | `scripts/check-site-order.mjs` | `scripts/check-listing-ad.mjs` |
| Middleware | `OPEN` adds the webhook; `SELF_GUARDED` adds the three new API routes | existing |

Outside this repo: one Git repository per client portfolio under the agency's GitHub organisation, holding the Site's source project so that Sites can associate each saved version with a commit and the source stays portable.

New environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SINGLE`, `STRIPE_PRICE_SETUP` (if the setup is a separate SKU). Prices live in Stripe, not in code.

No new npm dependency. Estimated size: about 1,300 lines across the files above, two to three focused days, plus one day of Stripe test-mode and CRM sandbox verification, plus the foundation, runbook and Gate 0 work, which is not software.

**States:** `draft` → `paid` → `in_production` → `in_review` → `live` → `archived`; `cancelled` is reachable from `draft`, `paid`, `in_production` and `in_review`; `quote_requested` is terminal in the app for Development orders. Transitions: Stripe (`draft`→`paid`); admin (`paid`→`in_production`, `in_production`→`in_review`, `in_review`→`live` after approval, `live`→`archived`, any→`cancelled`); client (`in_review`→`in_production` via "request changes"; approval sets `approval` without leaving `in_review`; listing status changes do not change state).

## 8. Data model

One file per order, `data/orders/<id>.json`, on the volume, gitignored like snapshots.

```json
{
  "id": "ord-1757955000000-3f9a1c2b",
  "client_slug": "stone-sisters",
  "purchaser_email": "coordinator@stonesisters.com",
  "package": "single",
  "state": "paid",
  "listing_status": "active",
  "page_slug": "985-academy-way-unit-208",
  "expected_url": "https://portfolio.stonesisters.com/985-academy-way-unit-208",
  "created_at": "2026-09-15T18:10:00Z",
  "updated_at": "2026-09-15T18:14:30Z",
  "intake": {
    "realtor_url": "https://member.realtor.ca/Reports/ListingDestination/...",
    "address": "985 Academy Way Unit 208, Kelowna, BC",
    "mls_number": "10345678",
    "list_date": "2026-09-01",
    "listing_price": "749900",
    "beds": "2", "baths": "2", "area": "1180", "area_unit": "sqft",
    "property_type": "Condo",
    "selling_points": ["Corner unit", "Lake view", "Two parking stalls"],
    "photos_url": "https://www.dropbox.com/scl/fo/...",
    "floor_plan_url": "", "video_url": "",
    "hero_preference": "The lake view photo",
    "agent": { "name": "Jane Stone", "email": "jane@stonesisters.com", "phone": "+1 250 555 0100" },
    "lead_emails": ["jane@stonesisters.com", "leads@stonesisters.com"],
    "target_date": "2026-09-25",
    "notes": "",
    "rights_confirmed_at": "2026-09-15T18:12:05Z"
  },
  "facts_approved": null,
  "payment": {
    "provider": "stripe",
    "session_id": "cs_test_...",
    "session_expires_at": "2026-09-16T18:12:00Z",
    "payment_intent": "pi_...",
    "amount_total": 0, "currency": "cad",
    "paid_at": "2026-09-15T18:14:30Z",
    "event_id": "evt_..."
  },
  "crm": { "module": "Listing_Websites", "record_id": "3201000004321000", "synced_at": "2026-09-15T18:14:35Z", "error": "" },
  "production": { "review_url": "", "live_url": "", "version_label": "", "previous_version_label": "", "basin_form_id": "", "revision_count": 0, "producer_email": "", "build_minutes": 0, "qa_minutes": 0, "notes": "" },
  "approval": { "version_label": "", "by": "", "at": "" },
  "needs_crm": false, "needs_email": false,
  "history": [
    { "at": "2026-09-15T18:10:00Z", "by": "coordinator@stonesisters.com", "from": "", "to": "draft" },
    { "at": "2026-09-15T18:14:30Z", "by": "stripe", "from": "draft", "to": "paid" }
  ]
}
```

Client profile additions: `portfolio_host` (bare hostname, for example `portfolio.stonesisters.com`), `portfolio_site_id` (optional, the Site's identifier for the team's reference), and, if the client's GA4 measurement id is not already known to the team, `ga4_measurement_id`. The existing `rybbit_site_id` is reused.

CRM module `Listing_Websites` (created in the Zoho CRM UI; API names verified against live metadata before mapping, as was done for `Listing_Ads`): `Name` (address plus day), `Brokerage` (lookup, from the profile only), `Order_ID`, `Purchaser_Email`, `Package`, `Stage` (picklist mirroring the app states), `Listing_Status`, `Listing_Address`, `MLS_Number`, `Realtor_Stats`, `Photos_Link`, `Agent_Name`, `Agent_Email`, `Agent_Phone`, `Lead_Emails`, `Page_URL`, `Payment_Reference`, `Amount_Paid`, `Review_URL`, `Approved_Version`, `Basin_Form`, `Build_Minutes`, `QA_Minutes`, `Revision_Count`, `Notes`. The portfolio itself is described on the client profile; if the team wants it in CRM too, two fields on the Account (`Portfolio_Host`, `Portfolio_Site`) are enough.

## 9. Gate 0: ChatGPT Sites qualification (before any code)

The platform is decided. Gate 0 therefore inventories what Sites can do for this product and strikes, in writing, every requirement it cannot meet. Build one portfolio Site by hand with a gallery and two listing routes from realistic material, connect a test subdomain, and record pass, fail or not available for every line in `docs/listing-service/platform-qualification.md`.

| # | Check | Decides |
| --- | --- | --- |
| 1 | One Site serves the gallery and many listing routes under one custom subdomain (`portfolio.<clientdomain>`), with HTTPS; the DNS steps are written down | R17; the onboarding checklist |
| 2 | The workspace plan supports custom domains (the docs exclude Enterprise at launch) and the beta "plan-specific usage limits" are known in numbers: Sites per workspace, storage, requests, bandwidth | Pricing, capacity |
| 3 | Third-party scripts load: GA4, the Rybbit snippet, the Turnstile widget | R23, R22 |
| 4 | A form posts directly to Basin and Basin's Turnstile check passes; a submission reaches the recipients | R22 |
| 5 | The client can preview a saved, undeployed version as an invited external viewer; if not, the unlisted-route approach works (route reachable, `noindex`, no gallery card) | R28 |
| 6 | Save a named version, deploy it, roll back to the previous one; time each step; confirm a deploy of one new page leaves an existing page byte-identical | R25, R19 |
| 7 | Unknown routes return HTTP 404 (`curl -I`); per-route title, description, canonical, Open Graph, `noindex`; robots and sitemap control | R24 |
| 8 | Thirty photos on one listing: upload, responsive sizes, gallery on a phone; where the images live (the docs mention R2 storage) and what it costs | Gallery scope |
| 9 | Build model: static (the producer adds a page per order) versus data-driven (listings stored in the Site's database, the docs mention D1; pages and gallery rendered from rows). Time both for one listing | Section 10.2 and the 30-minute question |
| 10 | Source portability: a local source project in Git per portfolio; whether Sites associates versions with commits as documented; whether the source could run elsewhere if Sites changed terms | R44, continuity |
| 11 | Editor invitations for every producer on one Site; what happens to the Site if the owning seat changes | Team access, continuity |
| 12 | Lighthouse mobile with GA4 and Rybbit installed, three runs; record the median | The honest performance target |
| 13 | Rybbit: the client's existing site id records visits on the portfolio subdomain, and the seller report generator's listing lookup finds the micro-site path by MLS number or address slug | Section 2, third bullet |
| 14 | Minutes to add one listing page and its gallery card by hand, by a producer who did not build the foundation | The 30-minute question |

Decision rule: lines 1, 3, 4 and 6 must pass, or the product is redesigned before any code. Line 5 must yield one working preview method. A fail on line 7 strikes the matching part of R24 explicitly. Line 9 chooses the build model. Line 13 decides whether the seller report loop is promised or left out of the positioning.

## 10. Runbooks (outline; the full runbooks are written after Gate 0)

### 10.1 Portfolio setup (once per client)

1. Admin adds `portfolio_host` to the client profile.
2. Create the portfolio Site from the foundation; apply the client's preset from the profile (logo, colours, brokerage block, website link).
3. Add the DNS record on the client's domain (agency-managed DNS, or send instructions to the client) and connect the subdomain in Sites; confirm HTTPS.
4. Install analytics with the client's GA4 measurement id and Rybbit site id; verify a page view and the lead event arrive.
5. Create the client's default Basin form; enable Turnstile.
6. Publish the gallery (empty state allowed), privacy and thank-you pages.
7. Invite the producers as editors; record the Site identifier on the profile.
8. Run the template qualification (11.1) on the gallery and one sample listing route; record it.
9. Create the Git repository for the portfolio source.

### 10.2 Micro-site (per order)

1. Open the CRM record or the admin order page; read the approved facts, the page slug and the links.
2. Download the photos from the client's folder; pick the hero per the client's preference.
3. Add the listing route at the page slug; fill facts, agent block and brokerage block from the order; write the description from the selling points and facts; run the copy checks.
4. Create the Basin form for the order with the lead emails as recipients; enable Turnstile; connect the form; test one submission to the real recipients and confirm receipt; record the form id on the order.
5. Add the gallery card. Save the candidate version with a label.
6. Run the per-page checklist (11.2) and record minutes.
7. Set up the client preview per R28; paste the review link and version label into the admin order page; set state `in_review`.
8. On approval, deploy that version, record the live URL, set `live`, and fill the Listing Ads destination URL if a campaign exists. On "request changes", make the changes, bump the version label, back to `in_review`.
9. On a listing status change, update the card (sold badge or removal) in a new labelled version and deploy.

## 11. Quality

### 11.1 Template qualification (once per foundation version, on each new portfolio)

Run and record the full gate from v1 FR24 on the gallery and one sample listing route: 320, 375, 390, 768, 1024 and 1440 CSS-pixel widths plus intermediate resizing; current Chrome, Firefox, Edge and Safari including real iOS Safari; keyboard navigation, focus states, labels, contrast, zoom, reduced motion, sticky elements, layout shift; form validation and failure handling; metadata, canonical, headings, alt text, robots, favicon, social preview; three Lighthouse mobile runs with tracking installed. Store the result as `docs/listing-service/template-qa-<foundation-version>-<client>.md`. A foundation change invalidates the record.

### 11.2 Per-page checklist (every order)

1. Every link, phone link, email link and anchor works.
2. Facts on the page match `facts_approved`.
3. No placeholder text or images; no em dashes or banned phrases.
4. Brokerage block present and correct.
5. Photos: hero as requested, gallery complete, no low-resolution stretch.
6. Form: one real submission delivered to every lead recipient; Turnstile active; thank-you page shown; thank-you `noindex`.
7. Analytics: page view and lead event received in GA4 and Rybbit; no PII in event payloads.
8. Title, description, Open Graph preview (check with a link preview tool).
9. Phone width (375) and desktop (1440) visually checked.
10. One Lighthouse mobile run at or above the template's recorded median minus five points.
11. The page is at the expected address under `portfolio.<clientdomain>`, over HTTPS.
12. Gallery card present with the right hero, address, price and status; gallery order correct.
13. Smoke test of one previously live micro-site in the same candidate version: it renders and its form still submits.
14. Review link works per R28; version label and previous version label recorded on the admin page; minutes recorded.
15. Deploy only after approval of the recorded version; live URL recorded.

## 12. Pilot and success measures

**Gate 1 (commercial):** two of the three current clients agree to buy at the proposed price, by email, before the build starts.

**Pilot:** portfolio setup for two clients, then six paid orders at the list price across those clients, covering a normal listing, a listing not on REALTOR.ca, a folder link that does not open, a request for changes, a cancellation with refund, a listing marked sold after launch, and a repeat order for the same client. Plus these tests, done by the team, not clients: a signed-in client opening another client's order page and API (expect 403); a replayed webhook event (expect 200, no change); a forged webhook signature (expect 400); a double click on Pay (expect the same session); a webhook that arrives before the client returns and one that arrives after; a foundation update deployed to a portfolio with two live pages (expect both unchanged in content).

| Measure | Target | How measured |
| --- | --- | --- |
| Portfolio setup | measured in hours per client; target set after the pilot | runbook 10.1 log |
| Order and pay time, returning client | median under 5 minutes | form open to `paid` timestamps |
| Intake completeness | at least 5 of 6 orders need no clarification email | producer log |
| Producer minutes (build plus QA), single listing | measured; the owner sets the target after the pilot; 90 minutes is the working assumption | admin order page |
| First-review approval | at least 4 of 6 approved after one round | `revision_count` |
| Lead delivery | 6 of 6 verified to the real recipients | checklist item 6 |
| Deploy safety | 0 deploys that changed another live page | checklist item 13, foundation test |
| Isolation and payment safety | all tests above pass | test log |
| Gross margin per order | at or above the owner's threshold (60 percent is the placeholder) | price minus Stripe fees, producer minutes at the loaded rate, platform cost share |
| Time to live | measured; reported as median business days | timestamps |

**Go or no-go:** go when every safety test passes, leads were delivered on all six, no deploy touched another page, at least four were approved in one round, the margin threshold is met, and at least two clients paid the list price. No-go on any safety failure. Otherwise, fix the specific miss and re-run the affected orders; do not add automation to fix a process problem.

## 13. Later: automation candidates and the evidence that unlocks each

| Candidate | Build it when |
| --- | --- |
| Data-driven portfolio (listings as rows in the Site's database, gallery and pages rendered from them) | Gate 0 line 9 shows it is workable and the static path costs more than 30 producer minutes per order |
| Prefill more facts from the REALTOR.ca share page (price, beds, baths) if the page exposes them | producers or clients spend more than 5 minutes per order retyping facts |
| Folder link check (opens, file count, obvious low resolution) | more than 1 in 5 orders has an unusable folder |
| Basin form creation through its API (Growth plan or above) | producers spend more than 10 minutes per order on forms |
| Refund and cancellation through the Stripe API | more than one refund a month |
| Listing status changes applied by scheduled job or by the client directly | more than 20 live micro-sites |
| Development package with a unit model | three developments built by hand and the varying fields are known |
| Per-client sold archive page with filters | a client asks for it |
| Per-route structured data and Search Console | organic search is measured as a meaningful lead source on live pages |
| Agent-assisted builds | Gate 0 shows the platform is scriptable and the vendor's trigger API can return results (today it cannot) |

## 14. Decisions

Decided on 15 September 2026:

| Decision | Outcome |
| --- | --- |
| Tracking | Custom Zoho CRM module, one record per micro-site; no Zoho Projects |
| Domains | One `portfolio.<clientdomain>` per client; each micro-site a path under it; no per-listing domains |
| Gallery | The portfolio root lists the client's micro-sites |
| Platform | ChatGPT Sites; Gate 0 qualifies it rather than compares it |
| Payment | Stripe Checkout (hosted sessions, signed webhook, no SDK) |

Still required before build:

| Decision | Proposed default | Owner | Needed by |
| --- | --- | --- | --- |
| Intake before payment | Yes | Owner | Before build |
| Price for the micro-site; setup fee or included with the first order | After Gate 1 | Owner | Before sale |
| Stripe account and automatic tax | Agency account, tax on | Owner | Before build |
| Gallery scope | Active listings plus a sold section shown for 12 months | Owner, per client | Before Gate 0 |
| Preview method | Result of Gate 0 line 5 | Owner and producer | Before build |
| Build model | Result of Gate 0 line 9 | Owner and producer | Before build |
| Refund and cancellation wording | Section 4.4 | Owner | Before sale |
| Lead path and Basin retention | Agent inbox; 12 months | Owner | Before sale |
| Who may order | Named coordinator addresses | Owner, per client | Before sale |
| CRM module and fields | `Listing_Websites` as in section 8 | Owner | Before build |
| Pilot orders paid or comped | Paid | Owner | Before pilot |
| Privacy page wording | Reviewed once for the foundation | Owner | Before first launch |
| Who manages each client's DNS | Agency where it already does; otherwise the client with instructions | Owner, per client | Before portfolio setup |

**Technical discovery (one day, before build):** confirm the CRM OAuth token's scopes cover the new module or plan a re-mint that the REALTOR import Worker survives; confirm the Basin plan supports Turnstile and the number of forms expected; create the Stripe products, prices and test-mode keys and register the webhook endpoint; confirm the ChatGPT workspace plan supports custom domains; confirm a volume backup or accept the records-of-record recovery in R44.

## 15. Risks

| Risk | Mitigation |
| --- | --- |
| Sites cannot meet a requirement, or changes limits or terms during its beta | Gate 0 strikes what it cannot do before code; usage limits recorded in numbers; hosting promised only while the client is active; source in Git |
| One Site per client: a bad deploy touches every page in the portfolio | One candidate at a time (R25); smoke test of a live page in every candidate (11.2 item 13); foundation updates deployed alone; rollback by redeploying the previous label |
| Nobody buys at the price | Gate 1 before build |
| Payment confirmed but CRM or email fails | R7 flags and retries; the order is never lost |
| Volume loss | R44 records of record; CRM mirrors every field |
| Client disputes a deployed page | Approval of a named version by a named person, with history |
| Advertising rule breach | Mandatory brokerage block on every page and the gallery, rights checkbox, checklist item 4 |
| Lead lost or sent to the wrong person | Real-recipient test before review; recipients fixed in Basin, never chosen by the browser |
| Client DNS not under the agency's control delays setup | Onboarding checklist with client instructions; the portal card stays "Not set up yet" until the host resolves |
| Rybbit does not record the subdomain under the client's existing site | Gate 0 line 13; fall back to a second Rybbit site id on the profile and leave the report loop out of the positioning |
| Scope creep from "small" requests | One included revision round; everything else priced |

## Appendix A: v1 requirement map

| v1 | v2.1 |
| --- | --- |
| FR01 account from session | R1, R2 |
| FR02 display terms, server-side payment confirmation | R4, R5, section 4.4 |
| FR03 durable order, dedupe, declines do not start work | R3, R5, R6, R7 |
| FR04 resume after payment | Cut; intake precedes payment |
| FR05 client review, versioned approval, scoped links | R26 to R28 |
| FR06 Zoho Projects parent task and subtasks | Cut (owner decision); one `Listing_Websites` record per micro-site, R31 |
| FR07 durable jobs, workers, retries, audit log | Cut; R5, R7, history array |
| FR08 access, fetch validation, data not instructions | R35, R38, R39 |
| FR09 team access to the site platform | Gate 0 line 11; runbook 10.1 |
| FR10, FR11 research agents, best-effort access | Cut; R13 prefill only |
| FR12 original copy, no invented claims | R21 |
| FR13, FR14 Dropbox pipeline, asset records | Cut; R16 |
| Research budget (SEO study) | Cut |
| FR15 event-triggered research | Cut |
| FR16 team-initiated build | Section 10.2 |
| Proof of concept for automation | Section 13, last row |
| State transitions | Section 7 states |
| FR17 one foundation, presets | R19 |
| FR18 one page per site, no inherited updates, unit variants | R17, R19 (one Site per client makes inheritance the rule, with a smoke test); units deferred |
| FR19 Basin | R22 |
| FR20 Turnstile, proxy, hidden fields | R22 (no proxy) |
| FR21 SEO hygiene, 404 | R24, Gate 0 line 7 |
| FR22 structured data | R24 (conditional) |
| FR23 privacy template | R41 |
| Performance defaults | Template qualification 11.1 |
| FR24 evidence per version | 11.1 once per portfolio, 11.2 per page |
| FR25 GA4 and Rybbit, no PII | R23 |
| FR26 Search Console | Cut; section 13 |
| FR27 publish, verify, rollback, notify, uptime | R25, R27, checklist 15, R47 |
| FR28 sold, archive, retention | R32 to R34 |
| Phase one | Sections 7, 10, 12 |
| Phase two | Section 13 |
| Pilot targets | Section 12 |
| Decisions and discovery | Section 14 |
