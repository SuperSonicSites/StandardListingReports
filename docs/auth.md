# Project: Lightweight Analytics Integration (Meta & Rybbit)
- Status: **Implemented (v0.2)** — see the As-built notes below for deltas
- Target Version: v0.2 (Post-HTML/PDF Validation)
- Design Philosophy: KISS, YAGNI, Boring Code, Human-in-the-Loop

## 0. As built (July 2026) — where the implementation deliberately differs

This spec predates implementation; the sections below are kept as the design
record. Where the shipped code differs, the code is correct:

- **"Reach" is "Views" everywhere.** Meta completed the post-level reach
  deprecation, so the distribution metric is views: IG `views`; FB
  `max(post_video_views, post_clicks)`. Read "reach" below as "views".
- **Facebook discovery is not the "last 50 posts" loop-match.** Pasted FB links
  are opaque `pfbid` share URLs, so the adapter resolves the numeric post id via
  the post page's `og:url` (host-pinned to m.facebook.com) and reads the post
  directly with a minted Page access token. Instagram kept the 50-item
  shortcode loop-match as specced.
- **Stub mode is gated behind `DEMO_MODE=1`.** A missing credential in normal
  operation degrades to a per-block warning and manual entry; fabricated
  `source: "mock"` numbers require explicit opt-in.
- **No submit-lock.** The `data-approval`/`data-submit-panel`/`is-locked` hooks
  in §9 were never wired and have been removed; metric inputs are always
  editable (manual-first), and the approval checkbox is the only gate.
- **Snapshot `warnings` stays `[]`** at assembly (per §5.3) and the report
  template renders no warnings section — fetch warnings are a form-time,
  coordinator-facing concern, not seller-facing content.
- **Post images and the client logo are frozen into the snapshot** as base64
  data URIs at creation time; form-supplied image URLs are only fetched from
  Meta CDN hosts (SSRF guard).

## 1. Objective & Scope

The goal is to eliminate manual copy-pasting for marketing coordinators by auto-populating listing views (Rybbit) and organic social performance metrics (Meta) directly into the report form when the coordinator clicks "Pull data".

Per the README build order, this feature is implemented only after the local HTML-to-PDF workflow is locked down and reliable ("Real analytics integrations" is a late step, gated behind a solid core). Integration order follows the README: Rybbit, then Facebook, then Instagram.

### In Scope (v0.2)

- Server-side hydration of the **existing** report-form inputs from **Rybbit** (website listing views) and **Meta** (Facebook + Instagram **organic** post reach/engagements), triggered by the existing "Pull data" button.

### Out of Scope

- **REALTOR.ca integration.** Its value lives in the `manual` snapshot block with no `source`. No pull touches `realtor_listing_views`. There is no Google Ads metric or connection anywhere in this product — listing-level Google Ads data does not exist for these clients.
- **Paid / "dark" / boosted Facebook ad posts.** Dark ad creatives do not appear in a Page's organic `/posts` edge, so the URL match can never succeed for them; supporting them requires the Marketing API (a different auth surface). v0.2 is **organic posts only**.
- **Facebook reach as a guaranteed auto-fill.** Meta's post-level reach metric is in active deprecation (see §7). v0.2 treats FB reach as best-effort: it auto-fills when the call succeeds and otherwise degrades to a manual field with a notice. Coordinators should expect FB reach may frequently be manual-by-default.
- Multi-tenant OAuth setup or login prompts for end clients (a single master System User token is used).
- Automated background metric-scraping crons or schedulers (pulls are user-initiated only).
- Complex database synchronization models (client config stays JSON files; snapshots stay JSON files).
- Any write path from an API into a snapshot — APIs hydrate form inputs only (§3.3, §4.2, §5).

## 2. The Core User Experience

1. Admin selects a Client profile → `/c/<slug>/`.
2. The form loads with the listing details and three link fields (exact existing input names):
   - Website URL (`listing_url`)
   - Facebook URL (`facebook_post_url`) — organic posts only
   - Instagram URL (`instagram_post_url`)
3. User enters the date range (`start_date` / `end_date`).
4. User clicks "Pull data".
5. Server queries Meta & Rybbit → the UI populates the **editable** metric inputs; any source that fails shows an inline notice next to its input(s).
6. User reviews, overrides anything that looks off, adds notes, and checks "Review and approve" (`approved=yes`).
7. User clicks "Create Report" → the form POSTs to `/api/snapshot`, the snapshot JSON is frozen on disk, and the report renders.

> **Label note:** the form fields are already labeled "Facebook URL" / "Instagram URL" (not "Post/Ad URL"). Keep them as-is. Because discovery matches a Page's organic `/posts` edge, an "Ad" affordance would be a promise the code can't keep — so honest "URL"/"post" wording is correct.

## 3. Functional Requirements

### 3.1 Meta Integration (Facebook & Instagram)

Instead of per-client authentication, the platform uses a single, static **Meta System User Token** belonging to our master Business Manager account, read server-side from `META_SYSTEM_USER_TOKEN`.

- **Asset Management (manual prerequisite):** Every target client Facebook Page and Instagram Professional account must be added to our master Business Manager and the System User granted a task role on them. Without this the token cannot read the assets.
- **Organic Discovery (The Loop Match):**
  - The server fetches the last 50 organic items from the client's configured `meta_page_id` (Facebook) or `meta_instagram_id` (Instagram).
  - The server performs an array `.find()` comparing the user-pasted URL against the `permalink_url` (Facebook) / `permalink` (Instagram) returned by Meta, after normalizing both sides (strip query string + trailing slash, lowercase host; for Instagram match on the `/p/` or `/reel/` shortcode).
  - No match is a **normal, expected outcome** (not a crash): the block degrades to `manual` with a warning, and the coordinator types the numbers in.

The full adapter contract is specified in §7 (Meta Adapter).

### 3.2 Rybbit Integration

- **Data Retrieval:** The server extracts the URL **pathname** from the pasted Website URL (`new URL(listing_url).pathname`, wrapped in try/catch) and filters Rybbit on that pathname.
- **Metric Payload:** The server executes a server-to-server request using the global `RYBBIT_API_KEY` (org-scoped) plus the client's `rybbit_site_id` to pull listing-page views for the reporting window.
- **Important assumption:** Rybbit only has data for the client's **own** Rybbit-tracked site. If the coordinator pastes a REALTOR.ca or foreign-IDX URL, Rybbit legitimately returns 0 and the field stays 0 for manual override.

> **Note:** the Rybbit API key is global (one key covers every site in the org) but each client needs its own non-secret `rybbit_site_id`, stored in the client profile (§4.1).

The full adapter contract is specified in §8 (Rybbit Adapter).

