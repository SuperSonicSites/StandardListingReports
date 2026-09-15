# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A white-label, **self-serve seller report generator** for real estate marketing teams (package name `seller-report-generator`; the working directory is `SupersonicAnalytics`). The app lives at **supersonicrealtors.com** and is the front door for every Supersonic client: sign in by magic link, then choose **Submit Listing Ads** (the in-app `/c/<slug>/ads` form, which files one `Listing_Ads` record in Zoho CRM) or **Generate Listing Reports** (the report generator below). The client's coordinator serves themselves — no agency involvement per report:

1. The coordinator pastes their REALTOR.ca member "share listing" link (the backend link) into their report form.
2. The app gathers **all the data automatically**: REALTOR.ca views/days-on-market/address/MLS/photo (headless-Chrome scrape), the listing page on the client's own website with its true view count (one Rybbit pathname lookup by MLS#/address slug — no web-search dependency), site-wide views, and the matching Facebook/Instagram posts with their view counts (listed, ranked, and offered as a picker).
3. The coordinator reviews and approves — every value stays editable, but typing numbers is the *fallback* for a degraded source, not the workflow.
4. Approval freezes the numbers into a JSON **snapshot**, and a branded multi-page **PDF** is rendered from that snapshot for the coordinator to download/print.

The PDF is the product — this is a report compiler, not a dashboard, CRM, or analytics platform.

Current state is **v0.2**: the Meta (Facebook/Instagram organic post metrics) and Rybbit (listing page views) pulls are live, implemented in [src/lib/meta.ts](src/lib/meta.ts) and [src/lib/rybbit.ts](src/lib/rybbit.ts) behind [/api/pull](src/pages/api/pull.ts). The distribution metric is **views** (Meta deprecated post-level reach). Deployment target is Railway (see README "Deployment"); the Cloudflare stack is deferred to v0.3.

## Commands

```bash
npm install
npm run dev        # astro dev on http://127.0.0.1:4321
npm run build      # astro build -> dist/ (SSR, standalone node server)
npm run preview    # node ./dist/server/entry.mjs  (runs the BUILT server; run build first)
npm run start      # same as preview (production start command)
npm run check:listing-ad   # /api/listing-ad against a fake Zoho CRM (no network)
```

There is **no test runner and no lint script.** Type checking comes from `tsconfig` (extends `astro/tsconfigs/strict`); run `npx astro check` if you need to typecheck. The one runnable check (`check:listing-ad`) is a plain Node script using Node's TypeScript type stripping.

Run all commands from the repo root — storage paths are resolved against `process.cwd()`.

PDF generation requires a local Chrome or Edge. If neither is in a standard location, set `CHROME_PATH` to the browser executable (see the candidate list in [src/pages/api/pdf/[snapshotId].ts](src/pages/api/pdf/[snapshotId].ts)).

**Env loading gotcha:** `.env` is loaded only by `npm run dev` (Vite snapshots it at startup — restart after edits). The built server (`start`/`preview`) reads real environment variables only. Server code therefore checks `process.env.X ?? import.meta.env.X` — keep that pattern when touching env reads.

## Architecture

Astro 7 in **SSR mode** (`output: "server"`, `@astrojs/node` standalone adapter — see [astro.config.mjs](astro.config.mjs)). Nothing is statically prerendered; all API routes set `prerender = false`. Astro's CSRF `checkOrigin` is deliberately disabled (breaks behind TLS-terminating proxies; access control is an external gate like Cloudflare Access).

The end-to-end flow, and the files that own each step:

