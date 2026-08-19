# Seller Report Generator

A small, boring, white-label, **self-serve** seller report generator for real
estate marketing teams.

The product is simple:

```txt
Admin sets up the client once (brand + access + integration IDs)
Client opens their report form
Client pastes their REALTOR.ca share link (the member/backend link)
The app gathers all the data automatically
Client reviews and approves
Client downloads/prints the branded PDF
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
/c/[client_slug]/
/reports/[snapshot_id]
```

PDF generation uses `puppeteer-core` with a locally installed Chrome or Edge.
If the browser is not in a standard location, set `CHROME_PATH`.

Generated snapshots are written to `data/snapshots` and are ignored by git.

Copy `.env.example` to `.env` for the integration credentials. Without
credentials, "Pull data" degrades to manual entry with a warning; set
`DEMO_MODE=1` to get fabricated numbers labeled `mock` for demos instead.

## What the app does (v0.2)

The coordinator's only required input is the REALTOR.ca member **"share
listing"** link. From that one link, "Pull data" gathers everything:

- **REALTOR.ca** — all-time listing views, days on market, address, MLS® number,
  and the listing's first photo, scraped from the member stats page in headless
  Chrome (the public listing page is bot-walled).
- **Report period** — derived, not typed: first day on market → today.
- **Website analytics (Rybbit)** — one pathname lookup by MLS#/address slug
  resolves the listing page on the client's own site AND its view count
  together (no web-search dependency — Rybbit is the tracker, so it's always
  in sync), plus site-wide views for the summary line.
- **Facebook / Instagram (Meta)** — recent posts are listed, ranked against the
  listing (MLS# / street name + civic number), and offered as a picker; the
  selected post's views, caption, and image fill the form.

The coordinator reviews the pulled values, corrects anything that looks off
(every metric stays an editable field — the fallback, not the workflow), checks
"Review and approve", and creates the report. The approved numbers freeze into a
snapshot; the PDF renders from the snapshot only.

## Product Shape

```txt
Admin creates client (once)
        |
App creates private client report endpoint  /c/<slug>/
        |
Client pastes REALTOR.ca share link -> Pull data
        |
App gathers everything automatically
        |
Client reviews and approves
        |
App freezes snapshot -> renders branded report
        |
Client downloads the PDF
```

Client analytics access is delegated to us as part of the service, so the
system uses server-side credentials; those credentials are never exposed to the
browser or stored in snapshots.

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
- automatic gathering with manual fallback
- one good PDF template
- review/approve before final output

Avoid:

- speculative abstractions
- template builders
- workflow engines
- premature databases
- pretending APIs are perfect

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
   `RYBBIT_API_KEY`. The built server never loads `.env` — platform env vars
   are the only source.
   **Chromium** (PDF + REALTOR.ca capture) ships bundled via `@sparticuz/chromium`
   — a headless-shell build that runs in restricted containers where the system
   apt `chromium` can't (recent Chromium needs unprivileged user namespaces the
   host kernel now blocks). No `CHROME_PATH` or `RAILPACK_DEPLOY_APT_PACKAGES` is
   needed on Linux; on Linux `CHROME_PATH` is ignored so a stale one can't force
   the broken system binary. `/api/health/chrome` (admin-only) verifies the launch.
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

A client represents one white-label brand, set up once by the admin so the
coordinator can self-serve afterwards.

Fields:

```txt
slug
name
logo
brand colors
footer/contact text
brokerage disclaimer details
coordinator password (hash)
website URL (for the listing auto-find)
integration IDs (Meta page/IG account, Rybbit site)
```

### Report Form

The coordinator-facing form at `/c/<slug>/`. Its one required input is the
REALTOR.ca member "share listing" link; "Pull data" fills everything else for
review:

```txt
address, MLS# ................. scraped from REALTOR.ca
report period ................. derived: first day on market -> today
listing URL + website views ... resolved together via Rybbit (MLS/slug lookup)
site-wide views ............... pulled from Rybbit
REALTOR.ca views, days ........ scraped from REALTOR.ca
FB / IG post, caption, views .. picked from ranked Meta candidates
showings, notes ............... optional, always manual; on the report only when entered
```