### 3.3 UI & The Form Hydration Rule

- APIs must **never** write directly to the final snapshot. They only fill input fields on the UI form.
- Every metric field (Reach, Engagements, Views) remains a standard HTML `<input>` the coordinator can freely type into or override.
- A block's `source` is decided at snapshot-assembly time from a hidden form field — never trusted directly from the API response (see §4.2 / §5.3).

## 4. Technical Architecture & Data Schema

### 4.0 MetricSource reconciliation (foundation for everything below)

The current union is a single member:

```ts
// src/lib/types.ts (today)
export type MetricSource = "mock";
```

Widen it, **keeping `"mock"`** so existing/demo snapshots on disk still typecheck and render without a migration:

```ts
export type MetricSource = "rybbit_api" | "meta_api" | "manual" | "mock";
```

- `"rybbit_api"` — `website` block only, when the Rybbit pull succeeded.
- `"meta_api"` — `facebook` and `instagram` blocks, when the Meta pull succeeded.
- `"manual"` — website/facebook/instagram when NOT auto-populated (not pulled, pull failed, or typed by hand).
- `"mock"` — retained for pre-integration/demo snapshots **and for stub-mode pulls** (§7/§8). No migration required.

**Per-block source semantics (KISS rule):** exactly three blocks carry a `source` (`website`, `facebook`, `instagram`). One source per block, set once at pull time. The `manual` block gets **no** `source` field (REALTOR.ca, showings, days_on_market, inquiries are manual by definition). A coordinator editing an auto-filled number does **not** flip the label back to `manual` — `source` records how the block was populated at pull time; human review is expected. Only a never-pulled or failed block is `manual`; stub-mode fabricated numbers are `"mock"` (never `meta_api`/`rybbit_api`). `ReportSnapshot` needs no shape change: `website.source`, `facebook.source`, `instagram.source` are already typed `MetricSource` and widen automatically; `warnings: string[]` is unchanged (and, per §5.3, stays `[]` at assembly).

### 4.1 Client Configuration Enhancement

Per-client **non-secret** integration identifiers live in the committed client JSON (`data/clients/<slug>.json`). They are addressing IDs, useless without the master token/key, so committing them to git is safe. Secrets (`META_SYSTEM_USER_TOKEN`, `RYBBIT_API_KEY`) live **only** in env (§6).

Add these **optional** fields to `ClientProfile` (optional so existing `stone-sisters.json` and the create flow stay valid without a migration):

```ts
// src/lib/types.ts
export type ClientProfile = {
  slug: string;
  name: string;
  logo_url: string;
  brand_primary: string;
  brand_accent: string;
  footer_text: string;
  brokerage_name: string;
  brokerage_address: string;
  brokerage_contact: string;
  // --- v0.2 integration IDs (optional; committed to git; NON-SECRET) ---
  meta_page_id?: string;       // Facebook Page ID (numeric string)
  meta_instagram_id?: string;  // Instagram professional/business account ID (numeric string)
  rybbit_site_id?: string;     // Rybbit per-client site id (numeric string)
};
```

> **Decision:** no `meta_ad_account_id` field in v0.2. Ads are out of scope, so YAGNI — do not add it until paid metrics are actually implemented.

> **Ordering dependency (do this first):** this `ClientProfile` widening (§12 step 1) MUST land before the `ClientForm.astro` edit (§12 step 7). The form snippet reads `client?.meta_page_id ?? ""`; until the field exists on the type, that `.astro` expression fails `npx astro check`.

**Validation (in `src/pages/api/client.ts`, NOT `assertSafeId`).** `assertSafeId` is the filesystem path-traversal guard for slug/snapshot ids only — these IDs are never file paths, so do not route them through it. Validate with a small local check, store trimmed, and **omit the field entirely when empty** (so absence cleanly means "channel not configured"):

- `meta_page_id`, `meta_instagram_id`, `rybbit_site_id`: accept `^[0-9]{1,32}$` (Meta and Rybbit IDs are numeric strings). If a non-empty value fails the pattern, **drop it (omit)** — do not 400 the whole client save; the coordinator can re-enter it.

> **Known trade-off (silent drop):** a mistyped ID is silently omitted, with no per-field error on the form. This is deliberate KISS (a 400 would block the whole save for a non-secret optional field). The consequence — a later pull for that channel degrades to "not configured" — is a stated, tested behavior (§11 step 7), not an accident. If a coordinator reports "my ID keeps disappearing," the cause is a non-numeric value.

**Canonical `client.ts` write** (one helper, values computed once into locals, defined fields spread in):

```ts
const digits = /^[0-9]{1,32}$/;
function optionalId(form: FormData, name: string): string | undefined {
  const v = field(form, name);
  return digits.test(v) ? v : undefined;
}

// ...inside POST, alongside the existing field() reads:
const metaPageId = optionalId(form, "meta_page_id");
const metaInstagramId = optionalId(form, "meta_instagram_id");
const rybbitSiteId = optionalId(form, "rybbit_site_id");

const client: ClientProfile = {
  slug,
  name,
  logo_url: field(form, "logo_url") || "/clients/stone-sisters/logo.svg",
  brand_primary: hex.test(field(form, "brand_primary")) ? field(form, "brand_primary") : "#111111",
  brand_accent: hex.test(field(form, "brand_accent")) ? field(form, "brand_accent") : "#c9a86a",
  footer_text: field(form, "footer_text") || name,
  brokerage_name: field(form, "brokerage_name") || name,
  brokerage_address: field(form, "brokerage_address"),
  brokerage_contact: field(form, "brokerage_contact"),
  ...(metaPageId ? { meta_page_id: metaPageId } : {}),
  ...(metaInstagramId ? { meta_instagram_id: metaInstagramId } : {}),
  ...(rybbitSiteId ? { rybbit_site_id: rybbitSiteId } : {})
};
```

**Form (`src/components/ClientForm.astro`).** Add a new section matching the existing markup (`form-section`, `field-grid two`, `<label>…<input></label>` pairs). Inputs are **not** `required`:

```html
<section class="form-section">
  <h2>Integrations (optional)</h2>
  <div class="field-grid two">
    <label>
      Facebook Page ID
      <input name="meta_page_id" value={client?.meta_page_id ?? ""} pattern="[0-9]*" inputmode="numeric" />
    </label>
    <label>
      Instagram account ID
      <input name="meta_instagram_id" value={client?.meta_instagram_id ?? ""} pattern="[0-9]*" inputmode="numeric" />
    </label>
    <label>
      Rybbit site ID
      <input name="rybbit_site_id" value={client?.rybbit_site_id ?? ""} pattern="[0-9]*" inputmode="numeric" />
    </label>
  </div>
</section>
```

