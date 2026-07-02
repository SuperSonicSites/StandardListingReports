# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A white-label **seller report generator** for real estate marketing teams (package name `seller-report-generator`; the working directory is `SupersonicAnalytics`). A coordinator fills a per-client form, optionally pulls live numbers, the reviewed numbers are frozen into a JSON **snapshot**, and a branded multi-page **PDF** is rendered from that snapshot. The PDF is the product — this is a report compiler, not a dashboard, CRM, or analytics platform.

Current state is **v0.2**: the Meta (Facebook/Instagram organic post metrics) and Rybbit (listing page views) pulls are live, implemented in [src/lib/meta.ts](src/lib/meta.ts) and [src/lib/rybbit.ts](src/lib/rybbit.ts) behind [/api/pull](src/pages/api/pull.ts). The distribution metric is **views** (Meta deprecated post-level reach). Deployment target is Railway (see README "Deployment"); the Cloudflare stack is deferred to v0.3.

## Commands

```bash
npm install
npm run dev        # astro dev on http://127.0.0.1:4321
npm run build      # astro build -> dist/ (SSR, standalone node server)
npm run preview    # node ./dist/server/entry.mjs  (runs the BUILT server; run build first)
npm run start      # same as preview (production start command)
```

There is **no test runner and no lint script.** Type checking comes from `tsconfig` (extends `astro/tsconfigs/strict`); run `npx astro check` if you need to typecheck.

Run all commands from the repo root — storage paths are resolved against `process.cwd()`.

PDF generation requires a local Chrome or Edge. If neither is in a standard location, set `CHROME_PATH` to the browser executable (see the candidate list in [src/pages/api/pdf/[snapshotId].ts](src/pages/api/pdf/[snapshotId].ts)).

**Env loading gotcha:** `.env` is loaded only by `npm run dev` (Vite snapshots it at startup — restart after edits). The built server (`start`/`preview`) reads real environment variables only. Server code therefore checks `process.env.X ?? import.meta.env.X` — keep that pattern when touching env reads.

## Architecture

Astro 7 in **SSR mode** (`output: "server"`, `@astrojs/node` standalone adapter — see [astro.config.mjs](astro.config.mjs)). Nothing is statically prerendered; all API routes set `prerender = false`. Astro's CSRF `checkOrigin` is deliberately disabled (breaks behind TLS-terminating proxies; access control is an external gate like Cloudflare Access).

The end-to-end flow, and the files that own each step:

