# Seller Report Generator

A small, boring, white-label seller report generator for real estate marketing teams.

The product is simple:

```txt
Create client
Open client report form
Enter listing/report details
Review the frozen snapshot
Generate a branded PDF
```

The PDF is the product.

This is not a dashboard platform, CRM, analytics warehouse, social scheduler, billing
system, template marketplace, or Looker Studio clone. It is a report compiler.

## Run Locally

```txt
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:4321
```

Useful local routes:

```txt
/admin/clients/new
/c/stone-sisters/new
/reports/[snapshot_id]
```

PDF generation uses `puppeteer-core` with a locally installed Chrome or Edge.
If the browser is not in a standard location, set `CHROME_PATH`.

Generated snapshots are written to `data/snapshots` and are ignored by git.

Copy `.env.example` to `.env` for the integration credentials. Without
credentials, "Pull data" degrades to manual entry with a warning; set
`DEMO_MODE=1` to get fabricated numbers labeled `mock` for demos instead.

## Current Goal

v0.2: the report workflow is real end-to-end. "Pull data" hydrates the form from
Rybbit (listing page views) and Meta (organic Facebook/Instagram post views and
engagements); every metric stays a manually editable field, and a failed pull
degrades to a warning. The snapshot freezes the reviewed numbers, captions, and
images, and the PDF renders from the snapshot only.

## v0.1 Scope

v0.1 should do only this:

1. Create or define one client brand.
2. Open a client-specific report form.
3. Submit listing details and mock/manual metrics.
4. Save a frozen report snapshot.
5. Render a branded PDF from that snapshot.

No live analytics integrations are required for v0.1.

No production authentication is required for v0.1.

No database is required unless it is simpler than local files for the chosen
implementation.

## Product Shape

The eventual hosted app should support this flow:

```txt
Admin creates client
        |
App creates private client report endpoint
        |
Client fills report form
        |
App creates snapshot
        |
Client reviews/edit numbers
        |
App generates branded PDF
```

Example future client endpoint:

```txt
/c/stone-sisters/new
```

Private links or access controls can be added when the app moves beyond the
local demo. Client analytics access is delegated to us as part of the service,
so the system can use server-side credentials later, but those credentials should
never be exposed to the browser or stored in snapshots.

## Development Philosophy

This project follows lazy-dev, KISS, and YAGNI principles.

Before adding code or features, use this decision tree:

```txt
1. Does this need to exist?   -> no: skip it
2. Already in this codebase?  -> reuse it, don't rewrite
3. Stdlib does it?            -> use it
4. Native platform feature?   -> use it
5. Installed dependency?      -> use it
6. One line?                  -> one line
7. Only then: the minimum that works
```

Heavily inspired by
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

Prefer:

- boring code
- explicit data
- frozen snapshots
- manual fallback
- one good PDF template
- review/edit before final output

Avoid:

- speculative abstractions
- template builders
- workflow engines
- premature auth systems
- premature databases
- pretending APIs are perfect

## Build Order

Build in this order:

1. Form -> snapshot -> branded HTML.
2. Branded HTML -> PDF.
3. Local client creation or client config.
4. Review/edit screen.
5. Hosted client endpoint.
6. Persistent storage.
7. Real analytics integrations.

Do not build step 7 before step 2 is good.

## Preferred Stack

Current stack, kept deliberately light:

- Astro (SSR, `@astrojs/node` standalone) for the app and report pages
- JSON files under `data/` for client config and snapshots
- puppeteer-core + local Chrome/Edge for PDFs

Hosting (July 2026 decision): **Railway Hobby + a volume mounted at `/app/data`**.
The Cloudflare stack (Workers/D1/R2/Browser Rendering) is the v0.3 destination —
do not start that rewrite now.

## Deployment (Railway)

The code is host-agnostic; these are the moving parts:

1. Set the start command to `npm run start` **before** the first deploy
   (Railpack cannot infer it for `output: "server"`).
2. Service variables: `HOST=0.0.0.0`, `ADMIN_PASSWORD`, `META_SYSTEM_USER_TOKEN`,
   `RYBBIT_API_KEY`, `CHROME_PATH=/usr/bin/chromium`, and
   `RAILPACK_DEPLOY_APT_PACKAGES=chromium` (installs Chrome for the PDF route).
   The built server never loads `.env` — platform env vars are the only source.
3. Mount a volume at `/app/data`. Client profiles and snapshots are runtime
   data that live only on this volume (gitignored) — deploys never touch them.
   Create clients via `/admin/clients/new` after the first deploy.