**Snapshot boundary rule (non-negotiable):** `ReportSnapshot.client` is **branding-only**. Do NOT copy `meta_page_id` / `meta_instagram_id` / `rybbit_site_id` into `snapshot.client`. Keep the field-by-field hand-pick in `snapshot.ts` (lines 59–69) exactly as-is — never spread `ClientProfile` into the snapshot. `ClientProfile` and `ReportSnapshot["client"]` remain distinct shapes per CLAUDE.md. Because the hand-pick list is untouched, adding these fields to `ClientProfile` cannot leak them into snapshots.

### 4.2 Endpoint Design

One new server surface: **`POST /api/pull`** → `src/pages/api/pull.ts` (`export const prerender = false`). It is the ONLY new endpoint. It reads client integration IDs server-side via `readClient(client_slug)` and tokens from `process.env`. Tokens never leave the server; the browser only ever sees numbers, source labels, and warning strings.

Scope: it fills **website (Rybbit)**, **facebook**, and **instagram (Meta)** only. REALTOR.ca is never touched.

#### Request body (JSON, `Content-Type: application/json`)

Field names deliberately match the existing form input names:

```json
{
  "client_slug": "stone-sisters",
  "listing_url": "https://www.example.com/listings/985-academy-way-unit-208",
  "facebook_post_url": "https://www.facebook.com/stonesisters/posts/985-academy-way-208",
  "instagram_post_url": "https://www.instagram.com/p/academy-way-208/",
  "start_date": "2026-04-01",
  "end_date": "2026-06-26"
}
```

`client_slug` is validated by `readClient()`'s `assertSafeId`. Missing/blank `client_slug` → `400`; unknown client → `404` (same style as `snapshot.ts`). **Every other failure degrades gracefully and still returns `200`.**

#### Response contract (always `200` on a resolvable client)

Per-block object `{ source, <metrics>, warnings }`. `source` is the API label on success, `"manual"` on that block's failure, `"mock"` in stub mode (§7/§8). Metrics are always present numbers (0 on failure). A flattened `warnings` array is included for the client script.

```ts
type PullResponse = {
  website:   { source: "rybbit_api" | "manual" | "mock"; listing_views: number; warnings: string[] };
  facebook:  { source: "meta_api"  | "manual" | "mock"; reach: number; engagements: number; warnings: string[] };
  instagram: { source: "meta_api"  | "manual" | "mock"; reach: number; engagements: number; warnings: string[] };
  warnings: string[]; // flattened union of all per-block warnings (UI-advisory only)
};
```

**Success example**

```json
{
  "website":   { "source": "rybbit_api", "listing_views": 1801, "warnings": [] },
  "facebook":  { "source": "meta_api", "reach": 304, "engagements": 2, "warnings": [] },
  "instagram": { "source": "meta_api", "reach": 167, "engagements": 0, "warnings": [] },
  "warnings": []
}
```

**Partial-failure example** (Meta token expired, Rybbit fine)

```json
{
  "website":   { "source": "rybbit_api", "listing_views": 1801, "warnings": [] },
  "facebook":  { "source": "manual", "reach": 0, "engagements": 0,
                 "warnings": ["Meta auto-fetch unavailable (token expired). Enter Facebook numbers manually."] },
  "instagram": { "source": "manual", "reach": 0, "engagements": 0,
                 "warnings": ["Meta auto-fetch unavailable (token expired). Enter Instagram numbers manually."] },
  "warnings": [
    "Meta auto-fetch unavailable (token expired). Enter Facebook numbers manually.",
    "Meta auto-fetch unavailable (token expired). Enter Instagram numbers manually."
  ]
}
```

#### Server logic (boring, no framework)

The adapters return a `source` label directly (so stub mode can return `"mock"` without the endpoint having to infer it). The endpoint maps adapter results into the response shape.

```ts
import type { APIRoute } from "astro";
import { readClient } from "../../lib/storage";
import { fetchFacebookPostMetrics, fetchInstagramMediaMetrics } from "../../lib/meta";
import { fetchRybbitListingViews } from "../../lib/rybbit";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const slug = String(body.client_slug ?? "").trim();
  if (!slug) return new Response("Missing client slug.", { status: 400 });

  let client;
  try { client = await readClient(slug); }
  catch { return new Response("Client profile not found.", { status: 404 }); }

  const listingUrl = String(body.listing_url ?? "");
  const facebookUrl = String(body.facebook_post_url ?? "");
  const instagramUrl = String(body.instagram_post_url ?? "");
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");

  // Each helper NEVER throws; it returns a typed result carrying its own `source` + optional warning.
  const web = await fetchRybbitListingViews(client.rybbit_site_id, listingUrl, startDate, endDate);
  const fb  = await fetchFacebookPostMetrics(client.meta_page_id, facebookUrl);
  const ig  = await fetchInstagramMediaMetrics(client.meta_instagram_id, instagramUrl);

  const website   = { source: web.source, listing_views: web.listing_views, warnings: web.warning ? [web.warning] : [] };
  const facebook  = { source: fb.source,  reach: fb.reach,  engagements: fb.engagements,  warnings: fb.warning ? [fb.warning] : [] };
  const instagram = { source: ig.source,  reach: ig.reach,  engagements: ig.engagements,  warnings: ig.warning ? [ig.warning] : [] };

  return new Response(JSON.stringify({
    website, facebook, instagram,
    warnings: [...website.warnings, ...facebook.warnings, ...instagram.warnings]
  }), { headers: { "Content-Type": "application/json" } });
};
```

Any external failure (bad/missing token, missing client ID, rate limit, no URL match, network error, timeout) is absorbed inside each adapter and surfaces as a `manual`-labeled block with metrics 0 and a one-line warning. The endpoint never 500s on an external failure.

#### Data flow into `/api/snapshot`

The pull hydrates form inputs; the coordinator submits the form; `snapshot.ts` reads the hidden **source** carriers (numbers still come from the editable inputs via the existing `numberField()`). Add one small helper to `snapshot.ts`:

```ts
// near field()/numberField() in src/pages/api/snapshot.ts
import type { ReportSnapshot, MetricSource } from "../../lib/types";

function sourceField(form: FormData, name: string): MetricSource {
  const v = field(form, name);
  return v === "rybbit_api" || v === "meta_api" || v === "mock" ? v : "manual";
}
```

Then replace the three hardcoded source values (leave `warnings: []` unchanged — see §5.3):

- `website.source: "mock"` → `sourceField(form, "website_source")`
- `facebook.source: "mock"` → `sourceField(form, "facebook_source")`
- `instagram.source: "mock"` → `sourceField(form, "instagram_source")`