0. **Sign in + portal** — `/login` ([src/pages/login.astro](src/pages/login.astro), "Realtor Hub" shell in [src/layouts/HubLayout.astro](src/layouts/HubLayout.astro)) → `/api/login` emails a link → `/auth/verify` sets the session → `/portal` ([src/pages/portal.astro](src/pages/portal.astro)) shows the client's two destinations. Details under "Access control" below.
1. **Create client** — `/admin/clients/new` form POSTs to `/api/client` ([src/pages/api/client.ts](src/pages/api/client.ts)), which writes `data/clients/<slug>.json`. Creating refuses to overwrite an existing slug; the edit form declares itself with a hidden `mode=edit` field.
2. **Report form** — `/c/<slug>/` ([src/pages/c/[clientSlug]/index.astro](src/pages/c/[clientSlug]/index.astro)) loads the client and shows the form. (`/c/<slug>/new` just redirects to `/c/<slug>/`.)
3. **Pull data (the core step)** — the form's "Pull data" button POSTs to `/api/pull` ([src/pages/api/pull.ts](src/pages/api/pull.ts)), which runs all pulls concurrently and returns `{website, facebook, instagram, realtor}` blocks, each carrying a `source` label and its own warnings: Rybbit listing views + site-wide totals, Meta post views, and REALTOR.ca stats scraped from the member-portal "share listing" link via headless Chrome ([src/lib/realtor.ts](src/lib/realtor.ts) — all-time listing views from the stats page's "All" tab, days on market, and the listing's first photo; a real browser is required; realtor.ca blocks plain HTTP clients). The form JS fills the *inputs* (numbers, captions, media URLs) and shows per-block warnings; a degraded block never overwrites what the coordinator already typed.
4. **Create snapshot** — the form POSTs to `/api/snapshot` ([src/pages/api/snapshot.ts](src/pages/api/snapshot.ts)), which validates inputs (dates, numbers, URL schemes), embeds the logo and post images as base64 data URIs, assembles a `ReportSnapshot`, writes `data/snapshots/rpt-<timestamp>-<hex>.json`, then 303-redirects to the report.
5. **Render report** — `/reports/<id>` ([src/pages/reports/[snapshotId].astro](src/pages/reports/[snapshotId].astro)) renders the branded HTML report from the snapshot. `?print=1` hides the toolbar for PDF capture.
6. **Generate PDF** — `/api/pdf/<id>` ([src/pages/api/pdf/[snapshotId].ts](src/pages/api/pdf/[snapshotId].ts)) launches puppeteer-core, navigates to `http://127.0.0.1:<PORT>/reports/<id>?print=1` (loopback on purpose — never the request's own origin, which is client-controlled and breaks behind proxies), and returns a Letter PDF named after the listing address.

### Listing ads (Zoho CRM)

`/c/<slug>/ads` ([src/pages/c/[clientSlug]/ads.astro](src/pages/c/[clientSlug]/ads.astro), behavior in [src/scripts/ads-form.ts](src/scripts/ads-form.ts)) replaced the external Zoho Form. It POSTs JSON to `/api/listing-ad` ([src/pages/api/listing-ad.ts](src/pages/api/listing-ad.ts)), which re-checks the rules shared with the browser in [src/lib/listing-ads.ts](src/lib/listing-ads.ts), takes `Brokerage` **only** from the profile's `zoho_account_id` (never from the request), and creates one `Listing_Ads` record via [src/lib/zoho.ts](src/lib/zoho.ts) (Canadian DC; env `client_id`/`client_secret`/`refresh_token`/`api_domain`; one cached access token). Success is shown only after CRM returns the record id. Duplicates: every request carries a submission id (one id = one request, remembered in memory for 24 h). An unanswered request stays pending in the browser (fields locked, kept in sessionStorage across reloads); its retries wait 30 s for Zoho to settle, reuse the first attempt's record, and look for a record matching every written field (Get Records by `Created_Time`, not Search — search lags creates; picklists read back as labels) before creating. No `trigger` key, so CRM workflows run — but the old Zoho Flow ("Form Listing Submission": Kim's task, the REALTOR import Worker webhook) does not. `npm run check:listing-ad` runs the route against a fake CRM.

### Storage layer

All disk I/O goes through [src/lib/storage.ts](src/lib/storage.ts) — never read/write `data/` files directly elsewhere. Two stores, both plain JSON files, written atomically (temp file + rename):

- `data/clients/<slug>.json` — client brand profiles (**gitignored** — runtime data on the production volume; they carry coordinator email lists and uploaded-logo data URIs).
- `data/snapshots/<id>.json` — frozen reports (**gitignored** except `.gitkeep`).

Every id/slug that becomes a file path is validated by `assertSafeId` against `^[a-z0-9-]+$`. Preserve this — it is the path-traversal guard for user-supplied ids.

### Access control (v0.2.2 — magic links)

[src/middleware.ts](src/middleware.ts) gates every route through [src/lib/auth.ts](src/lib/auth.ts). There are no passwords: `/login` takes a work email, `/api/login` emails a 15-minute HMAC-signed link (via Resend, [src/lib/mail.ts](src/lib/mail.ts); in dev without `RESEND_API_KEY` the link is printed to the console), and `/auth/verify` swaps it for a 30-day signed session cookie that carries only the email. Authorization is re-derived on every request from that email: `ADMIN_EMAILS` (env; defaults to `dev@supersonicsites.com`) opens everything; a client profile's `emails` list (full addresses or `@domain.com`) opens `/c/<slug>/` and that client's reports/PDFs — so removing an email revokes access immediately. After sign-in a client lands on `/portal` (the chooser: "Submit Listing Ads" → `/c/<slug>/ads` once the profile has a `zoho_account_id`, "Generate Listing Reports" → `/c/<slug>/`); admins land on the `/` dashboard. `AUTH_SECRET` signs links and sessions (fail-closed in production; random per-process in dev) and `APP_URL` is the public base for links — never the request origin. `/api/pull|snapshot|client|listing-ad` authorize inside the route after parsing the slug from the body. The PDF route forwards the caller's cookie to its loopback self-fetch — remove that and PDFs print the login page.

### The snapshot is the source of truth

This is the central invariant. Reports render **only** from snapshot JSON, never from live API calls. A snapshot **embeds a copy of the client's branding** at creation time — including the logo and post images as data URIs — so an existing report never changes when the client profile, a logo file, or an expiring Meta CDN URL changes later. `ClientProfile` and `ReportSnapshot["client"]` are near-duplicate shapes in [src/lib/types.ts](src/lib/types.ts) for exactly this reason — don't collapse them.

### Integration rules (non-negotiable, from docs/auth.md)

- APIs hydrate **form inputs only**, never the snapshot directly; a block's `source` label is set from a hidden form field at snapshot-assembly time.
- Every metric stays a manually-editable field — automatic gathering is the workflow, manual entry is the review/override affordance and the fallback when a source degrades.
- A failed API call degrades to a per-block warning — it never crashes the form or blocks PDF generation.
- Fabricated demo numbers exist only behind `DEMO_MODE=1` (labeled `source: "mock"`). Without it, missing credentials degrade to manual entry with a warning. Never let mock data reach a real client unlabeled.
- `embedImage` in [src/pages/api/snapshot.ts](src/pages/api/snapshot.ts) only fetches Meta CDN hosts for form-supplied URLs (SSRF guard) — extend the allowlist deliberately, never remove it.

### PDF / print model

The report is built as fixed-size pages. In [src/styles/global.css](src/styles/global.css), `@page { size: Letter; margin: 0 }` plus each `.report-sheet` locked to `8.5in × 11in` with `break-after: page`. **One `.report-sheet` = one PDF page.** When editing the report template, keep content within a sheet's fixed height or it will clip (`overflow: hidden`). Free-text fields are capped server-side (notes 600 chars, captions 300) and line-clamped in CSS as a second guard.

Inter is shipped locally in `public/fonts/` (declared via `@font-face`) so PDF typography is machine-independent. Dates/numbers are formatted via [src/lib/format.ts](src/lib/format.ts) using the `en-CA` locale and UTC timezone (the product is Canadian — REALTOR.ca, BC brokerages).

## Conventions and intent

- **Development philosophy is KISS / YAGNI / boring code**, spelled out in [README.md](README.md). Prefer reuse over new abstraction; do not add a database, a bigger auth system, or template builders. In-app auth is the minimal stateless magic-link gate in [src/lib/auth.ts](src/lib/auth.ts) — don't grow it (no token table, no user records); Cloudflare Access can be layered in front for defense in depth.
- **White-label discipline:** nothing client-specific may be hardcoded as a default or fallback — no demo captions, no placeholder logos from another client, no sample brand data in `value=` attributes (placeholders are fine). A report must only ever contain its own client's assets.
- **docs/auth.md** is the v0.2 integration spec; its "As built" preface records where the implementation deliberately differs from the original text.
- **Security direction** (README): server-side credentials only (tokens go in `Authorization` headers, not URLs), never expose analytics tokens to the browser, never store private credentials in snapshots.