4. Access: `/login` gates everything. `ADMIN_PASSWORD` opens the admin area
   and every client workspace; each client gets its own coordinator password,
   set in the admin form, that opens only `/c/<slug>/` and its reports. For
   defense in depth, Cloudflare Access on a custom domain can still be added
   in front.

## Core Concepts

### Client

A client represents one white-label brand.

Minimum useful fields:

```txt
slug
name
logo
brand colors
footer/contact text
brokerage disclaimer details
optional integration IDs (Meta page/IG account, Rybbit site)
```

Later, a client may also hold server-side integration settings for Rybbit, Meta,
or storage.

### Report Form

The client-facing form should collect:

```txt
address
listing URL
report start date
report end date
Facebook / Instagram post URLs
website views (pulled from Rybbit or entered manually)
Facebook views and engagements (pulled from Meta or entered manually)
Instagram views and engagements (pulled from Meta or entered manually)
post captions and images (pulled from Meta, reviewable before approval)
REALTOR.ca views, inquiries, showings, days on market (always manual)
notes
```

The form should be easy enough for a non-technical marketing coordinator to use.

### Snapshot

The snapshot is the source of truth.

Reports should render from snapshot data, not live API calls. Once a report is
generated, old reports should not change because an analytics provider changed
historical data, removed a field, expired a token, or broke an endpoint.

The snapshot should include:

```txt
client branding
report details
metric values
metric source labels
warnings
created timestamp
review/approval timestamp when available
```

Example:

```json
{
  "client": {
    "slug": "stone-sisters",
    "name": "Stone Sisters",
    "logo_url": "data:image/svg+xml;base64,...",
    "brand_primary": "#111111",
    "brand_accent": "#c9a86a",
    "footer_text": "Stone Sisters Real Estate Team",
    "brokerage_name": "RE/MAX Kelowna",
    "brokerage_address": "100-1553 Harvey Avenue, Kelowna, BC",
    "brokerage_contact": "Stone Sisters Team"
  },
  "report": {
    "address": "985 Academy Way Unit 208",
    "start_date": "2026-04-01",
    "end_date": "2026-06-26",
    "listing_url": "https://www.example.com/listings/985-academy-way-unit-208",
    "created_at": "2026-06-29T14:00:00Z",
    "notes": "Marketing activity remained steady through the reporting period."
  },
  "website": {
    "source": "rybbit_api",
    "listing_views": 1801
  },
  "facebook": {
    "source": "meta_api",
    "post_url": "https://www.facebook.com/share/p/...",
    "caption": "Spotlight listing...",
    "media_url": "data:image/jpeg;base64,...",
    "views": 304,
    "engagements": 2
  },
  "instagram": {
    "source": "meta_api",
    "post_url": "https://www.instagram.com/p/...",
    "caption": "New listing...",
    "media_url": "data:image/jpeg;base64,...",
    "views": 167,
    "engagements": 0
  },
  "manual": {
    "realtor_listing_views": 58,
    "inquiries": 0,
    "showings": 1,
    "days_on_market": 36
  },
  "warnings": []
}
```

Images (the client logo and post media) are embedded as base64 data URIs at
snapshot-creation time, so a frozen report keeps rendering after Meta's signed
CDN URLs expire or a brand asset changes on disk. The distribution metric is
**views** — Meta deprecated post-level reach.

### PDF

The PDF should be rendered from one designed HTML/CSS template.

It should include:

```txt
client logo and branding
listing address
report date range
large metric cards
website performance
social post performance
manual listing platform numbers
showings and days on market
optional summary
footer/contact info
```

Do not build a template editor for the MVP.

## Later Integrations

Integrations should be added only after the PDF workflow works locally.

Potential integration order:

1. Rybbit listing page views.
2. Facebook post metrics.
3. Instagram media metrics.
4. REALTOR.ca numbers, if practical.

Every integration must keep manual override available.

If an integration fails, the report should show a warning and let the user enter
or correct the numbers manually. A failed API call should not kill the report
unless the PDF itself cannot be generated.

## Security Direction

For the local demo, do not build production security.

For the hosted app, use simple but serious security:

- server-side API calls only
- no analytics credentials in browser code
- no private credentials in snapshots
- encrypted storage for per-client tokens if tokens are stored
- high-entropy private client links or real access control
- signed/private PDF URLs when reports contain sensitive information
- redacted logs

## North Star

A real estate marketing coordinator should be able to create a seller report in
under five minutes without opening Looker Studio, GA4, Meta Business Suite, or a
design tool.

The report should look good enough to send to a seller without editing.

If a feature does not help with that, skip it.