`MetricSource` is imported by adding it to the existing `import type { ReportSnapshot }` line. The "hydrate inputs only" rule is preserved — the numbers still come from editable inputs.

## 5. Error Handling — The "Boring Code" Guardrails

**The Gold Standard Rule (non-negotiable):** A failed or slow API call must NEVER crash the form, block "Create Report", or block PDF generation. The pull is a convenience that fills inputs; the coordinator can always type the numbers by hand and proceed. This holds structurally because `/api/pdf/<id>` renders only the frozen snapshot and never calls Meta or Rybbit — no pull failure can reach the PDF path. The rules below keep the form itself equally safe.

### 5.1 Per-source degradation (never all-or-nothing)

The pull covers three independent sources mapping 1:1 to snapshot blocks:

| Source | Fills form inputs | Snapshot block |
|---|---|---|
| Rybbit | `website_views` | `website` |
| Meta – Facebook | `facebook_reach`, `facebook_engagements` | `facebook` |
| Meta – Instagram | `instagram_reach`, `instagram_engagements` | `instagram` |

Each source succeeds or fails **on its own**. If Meta is down but Rybbit is up, `website_views` fills and the Facebook/Instagram inputs show a notice — good data is never discarded. The endpoint MUST catch every error internally and always return HTTP 200; it must never throw, never return 4xx/5xx for an upstream failure, and never hang (adapters use a bounded `AbortController` timeout; a timeout is just another warning).

### 5.2 UI feedback (per input, advisory only)

- On a block failure, show a subtle inline notice next to **that block's input(s)**: **"Auto-fetch unavailable. Please enter numbers manually."**
- For the no-URL-match case, use: **"Couldn't match this post URL — check the link or enter the numbers manually."**
- **DOM reality (important):** in `src/pages/c/[clientSlug]/index.astro`, Facebook and Instagram do **not** have their own cards. All four social inputs (`facebook_reach`, `facebook_engagements`, `instagram_reach`, `instagram_engagements`) live inside a **single shared `.import-review-card`** (the "Social performance" card, lines 174–224), split into two `.post-review-row` elements (Facebook lines 183–202, Instagram lines 203–222). Only `website_views` has its own `.import-review-card` (lines 151–172). Therefore the notice must be attached to the **`.post-review-row`** for Facebook/Instagram (and to the `.import-review-card` for website), with dedup **per row**, not per card. The §9 script does exactly this via `closest(".post-review-row") ?? closest(".import-review-card")`. Attaching to the card would collapse FB and IG into one notice and suppress the second — do not do that.
- The notice is **advisory only**. Inputs stay enabled and editable, keep any value the coordinator already typed, and are never cleared or re-disabled by a failed pull.
- A partial pull is a normal outcome, not an error state: successful blocks fill, failed blocks show a notice, and the form stays fully submittable throughout.

### 5.3 Source label persistence — warnings stay UI-only (decided at assembly)

**Source labels** are carried as hidden form fields (APIs hydrate inputs only, so the label cannot come from the API response at assembly time). Add these hidden inputs inside `#report-form`:

```html
<input type="hidden" name="website_source"   value="manual" />
<input type="hidden" name="facebook_source"  value="manual" />
<input type="hidden" name="instagram_source" value="manual" />
```

Defaults (`manual`) mean that if the coordinator never pulls (or JS is off), the snapshot is correctly labeled manual. On a successful block pull the client script sets the block's `*_source` to `rybbit_api`/`meta_api` (or `mock` in stub mode); on failure it stays `manual`. `snapshot.ts` validates defensively via `sourceField()` — any unrecognized value collapses to `manual`.

**Warnings are NOT persisted to the snapshot.** Pull warnings are purely UI-advisory (rendered next to the failing input, §5.2) and are **never** written to `snapshot.warnings`; `snapshot.ts` keeps `warnings: []` unchanged.

> **Rationale (product-surface correctness):** the report page renders `snapshot.warnings` into a seller-facing `.report-warning-card` (`src/pages/reports/[snapshotId].astro`, ~line 421) — that card is on the **client deliverable PDF**. If we persisted a pull warning like "Meta auto-fetch unavailable (token expired)," it would print on the seller's report even after the coordinator manually typed the correct numbers — an internal-tooling failure message leaking onto the product. Keeping warnings UI-only avoids this entirely and is **less** code (no hidden `warnings_json` carrier, no parser, no client-side `JSON.stringify`). The `.report-warning-card` stays available for genuine, coordinator-authored seller-facing caveats (the existing `warnings: []` behavior is unchanged; a future manual "warnings" field could feed it, out of scope here).

### 5.4 Logging

- Log each source failure server-side at most once per pull: source name + a short reason only.
- **Never log token values, API keys, full response bodies, or PII.**

## 6. Security & Secrets

### 6.1 Environment contract (server-side only)

All credentials are read **server-side only** and never sent to the browser, embedded in a page, or written to a snapshot or client JSON. Astro/Vite loads `.env` into `import.meta.env` (NOT `process.env`), so each adapter reads `process.env.X ?? import.meta.env.X` — a real runtime environment variable wins, and the local `.env` fills in during dev. The variable keys are declared in `src/env.d.ts` (augmenting `ImportMetaEnv`) so the reads typecheck under strict mode.

| Variable | Purpose | Secret? |
|---|---|---|
| `META_SYSTEM_USER_TOKEN` | Single static System User token for the master Business Manager | **Yes — secret** |
| `RYBBIT_API_KEY` | Global org-scoped Rybbit key (opaque string; needs a paid Rybbit Cloud plan), sent as `Authorization: Bearer <key>` | **Yes — secret** |
| `RYBBIT_API_URL` | Rybbit API base URL (default `https://app.rybbit.io`) | No (config) |
| `CHROME_PATH` | Existing — browser path for PDF | No (config) |

### 6.2 Secret vs. non-secret identifiers

- **Secrets (env only):** `META_SYSTEM_USER_TOKEN`, `RYBBIT_API_KEY`. Never in `data/clients/*.json` (committed), never in snapshots, never in browser code.
- **Non-secret per-client identifiers (safe in committed client JSON):** `meta_page_id`, `meta_instagram_id`, `rybbit_site_id`. These are addressing IDs, unusable without the master token/key.

### 6.3 `.env` handling

- Secrets live in a local `.env`. Astro/Vite loads it into `import.meta.env` at dev-server start and inlines the values into the **server** bundle at build time (never the client bundle); adapters also honor a real `process.env.X` at runtime (see §6.1). Do not commit `.env`. Note: a running dev server only picks up `.env` on (re)start; and a production build bakes in the build-time `.env`, so rotate a key by rebuilding or by setting a real `process.env` var at runtime.
- **Add to `.gitignore`:** `.env` and `.env.*`, while allowing a committed `.env.example` documenting the four variables with placeholder values.
- The pull endpoint must **fail closed**: if a required secret is missing, treat that source as failed (block → `manual` + warning). The form still works and the PDF still generates.