1. **Create client** — `/admin/clients/new` form POSTs to `/api/client` ([src/pages/api/client.ts](src/pages/api/client.ts)), which writes `data/clients/<slug>.json`. Creating refuses to overwrite an existing slug; the edit form declares itself with a hidden `mode=edit` field.
2. **Report form** — `/c/<slug>/` ([src/pages/c/[clientSlug]/index.astro](src/pages/c/[clientSlug]/index.astro)) loads the client and shows the form. (`/c/<slug>/new` just redirects to `/c/<slug>/`.)
3. **Pull data (optional)** — the form's "Pull data" button POSTs to `/api/pull` ([src/pages/api/pull.ts](src/pages/api/pull.ts)), which runs the three adapters concurrently and returns `{website, facebook, instagram}` blocks, each carrying a `source` label and its own warnings. The form JS fills the *inputs* (numbers, captions, media URLs) and shows per-block warnings; a degraded block never overwrites what the coordinator already typed.
4. **Create snapshot** — the form POSTs to `/api/snapshot` ([src/pages/api/snapshot.ts](src/pages/api/snapshot.ts)), which validates inputs (dates, numbers, URL schemes), embeds the logo and post images as base64 data URIs, assembles a `ReportSnapshot`, writes `data/snapshots/rpt-<timestamp>-<hex>.json`, then 303-redirects to the report.
5. **Render report** — `/reports/<id>` ([src/pages/reports/[snapshotId].astro](src/pages/reports/[snapshotId].astro)) renders the branded HTML report from the snapshot. `?print=1` hides the toolbar for PDF capture.
6. **Generate PDF** — `/api/pdf/<id>` ([src/pages/api/pdf/[snapshotId].ts](src/pages/api/pdf/[snapshotId].ts)) launches puppeteer-core, navigates to `http://127.0.0.1:<PORT>/reports/<id>?print=1` (loopback on purpose — never the request's own origin, which is client-controlled and breaks behind proxies), and returns a Letter PDF named after the listing address.

### Storage layer

All disk I/O goes through [src/lib/storage.ts](src/lib/storage.ts) — never read/write `data/` files directly elsewhere. Two stores, both plain JSON files, written atomically (temp file + rename):

- `data/clients/<slug>.json` — client brand profiles (**gitignored** — runtime data on the production volume; they carry coordinator password hashes and uploaded-logo data URIs).
- `data/snapshots/<id>.json` — frozen reports (**gitignored** except `.gitkeep`).

Every id/slug that becomes a file path is validated by `assertSafeId` against `^[a-z0-9-]+$`. Preserve this — it is the path-traversal guard for user-supplied ids.

### Access control (v0.2.1)

[src/middleware.ts](src/middleware.ts) gates every route through [src/lib/auth.ts](src/lib/auth.ts): `ADMIN_PASSWORD` (env) opens everything; each client profile stores a `password_hash` (sha256, set in the admin form) that opens only `/c/<slug>/` and that client's reports/PDFs. Cookie tokens are derived hashes, never the password. `/login` + `/api/login` are open; `/api/pull|snapshot|client` authorize inside the route after parsing the slug from the body. The PDF route forwards the caller's cookie to its loopback self-fetch — remove that and PDFs print the login page.

### The snapshot is the source of truth

This is the central invariant. Reports render **only** from snapshot JSON, never from live API calls. A snapshot **embeds a copy of the client's branding** at creation time — including the logo and post images as data URIs — so an existing report never changes when the client profile, a logo file, or an expiring Meta CDN URL changes later. `ClientProfile` and `ReportSnapshot["client"]` are near-duplicate shapes in [src/lib/types.ts](src/lib/types.ts) for exactly this reason — don't collapse them.

### Integration rules (non-negotiable, from docs/auth.md)

- APIs hydrate **form inputs only**, never the snapshot directly; a block's `source` label is set from a hidden form field at snapshot-assembly time.
- Every metric stays a manually-editable field.
- A failed API call degrades to a per-block warning — it never crashes the form or blocks PDF generation.
- Fabricated demo numbers exist only behind `DEMO_MODE=1` (labeled `source: "mock"`). Without it, missing credentials degrade to manual entry with a warning. Never let mock data reach a real client unlabeled.
- `embedImage` in [src/pages/api/snapshot.ts](src/pages/api/snapshot.ts) only fetches Meta CDN hosts for form-supplied URLs (SSRF guard) — extend the allowlist deliberately, never remove it.

### PDF / print model

The report is built as fixed-size pages. In [src/styles/global.css](src/styles/global.css), `@page { size: Letter; margin: 0 }` plus each `.report-sheet` locked to `8.5in × 11in` with `break-after: page`. **One `.report-sheet` = one PDF page.** When editing the report template, keep content within a sheet's fixed height or it will clip (`overflow: hidden`). Free-text fields are capped server-side (notes 600 chars, captions 300) and line-clamped in CSS as a second guard.

Inter is shipped locally in `public/fonts/` (declared via `@font-face`) so PDF typography is machine-independent. Dates/numbers are formatted via [src/lib/format.ts](src/lib/format.ts) using the `en-CA` locale and UTC timezone (the product is Canadian — REALTOR.ca, BC brokerages).

## Conventions and intent

- **Development philosophy is KISS / YAGNI / boring code**, spelled out in [README.md](README.md). Prefer reuse over new abstraction; do not add a database, an in-app auth system, or template builders. Access control for the hosted app is an external gate (Cloudflare Access), not app code.
- **White-label discipline:** nothing client-specific may be hardcoded as a default or fallback — no demo captions, no placeholder logos from another client, no sample brand data in `value=` attributes (placeholders are fine). A report must only ever contain its own client's assets.
- **docs/auth.md** is the v0.2 integration spec; its "As built" preface records where the implementation deliberately differs from the original text.
- **Security direction** (README): server-side credentials only (tokens go in `Authorization` headers, not URLs), never expose analytics tokens to the browser, never store private credentials in snapshots.