Every pulled value stays an editable field so the coordinator can correct it
before approving; a failed source degrades to a per-block warning and manual
entry.

### Snapshot

The snapshot is the source of truth.

Reports render from snapshot data, not live API calls. Once a report is
generated, old reports do not change because an analytics provider changed
historical data, removed a field, expired a token, or broke an endpoint.

The snapshot includes:

```txt
client branding (frozen copy, logo embedded)
report details (address, MLS#, period, listing/post URLs, photo, toggles, notes)
metric values
metric source labels
created timestamp
```

Example (shape matches `ReportSnapshot` in src/lib/types.ts):

```json
{
  "client": {
    "slug": "example-realty",
    "name": "Example Realty",
    "logo_url": "data:image/svg+xml;base64,...",
    "brand_primary": "#111111",
    "brand_accent": "#c9a86a",
    "footer_text": "Example Realty Team",
    "brokerage_name": "Example Brokerage",
    "brokerage_address": "100-1553 Harvey Avenue, Kelowna, BC",
    "brokerage_contact": "Example Realty Team"
  },
  "report": {
    "address": "985 Academy Way Unit 208",
    "mls_number": "10345678",
    "list_date": "2026-04-01",
    "start_date": "2026-04-01",
    "end_date": "2026-06-26",
    "listing_url": "https://www.example.com/listings/985-academy-way-unit-208",
    "created_at": "2026-06-29T14:00:00Z",
    "notes": "Marketing activity remained steady through the reporting period.",
    "realtor_url": "https://member.realtor.ca/Reports/ListingDestination/...",
    "property_image": "data:image/jpeg;base64,...",
    "show_showings": true,
    "show_notes": true
  },
  "website": {
    "source": "rybbit_api",
    "listing_views": 1801,
    "site_total_views": 38101
  },
  "facebook": {
    "source": "meta_api",
    "post_url": "https://www.facebook.com/share/p/...",
    "caption": "Spotlight listing...",
    "media_url": "data:image/jpeg;base64,...",
    "views": 304
  },
  "instagram": {
    "source": "meta_api",
    "post_url": "https://www.instagram.com/p/...",
    "caption": "New listing...",
    "media_url": "data:image/jpeg;base64,...",
    "views": 167
  },
  "manual": {
    "realtor_listing_views": 58,
    "showings": 1,
    "days_on_market": 36
  },
  "warnings": []
}
```

Images (the client logo, post media, and listing photo) are embedded as base64
data URIs at snapshot-creation time, so a frozen report keeps rendering after
Meta's signed CDN URLs expire or a brand asset changes on disk. The
distribution metric is **views** — Meta deprecated post-level reach.

### PDF

The PDF is rendered from one designed HTML/CSS template (Letter, one
`.report-sheet` per page):

```txt
client logo and branding
listing address and photo
report date range
metric widgets (website, REALTOR.ca, days on market, showings)
source breakdown table and total views readout
social post performance (image, caption, views)
reviewed-inputs and compliance/disclaimer page
footer/contact info
```

There is no template editor, by design.

## Integration Rules

All integrations are live in v0.2 (Rybbit, Meta, and the REALTOR.ca scrape).
The rules that keep them honest:

- APIs hydrate **form inputs only** — never the snapshot directly.
- Every metric stays a manually-editable field for review and fallback.
- A failed source degrades to a per-block warning; it never crashes the form or
  blocks PDF generation.
- Fabricated demo numbers exist only behind `DEMO_MODE=1`, labeled
  `source: "mock"`. Mock data must never reach a real client unlabeled.

## Security Direction

Simple but serious:

- server-side API calls only
- no analytics credentials in browser code
- no private credentials in snapshots
- password gate on every route (admin password + per-client coordinator
  passwords); Cloudflare Access can be layered in front
- redacted logs

## North Star

A client's marketing coordinator should be able to create a seller report
themselves in under five minutes: paste one REALTOR.ca link, confirm the
numbers, download the PDF — without opening Looker Studio, GA4, Meta Business
Suite, or a design tool, and without asking the agency for anything.

The report should look good enough to send to a seller without editing.

If a feature does not help with that, skip it.