### 6.4 Boundaries

- Tokens are never referenced in any `.astro` client `<script>`, `data-*` attribute, or serialized page prop.
- Logs are redacted (§5.4).
- Snapshots contain only metric values and source labels — never credentials, never integration IDs, never internal pull warnings.

## 7. Meta Adapter Spec — `src/lib/meta.ts` (NEW)

> VERIFY markers below flag things to confirm against developers.facebook.com at implementation time.

### Auth model

- Single static Meta System User token from the `META_SYSTEM_USER_TOKEN` env var (read as `process.env.X ?? import.meta.env.X`, per §6.1). Read internally; **never** a function parameter, never logged, never returned, never in a snapshot. If absent (and not in stub mode) → return a degraded result (`source: "manual"`, warning "Meta not configured — enter numbers manually.") — never throw.
- **Required scopes on the token (VERIFY at developers.facebook.com/docs/permissions/):** `pages_read_engagement`, `pages_show_list`, `read_insights`, `instagram_basic`, `instagram_manage_insights`, `business_management`. VERIFY the Instagram permissions specifically — Meta is consolidating IG permissions (e.g. `instagram_basic` direction, and the Instagram-API-with-Facebook-Login vs Instagram-Login split), so IG scopes are the most likely to have changed.
- **Client-config IDs consumed:** `meta_page_id` (Facebook Page ID), `meta_instagram_id` (Instagram professional account ID). Committed client JSON; non-secret.

### Version pinning and the Facebook reach reality

```ts
const GRAPH_VERSION = "v21.0"; // VERIFY at implementation: confirm a current, supported version. A version pin does NOT shield post_impressions_unique from deprecation (see below).
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
```

**Decision — Facebook reach is best-effort, manual-by-default when it fails.** Meta's Page Insights deprecation (the Nov 15 2025 + June 15 2026 waves) applies across **all** API versions, so pinning a version does **not** preserve `post_impressions_unique`. This doc is dated after that window, so treat FB reach as fragile: if the reach call errors, degrade `reach → 0` + warning (never throw). We deliberately do **not** invest in an alternate reach source in v0.2 — graceful degradation + manual entry is the accepted behavior, and it is stated in Scope (§1) so no one is surprised that FB reach may "never pull."

> Do NOT claim the version pin protects the metric — it does not. The pin exists only to avoid `"latest"` drift; the reach metric name itself is VERIFY.

### Public interface

Each function returns its own `source` label so the endpoint (and stub mode) needn't infer it.

```ts
export type MetaSocialResult = {
  source: "meta_api" | "manual" | "mock"; // provenance, set by the adapter
  reach: number;         // 0 on any failure
  engagements: number;   // 0 on any failure
  caption?: string;      // optional hydration (not required for v0.2)
  media_url?: string;    // optional hydration (not required for v0.2)
  warning?: string;      // present only on degradation; adapter NEVER throws
};

export async function fetchFacebookPostMetrics(
  pageId: string | undefined,   // client.meta_page_id
  postUrl: string               // form facebook_post_url (organic only)
): Promise<MetaSocialResult>;

export async function fetchInstagramMediaMetrics(
  igUserId: string | undefined, // client.meta_instagram_id
  mediaUrl: string              // form instagram_post_url
): Promise<MetaSocialResult>;
```

If `pageId`/`igUserId` is missing → return `{ source: "manual", reach: 0, engagements: 0, warning: "Meta not configured for this client — enter numbers manually." }`. `start_date`/`end_date` are NOT needed for post/media-level insights (they are lifetime-to-date for the object), so they are omitted from Meta calls.

### Facebook flow (VERIFY edges)

1. `GET {GRAPH}/{pageId}/posts?fields=permalink_url,message,full_picture,likes.summary(true),comments.summary(true),shares&limit=50&access_token=…` — request one page; do NOT auto-follow paging (YAGNI). VERIFY: `shares` shape `{ count }`; `full_picture` availability.
2. Normalize + `.find()` on `permalink_url` vs `postUrl`. No match → `{ source: "manual", reach: 0, engagements: 0, warning: "Facebook post not found in the Page's 50 most recent organic posts (paid/ad posts unsupported) — enter numbers manually." }`.
3. Reach: `GET {GRAPH}/{postId}/insights?metric=post_impressions_unique&access_token=…` → `data[0].values[0].value`. **VERIFY** it resolves on the chosen version; on a 400/unknown-metric error, `reach → 0` + warning (do not throw). (See "reach reality" above — this is expected to fail post-deprecation.)
4. Engagements (composed from step 1 fields): `likes.summary.total_count + comments.summary.total_count + shares.count`. **VERIFY** exact field names. Composing from stable summary counts is more durable than the deprecation-fragile `post_engaged_users` insight.
5. On success return `{ source: "meta_api", reach, engagements }`.

### Instagram flow (VERIFY edges)

1. `GET {GRAPH}/{igUserId}/media?fields=permalink,caption,media_url,media_type,timestamp&limit=50&access_token=…`.
2. Normalize (strip query/trailing slash, match `/p/` or `/reel/` shortcode) + `.find()` on `permalink` vs `mediaUrl`. No match → `{ source: "manual", reach: 0, engagements: 0, warning: "Instagram media not among the 50 most recent — enter numbers manually." }`.
3. Reach: `GET {GRAPH}/{mediaId}/insights?metric=reach&access_token=…` → `data[0].values[0].value`. **VERIFY** `reach` is a current IG media metric (it is long-standing but was not confirmable in the reference excerpt checked; on error, `reach → 0` + warning).
4. Engagements: `GET {GRAPH}/{mediaId}/insights?metric=total_interactions&access_token=…`. `total_interactions` aggregates organic interactions. **Do not substitute `total_likes`/`total_comments`/`total_views`** — that `total_*` family may include boosted counts, which would silently inflate an "organic-only" number. VERIFY: for some media types `total_interactions` may be unavailable — on error, degrade to 0 + warning.
5. On success return `{ source: "meta_api", reach, engagements }`.

### Field-mapping table (snapshot field → API source)

| Snapshot field | Platform | API source | Verified? |
|---|---|---|---|
| `facebook.reach` | FB post | insights metric `post_impressions_unique` | VERIFY (in deprecation, all versions) |
| `facebook.engagements` | FB post | `likes.summary.total_count` + `comments.summary.total_count` + `shares.count` | VERIFY field shapes |
| `facebook.caption` | FB post | post `message` field | VERIFY |
| `facebook.media_url` | FB post | post `full_picture` field | VERIFY |
| `instagram.reach` | IG media | insights metric `reach` | VERIFY (likely valid, unconfirmed in ref) |
| `instagram.engagements` | IG media | insights metric `total_interactions` (organic; NOT `total_*`) | VERIFY availability per media type |
| `instagram.caption` | IG media | media `caption` field | VERIFY |
| `instagram.media_url` | IG media | media `media_url` field | VERIFY |

### Degradation / error contract

The adapter **never throws**. Every failure path returns a `MetaSocialResult` with `source: "manual"`, `reach: 0`, `engagements: 0`, and a human-readable `warning`. Detect (VERIFY exact codes at developers.facebook.com/docs/graph-api/guides/error-handling/):

- **code 190** (subcodes 463/460) → expired/invalid token → "Meta token expired — enter numbers manually."
- **codes 4 / 17 / 32 / 613** → rate/throttle → "Meta rate limit — try again shortly or enter manually."
- **code 100** (unknown metric/field) → deprecation case → "Meta metric unavailable — enter numbers manually."
- Missing token / missing ID → "Meta not configured — enter numbers manually."

Use an `AbortController` timeout (e.g. 8s) so a hung Meta never blocks the pull.

### Stub mode (pre-credential development) — provenance-honest

To build and manually test steps 1–7 before real tokens exist: if `META_SYSTEM_USER_TOKEN` is absent, the adapter MAY return the current demo numbers (Facebook reach 304 / engagements 2, Instagram reach 167 / engagements 0 — the values in `data-mock-value`) with **`source: "mock"` and no warning**. It MUST NOT return `source: "meta_api"` for fabricated data — that would stamp demo numbers as real API-sourced data in the immutable snapshot, defeating the reason `"mock"` was retained (§4.0). Gate stub mode behind the missing-token check and note the choice in a code comment; swap to the real network path once a token is available.

## 8. Rybbit Adapter Spec — `src/lib/rybbit.ts` (NEW)

> Verified 2026-07 against Rybbit's docs, the `rybbit-io/rybbit` source, and the live instance (site 8725). This section now matches the shipped `src/lib/rybbit.ts`.

### Env & config

- `RYBBIT_API_KEY` (secret, env only) — org-scoped, opaque string, sent as `Authorization: Bearer <key>`. One key covers every site in the org. Read as `process.env.RYBBIT_API_KEY ?? import.meta.env.RYBBIT_API_KEY` (see §6.1). Cloud API keys require a paid plan (unavailable on free/basic; Standard ≈ 20 req/min).
- `RYBBIT_API_URL` (config, default `https://app.rybbit.io`) — configurable for self-hosted.
- `rybbit_site_id` (client JSON, non-secret) — numeric string. Empty/absent = Rybbit disabled for this client.

If key or site id is missing at call time → treat as "not configured", return views 0 + warning; never throw.

### Public interface

Returns its own `source` label (parallel to the Meta adapter).

```ts
export type RybbitViewsResult = {
  source: "rybbit_api" | "manual" | "mock"; // provenance, set by the adapter
  listing_views: number; // 0 on any failure / not-configured
  warning?: string;      // present only on degradation; NEVER throws
};

/**
 * Fetch listing-page views for one listing path within a date range.
 * NEVER throws. On any error returns { source: "manual", listing_views: 0, warning: "..." }.
 * @param siteId    client.rybbit_site_id (numeric string) — undefined => not configured
 * @param listingUrl the pasted listing_url; only its pathname is used to filter
 * @param startDate  YYYY-MM-DD (form start_date)
 * @param endDate    YYYY-MM-DD (form end_date)
 */
export async function fetchRybbitListingViews(
  siteId: string | undefined,
  listingUrl: string,
  startDate: string,
  endDate: string
): Promise<RybbitViewsResult>;
```

### Endpoint & params (verified)

- Host: `https://app.rybbit.io` (default; overridable via `RYBBIT_API_URL`). **Strip any trailing slash** before building the URL, so a configured `https://app.rybbit.io/` does not produce `//api/...` (which 404s).
- Endpoint: `GET ${apiUrl}/api/sites/{siteId}/metric?parameter=pathname` — `siteId` is a PATH param. This returns one row **per matching pathname**, each carrying that path's true total `pageviews`.
  - **Do NOT use `/overview`.** With a pathname filter, `/overview.pageviews` returns a lower, session-scoped figure that under-counts listing views (verified on site 8725: one listing read **1593** via `/overview` vs **2387** via `/metric`).
- Header: `Authorization: Bearer ${RYBBIT_API_KEY}`.
- Query params are **snake_case**: `parameter=pathname`, `start_date`, `end_date`, `time_zone` (use `UTC`), and a `filters` param as a JSON string array.
- Filter: `[{ "parameter": "pathname", "type": "equals", "value": [<path variants>] }]`, where `pathname = new URL(listingUrl).pathname` (wrap in try/catch; bad URL → views 0 + warning). `pathname` is a valid filter parameter and `equals` a valid type (confirmed in `rybbit-io/rybbit` `shared/src/filters.ts`).
  - **Trailing-slash normalization (required).** Rybbit records paths WITH a trailing slash (e.g. `/listings/123-main-st/`), but a pasted listing URL usually has none. Match BOTH variants — a filter `value` array is OR'd: `base = pathname.replace(/\/+$/, "")`; `value = base === "" ? ["/"] : [base, base + "/"]`. Without this, every slash-less listing URL returns a false 0 (verified: the no-slash variant alone returned 0).

### Response envelope & `listing_views` mapping (verified)

Response shape: `{ "data": { "data": [ { "value": "<pathname>", "pageviews": <number>, "count": <sessions>, ... } ], "totalCount": <n> } }`.

Map `listing_views` to the **sum of `data.data[].pageviews`** across the returned rows — total page-views, NOT `count` (that is sessions) and NOT unique users. Summing covers both trailing-slash variants. An **empty rows array is a valid `0`** (e.g. an untracked REALTOR.ca / foreign-IDX URL) → `{ source: "rybbit_api", listing_views: 0 }`, not a failure; only a malformed envelope (no `data.data` array) degrades to `manual`.

> **Exact-path is intentional.** Each pasted URL returns that URL's own count. A property reachable under multiple URLs (e.g. after a site migration to MLS-ID-suffixed slugs) is reported per-URL — the coordinator pastes the current canonical listing URL. Do NOT add a `contains` rollup to merge variants unless explicitly requested (it risks over-counting sibling pages).

### Degradation

Wrap the whole call in try/catch. Missing key, missing/empty `siteId`, malformed `listingUrl`, non-2xx, timeout, or JSON parse error → `{ source: "manual", listing_views: 0, warning: "Rybbit auto-fetch unavailable for listing views. Please enter manually." }`. Use an `AbortController` timeout (e.g. 8s).

### Stub mode — provenance-honest

If `RYBBIT_API_KEY` is absent during pre-credential dev, the adapter MAY return `{ source: "mock", listing_views: 1801 }` (current `data-mock-value`) with no warning, so the end-to-end flow is testable with zero credentials. It MUST use `source: "mock"`, never `"rybbit_api"`, for fabricated data. Note the choice in a code comment; swap to the real path once a key exists.

## 9. Client-side rewrite — `src/pages/c/[clientSlug]/index.astro`

Replace the `setTimeout(…, 450)` fake with a real `fetch("/api/pull", …)`. Preserve all existing input `name`s, class names, and `data-*` hooks (`data-pull-trigger`, `data-pull-card`, `data-pull-status`, `data-pull-detail`, `data-approval`, `data-submit-button`, `data-submit-panel`, `is-locked`/`is-pulled`). Add the three hidden **source** carriers from §5.3 inside the form.

**Required edits to the markup (prescriptive, not optional):**
1. Add the three `*_source` hidden inputs inside `#report-form` (§5.3).
2. The remaining `data-mock-field`/`data-mock-value` attributes on `website_views`/`facebook_*`/`instagram_*` become inert once `applyMockData()` is removed; they may be left or cleaned up (harmless either way).

> Because the coordinator may type everything and never pull, the review/approve/submit unlock must NOT depend solely on a successful pull. The script below unlocks review on **any** pull outcome (success or total failure), and the manual inputs (section 03: showings/inquiries/days on market/REALTOR.ca) are editable without pulling at all.

Replacement script (illustrative; keep it boring, no new deps). Note `showNotice` targets the **`.post-review-row`** for FB/IG and falls back to `.import-review-card` for website, deduping per row:

```js
const form = document.getElementById("report-form");
const pullButtons = document.querySelectorAll("[data-pull-trigger]");
const pullCard = document.querySelector("[data-pull-card]");
const statusText = document.querySelector("[data-pull-status]");
const statusDetail = document.querySelector("[data-pull-detail]");
const approvalCheckbox = document.querySelector("[data-approval]");
const submitButton = document.querySelector("[data-submit-button]");
const submitPanel = document.querySelector("[data-submit-panel]");
const NOTICE = "Auto-fetch unavailable. Please enter numbers manually.";

const groups = {
  website:   ["website_views"],
  facebook:  ["facebook_reach", "facebook_engagements"],
  instagram: ["instagram_reach", "instagram_engagements"],
};
const $ = (name) => form.querySelector(`[name="${name}"]`);
const setVal = (name, v) => { const el = $(name); if (el) el.value = String(v ?? 0); };
const enable = (name) => { const el = $(name); if (el) el.disabled = false; };
const unlock = (key) => groups[key].forEach(enable);

// Attach the notice to the row (FB/IG share one card, so per-row is required),
// falling back to the card for website. Dedup per container.
function noticeTarget(name) {
  const el = $(name);
  return el?.closest(".post-review-row") ?? el?.closest(".import-review-card") ?? null;
}
function showNotice(key) {
  groups[key].forEach((name) => {
    const target = noticeTarget(name);
    if (target && !target.querySelector("[data-fetch-notice]")) {
      const p = document.createElement("p");
      p.dataset.fetchNotice = "";
      p.className = "import-fetch-notice";
      p.textContent = NOTICE;
      target.appendChild(p);
    }
  });
}

function unlockReview() {
  pullCard?.classList.add("is-pulled");
  if (statusText) statusText.textContent = "Data pulled";
  if (statusDetail) statusDetail.textContent = "Review the values below, edit anything that looks off, then create the report.";
  if (approvalCheckbox instanceof HTMLInputElement) approvalCheckbox.disabled = false;
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
  submitPanel?.classList.remove("is-locked");
}

function applyBlock(key, source, fills) {
  Object.entries(fills).forEach(([name, v]) => setVal(name, v));
  const el = $(`${key}_source`);
  if (el) el.value = source;           // "rybbit_api" | "meta_api" | "mock" | "manual"
  unlock(key);
  if (source === "manual") showNotice(key);
}

async function pull(button) {
  button.disabled = true;
  button.textContent = "Pulling...";
  const payload = {
    client_slug:        $("client_slug").value,
    listing_url:        $("listing_url").value,
    facebook_post_url:  $("facebook_post_url").value,
    instagram_post_url: $("instagram_post_url").value,
    start_date:         $("start_date").value,
    end_date:           $("end_date").value,
  };

  let data = null;
  try {
    const res = await fetch("/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) data = await res.json();
  } catch { /* swallow — degrade below */ }

  if (data) {
    applyBlock("website",   data.website.source,   { website_views: data.website.listing_views });
    applyBlock("facebook",  data.facebook.source,  { facebook_reach: data.facebook.reach, facebook_engagements: data.facebook.engagements });
    applyBlock("instagram", data.instagram.source, { instagram_reach: data.instagram.reach, instagram_engagements: data.instagram.engagements });
  } else {
    // Total failure (network/HTTP): everything degrades to editable + notice + manual label.
    Object.keys(groups).forEach((k) => {
      unlock(k);
      showNotice(k);
      const el = $(`${k}_source`);
      if (el) el.value = "manual";
    });
  }

  unlockReview(); // review/approve/submit unlocked EITHER way — a failed pull never blocks report creation.
  pullButtons.forEach((b) => { if (b instanceof HTMLButtonElement) { b.disabled = false; b.textContent = "Refresh data"; } });
}

pullButtons.forEach((b) =>
  b.addEventListener("click", () => { if (b instanceof HTMLButtonElement) pull(b); }));
```

Add a small muted style for `.import-fetch-notice` in the existing stylesheet if desired; not load-bearing.

## 10. Acceptance Criteria (definition of done)

- [ ] `MetricSource` widened to `"rybbit_api" | "meta_api" | "manual" | "mock"`; `npx astro check` passes.
- [ ] `ClientProfile` has optional `meta_page_id` / `meta_instagram_id` / `rybbit_site_id`; existing `stone-sisters.json` still loads. (Type change lands before the ClientForm edit.)
- [ ] `ClientForm.astro` shows the "Integrations (optional)" section; `client.ts` persists valid numeric IDs and omits empty/invalid ones; `assertSafeId` is NOT used on them.
- [ ] `snapshot.ts` sets each block's `source` from its validated hidden field (fallback `manual`); `warnings` stays `[]` (no pull warnings persisted).
- [ ] `ReportSnapshot.client` still omits all integration IDs (hand-pick untouched); no integration ID ever appears in a snapshot JSON.
- [ ] `POST /api/pull` exists, reads tokens from `process.env`, fills the existing input `name`s — no `name` renamed.
- [ ] Pull is **per-source**: one source failing never clears or blocks another source's values; FB and IG degrade independently even though they share a card (notice on the correct `.post-review-row`).
- [ ] `/api/pull` always returns HTTP 200 on a resolvable client (400/404 only for missing/unknown slug); never throws on upstream failure/timeout.
- [ ] On a source failure, its input/row shows the advisory notice; inputs stay enabled/editable and keep typed values.
- [ ] REALTOR.ca inputs are never fetched from any API and are editable/submittable **without ever clicking Pull**. There is no Google Ads field or connection anywhere in the product.
- [ ] Both adapters (`meta.ts`, `rybbit.ts`) never throw; on failure return metrics 0 + `source: "manual"` + a warning.
- [ ] Stub mode (any adapter, when its secret is unset) returns fabricated demo numbers with `source: "mock"` — never `meta_api`/`rybbit_api`.
- [ ] All four env vars documented in `.env.example`; `.env`/`.env.*` gitignored; no token appears in browser code, client JSON, snapshots, or logs.
- [ ] With every secret unset, the form still submits and a PDF still generates; no pull warning text renders on the seller-facing report.
- [ ] No new dependency, database, cron, or OAuth flow added.

## 11. Manual Test Plan

No test runner or lint script exists. Verify manually with `npm run dev` (http://127.0.0.1:4321) and typecheck with `npx astro check`. Every scenario must end with **the form submitting and `/api/pdf/<id>` returning a valid PDF.**

0. **Typecheck:** `npx astro check` passes.
1. **Happy path (real creds or stub):** click Pull → `website_views`, `facebook_*`, `instagram_*` fill; hidden sources = `rybbit_api`/`meta_api`/`meta_api` (or all `mock` in stub) → approve → Create Report → snapshot shows those `source` labels → Download PDF renders. Confirm no warning card on the PDF.
2. **Expired-token path:** invalid/expired `META_SYSTEM_USER_TOKEN` (Rybbit valid) → Pull → `website_views` fills; the Facebook row and Instagram row **each** show the notice and stay editable; both hidden sources = `manual` → type numbers → Create Report → PDF renders; facebook/instagram `source` = `manual`; **no** Meta warning text on the seller PDF.
3. **FB-only vs IG-only failure (shared-card check):** force only Facebook to fail (e.g. a `facebook_post_url` not in the last 50 posts) with Instagram succeeding → confirm the notice appears on the **Facebook** `.post-review-row` only, Instagram fills normally, and the two are visually distinct. Then repeat with only Instagram failing.
4. **Rate-limit path:** force a Meta rate-limit response → `/api/pull` returns 200; notice shown; no crash; form submits → PDF renders.
5. **Full-offline path:** disconnect network (or unset all secrets, non-stub) → Pull → endpoint returns 200 with all blocks `manual` (or fetch rejects → total-failure branch); every metric input shows the notice and stays editable → fill by hand → Create Report → PDF renders; all sources = `manual`.
6. **Manual-only, no pull:** without ever clicking Pull, fill section 03 (showings/inquiries/days/REALTOR) by hand, approve, Create Report. Confirm those inputs were editable without a pull and no network request targeted REALTOR.ca.
7. **Missing / mistyped IDs:** (a) a client with no `meta_page_id`/`rybbit_site_id` → Pull → those blocks degrade to `manual` + "not configured" warning; form still submittable. (b) Enter a non-numeric Page ID in the client form, save, reopen → confirm it was silently dropped (field empty), documenting the known trade-off.
8. **Client form round-trip:** create/edit a client with valid numeric integration IDs → confirm they land in `data/clients/<slug>.json` and NOT in any resulting snapshot JSON.

## 12. Implementation Plan (file-by-file, dependency order)

Steps 1–6 are landable and testable with NO real tokens if adapters use stub mode (§7/§8). Real credentials only change adapter internals later.

1. **`src/lib/types.ts`** — widen `MetricSource` to `"rybbit_api" | "meta_api" | "manual" | "mock"`; add optional `meta_page_id`, `meta_instagram_id`, `rybbit_site_id` to `ClientProfile`. The `manual` block has no Google Ads fields — there is no Google Ads metric or connection anywhere in this product. **Must precede step 7.** Done when `npx astro check` passes.
2. **`src/lib/rybbit.ts`** (NEW) — `fetchRybbitListingViews`; never throws; returns its own `source`; stub mode (`source: "mock"`) when `RYBBIT_API_KEY` absent. Endpoint/field verified per §8 (`GET /metric?parameter=pathname`, sum `data.data[].pageviews`, trailing-slash normalized). Done when it returns a typed result for success and failure.
3. **`src/lib/meta.ts`** (NEW) — `fetchFacebookPostMetrics`, `fetchInstagramMediaMetrics`; never throw; return their own `source`; stub mode (`source: "mock"`) when token absent. Done when both return `MetaSocialResult` and never reject.
4. **`src/pages/api/pull.ts`** (NEW, `prerender = false`) — orchestrates the three adapters, maps each `source` + warnings, always 200 on resolvable client. Done when curling it returns valid JSON with/without tokens and never 5xx.
5. **`src/pages/c/[clientSlug]/index.astro`** — add the three hidden `*_source` carriers; replace the `setTimeout` fake with the real `fetch("/api/pull")` handler (§9). Done when Pull hydrates editable inputs on success and, on any failure, shows the per-row notice yet still unlocks review/submit, and manual inputs work without pulling.
6. **`src/pages/api/snapshot.ts`** — import `MetricSource`; add `sourceField`; replace the three `"mock"` source labels with `sourceField(...)`. Leave `warnings: []` as-is. Done when a post-pull snapshot records `meta_api`/`rybbit_api` (or `mock` in stub), a manual/failed one records `manual`, and no pull warnings are persisted.
7. **`src/components/ClientForm.astro`** — add the "Integrations (optional)" section (§4.1). Requires step 1. Done when the create/edit form shows and round-trips the three IDs.
8. **`src/pages/api/client.ts`** — persist the three IDs via `optionalId()`, omitting empty/invalid. Done when submitting writes valid numeric IDs into `data/clients/<slug>.json` and drops non-numeric ones.
9. **`.env.example` + `.gitignore`** — add `.env.example` with the four vars (empty); add `.env` and `.env.*` to `.gitignore`. Done when secrets are documented and ignored.
10. **`README.md` / `CLAUDE.md` note (optional)** — one line: tokens are server-side env only; per-client non-secret IDs live in committed client JSON; adapters run in stub mode (`source: "mock"`) when a token is absent.
