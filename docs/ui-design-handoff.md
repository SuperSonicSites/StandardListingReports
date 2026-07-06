# Supersonic Seller Report Generator — UI/UX Designer Handoff

This document is the design brief for the **app chrome** of the Supersonic Seller Report Generator — every screen a person touches *around* the finished report. It captures the current built state (with real tokens, measurements, and copy strings cited as baselines), then gives concrete, restrained recommendations tied to the client's design philosophy. Use it as a reference to design in Figma; each chapter is self-contained and buildable, and cross-references the shared **Design Foundations** for token names.

### The product in one minute

Supersonic is a **white-label seller-report generator** for real-estate marketing teams (Canadian: en-CA, REALTOR.ca, BC brokerages). A coordinator fills a per-client form, optionally pulls live numbers (REALTOR.ca listing stats, Rybbit website views, Meta/Facebook/Instagram post views), the reviewed numbers freeze into a JSON **snapshot**, and a branded multi-page **PDF report is rendered** from it. The PDF is the product — this is a report compiler, not a dashboard or CRM. Ethos: KISS / YAGNI / boring code; **restraint is a feature.**

**Two user types:**
- **Agency admin** — sets up client brand profiles (logo, colors, disclaimer, integrations, coordinator password). Uses `/login`, the clients dashboard, and the client setup form.
- **Client coordinator** — fills the report form for *their own client only*. Uses `/login` and `/c/<slug>/`.

**Out of scope (already good, do not touch):** the report **preview page body** and the **PDF output** (route `/reports/<id>`). The client considers these "perfect now." The report page's sticky **toolbar** (Back link + "Download PDF") is app chrome and may be referenced for consistency, but is not a design focus. Do not spec the report sheets.

**The white-label brand wall (load-bearing, repeated throughout):** App chrome carries the **Supersonic** brand (cyan `#29abe2` / navy `#0d1522`). A **report** carries only the **client's** brand (their primary/accent colors, their logo). Never mix: no client color in a button, badge, or focus ring; no Supersonic mark inside a report. Every token and recommendation in this doc is app-chrome-only unless it explicitly concerns a client asset being *identified* (never *styled into chrome*).

### Surface map

| Screen | Route | Primary user | Its one job |
|---|---|---|---|
| Sign in | `/login` | both | Password gate; earn trust fast and calmly |
| Clients dashboard (home) | `/` | agency admin | See every client; open a report form or create a client |
| Client setup — create | `/admin/clients/new` | agency admin | Build a client brand profile (rarely, carefully) |
| Client setup — edit | `/admin/clients/<slug>/edit` | agency admin | Update a profile; delete a client (danger zone) |
| Coordinator report form | `/c/<slug>/` | client coordinator | Paste a link, pull data, review, approve, create the report |
| Server error / validation pages | rendered by `/api/snapshot`, `/api/client` | both | Recover from a rejected submit without losing entries |

Shared across all interior surfaces: the **global app chrome** (document shell, background wash, sticky header, page-header + back-link pattern).

### How to apply the design philosophy to *this* app

The client's principles (below) are the spine of every recommendation. Rather than re-list them, here is how the highest-leverage ones bite on this specific product:

- **Make the default path excellent / hide complexity until needed.** The coordinator's happy path is: paste one REALTOR.ca link → Pull → confirm → Create. Everything downstream stays hidden until a pull runs. The **progressive-disclosure directive** is the centerpiece: reveal only what has to be dealt with at each stage; intake first, then reveal per-need, dim/fold completed stages, never show a wall of empty inputs.
- **Make states obvious.** The whole form is a traffic-light of *source states* (pulled / manual / partial / demo). Each must be legible at a glance — and **demo/mock data must be impossible to mistake for real numbers** (a hard requirement, not polish: fabricated numbers reaching a real client unlabeled is the product's worst failure).
- **Prevent errors before explaining them / make recovery simple.** Today's validation is server-side only and dead-ends on an unstyled page. The fix is inline, before-submit validation with a friendly recovery path — never a dead end.
- **Write copy like a helpful human.** De-jargon everything: "Create client," not "Create endpoint"; describe outcomes, not the `data/` filesystem.
- **Build with restraint.** Two elevation levels, two motion durations, one focus ring, no footer, no hamburger. The audience is an internal team at a desk — do not over-build.

The full principle set the client authored: *Clarity over cleverness · make the primary action obvious · reduce choices · hierarchy to guide the eye · predictable navigation · focused screens · content over chrome · spacing as a tool · intentional alignment · responsive, alive interactions · instant feedback · prevent errors, then explain, then recover · respect platform conventions · consistent but not rigid · motion explains, not decorates · design for thumbs, eyes, and context · accessibility as foundation (keyboard, touch, screen reader, reduced motion from the start) · familiar patterns unless there's a strong reason · hide complexity until needed · make the default path excellent · avoid visual noise · let important things breathe · make states obvious (empty, loading, success, error, disabled) · feel trustworthy · optimize real and perceived speed · destructive actions clear and reversible · polish the tiny moments · remove anything that doesn't help the user succeed · make the product feel inevitable.*

---
## Design Foundations (system, tokens, brand)

The shared visual language every screen inherits. These tokens live in `src/styles/global.css` (`:root`) and are the *app-chrome* system only — the Supersonic-branded shell around the tool. The report sheets carry a **separate** neutral token set (`.report-frame`) and are out of scope. Where a token exists today it is cited as the **current baseline**; each recommendation traces to the design philosophy.

> **The one non-negotiable rule for this whole chapter — the white-label wall.** App chrome is Supersonic (cyan/navy). The report is the client (their primary/accent). A token from one system may never appear in the other. No client color in a button, badge, or focus ring; no Supersonic cyan inside a report. Every color role below is app-chrome-only.

### Color system

#### Current baseline (`:root`)

| Token | Value | Current role |
|---|---|---|
| `--ss-ink` | `#0d1522` | Near-black. Primary buttons, all headings, input text |
| `--ss-text` | `#182230` | Default body text |
| `--ss-text-soft` | `#47536b` | Secondary text, descriptions, nav links |
| `--ss-muted` | `#64748b` | Tertiary: captions, counts, helper spans, timestamps |
| `--ss-accent` | `#29abe2` | Supersonic cyan. Focus borders, hover accents, brand mark |
| `--ss-accent-deep` | `#0f8ac4` | Deeper cyan. Spinner, checkbox `accent-color`, brand mark |
| `--ss-accent-ink` | `#0b6d9f` | Accent *text* on light (hover link color, eyebrows, badges) |
| `--ss-accent-soft` | `rgba(41,171,226,0.12)` | Cyan wash: badge fill, hover backgrounds, focus glow |
| `--ss-bg` | `#f5f7fa` | Page background |
| `--ss-surface` | `#ffffff` | Cards, inputs, panels |
| `--ss-border` | `#e4e9f0` | Default hairline: card edges, dividers |
| `--ss-border-strong` | `#cdd6e1` | Input borders, dashed empty-state edge |

#### Roles & where each is *allowed*

- **Ink** (`--ss-ink`) — the single "loud" neutral. Reserved for primary-action fills and heading type. Do not use as body text (too heavy at paragraph scale — that is `--ss-text`'s job).
- **Text ramp** — a strict 3-step hierarchy: `--ss-text` (body) → `--ss-text-soft` (supporting) → `--ss-muted` (metadata). *Hierarchy to guide the eye:* never introduce a 4th neutral; if something needs to recede further, use size/weight, not a new gray.
- **Cyan family** — the entire brand-accent surface. `--ss-accent` = strokes/dividers-of-attention; `--ss-accent-ink` = accent *text* (it clears AA on white, the raw `--ss-accent` does not — keep this split); `--ss-accent-soft` = fills and glows. Cyan is for **wayfinding and state**, never for large fills.
- **Surface/border** — structure comes from a hairline (`--ss-border`) on a white surface over a cool-gray page. `--ss-border-strong` is exclusively the *interactive edge* (inputs, dashed drop targets) so a field is visibly a field before you touch it.

#### Semantic colors (currently ad-hoc — RECOMMENDATION: tokenize)

The app hard-codes three status palettes inline. Promote them to named tokens so every surface (buttons, banners, the server error pages, the pull warnings) draws from one source:

| Proposed token | Value (from current usage) | Role |
|---|---|---|
| `--ss-danger` | `#dc2626` | Danger button fill, delete |
| `--ss-danger-ink` | `#b91c1c` | Danger text (login error, danger hover) |
| `--ss-danger-soft` | `#fef2f2` | Danger banner fill (login error, danger zone) |
| `--ss-danger-border` | `#fecaca` | Danger card border |
| `--ss-warn-ink` | `#9a3412` | Degraded-pull notice text (current `.import-fetch-notice`) |
| `--ss-warn-soft` | `#fff7ed` | Degraded-pull notice fill |
| `--ss-success` | *net-new* — propose `#0f8ac4` reusing accent-deep, or a green `#15803d` | "Data pulled" success dot/state |

*Prevent errors before explaining them; make states obvious.* Today "success" has no color of its own (the pulled dot borrows raw `--ss-accent`). Decide deliberately: either success == brand cyan (calm, on-brand) or success == green (conventional). Given *respect platform conventions*, a subtle green success dot is the safer read; keep warnings amber and errors red as-is.

### Type scale

Inter, shipped locally at 400/500/600/700 (`@font-face` in global.css). Keep the local ship — it is why PDF typography is machine-independent. Headings use tight negative tracking; body sits at `letter-spacing: 0`.

#### Proposed scale (current rem values as baseline)

| Role | Size (rem) | Weight | Tracking | Line-height | Current source |
|---|---|---|---|---|---|
| Display / hero H1 | `clamp(1.9, 4.2vw, 2.7)` | 700 | −0.035em | 1.08 | `.app-hero h1` (baseline) |
| Coordinator hero H1 | `clamp(2, 4.4vw, 3)` | 700 | −0.035em | 1.06 | `.client-form-hero h1` |
| Panel/section H1 | `1.45` | 700 | −0.02em | 1.1 | `.login-panel h1` |
| Section H2 | `1.25` | 700 | −0.02em | 1.2 | `.section-heading h2` |
| Card H2 (form section) | `1.0` | 700 | −0.01em | 1.3 | `.client-section-header h2` |
| Card H3 | `0.96` | 700 | normal | 1.3 | `.import-review-head h3` |
| **Eyebrow** | `0.72` | 700 | **+0.12em**, UPPERCASE | 1 | `.eyebrow` — color `--ss-accent-ink` |
| Body | `1.0` | 400 | 0 | 1.7 | `.app-hero p` |
| Body-strong / label | `0.84` | 600 | 0 | 1.4 | `label` |
| UI default (buttons, inputs) | `0.92` | 500–600 | 0 | 1.5 | `.button`, `.client-field input` |
| Small / helper | `0.86` | 500 | 0 | 1.5 | `.client-section-header p` |
| Caption / meta | `0.78–0.82` | 500–600 | 0 | 1.45 | `.count-badge`, `label span` |
| Micro-label (badge, dt) | `0.68–0.72` | 650–700 | +0.04em, UPPERCASE | 1.2 | `.source-badge`, `.post-review-row dt` |

**Recommendations, restrained:**
- **Consolidate the label size.** `0.84rem` / `0.86rem` / `0.82rem` are three near-identical steps. *Be consistent, but not rigid* — collapse to two rungs (`0.84` field label, `0.82` metadata). Fewer steps = a cleaner hierarchy the eye can actually parse.
- **Keep the eyebrow's +0.12em tracking** — it is the app's signature and the one place uppercase is allowed. The *report* uses a looser `+0.08em`; do not unify them (white-label wall).
- **Body line-height 1.7 is generous and correct** — *let important things breathe*. Keep it for prose; UI controls stay tighter (1.4–1.5).
- App chrome should stick to the four shipped weights (400/500/600/700). Any 650 in chrome (`.source-badge`, `.post-review-row dt`) will fall back — round to 600 or 700.

### Spacing scale

The app uses an informal 2/4px-step ramp. **RECOMMENDATION: name it** so the designer places to a grid rather than eyeballing:

| Token | px | Typical use (observed) |
|---|---|---|
| `--sp-1` | 4 | icon gaps, tightest inline gaps |
| `--sp-2` | 6–7 | label→input gap, small chip gaps |
| `--sp-3` | 8–10 | button gap, card-link gaps, nav gap |
| `--sp-4` | 12–14 | field gaps, hero action gaps, card grid gap |
| `--sp-5` | 16–18 | intra-card padding, review-card gap |
| `--sp-6` | 22–24 | card padding, panel padding |
| `--sp-7` | 28–30 | panel/admin-form padding |
| `--sp-8` | 40–44 | hero vertical rhythm |

*Use spacing as a design tool; align everything intentionally.* The values already cluster on a near-4px grid — the ask is only to **snap the stragglers** (7px, 9px, 11px, 15px appear) to the nearest rung. Highest-leverage low-risk cleanup in the system.

### Radius scale

| Token | Value | Use |
|---|---|---|
| `--ss-radius-lg` | 16px | Panels, cards, modal card, login panel, form cards |
| `--ss-radius` | 12px | Client cards, review cards, count-badge context |
| `--ss-radius-sm` | 8px | Inputs, small buttons, badges' container, brand link |
| *(inline)* `10px` | — | `.button` (primary/secondary) — **inconsistent** |
| *(inline)* `999px` | — | Pills: count-badge, source-badge, status dot |

**Recommendation:** buttons use a one-off `10px` while everything else is 8/12/16. Move buttons to `--ss-radius-sm` (8px) or add a deliberate `--ss-radius-btn: 10px` token — pick one and name it. Keep `999px` as `--ss-radius-pill` for all chips and dots.

### Elevation / shadow

| Token | Value | Use |
|---|---|---|
| `--ss-shadow-sm` | `0 1px 2px rgba(13,21,34,.05)` | Buttons, small cards, client cards, submit panel |
| `--ss-shadow` | `+ 0 12px 32px -16px rgba(13,21,34,.14)` | Panels, modal, login, card hover |

A tight, two-step elevation model — correct and *restrained*.
- **Shadows are cool-tinted** (navy `rgba(13,21,34,…)`), not black. Preserve — it keeps elevation from looking dirty on the cool-gray page.
- **Two levels only.** Resting cards = `sm`; things that float or matter (panels, pull modal, hover) = full. Do not invent a third.
- The one background flourish is a **radial cyan glow** behind hero areas (`radial-gradient(1100px 380px at 50% -120px, rgba(41,171,226,.08), transparent)`). Keep it — the only "chrome" that reads as brand atmosphere. Static under reduced-motion; do not animate it.

### Button family

Base `.button`: min-height **42px**, radius 10px, padding `0 1.1rem`, font `0.92rem/600`, transition 140ms ease.

| Variant | Rest | Hover | Notes |
|---|---|---|---|
| **primary** | `--ss-ink` fill, white text, `shadow-sm` | bg → `#1c2a40` | The one obvious action per screen |
| **secondary** | white fill, `--ss-border-strong` edge, `--ss-text` | edge → `--ss-accent`, text → `--ss-accent-ink` | Companion action |
| **ghost** | transparent, `--ss-text-soft` | bg → `--ss-accent-soft`, text → `--ss-accent-ink` | Tertiary (Edit, Back) |
| **danger** | `--ss-danger` fill + edge, white | bg → `#b91c1c` | Delete only |
| **`.sm`** | min-height 36px, radius 8px, pad `0 .85rem`, `0.85rem` | — | Card-level actions |
| **`.is-busy`** | `opacity .65`, `pointer-events:none` | — | Submitting state |

**All states — the gaps to close:**
- **`:focus-visible`** — global `2px solid --ss-accent, offset 2px`. Keep. *Accessibility as foundation.*
- **`:active`** — **missing.** Add a pressed state: subtle darken + `transform: translateY(1px)` (suppressed under reduced-motion). *Give instant feedback.*
- **`:disabled`** — base `.button` has **no disabled style**; only the bespoke `.client-*-button` classes do (gray `#9ca3af`, `not-allowed`). Add one shared disabled treatment to `.button` (reduced-contrast fill, muted text, `not-allowed`) so a disabled primary never looks clickable.
- **`.is-busy` needs a spinner.** It only dims today. Pair the dim with an inline 14px spinner (reuse `pull-spin` keyframe) and swap the label. Reduced-motion: keep the label swap, drop the spin.
- **Two parallel button systems exist** — generic `.button.*` and the coordinator's `.client-pull-button` / `.client-submit-button` (min-height 40, radius 8, ink fill). Fold the client buttons into `.button.primary` + a size modifier. One family, fewer surprises.

**Touch:** 42px base clears 44px loosely; **`.sm` at 36px does not.** On the coordinator form (used on tablets in the field) bump `.sm` to 40px min-height on coarse pointers, or never use `.sm` for a lone primary action.

### Form-control family

Two near-duplicate input systems: admin `input,textarea` (padding `0.7rem 0.85rem`, no explicit min-height) and coordinator `.client-field input` (min-height 42px, `0.92rem`). **RECOMMENDATION: unify on one control** — min-height 42px (44 on coarse pointers), `--ss-border-strong` edge, `--ss-radius-sm`, `0.92rem/500`, ink text.

| State | Treatment (baseline → recommendation) |
|---|---|
| **default** | white fill, `--ss-border-strong` edge, ink text, `font-weight:500` |
| **hover** | edge → `--ss-accent` (only when not readonly) — keep |
| **focus** | edge → `--ss-accent` + `box-shadow 0 0 0 3px --ss-accent-soft` — keep; the signature focus ring |
| **readonly** | `#f1f5f9` fill, `#475569` text, `not-allowed` — keep (slug-on-edit) |
| **disabled** | *inconsistent today* — define once: same as readonly but reduced text contrast; no hover |
| **invalid** | **MISSING — the biggest gap.** See below |

**Control-specific notes:**
- **`input[type=color]`** — min-height 46px, pointer cursor. Keep native; pair each with a small read-only hex text field so the value is legible and copyable (net-new, low-cost).
- **`input[type=file]`** (logo upload) — currently unstyled native control. Wrap as a bordered drop-zone matching `.empty-state` (dashed `--ss-border-strong`), with filename + size feedback after pick and the current-logo preview beside it on edit. Show the `<=1MB / PNG,JPEG,SVG,WebP` rule as helper text *before* the error.
- **`input[type=password]`** — add a show/hide toggle on `/login` and the coordinator-password field.
- **`textarea`** — `resize:vertical`, min-height 108px (fields) / 56px (caption). Caption/notes capped server-side (300/600). Add a live **character counter** that turns `--ss-warn-ink` near the cap.
- **`number` inputs** (`.import-metric-input`) — right-aligned, weight 700, the big one at `1.5rem`. Deliberate "headline number" treatment. Keep; ensure the focus ring still reads at that size.
- **checkbox toggles** (`.client-toggle`, `.client-approval`) — 17–18px native box, `accent-color: --ss-accent-deep`. The whole label is the click target — ensure the label row is ≥44px tall on coarse pointers. Keep `accent-color`.

#### Invalid / error state (net-new, required)

The app has **no inline invalid state** — validation failures render an *unstyled* dead-end page. Define the token-level treatment here so every form inherits it:
- **Field-invalid:** edge → `--ss-danger`, focus glow → `--ss-danger-soft`, a `--ss-danger-ink` message directly beneath the label (`0.8rem/600`), `aria-invalid="true"` + `aria-describedby` to the message.
- **Form-level error banner:** a `--ss-danger-soft` fill / `--ss-danger-ink` card at the top of the form (reuse the `.login-error` treatment, which already exists), scrolled into view and focus-moved on submit failure.
- This replaces the bare error page as the primary path. Keep the helpful copy ("your entries are preserved") but *inline it*.

### Chips & badges

| Chip | Baseline | Role |
|---|---|---|
| **count-badge** | pill, `--ss-border` edge, `--ss-bg` fill, `--ss-muted` text, `0.78rem/600` | "3 clients" count on dashboard |
| **source-badge** | pill, `rgba(41,171,226,.3)` edge, `--ss-accent-soft` fill, `--ss-accent-ink` text, `0.7rem/650`, min-height 22px | Data-source label on review cards |

The **source-badge is a stateful chip** — its label changes by pull state. Today the *color* is fixed cyan regardless. RECOMMENDATION — give each state a distinct chip color drawn from the semantic tokens:

| State | Label e.g. | Chip color |
|---|---|---|
| pulled | "REALTOR.ca — pulled" | cyan (current `--ss-accent-soft` / `--ss-accent-ink`) |
| manual | "Rybbit — manual" | neutral (`--ss-bg` / `--ss-muted`, like count-badge) |
| partial | "Meta — partial" | amber (`--ss-warn-soft` / `--ss-warn-ink`) |
| demo | "Meta — demo" | **must be unmistakable** — amber/warn, never cyan; mock data must never read as real |

The demo case is a hard requirement, not polish. *Make the interface feel trustworthy.* Round the `650` weight to `600`.

### Focus ring

One global treatment, and it is good: `a/button:focus-visible → 2px solid --ss-accent, offset 2px`; inputs → `--ss-accent` edge + `3px --ss-accent-soft` glow.
- **Keep the `:focus-visible` gating** — no ring on mouse click, ring on keyboard.
- **Contrast check:** `--ss-accent` (#29abe2) as a 2px ring on white is ~2.6:1 non-text contrast — borderline for WCAG 2.4.11/1.4.11 (needs 3:1). RECOMMENDATION: thicken to 2.5–3px, or use `--ss-accent-deep` (#0f8ac4) for the ring specifically. The one accessibility defect worth fixing at the token level.
- Ensure the ring is **never clipped** by `overflow:hidden` ancestors (client-card logo tile, table cards).
- `::selection` is `rgba(41,171,226,.25)` — on brand, keep.

### Brand lockup & paper-plane mark

- **Two forms.** `wordmark=true` (default) → the real artwork `public/assets/supersonic-logo.png` (200×118 stacked lockup), height scaled from `size × 1.3`. `wordmark=false` → an inline SVG paper-plane mark (navy `#0d1522` trails + cyan `#29abe2`/`#0f8ac4` plane), used only in tiny/toolbar contexts where it "stays crisp at 18px."
- **Usage rules:** Site header → `SupersonicBrand size={32}`, linked to `/`, `aria-label="Supersonic — all clients"`. Login → `.login-brand` lockup above the H1 (the trust anchor — keep prominent). Mark-only (plane SVG) reserved for spaces too small for the wordmark; do **not** use the plane as a decorative flourish.
- **Min sizes (RECOMMENDATION):** wordmark never below ~104px wide (≈`size 26`); plane mark floor **18px**, ceiling ~32px. Clear space ≥ the plane's height.
- **The `®` mark** (`.ss-brand-reg`) sits `0.52em`, `--ss-muted`, superscript — a fallback for the live-text lockup; the PNG is canonical.
- **White-label guardrail:** `SiteHeader` is "App chrome only — never rendered inside a report sheet." Never place the Supersonic mark on a report surface, never recolor it to a client brand.
- **Alt text** is `"Supersonic"` on both forms — keep it identical so screen readers hear one brand name.

### Favicon & theme-color (net-new)

- **Favicon:** the paper-plane SVG mark on a transparent or navy (`#0d1522`) ground — reads at 16px, the app's only mark that survives tiny sizes. Ship SVG + a 32px PNG fallback.
- **`theme-color`:** `--ss-ink` `#0d1522` for cohesive mobile browser chrome. Do **not** use client accent — favicon and theme color are Supersonic-global; a per-client theme-color would breach the white-label wall.
- **Apple touch / PWA:** out of scope for an internal tool (YAGNI) — one SVG favicon + one theme-color is the restrained correct amount.

---
## Global App Chrome (layout shell, header, navigation)

The shell every in-app surface shares: document wrapper, background wash, sticky translucent header, and the page-header/back-link pattern that opens each screen. It is the Supersonic-branded frame around the work — the wall that keeps client brand *out* of app chrome. It appears on `/`, `/admin/clients/new`, `/admin/clients/<slug>/edit`, and `/c/<slug>/`. It is **not** rendered inside a report sheet, though the report page carries its own separate `.report-toolbar`.

Owned by: `src/layouts/AppLayout.astro` (document shell), `src/components/SiteHeader.astro` (header), and the `.site-header` / `.app-shell` / `.form-shell` / `.app-body` rules in `src/styles/global.css`.

### Document shell

PURPOSE — one consistent frame, so every screen feels like the same product (*Be consistent, but not rigid*).

| Element | Current baseline | Recommendation |
|---|---|---|
| Wrapper | `AppLayout.astro` — `<html lang="en">`, Inter local font, favicon `/assets/supersonic-mark.svg`, `theme-color #ffffff`, single `<slot />` | Keep. `theme-color` is fine; if a dark header ever ships, sync it. |
| Body background | `.app-body` / `.client-form-body`: `var(--ss-bg)` (#f5f7fa) under a `radial-gradient(1100px 380px at 50% -120px, rgba(41,171,226,0.08), transparent 70%)` — a soft cyan wash bleeding down from top-center | Keep — the only decorative flourish and it earns its place by branding the surface without noise (*Avoid visual noise; polish the tiny moments*). Do not add a second gradient or a texture. |
| Title | `<title>` defaults to "Seller Report Generator" | Make each surface pass a specific title (e.g. "Create client — Supersonic", "<Client name> report form") so browser tabs and history are legible (*Keep navigation predictable*). |

**Content widths per surface (current baseline — cite and keep):**

| Surface | Shell class | Max width |
|---|---|---|
| Home / clients dashboard | `.app-shell` | `min(1120px, 100vw − 32px)` |
| Client setup (new/edit) | `.form-shell` | `min(880px, 100vw − 32px)` |
| Coordinator report form | (its own workspace) | `min(1040px, 100vw − 40px)` |
| Header inner rail | `.site-nav` | `min(1120px, 100vw − 32px)` |

- **Alignment note (*Align everything intentionally*):** the header rail is 1120px but the form shell is 880px. On setup and coordinator pages the brand mark sits ~120px left of the form's left edge — a visible misalignment. RECOMMENDATION: give `.site-nav` a per-surface max-width matching the shell below it, or pick one canonical content column and use it everywhere. Prefer the latter for *inevitability* — the header should feel bolted to the content beneath it.
- Vertical rhythm: `.app-shell` / `.form-shell` pad `28px` top, `64px` bottom; both drop to `20px / 56px` under 760px. Keep.

### Sticky header

PURPOSE — persistent "you are in Supersonic" anchor + home escape hatch + per-surface nav, without stealing attention from the work (*Prioritize content over chrome*).

LAYOUT & HIERARCHY — one horizontal rail, `min-height 60px` (56px mobile), `space-between`: brand cluster left, nav slot right. Sticky (`top:0`, `z-index:40`), translucent white `rgba(255,255,255,0.86)` with `backdrop-filter: blur(14px)`, 1px bottom border `--ss-border`. The blur is the only thing separating it from scrolling content — restrained and correct.

ELEMENT-BY-ELEMENT:

| Element | Content | Emphasis | Notes |
|---|---|---|---|
| `.site-brand-link` → `SupersonicBrand size={32}` | Supersonic mark + wordmark, links to `/` | Primary anchor | `aria-label="Supersonic — all clients"` |
| `.site-context` (optional) | Client name string, prefixed by a vertical divider (`border-left`, 14px pad) | Secondary — muted `--ss-muted`, 0.86rem, 600, ellipsis-truncated | Only rendered when a `context` prop is passed |
| `.site-nav-actions` (`<slot />`) | Right-aligned nav links / buttons, `gap 10px` | Contextual actions | Content varies per surface |

STATES:
- **Nav link** (`.nav-link`): rest = `--ss-text-soft`, 0.9rem/600, 8×10px pad. **Hover** = `--ss-accent-soft` bg + `--ss-accent-ink` text, 140ms ease. No focus-visible style is defined — **accessibility gap**.
- **Brand link:** has `radius-sm` but no hover or focus-visible treatment. RECOMMENDATION: add the app's standard 2px accent outline + 3px accent-soft glow.
- **Context label:** static; truncates with ellipsis. No hover. Fine — it is a label, not a control.

INTERACTIONS & MOTION — only the 140ms color/bg transition on nav links. No entrance animation, no scroll-shrink. Keep it calm (*Use motion to explain, not decorate*). The blur is static and reduced-motion-safe.

### How the header adapts across the two user contexts

The header's real job: signal *which client am I in* while keeping navigation predictable.

| Surface | `context` prop | Nav slot content (current) |
|---|---|---|
| Home `/` | none | "New client" link |
| Setup `/admin/clients/new` | none | "All clients" link |
| Setup edit `/admin/clients/<slug>/edit` | `client?.name` | "All clients" link |
| Coordinator form `/c/<slug>/` | `client.name` | (empty) |
| Report page (chrome variant) | none | (empty) |

- **Context label rule (keep):** appears if and only if a specific client is in scope. The *new client* page shows nothing (correct — no client yet). Good.
- **The context label is the primary "which client" signal, and it is under-weighted** — `--ss-muted` at 0.86rem, quieter than the nav links beside it. When a coordinator is deep in the report form, "am I filling out the right client's report?" is the highest-stakes orientation question. RECOMMENDATION: strengthen it — bump to `--ss-text` weight, and prefix a small client identity token. Two restrained options, pick one:
  1. A tiny (20–24px) rounded client logo swatch on the dark `#101725` tile treatment (same as client cards), just left of the name. Permissible because it *identifies scope*, not styles chrome — keep it small and neutral-framed so it reads as a wayfinding token, not a brand takeover.
  2. If a logo chip risks blurring the brand wall, keep text-only but add a muted "Client:" or a person/building glyph before the name.
- **Divider is right, keep it.** The vertical `border-left` reads as "Supersonic › <Client>" — a breadcrumb without breadcrumb chrome. Consider making it slightly taller/more present.
- **Coordinator form has an empty nav slot.** Their only exit is an unlabeled logo click. RECOMMENDATION: leave the slot empty for coordinators (*reduce choices*) but ensure the brand link has a visible focus state and an `aria-label` that reads as "home."
- **Copy for nav links:** current "All clients" / "New client" are good — concrete and predictable. Keep them; do not rename to icons-only for a low-frequency internal tool (*Use familiar patterns*).

### Page-header + back-link pattern

PURPOSE — orient the user at the top of each interior screen: where they are, how to leave, what this screen is for.

- **Back link** (`.back-link`): inline-flex, `gap 6px`, `--ss-text-soft`, 0.87rem/600, 16px bottom margin, hover → `--ss-accent-ink`. Copy e.g. "← Back to clients". Sits above the eyebrow/H1.
- **Page header** (`.page-header`): eyebrow (0.72rem uppercase `--ss-accent-ink`, 0.12em tracking) → H1 (`clamp(1.9rem, 4.2vw, 2.7rem)`, 700, tight `-0.035em`) → optional description `p` (max 640px, `--ss-text-soft`, 1.7 line-height). Sits directly on the page background; no card. Correct — the header is orientation, cards hold the work.

Recommendations:
- **Two overlapping "back" affordances.** The header brand link (global home) and the `.back-link` (contextual parent) are both "up and out." Keep the back-link destination literally the parent, never home, so the two never collide semantically.
- **Give the back link a visible focus-visible ring.** It is a primary keyboard escape and currently only has a hover color change.
- **Eyebrow as a third orientation cue.** Use it consistently as the top line of every interior page so users get mode → title → description top-down every time.

### Mobile / 760px behavior

Current baseline (`@media (max-width: 760px)`): `.site-nav` → `width: calc(100vw − 28px)`, `min-height 56px`; `.ss-brand-word` → 1.05rem; `.site-context` → `max-width: 38vw`, ellipsis-truncated; shells → `20px / 56px` padding.

- **Nav does not collapse to a menu** — with only one action per surface this is the right call (*Hide complexity until it is needed*). Do **not** add a hamburger.
- **Context truncation on mobile is the real risk.** At `max-width: 38vw` a long name (e.g. "Coldwell Banker Oceanside Realty") clips to a few characters, defeating the "which client" signal. RECOMMENDATION: on ≤760px, if a nav link is present, let context take priority — give it more width and let the nav link shrink or wrap to a second row. On the coordinator form (empty nav slot) give context the full remaining width.
- **Touch targets:** nav links are `8×10px` padding on 0.9rem → ~34px tall, **under 44px**. The back link is worse. RECOMMENDATION: raise interactive header/back targets to ≥44px tap height on touch viewports (increase vertical padding; the visual text can stay the same size). The one concrete accessibility fix the chrome needs.
- Brand mark at 32px stays legible; keep.

### No footer

App chrome has **no footer** — deliberate and correct for a focused internal tool (*Remove anything that does not help the user succeed*). Keep it. If a build/version string is ever needed for support, tuck it into an unobtrusive spot (e.g. a tiny muted line on the login page only) rather than adding standing footer chrome to every screen.

### Accessibility summary (chrome-wide)

- **Add `:focus-visible`** rings to `.site-brand-link`, `.nav-link`, and `.back-link` using the app's 2px accent outline + accent-soft glow. Today only hover states exist — keyboard users get no visible landing. Top gap.
- **Keyboard order** per surface: brand link → context (non-focusable label) → nav link(s) → page back-link → H1/content. Preserve.
- **Screen reader:** brand link `aria-label="Supersonic — all clients"` is good. Keep `.site-context` a plain `<span>`; consider `aria-current` or a visually-hidden "Current client:" prefix so its role is unambiguous.
- **Contrast:** `--ss-muted` (#64748b) context text on the translucent white header passes AA at 0.86rem/600; verify against the *lightest* point of the cyan gradient wash.
- **Reduced motion:** nothing in chrome animates beyond 140ms color fades; keep it that way — do not add a scroll-collapse or slide-in.

---
## Sign In (`/login`)

**PURPOSE** — The password gate. First screen anyone sees; the moment the tool earns (or loses) trust. It must feel fast, calm, and unmistakably Supersonic. · **ROUTE** — `/login` (`src/pages/login.astro`), rules `.login-shell` / `.login-panel` / `.login-error`. · **AUDIENCE** — one screen, two user types: the **agency admin** (`ADMIN_PASSWORD`) and the **client coordinator** (per-client password). Neither is named here and neither should be — the field is password-only, so copy must stay identity-agnostic and welcoming to both.

### Layout & hierarchy

Single centered card on the page background (`--ss-bg #f5f7fa`), centered via `place-items: center`. Nothing competes with it — no nav, no footer chrome, no marketing. Correct and philosophy-aligned (*make every screen feel focused*, *prioritize content over chrome*). Keep it.

- **Card width** — current `min(380px, 100%)`. Hold 380px; a login card wider than ~400px reads as a form, not a doorway.
- **Card padding** — current `34px 32px 32px`. Good. On mobile keep ≥24px horizontal.
- **Vertical rhythm inside the card**, top to bottom: brand mark → headline → subtext → (error, conditional) → field → button. Current `gap: 10px` on the panel plus `gap: 16px` on the form. Nudge the brand→headline gap slightly larger than headline→subtext so the mark reads as a separate "roof" over the text block.
- **Optical centering** — currently exact vertical middle of `100vh - 60px`. Bias a hair above center (~45% from top) so it feels intentionally placed rather than mechanically centered.

### Element-by-element inventory

| Element | Content (current) | Emphasis | Recommendation |
|---|---|---|---|
| Brand mark | `<SupersonicBrand size={44}>` → stacked wordmark lockup (~57px tall here) | Primary anchor | Keep the full stacked lockup — the one screen where the wordmark, not the tiny plane mark, belongs. Commit to one alignment axis: center the mark with the text block, OR left-align the whole card. |
| Headline (h1) | "Sign in" · 1.45rem / 700 / `-0.02em` / `--ss-ink` | Primary | Keep "Sign in". Two words, unambiguous. Do not get clever. |
| Subtext (p) | "Enter your password to open this workspace." · 0.92rem / `--ss-text-soft` | Secondary | Strong as-is. "workspace" is neutral enough for both users. Keep. |
| Error banner | "That password didn't match. Try again." · `.login-error`, bg `#fef2f2`, text `#b91c1c`, 600 | Conditional, high-salience | See **Error state** below. |
| Password label + field | "Password" label wrapping `type=password`, `autocomplete="current-password"`, `required`, `autofocus` | Primary interactive | See **Field** below. |
| Hidden `next` field | `value={next}`, defaults to `/` | Invisible plumbing | Preserves intended destination. Keep exactly. |
| Continue button | "Continue" · `.button.primary` (ink bg, white) | Primary action | Full-width recommended. Add a submitting state. |

### The password field

- **Autofocus** — currently on. **Keep it.** A single-field login page is the textbook case where autofocus helps (the user's only possible next action is to type the password) and does not trap screen-reader users (there is no complex page). Supports *make the primary action obvious* and *perceived speed*.
- **`autocomplete="current-password"`** — correct; lets password managers autofill. Keep — a real speed win for repeat coordinators.
- **Label** — currently a wrapping `<label>Password</label>`; valid. Recommend the label sit **above** the field (block), full width, ~0.82rem `--ss-text-soft`. Keep it visible (do not replace with a placeholder-only field).
- **Height & touch** — bump the field and button to **≥48px** so they're comfortable doorway targets.
- **Show/hide toggle (RECOMMENDATION / net-new)** — add an optional "Show" text toggle inside the field's right edge. Keep it a plain accessible button (`aria-pressed`, label "Show password" / "Hide password"), not an icon-only control.

### The "Continue" button

- **Width** — make it **full-width** of the card. A single-action form reads best with one confident full-width button.
- **Style** — keep `.button.primary` (ink `--ss-ink` bg). Do not tint with cyan; reserve accent for focus rings.
- **Label** — "Continue" is fine. "Sign in" is an acceptable alternative if you want the button verb to echo the headline; pick one app-wide.

### All states

| State | Current | Recommendation |
|---|---|---|
| **Empty / default** | Field empty, cursor in field, button enabled | Keep. Do not disable the button on empty — let the browser's `required` handle it so the user gets a native inline hint. |
| **Focus** | Input gets 2px accent outline + 3px `--ss-accent-soft` glow | Excellent and on-brand. Ensure the ring is equally visible on the button when tabbed to. |
| **Error (wrong password)** | Red banner above the form after a full page reload; field cleared; focus lost to page top | **Biggest gap.** See below. |
| **Loading / submitting** | **None** — button stays "Continue", page navigates | **Add one.** See below. |
| **Disabled** | n/a | Only the transient submitting state should disable the button. |
| **Hover** | Button darkens per `.button.primary:hover` | Keep; ensure a visible 100–150ms transition. |

#### Error state (wrong password) — recommended treatment

- **Announce it** — give the banner `role="alert"` (or `aria-live="assertive"`) so a screen reader speaks the error the instant the page loads after a failed attempt. Right now it is silent to assistive tech.
- **Restore focus** — keep `autofocus` on the field (a fresh render already does this) and add `role="alert"` on the banner; the banner announces, the cursor is ready.
- **Visual link** — when the error is present, also apply an error outline to the password field itself (red border, not the accent ring) so the eye connects message → field.
- **Don't blame, don't leak** — keep the copy generic. There are no usernames — good. Current string is well-judged.
- **Microcopy** — keep **"That password didn't match. Try again."** Acceptable variant: **"That password didn't match. Check it and try again."**

#### Loading / submitting state — recommended (net-new)

Auth is a server round-trip; a slow network currently gives **zero feedback** between click and navigation. Add a minimal submitting state (mirrors the coordinator form's "Creating report…" pattern):
- On submit: disable the button, swap label to **"Signing in…"**, show a small inline spinner or subtle pulse. `aria-busy="true"` on the form.
- **bfcache guard** — add a `pageshow` handler that re-enables the button if the user lands back via back/forward or a validation bounce.
- Keep it honest and boring — no bouncy animation.

### Interactions & motion

- **Card entrance** — a single quiet fade+rise (opacity 0→1, translateY ~6px, ~200ms ease-out) on load. One motion, once. Respect `prefers-reduced-motion`: no transform, instant paint.
- **Error banner** — a ~150ms fade on a JS submit path; on the current full-reload path it simply renders — fine. No shake, no bounce (a shake reads as scolding).
- **Focus ring** — instant, no delay.
- **Reduced motion** — disable the entrance and any spinner spin; keep a static "Signing in…" label.

### Microcopy (recommended strings)

- **Title tag** — "Sign in | Supersonic". · **Headline** — "Sign in". · **Subtext** — "Enter your password to open this workspace." · **Field label** — "Password". · **Show toggle (if added)** — "Show password" / "Hide password". · **Button (idle)** — "Continue" (or "Sign in"). · **Button (submitting)** — "Signing in…". · **Error** — "That password didn't match. Try again." · **Native empty-submit** — leave to the browser.

### Accessibility

- **Keyboard order** — Password field → (Show toggle) → Continue button. The hidden `next` field is not focusable — correct. Enter submits natively — correct.
- **Label association** — currently valid via wrapping `<label>`. If you split label above field in Figma, spec an explicit `for`/`id` pairing.
- **Error announcement** — `role="alert"` on `.login-error` (the single most important a11y fix here).
- **Focus management** — cursor lands in the password field on both first load and error reload. Confirm the visible focus ring meets 3:1 non-text contrast.
- **Contrast** — headline `--ss-ink` on white and error `#b91c1c` on `#fef2f2` both pass AA. Subtext `--ss-text-soft #47536b` on white passes AA for body.
- **Touch targets** — field and button ≥48px; the Show toggle ≥44px tappable.
- **No CAPTCHA, no extra fields** — keep the surface to exactly what's needed.

### The hidden `next`-destination preservation

- **What it does** — `next` (from the query string, default `/`) is posted with the password so a coordinator who deep-linked to `/c/<slug>/` lands back there after signing in. Keep it.
- **Design implication** — invisible; nothing to render. Two guardrails for the engineer (not visual work): the value must be shown/escaped safely and validated as a same-site relative path, so login can't become an open redirect.

### Responsive

- **Desktop / tablet** — centered 380px card, generous whitespace. Nothing reflows.
- **Mobile (≤760px)** — card goes to `100%` (minus page padding). Keep ≥24px horizontal padding inside; field and button full-width and ≥48px tall. Bias toward the top so the on-screen keyboard doesn't shove it off-screen.
- **Very short viewports / keyboard open** — because the field autofocuses, mobile keyboards open immediately; top-biased vertical placement keeps the card + button reachable.

### Design opportunities (restrained)

1. **Add the submitting state** — highest-value change; closes the silent gap between click and navigation and prevents double-submits.
2. **Make the error accessible** — `role="alert"` + an error outline on the field.
3. **Full-width Continue button + ≥48px targets** — the one action, unmistakable and comfortable.
4. **One quiet entrance animation** (reduced-motion-safe).
5. **Optional show/hide password** — courtesy for shared coordinator passwords. Clearly net-new.
6. **Commit to one alignment axis** for the brand/text/field stack.

Everything else on this screen is already right and should be left alone — the restraint here (no username, no "remember me," no marketing, no social login) is a feature, not a gap.

---
## Clients Dashboard / Home (`/`)

PURPOSE: The agency admin's landing page and launchpad — see every client at a glance, jump into a client's report form, or create a new client. ROUTE: `/` (`src/pages/index.astro`).

This screen has exactly two jobs: **open an existing client's report form** (the recurring daily task) and **create a new client** (the occasional setup task). The design must make both obvious without letting them compete. Supersonic-branded app chrome — no client colors here, per the brand wall.

### Layout & Hierarchy

Single centered column, `min(1120px, 100vw-32px)`, two stacked bands:
1. **Hero band** (`.app-hero`) — intro + primary "Create client" CTA. Baseline-aligned flex row (title block left, action right), padding `40px 4px 34px`.
2. **Report endpoints panel** (`.panel`) — a `.section-heading` (title + count badge) over either the `.client-grid` or the `.empty-state`.

Top nav (`SiteHeader`) carries a single `New client` link.

Hierarchy today is flat: the hero h1 (`clamp(1.9rem, 4.2vw, 2.7rem)`) dominates, but the h1 is a **restatement of the product name**, not a task. The most-repeated action — opening a client — lives in small secondary buttons buried inside cards. **Recommendation:** rebalance so the eye lands on the client grid fastest, since that is what a returning admin came for. The hero can shrink; the grid should feel like the center of gravity (*make the default path excellent*).

### Element-by-element inventory

| Element | Content (current) | Emphasis | Recommendation |
|---|---|---|---|
| Nav link | "New client" | tertiary | Keep. Persistent, low-key. |
| Hero eyebrow | "Seller report engine" | label | Fine as-is. |
| Hero h1 | "Seller Report Generator" | primary visually | Demote size on this screen — a static title, not a task. |
| Hero description | "Capture report details, freeze the numbers into a snapshot…" | secondary | Keep on first-run; consider hiding once clients exist. |
| Hero CTA | "Create client" (`.button.primary`) | primary action | Keep as the one strong button in the hero (see below). |
| Section eyebrow | "Clients" | label | Fine. |
| Section h2 | "Report endpoints" | panel title | Rename — see microcopy. |
| Count badge | "{n} clients" | metadata | Keep; good *give-feedback* touch. |
| Client card | logo tile + name + footer_text + 2 actions | the real payload | Make the whole card the open target. |
| "Open report form" | `.button.secondary.sm` | should be primary-in-card | Promote emphasis. |
| "Edit" | `.button.ghost.sm` | secondary-in-card | Keep ghost. |
| Empty state | dashed box, "No clients yet" + CTA | first-run | Strong opportunity — see below. |

### The CTA-duplication question (hero vs nav)

Both the nav `New client` link and the hero `Create client` button do the same thing. **Warranted — conditionally:**
- **When clients exist:** keep only the nav `New client` link as the persistent creator; let the grid own the viewport. RECOMMENDATION: when ≥1 client exists, **drop the hero button** (or reduce it to a quiet secondary) so the hero stops competing with the grid.
- **When zero clients exist:** the empty-state already carries a primary "Create client" CTA, so the hero button is again redundant — the empty state should be the single loud call.

Net: **exactly one loud "create" affordance visible at a time** — the empty-state CTA on first run, the nav link thereafter. Keep the two copy strings identical if both ever show — "Create client" in both places, never "New client" one place and "Create client" another.

### The client card

PURPOSE: One client's identity + the two things you do with it. Current grid: `76px | 1fr`, logo tile left, text+actions right.

- **Dark logo tile (`.client-card-logo`, bg `#101725`):** Keep. Rationale is sound and documented — realtor logos are frequently drawn light-on-dark, so a dark tile guarantees they read on a white card. On mobile it shrinks to `60px`. RECOMMENDATION: add a **fallback** when `logo_url` is missing or fails to load (a monogram of the client's initials on the dark tile) so the grid never shows a broken-image icon.
- **Name (h3, 0.98rem/700):** Primary text identity. Good.
- **footer_text (p, muted 0.85rem):** Secondary — the report footer/disclaimer line; a disambiguator between similarly-named brokerages. Keep muted; line-clamp to 2 lines.

**Primary vs secondary action (the key fix):** Today both actions are low-emphasis (`secondary` + `ghost`) at equal weight. "Open report form" is the daily job and should clearly outrank "Edit."
- **Make the whole card a click target that opens the report form** (`/c/<slug>/`). Largest possible target; matches "click the client to work on it."
- **Keep "Edit" as an explicit, smaller control** layered above the card link (ghost button, top-right or bottom-right), so the two actions don't nest illegally.
- If you keep two side-by-side buttons instead: promote "Open report form" to `.button.secondary` at normal (non-`sm`) weight or a subtle accent-tinted fill, and keep "Edit" as `ghost.sm`. The visual weight gap must be unmistakable.

Card affordance copy: "Open report form" is clear and honest about the destination — keep it over vaguer "Open" or "Manage."

### Responsive card grid

Current: `repeat(auto-fit, minmax(300px, 1fr))`, gap `14px`. Solid, boring, correct — keep it. Desktop (1120px): 3 columns. Tablet: 2. Mobile (≤760px): 1 column; logo tile → `60px`. RECOMMENDATION: raise the gap slightly (`16px`). No max column cap needed at current scale.

### Empty state (first run)

Current (`.empty-state`): dashed `1.5px` box, "No clients yet" strong, one line of explanation, primary "Create client" button. Already a real designed state — good. Refinements:
- Add a **small, friendly illustration or the paper-plane brand mark** above the heading so first-run feels intentional and on-brand rather than like an error box.
- On first run, this dashed box should be the visual hero — let the page hero recede so a brand-new admin sees exactly one instruction.

Recommended empty-state copy:
- Heading: **"No clients yet"** (keep)
- Body: **"Create your first client to generate a branded report endpoint they can fill in."**
- Button: **"Create your first client"** (first-run specificity beats generic "Create client")

### All states

| State | Behavior | Recommendation |
|---|---|---|
| Empty (0 clients) | dashed empty-state + CTA | Make it the focal point; recede hero; add brand mark. |
| Populated | grid of cards | Grid is focal; hero recedes/loses its button. |
| Card hover | `border-color #bcd9ec`, elevated shadow, `140ms ease` | Good, restrained. If card becomes the link, add a subtle translate-up (1px) and cursor:pointer. |
| Card focus (keyboard) | *none defined today* | **Add a visible focus ring** — the standard 2px accent outline + 3px accent-soft glow. Critical: the primary action is keyboard-reachable. |
| Logo missing/broken | broken-image icon (today) | Initials monogram fallback on the dark tile. |
| Loading | N/A (SSR, data ready at render) | No spinner needed; page arrives populated. |
| Long name / footer | can wrap unbounded | Clamp name to 1 line, footer to 2; ellipsis. |
| Many clients | grid grows unbounded | See net-new search/sort below. |

### Interactions & motion

- Card hover transition is `140ms ease` on border + shadow — keep.
- If the whole card becomes clickable, add `:active` press feedback (subtle shadow reduction).
- **Reduced motion:** wrap any new translate/press animation in `prefers-reduced-motion` — keep color/shadow state changes but drop movement.

### Accessibility

- **Keyboard order:** nav "New client" → hero "Create client" (if present) → each card in DOM order, "Open report form" then "Edit" per card.
- **Focus visibility:** add the accent focus ring to cards/links (currently missing) — non-negotiable for the primary action.
- **Card-as-link semantics:** if wrapping the card in a link, give it a meaningful accessible name — `aria-label="Open report form for {client name}"`. Keep "Edit" as a separate focusable control outside the card link (don't nest interactive-in-interactive; use an overlay-link pattern).
- **Logo alt:** already `"{name} logo"`. For the monogram fallback, mark it decorative and rely on the adjacent h3.
- **Touch targets:** `sm` buttons risk falling under 44px. Ensure Edit and any in-card button hit ≥44px tall on touch, or rely on the full-card target for "open."
- **Contrast:** count-badge text is `--ss-muted #64748b` on `--ss-bg #f5f7fa` — verify ≥4.5:1 (borderline); nudge to `--ss-text-soft` if it fails. Card footer_text (`--ss-muted`) on white passes.

### Microcopy

| Location | Current | Recommended |
|---|---|---|
| Section h2 | "Report endpoints" | **"Your clients"** — plainer, human, matches what the cards are. "Report endpoints" is engineer-speak on an agency-admin screen. |
| Count badge | "3 clients" | Keep. |
| Hero description | "Capture report details, freeze the numbers into a snapshot, and render a branded seller report ready to download as a PDF." | Keep on first-run; hide once clients exist. |
| Card open action | "Open report form" | Keep. |

### Design opportunities (restrained)

1. **One loud create-action at a time.** Empty state owns it on first run; nav link owns it thereafter; drop/soften the hero button when clients exist.
2. **Whole card opens the report form.** Biggest possible target for the daily task; Edit stays a small explicit control.
3. **Recede the hero once populated.** Returning admins want the grid, not the product name.
4. **Logo-fallback monogram** so the grid is never broken.
5. **Card focus ring + press feedback.**

**NET-NEW RECOMMENDATION — search/sort (only at scale):** Future-only. If an agency accumulates many clients (say >12–15, where scanning the grid stops being instant), add a single **client search field** in the `.section-heading` row that filters cards by name as you type — client-side, no new backend. Optionally a simple sort toggle (A–Z / recently edited). Keep it invisible below the threshold. Do not add filters, tags, or pagination.

---
## Client Setup Form (create + edit)

### Purpose & posture

The agency admin's brand-profile builder. Filled **rarely and deliberately** — once per client, then edited occasionally. The right optimization is not speed but **confidence and correctness**: the numbers, colors, and IDs entered here silently drive every future report and every coordinator login. Should feel like a careful setup wizard, not a data-entry chore (*make the interface feel trustworthy · build with restraint · let important things breathe*).

- **Routes:** `/admin/clients/new` (create) and `/admin/clients/<slug>/edit` (edit) — both render `src/components/ClientForm.astro` inside `.form-shell`.
- **Shell width:** `.form-shell` at `min(880px, 100vw-32px)`. Keep the narrow measure — a single readable column reinforces "one careful pass, top to bottom."

### Page frame (both routes)

| Element | Create | Edit |
|---|---|---|
| Back link | `← Back to clients` | `← Back to clients` |
| Eyebrow | `Client setup` | `Client setup` |
| H1 | `Create client` | `Edit client` |
| Intro copy | currently mentions `data/clients` JSON path | mentions the JSON path + "Reports already generated keep their branding" |
| Nav link | `All clients` | `All clients` (with client name as header context) |

**Recommendation — rewrite the intro copy for the reader, not the filesystem.** The current create-page line ("This writes a JSON profile to `data/clients`…") describes an implementation detail the admin does not care about.
- Create: **"Set up a client's brand and access. This creates their report form and the login their coordinator uses."**
- Edit: **"Update this client's brand and access. Reports you've already generated keep the branding they were created with — changes here only affect new reports."** (Genuinely reassuring — it prevents "will editing break old PDFs?" Keep prominent.)

### The four sections

Current structure: four `.form-section` blocks separated by bottom borders (`border-bottom: 1px solid --ss-border`, `padding: 26px 0`), each an H2, each a single-column `.field-grid` (which has **no** `grid-template-columns` — every field is full-width and stacked). All labels are `display:grid` with a 7px gap and an optional `<span>` helper below.

**Recommendation — number the sections and give each a one-line purpose**, mirroring the coordinator form's numbered badges for consistency (*be consistent · use hierarchy to guide the eye*).

| # | Section (recommended heading) | Purpose sub-line | Emphasis |
|---|---|---|---|
| 1 | **Brand** | "How this client looks on their report." | Primary — most fields, drives the PDF |
| 2 | **Brokerage disclaimer** | "The fine print that appears on every report." | Secondary |
| 3 | **Access** | "The password this client's coordinator signs in with." | Primary (security) |
| 4 | **Integrations** *(optional)* | "Connect data sources so numbers can be pulled automatically. You can add these later." | De-emphasized / collapsible |

#### Section 1 — Brand

| Field | Type | Required | Helper (current) | Placeholder |
|---|---|---|---|---|
| Client name | text | yes | — | `Stone Sisters` |
| Client slug | text, `pattern=[a-z0-9-]+` | yes | create: "Lowercase letters, numbers, and hyphens." / edit: "Slug can't be changed after creation." | `stone-sisters` |
| Logo upload | file | no | "PNG, JPEG, SVG, or WebP, up to 1 MB." (+ edit: "Leave empty to keep the current logo.") | — |
| Logo URL | url-ish text | no | — | `https://acmerealty.com/logo.svg` |
| Current logo preview | img (edit only) | — | label "Current logo" | — |
| Footer text | text | yes | — | `Acme Realty Team | Kelowna, BC` |
| Primary color | `input[type=color]` | yes | — | default `#111111` |
| Accent color | `input[type=color]` | yes | — | default `#c9a86a` |

**Recommendations:**
- **Group Name + Slug at the top, tightly.** *Net-new:* on **create**, auto-suggest the slug as the admin types the name (live slugify: lowercase, spaces→hyphens), pre-filled and overridable. Helper: **"This becomes the client's report URL: `/c/stone-sisters/`. Lowercase letters, numbers, and hyphens only."** Showing the actual resulting URL makes the abstract "slug" concrete.
- **Slug helper carries a permanence warning on create only:** **"Choose carefully — the slug can't be changed later."** On edit it's readonly (`#f1f5f9` bg, `not-allowed`) — keep; add a tiny lock glyph so "readonly, on purpose" reads as locked, not broken.
- **Footer text** helper: **"Appears at the bottom of every report page — usually the team name and city."** It reads decorative but it's report content.

##### Logo: upload vs. URL dual input

Current: two separate stacked fields with the parenthetical "Logo URL (alternative to upload)". The weakest moment in the form — two inputs for one value, no indication which wins, unstyled file input.

**Recommendation — present it as one logo control with a clear either/or:**
- A single **"Client logo"** field-group, upload as the primary: a styled drop/upload zone (dashed border, upload glyph, **"Upload a file"** + **"PNG, JPEG, SVG, or WebP · up to 1 MB"**). A styled label wrapping a visually-hidden `<input type=file>` fixes accessibility and appearance together.
- A quiet **"or paste a URL"** disclosure/divider that reveals the URL input, visually subordinate. Helper on the URL: **"We'll fetch and store a copy, so the logo won't break if the original link changes."** (True — snapshots embed logos as data URIs.)
- **After a file is chosen, show an instant inline thumbnail preview** (client-side `FileReader`), filename, and a **"Remove"** affordance.
- **Precedence must be stated:** **"If you upload a file, it's used instead of the URL."**

##### Current-logo preview (edit only)

Current: `.logo-preview` — "Current logo" caption over an `<img>` capped at `max-width:180px · max-height:64px`, on white with a border.
- **Note the dark-tile reality.** Client logos are often light-on-dark (the dashboard renders them on `#101725`). A logo previewed only on white can look wrong vs. how it appears on cards and reports. Show the current logo on **both** a white and a dark swatch (small side-by-side).
- **Position the preview adjacent to the logo control**, not floating after it in grid order.
- Label the state precisely: **"Current logo — leave the upload empty to keep it."**

##### The two color pickers — Primary & Accent

Current: two bare `input[type=color]` swatches (`min-height:46px`), labels "Primary color" / "Accent color", no helper, defaults `#111111` and `#c9a86a`. The highest-leverage under-designed element: **these colors paint the client's report, not the app** — but nothing on screen says so, and a raw OS picker gives no sense of the result.

**Recommendations (restrained but real):**
1. **Frame them as report brand colors, with a caption that draws the white-label wall.** Section-level note: **"These colors appear on this client's report — not in this app."** Never let the admin think they're theming the tool.
2. **Show a live result preview, not just the raw swatch.** Beside the two pickers, a small **"On the report"** preview chip: a heading in Primary + a rule/pill in Accent on a white card. Update it live as they pick.
3. **Better swatch UX than the native picker.** Each color = a swatch button + an editable hex field (`#______`) side by side. The swatch opens the native picker; the hex field lets an admin paste a brand-guide hex directly (the common real workflow). Validate the hex inline.
4. **Contrast guardrail (net-new, gentle).** If Primary is near-white or the two colors clash against the report's white sheets, show a soft advisory — **"This color may be hard to read on the report's white pages"** — never a hard block.
5. **Defaults are generic-neutral (`#111111` / `#c9a86a`), which is correct** — no other client's brand leaks in as a default. Keep them; label as **"Default"** so the admin knows they're placeholders to replace.

#### Section 2 — Brokerage disclaimer

| Field | Required | Placeholder | Width |
|---|---|---|---|
| Brokerage | yes | `RE/MAX Kelowna` | normal |
| Contact | yes | `Acme Realty Team` | normal |
| Brokerage address | yes | `100-1553 Harvey Avenue, Kelowna, BC` | `.wide` (full row) |

**Recommendations:**
- **Section sub-line: "Required by BC real-estate rules — this appears as fine print on every report."** Explains *why* three otherwise-boring required fields matter.
- The `.wide` full-row treatment on address is right; Brokerage + Contact could sit as a **two-up row on desktop** (short, related) collapsing to stacked under 760px. Address stays full-width.
- Add a **live disclaimer preview line** (net-new, quiet): render the three values as the single fine-print string the report will show, so the admin proofreads the actual output.

#### Section 3 — Access

One field — **Coordinator password**, `type=password`, `autocomplete=new-password`, `minlength=8`. On **create** `required`; on **edit** not required with placeholder **"Leave blank to keep current password"**. Helper: "Coordinators use this to open /c/`<slug>`/. At least 8 characters."

**Recommendations:**
- **Keep the create/edit distinction exactly.** On edit, make the empty field clearly optional — helper reads **"Leave blank to keep the current password"** as primary helper, not just placeholder (placeholders vanish on focus).
- **Add a show/hide toggle** — reduces typo-lockouts for a password the admin is *setting for someone else*.
- **Add a minimal length affirmation** — an inline check that flips to a green "Looks good" once ≥8 chars. Not a nagging meter.
- **Helper rewrite:** **"The coordinator for this client signs in with this at `/c/stone-sisters/`. Minimum 8 characters — share it with them securely."**
- **Never echo an existing password back** (baseline already doesn't — hashes only). Keep the field always empty on edit. Don't add a "current password" reveal.

#### Section 4 — Integrations (optional) — collapse by default

Current: heading "Integrations (optional)"; four stacked numeric/URL fields (Website URL, Facebook Page ID, Instagram account ID, Rybbit site ID), all optional, `pattern=[0-9]*` except Website (`type=url`). No visual signal beyond "(optional)" that the block is skippable — it renders as a wall of four empty inputs identical in weight to the required sections.

**The clearest place to apply the progressive-disclosure directive.**
- **Collapse the entire section by default**, as a single expandable row: **"Data sources (optional)"** with a chevron and a one-line summary — **"Connect Website, Facebook, Instagram, or Rybbit so numbers can be pulled automatically. You can add these anytime."** The default create path becomes: Brand → Brokerage → Access → Save.
  - On **edit**, if any integration is already filled, **expand it by default** and show a filled-count summary (e.g. "2 of 4 connected") so nothing configured is hidden.
- **When expanded, each field gets a "why" helper:**
  - Website URL — **"The listing/agent site Rybbit tracks. Used to pull page views."**
  - Facebook Page ID — **"Numeric Page ID (not the @handle). Used to find matching posts."**
  - Instagram account ID — **"Numeric account ID. Used to pull Instagram post views."**
  - Rybbit site ID — **"The numeric site ID from your Rybbit dashboard."**
- **Reinforce non-blocking reality:** a footnote — **"Leaving these blank is fine — the coordinator can still enter numbers by hand on the report form."**
- Numeric fields carry `inputmode=numeric` — keep. Add inline "numbers only" feedback rather than silent `pattern` rejection at submit.

### Submit action & create/edit differences

Current: one primary button (`.button.primary`, min-height 42) reading **"Create endpoint"** (create) or **"Save changes"** (edit), in a `.form-actions` row.

**Recommendations:**
- **"Create endpoint" → "Create client."** "Endpoint" is developer vocabulary on an agency-facing button.
- **Submit states** *(currently none):*
  - **Default:** "Create client" / "Save changes."
  - **Submitting:** disable + spinner + "Creating client…" / "Saving…" (mirror the coordinator form's disable-on-submit + bfcache re-enable).
  - **Success:** on create, redirect to the dashboard with a brief success confirmation (toast/banner **"Client created — their report form is ready"** with a link to `/c/<slug>/`).
- **Secondary "Cancel / Back to clients"** next to the primary, so leaving without saving is a clear, non-destructive choice.
- **Sticky action bar** on long viewports so Save is always reachable — this form is tall.

| | Create | Edit |
|---|---|---|
| Slug field | editable, auto-suggested | **readonly**, locked styling + lock glyph |
| Password | **required** | optional, "leave blank to keep" primary helper |
| Logo | upload or URL | + **current-logo preview**, "leave empty to keep" |
| Integrations section | collapsed | expanded if any are set |
| Primary button | **Create client** | **Save changes** |
| Danger zone | absent | present (see below) |
| Edit-safety note | — | "Existing reports keep their branding" (keep prominent) |

### Danger zone (edit only) + typed-name delete

Current: `.danger-zone` card at the page bottom — red-tinted (`#fef2f2` bg, `#fecaca` border), H2 **"Delete this client"** (`#991b1b`), an explanation paragraph, and a **"Delete client"** danger button (`#dc2626`). Submitting fires a JS `prompt()` asking the admin to **type the client's exact name**; a mismatch cancels with `alert("Name didn't match — nothing was deleted.")`.

Genuinely good — a typed-name confirmation is stronger than an OK-click. The weakness is the mechanism (`prompt()`/`alert()` — jarring OS dialogs, no styling, no accessibility control).

**Recommendations:**
- **Keep the typed-name gate; replace the native `prompt()`/`alert()` with an in-page modal** matching the app's dialog styling (the pull modal already establishes the pattern).
  - Modal: title **"Delete `Stone Sisters`?"**, body listing exactly what's removed (**"This removes their report form at `/c/stone-sisters/` and revokes the coordinator password."**), then the reassuring part — **"Reports you've already generated stay viewable (admins only)."**
  - A text input labelled **"Type the client's name to confirm"** with the name shown; the destructive button stays **disabled** until the typed value matches exactly (preventing the mistake beats explaining it).
  - Buttons: **"Cancel"** (default, autofocused) + **"Delete client"** (danger, disabled-until-match).
- **Post-delete feedback:** redirect to dashboard with **"`Stone Sisters` was deleted."** Currently silent.
- **Honesty in copy:** the paragraph correctly says "This cannot be undone" *and* "Reports already created stay viewable." Keep both.
- **States:** danger button default/hover/focus (baseline has hover); the confirm button needs a clear **disabled** state while the name doesn't match, and a **deleting…** state after confirm.

### 404 — "Client not found" (edit route)

Current: on `readClient` throw, `Astro.response.status = 404` renders a `.panel` with eyebrow **"Missing client"**, H1 **"Client not found"**, body **"No local client profile exists for `<slug>`."**, and a primary **"Back to clients"** button.

Serviceable and correctly non-dead-end. Refinements:
- **Soften and humanize:** **"We couldn't find a client called `<slug>`. It may have been deleted, or the link might be out of date."** Then two clear paths: **"Back to clients"** (primary) + **"Create a new client"** (secondary).
- Give it a **quiet empty-state illustration or icon** consistent with the dashboard's empty state so 404 and "no clients yet" feel like one family.
- Keep the `<slug>` echoed in monospace for typo diagnosis.

### Validation-error states (all fields)

The form posts to `/api/client`, which on failure renders a **bare, unstyled system-ui error page**. That dead-end page is covered in the Errors chapter — the recommendation here is to **surface validation inline on this form instead of bouncing to a separate page.** Per-field error treatment (net-new):

| State | Treatment |
|---|---|
| **Default** | baseline input: `1px --ss-border-strong`, radius-sm |
| **Hover** | border → `--ss-accent` (baseline exists) |
| **Focus** | 2px accent outline + 3px accent-soft glow (baseline exists) — keep |
| **Invalid** | red border, red helper text replacing the neutral helper (e.g. slug: **"Use only lowercase letters, numbers, and hyphens."**; password: **"Needs at least 8 characters."**), inline **on blur**, not just at submit |
| **Server-rejected** | on bounce-back, scroll to and focus the first offending field, mark it invalid, preserve all typed values (the API already preserves entries — reflect that visually) |
| **Disabled** | only the readonly slug on edit — locked styling, lock glyph, not the greyed "broken" look |

### Interactions & motion

- **Section reveal / collapse (Integrations):** height/opacity ease, ~180–220ms, chevron rotates. Honor `prefers-reduced-motion` — snap open with no transition.
- **Logo thumbnail** appears with a quick fade on file select.
- **Color preview chip** updates live (instant is correct feedback).
- **Delete modal** fades/scales in ~150ms; reduced-motion → instant. Focus trapped inside; Esc cancels.
- **Submit button** transitions to its loading label without layout shift (reserve width).

### Accessibility

- **Keyboard order** follows DOM top-to-bottom; the collapsed Integrations toggle is a real `<button aria-expanded>` in tab order, its panel `aria-controls`-linked.
- **Logo upload:** the styled dropzone must wrap a real, focusable, visually-hidden `<input type=file>` with a programmatic label — never a `div` with a click handler. Announce the chosen filename via `aria-live`.
- **Color inputs:** each swatch + hex pair shares one accessible label ("Primary report color"); the live preview is decorative (`aria-hidden`).
- **Delete modal:** `role=dialog`, `aria-modal`, labelled by the title; focus starts on Cancel; the destructive button's disabled state conveyed by `aria-disabled` + the visible "type the name" instruction.
- **Errors:** invalid fields get `aria-invalid` + `aria-describedby`; on server bounce, move focus to the first error and announce a summary via `aria-live`.
- **Contrast:** danger-zone text (`#991b1b`/`#7f1d1d` on `#fef2f2`) passes; verify any new red error helper on white meets 4.5:1.
- **Touch targets:** inputs are ~42–46px. Ensure the show/hide toggle, logo remove, chevron, and modal buttons are ≥44px.

### Responsive

- **Desktop (>980px):** single readable column at `min(880px…)`. Optional two-up for the short Brokerage/Contact pair. Sticky action bar. Live color/logo/disclaimer previews sit beside their inputs.
- **Tablet (760–980px):** everything single-column (baseline); previews move below their inputs rather than beside.
- **Mobile (<760px):** full-width stacked fields. Integrations stays collapsed — especially valuable here. Danger zone's row wraps (baseline `flex-wrap:wrap`). Delete modal goes full-width sheet. Sticky save bar pinned to the bottom edge.

### Design opportunities (summary, restrained)

1. **Collapse Integrations by default** — the biggest progressive-disclosure win; makes the default create path four short steps.
2. **Unify the logo into one control** with styled upload, instant preview, stated precedence, and a dark+light swatch check.
3. **Make the two colors legibly "the report's brand"** — outcome preview + hex-paste + white-label caption.
4. **Replace native `prompt()`/`alert()` delete flow with a styled, disabled-until-typed modal.**
5. **Inline validation instead of the unstyled bounce page.**
6. **De-jargon the copy** — "Create client" not "Create endpoint"; describe outcomes, not the `data/` filesystem.

---
## Coordinator Report Form — Stage 1: Intake & Pull

**PURPOSE.** The coordinator's entire happy path: paste one REALTOR.ca share link, press Pull, and watch the whole report fill itself in. Stage 1 is the only thing on screen at first — everything downstream (listing details, performance, showings, submit) stays hidden until a pull runs. The app's clearest expression of *make the default path excellent* and *hide complexity until it is needed*.

**ROUTE.** `/c/<slug>/` — `src/pages/c/[clientSlug]/index.astro`. Rendered inside `.client-workspace` (width `min(1040px, 100vw-40px)`; the 760px rule widens it to `min(100vw-24px, 1120px)`).

### Stage-1 anatomy (top to bottom)

| Element | Class / hook | Current baseline | Emphasis |
|---|---|---|---|
| Hero | `.client-form-hero` | eyebrow "Listing report", h1 "Create Listing Report", one paragraph | Orientation only — secondary |
| Section-1 card | `.client-form-card.client-pull-card` | numbered badge "1" + "Start here" + instruction | The stage container |
| URL field | `.client-field.wide` + `.client-url-input` | label "REALTOR.ca Admin URL", required `type=url`, helper `<small>` | **Primary input** |
| Pull strip | `.client-pull-strip` | status dot + status text + detail + dark "Pull data" button | **Primary action** |
| Social pickers | `[data-social-picker]` (hidden) | FB + IG `<select>` + thumbnail | Revealed post-pull |

### The hero

- **Current baseline.** `max-width:720px`, h1 `clamp(2rem, 4.4vw, 3rem)` at `-0.035em`, body copy `max-width:620px`, `line-height:1.7`, color `--ss-text-soft`. Eyebrow follows the app pattern.
- **Copy (current).** Eyebrow "Listing report" · H1 "Create Listing Report" · Body "Paste the REALTOR.ca share link and hit Pull data — the address, MLS®, reporting window, website page, views, photo and matching social posts all fill in below. Then just confirm and create."
- **RECOMMENDATION.** The body lists seven things that fill in "below" — but *below is empty at this moment*. Listing seven fields the coordinator can't yet see is visual noise that fights the progressive-disclosure directive. Shorten to the promise, not the inventory:
  - Body → **"Paste your REALTOR.ca share link and pull. We find the listing, the matching posts, and the numbers — you just confirm and create the report."**
- **RECOMMENDATION (spacing).** Keep the generous `44px` hero top padding (it signals "start of something") but tighten hero-to-card so intake feels like one unit. The one input is the important thing — *let it breathe*.

### Section-1 "Start here" card

- **Layout (current).** `.client-form-card` is a two-column grid: a `230px` left rail (badge "1" + heading + sub) and a `1fr` right column (field, strip, pickers). Collapses to single column at 980px.
- **Section header (current).** Badge = `30px` rounded square, `--ss-accent-soft` fill, `--ss-accent-ink` "1" at 0.72rem/700. Heading "Start here" 1rem/700. Sub "Paste the REALTOR.ca share link and pull. Everything else fills in below for you to confirm."
- **HIERARCHY.** The numbered badge is the app's spine — the coordinator reads "1 → 2 → 3 → 4" as a staircase. Keep badge "1" fully saturated; when the review block reveals, later badges should read as "unlocked" (see Reveal).
- **DESIGN OPPORTUNITY (restraint).** At intake the `230px` left rail is mostly empty beside a single input — acceptable air on desktop, an awkward orphan on tablet. Consider letting the rail hold a subtle "1 of 4" progress hint (net-new, optional) only if it earns its keep; otherwise leave it as breathing room. Do **not** fill it with decoration.

### The REALTOR.ca Admin URL input (the one required field)

- **Current baseline.** Single `.client-field.wide` in a `.client-field-grid.two`. `type=url`, `required`, placeholder `https://member.realtor.ca/Reports/ListingDestination/...`. Input min-height `42px`, `--ss-border-strong` border, focus = accent border + `3px --ss-accent-soft` glow, hover = accent border.
- **Helper (current `<small>`).** "Signed in to REALTOR.ca, the top-right corner of your listing has a SHARE LISTING button — share the link with yourself, paste it here, and press Pull data."
- **RECOMMENDATION — make the SHARE LISTING instruction unmissable.** The single biggest source of "how do I start" confusion, currently 0.8rem grey text under the field.
  - Tighten to: **"In REALTOR.ca, open your listing and click SHARE LISTING (top-right). Send the link to yourself, then paste it here."**
  - Set **SHARE LISTING** in a subtle pill or `--ss-accent-ink` weight so the eye lands on the literal button name the coordinator is hunting for on another site.
  - Net-new, optional: a small "Where do I find this?" text link that opens a 2-frame inline hint (screenshot of the SHARE LISTING button), collapsed by default.
- **STATES.**
  - *Empty / default.* Placeholder shows the URL shape.
  - *Focus.* Accent ring (current). Keep.
  - *Filled-valid.* No affordance today. RECOMMENDATION: when a plausible REALTOR.ca URL is present, nudge the status to "Ready to pull" emphasis and consider a faint check at the field's right edge.
  - *Invalid on pull.* The field is `type=url required`, but the pull is a JS button, not a submit. RECOMMENDATION: on Pull with an empty or non-REALTOR host, don't fire the network call — set the strip to an inline error and focus the field.
- **ACCESSIBILITY.** Autofocus this field on load (the one thing to do). Wire the `<small>` via `aria-describedby` so the SHARE LISTING instruction is announced. Touch target: input is 42px — **bump to 44px**.

### The Enter-to-pull affordance

- **Current behavior.** A `keydown` handler on the URL input intercepts Enter, `preventDefault()`s, and triggers the pull — never a form submit.
- **RECOMMENDATION.** A nice *respect platform conventions* touch (Enter = "go" in a one-field form) but invisible. Add a quiet hint at the strip: status detail could end with "…or just press Enter." Surface only once the field has content.

### The pull strip (status dot + status + button)

- **Layout (current).** `.client-pull-strip` = flex row, space-between, `border-bottom` + `16px` padding-bottom (it visually caps Stage 1). Left = `.client-pull-status` (a `12px` dot + a stacked strong/small). Right = `.client-pull-button` (dark `--ss-ink` bg, white, `min-height:40px`). Stacks vertically at 760px.
- **RECOMMENDATION.** Button min-height is 40px; **raise to 44px** on mobile where it goes full-width.

#### Status states (the strip narrates the whole pull lifecycle)

| State | Dot | Status `strong` | Detail `small` | Button label |
|---|---|---|---|---|
| Ready (current) | hollow, `--ss-border-strong` ring | "Ready to pull" | "Paste the REALTOR.ca link above, then pull — everything else fills in for you to confirm." | "Pull data" |
| Pulling | RECOMMENDATION: pulsing accent dot | RECOMMENDATION: "Pulling your data…" | RECOMMENDATION: staged (see modal) | "Pulling..." (current), disabled |
| Pulled (current) | **filled `--ss-accent`** (via `.is-pulled`) | "Data pulled" | "Review the values below, edit anything that looks off, then create the report." | "Refresh data" |
| Pulled-with-warnings (current) | filled accent | "Data pulled — with warnings" | "Some sources could not be fetched — see the notes below and fill those numbers in manually." | "Refresh data" |
| Failed (current) | RECOMMENDATION: amber dot | "Pull failed" | "The data sources could not be reached. Enter the numbers manually below." | "Refresh data" |

- **RECOMMENDATION — differentiate the three post-pull dot colors.** Today success and warnings share the same filled-accent dot (only text differs). Give three distinct dots: accent (clean success), amber `#d97706` (warnings), red-tinged or amber (failed). The dot is the fastest glanceable signal.
- **RECOMMENDATION — button label after pull.** "Refresh data" is correct, but on a clean success most coordinators won't need to refresh — demote the refreshed button to secondary weight (white/border) once pulled, so the dark primary emphasis moves down to "Create Report." After a good pull, the next step is approve, not re-pull.
- **MICROCOPY — for a *client-side invalid URL* (net-new state):** **"That doesn't look like a REALTOR.ca share link. Check the link and try again."** Keep it in the strip, not a modal.

### The pull loading modal (~1-minute wait)

- **Current baseline.** `.pull-modal` = fixed full-screen scrim `rgba(13,21,34,0.45)` + `2px` backdrop blur, `z-index:60`, `role="status" aria-live="polite"`. Card = `min(380px, 100vw-48px)`, centered, `.pull-spinner` (34px accent ring, `0.9s linear` spin), strong "Finding your listing and matching social posts…", p "Reading REALTOR.ca stats, matching Facebook/Instagram posts, and website analytics. This can take up to a minute."
- **The core problem.** A headless-Chrome REALTOR.ca scrape can take up to a minute. A single indeterminate spinner for 60 seconds erodes trust — the philosophy demands *optimize for speed, both real and perceived*.

#### RECOMMENDATIONS to make the wait feel fast and trustworthy

1. **Staged status messages (net-new).** Replace the one static line with a sequence that advances on a timer (not tied to real progress — the API returns one blob — but honest to the *order* the server works in). Announce each via the existing `aria-live` region:
   - 0s — "Opening your REALTOR.ca listing…"
   - ~12s — "Reading listing views and days on market…"
   - ~25s — "Matching your Facebook and Instagram posts…"
   - ~40s — "Checking website analytics…"
   - ~55s — "Almost there — finishing up…"
2. **Determinate-feel progress (net-new).** A thin progress bar under the spinner that eases toward ~90% over the expected minute and completes on response. Never stall at 100% — cap it short so completion feels like arrival.
3. **Set the expectation up front.** Keep "This can take up to a minute" — the single most trust-preserving sentence here.
4. **Reduced motion.** Under `prefers-reduced-motion: reduce`, replace the spin with a static ring + a pulsing opacity or a plain "Working…", and let the staged text carry progress. Verify the modal still reads as "loading" with motion off.
5. **Skeletons instead of a blocking modal (net-new, bigger swing — optional).** Skip the full-screen scrim: reveal the review block immediately with **skeleton placeholders** in each metric slot, swapping values in when the pull resolves. Turns dead waiting into a preview and removes a modal that traps focus. Trade-off: more build cost and review fields visible-but-empty during the wait (softens the strict progressive-disclosure line). Keep the modal for v1 (honest and simple); note skeletons as the v-next upgrade.

#### Modal accessibility (current gaps)

- **Current.** `role="status" aria-live="polite"` announces the text but does **not** trap focus or mark itself as a dialog.
- **RECOMMENDATIONS.**
  - Either (a) make it a real `role="dialog" aria-modal="true"` with focus trapped and returned to the Pull button on close, or (b) since there are no controls inside, simplest correct option: move focus to the modal card on open and back to the Pull/Refresh button on close, and mark the underlying form `inert` while it's up.
  - Keep `aria-live="polite"` on the message line so each staged message is announced. **The key async-announcement fix:** the result must be spoken, not just shown — on close, the strip's new status ("Data pulled" / "…with warnings" / "Pull failed") must be in an `aria-live` region so a screen-reader user hears the result, since the modal vanishing is silent.

### Social post pickers (revealed after the pull)

- **PURPOSE.** Let the coordinator confirm/swap which FB and IG posts the report features — top match preselected so the happy path is zero clicks.
- **Current baseline.** `[data-social-picker]` starts `hidden`, revealed by `revealAfterPull()`. Two `.client-field`s: `<select class="post-candidate-select">` (FB and IG) each with a `.post-media-preview` thumbnail (`hidden` until a media_url exists). Options labeled by `candidateLabel()` → "MMM D, YYYY — caption(≤60ch) · N views". Index 0 preselected, applied via `selectCandidate()`, which fills downstream URL/caption/media/views inputs and sets `<source>=meta_api`.
- **STATES.**
  - *Before pull.* Whole picker hidden; select holds placeholder "Pull data to match posts…".
  - *Matched (success).* Enabled select, ranked options, top preselected, thumbnail shown.
  - *No-post gate (current).* Empty candidates → a single disabled option "No matching post found" (or "No posts available — enter manually" when source is manual), select `disabled`, source forced to `manual`, and an amber `.import-fetch-notice`: "No {Facebook/Instagram} post found for this listing — did you post it? Enter it manually or leave blank." **Non-blocking.**
  - *Auto-fetch unavailable (total failure).* "Auto-fetch unavailable — enter the {network} post manually or leave blank."
- **RECOMMENDATION — the thumbnail is the confirmation, make it primary.** A coordinator picks the right post visually, not by reading a caption string. Give the thumbnail more prominence (larger, immediate) and keep the dropdown as the *refiner*. The post image is the content.
- **RECOMMENDATION — no-post gate copy is good; keep the human tone.** "…did you post it?" is exactly the *helpful-human* voice. Ensure the amber notice ties visually to the specific picker (it anchors via `data-notice-anchor`).
- **ACCESSIBILITY.** Each `<select>` is inside a `<label>` (good). The disabled no-match select still conveys state visually; associate the amber notice via `aria-describedby` so SR users hear *why* it's disabled. Thumbnails already carry alt text ("Selected Facebook post image").

### Progressive disclosure — nothing below Stage 1 exists until a pull runs (the centerpiece)

**Current mechanics (verified):**
- `[data-review-block]` (Sections 2–4 + submit panel) and `[data-social-picker]` both ship `hidden`.
- `revealAfterPull()` sets both `.hidden = false` — called in the pull's `finally`, so it fires on **success OR failure**. A degraded/failed pull still reveals the fields (the report is never a dead end).
- The `submit` handler `preventDefault()`s if `reviewBlock.hidden` — you cannot submit before a pull.

**Well-built.** Recommendations sharpen *how the reveal feels*:
- **Animate the reveal, don't pop it.** A short (~220–280ms) height+opacity ease-in as the review block mounts, so the coordinator perceives the form *growing out of* the pull. Stagger Sections 2→3→4 by ~60ms each. Under `prefers-reduced-motion`, reveal instantly with no transform.
- **Move focus and scroll intentionally.** On a successful pull, smooth-scroll the review block into view and move focus to the Section 2 "Address" field. On a warnings/failed pull, scroll to and focus the first block carrying an amber notice — take the coordinator straight to the thing they must fix.
- **Dim/fold the completed Stage 1.** Once pulled, Stage 1 has done its job. Visually recede the Stage-1 card — filled accent dot already signals "done"; add a subtle collapse of the helper text and a softened card treatment so attention flows down. Keep the URL field and "Refresh data" reachable, just lower their visual weight.
- **Reinforce the staircase on reveal.** Badges 2/3/4 appear for the first time here — animate them in with the same accent-soft fill so the "1 → 4" progression reads as *unlocking*.

### Warnings model across Stage 1 (reference)

- Every degraded source renders `.import-fetch-notice` inline (baseline `bg #fff7ed`, text `#9a3412`), one per block, updated in place. A degraded block **never** overwrites what the coordinator already typed — a core invariant to preserve.
- **RECOMMENDATION.** Add a small warning glyph and ensure `role="status"`/`aria-live` on the notice container so warnings appearing after an async refresh are announced, not just shown.

### Responsive summary

| Breakpoint | Stage-1 behavior |
|---|---|
| Desktop (>980px) | Card is `230px` header rail + `1fr`; pull strip is one row (status left, button right); pickers side-by-side. |
| Tablet (≤980px) | Card collapses to single column (header stacks above field); pickers still two-up until 760px. |
| Mobile (≤760px) | Pull strip stacks vertically, button goes **full-width** (raise to 44px); `.client-field-grid.two` → 1 col; badge grows to 34px. Modal card is `100vw-48px`. Keep the modal's staged text large enough to read one-handed and the progress bar full-width. |

---
## Coordinator Report Form — Stage 2: Review, Approve & Submit

### Purpose & where it appears

- **PURPOSE:** The confirm-and-correct stage. After a pull runs, the coordinator verifies the auto-filled numbers, captions, and photo, adds the one number no API can supply (showings), and explicitly approves before a report is frozen. A *checkpoint*, not a data-entry wall — the machine did the typing; the human does the judgment.
- **ROUTE:** `/c/<slug>/`, inside `.client-review-block[data-review-block]`.
- **REVEAL RULE (current, keep):** the entire block is `hidden` until a pull runs — **success OR failure** (`revealAfterPull()` fires in the `finally` of `pull()`). A failed pull still reveals the block so every field is reachable for manual entry; never a dead end. Do not make reveal conditional on pull *success*.

### The core problem this chapter solves

Once revealed, all three performance cards, both social rows, listing details, and showings appear at once with **identical visual weight** — a card that pulled cleanly looks exactly like a card that degraded to manual. The most valuable move: a **per-card trust state** so the eye lands on *what still needs a human* and skims past *what was pulled and trusted*.

#### RECOMMENDATION (net-new visual language) — three card states

Apply one state per `.import-review-card` (and per `.post-review-row`), driven by the same `source` values the script already computes (`meta_api`/`realtor_page`/pulled vs `manual` vs `mock`, plus presence of a warning notice):

| State | Meaning | Visual treatment | Left rail / accent |
|---|---|---|---|
| **Pulled & trusted** | source is `pulled`/`meta_api`/`realtor_page`, no warning | Calm, slightly recessed. Card background a hair cooler than surface, header text at normal weight. A small check glyph before the source badge. | 3px left border in a muted teal/green |
| **Needs your review** | pulled but a value a human should eyeball (captions, the realtor photo, any post preselected from >1 candidate) | Default surface, full contrast. Subtle "look here" affordance. | 3px left border in `--ss-accent` (cyan) |
| **Degraded — enter manually** | source is `manual` after a failed/partial pull; amber `.import-fetch-notice` present | Full contrast + the existing amber notice. Number inputs get a faint amber ring at rest so an empty `0` reads as "unfilled". | 3px left border amber (`#f59e0b`) |

- Keep it a **left rail + badge**, not a full colored fill — restraint. The report is the product; the form should feel like quiet instrumentation.
- **Dim/fold solved cards (progressive disclosure within the block):** once a "pulled & trusted" card is untouched and warning-free, render it at ~85–90% opacity with tighter vertical rhythm; when the coordinator focuses any input inside it, restore full opacity. Makes "the two things I actually need to check" pop out of a screen of five cards.
- **Reduced motion:** the dim/undim is opacity only — safe, but gate any transition behind `prefers-reduced-motion` (instant swap, no fade).

### SECTION 2 — Listing details

- **ROUTE/where:** first `.client-form-card` inside the review block; section badge "2".
- **Header (current):** "Listing details" / "Pulled from REALTOR.ca — edit only if a value is wrong." Keep — it frames the section as *confirm, not enter*.

#### Element inventory

| Element | Field | Current | Recommendation |
|---|---|---|---|
| Address | `address` (required) | `.client-field.wide`, placeholder "Pulled from REALTOR.ca" | Primary field — top position, full width (already does). When auto-filled, show a tiny "auto-filled" affordance. |
| MLS® number | `mls_number` (optional) | placeholder "Pulled from REALTOR.ca" | Secondary; half width. Fine. |
| Report period | derived read-only `.client-period-value[data-period-text]` | "First day on market → today", replaced with formatted `Mon D, YYYY → Mon D, YYYY` | Make it visibly a *derived read-only* value, not a disabled input. See below. |
| Website URL | `listing_url` (required) | `.client-url-input`, auto-found or pasted | See degraded handling below. |

#### The derived "Report period" value

- **PURPOSE:** show the reporting window without letting the coordinator fiddle with dates they don't need to touch. Derived: first day on market → today.
- **CURRENT:** a bare `<p class="client-period-value">`. Reads as body text, ambiguous whether editable.
- **RECOMMENDATION:** style it as a **read-only pill/chip** — subtle `--ss-bg` fill, `--ss-border` outline, `--ss-radius-sm`, calendar glyph, no focus ring, cursor default. Informational, distinct from every input. Caption beneath: "Set automatically from the listing's first day on market."
- **A11y:** not a form control — give the label an `id` and associate the value with `aria-describedby`, or wrap as a `<dl>` (dt "Report period" / dd value). Screen readers should hear "Report period, June 2 2026 to July 6 2026," not an editable field.

#### The manual date fallback (`[data-period-fallback]`)

- **PURPOSE:** the *only* time the coordinator touches dates — when REALTOR.ca's date couldn't be read (`needsManual = !derived || !start_date`; also forced open on total pull failure).
- **STATES:** `hidden` by default; revealed only on the failure path. Two `type=date` inputs (First day on market / End date) + an amber `.import-fetch-notice`: "We couldn't read the listing date from REALTOR.ca — set the reporting window here."
- **RECOMMENDATION:** when the fallback opens, **replace** the read-only period pill with these inputs (don't show a stale pill above live date inputs — two competing sources of truth). Keep the amber notice as the explanation *above* the inputs. Tighten: "We couldn't read the listing date. Set the reporting window below."
- **A11y:** both date inputs need real `<label>`s (currently `<span>` labels — ensure the `for`/wrapping is intact). Focus should move to "First day on market" when the fallback reveals.

#### Website URL — pulled vs. must-type

- **STATES:** (a) auto-found — script fills `listing_url` from `data.website.listing_url` when `listing_source` is `search`/`mock` and the field is empty; (b) not found — `setNotice("listing", …)` shows the amber notice at `[data-notice-anchor="listing"]`, field stays empty and required.
- **RECOMMENDATION:** when auto-found, prefix the field with a small "auto-found" chip. When not found, ensure the field carries the "degraded — enter manually" amber ring so a required-but-empty URL is unmistakable *before* submit.

### SECTION 3 — Performance (the three source cards)

- **ROUTE/where:** second `.client-form-card`, badge "3", `.import-review-stack` (grid, 10px gap) holding three `.import-review-card`s.
- **Header (current):** "Performance" / "Pulled numbers — review and correct anything that looks off." Keep.

#### The source badges — labels change by state

The badge is the primary trust signal per card. Current label logic (keep the strings, elevate the styling):

| Card | Badge selector | Labels by state |
|---|---|---|
| Website | `[data-source-badge="website"]` | `Rybbit — pulled` / `Rybbit — manual` / `Rybbit — demo data` |
| REALTOR.ca | `[data-source-badge="realtor"]` | `REALTOR.ca — pulled` / `REALTOR.ca — manual` |
| Social (shared FB+IG) | `[data-source-badge="social"]` | `Meta — pulled` / `Meta — partial` (one network manual) / `Meta — manual` / `Meta — demo data` |

- **CURRENT STYLE:** every badge is the *same* cyan `.source-badge` regardless of the "— pulled / manual / demo" suffix. The flaw — a degraded source wears the same calm cyan as a trusted one.
- **RECOMMENDATION — colour the badge by state:**
  - **— pulled** → cyan (current) or a settled teal/green. Reads "trusted."
  - **— manual** → amber fill/outline (`#fff7ed` / `#9a3412`, matching the notice) so badge and notice speak the same colour.
  - **— partial** → amber; keep "Meta — partial" but the amber signals *one network needs you*.
  - **— demo data** → a distinct **warning/violet** treatment that never reads as trusted. Per the white-label rule and the DEMO_MODE gate, demo data must be *impossible to mistake* for real numbers. The one badge that should almost look "wrong."
- **A11y:** badge text alone must carry the state (it does — "pulled/manual/demo" are words). Colour is reinforcement, never sole signal. Amber-on-white and violet must meet 4.5:1.

#### Card 1 — Website analytics (Rybbit)

- **LAYOUT:** `.import-review-head` = left (badge, "Website analytics", "Listing traffic for the reporting window.") · right `.import-primary-metric` = one big **right-aligned** number `website_views` (1.5rem, 140px) with caption "listing page views". Good "headline metric" treatment. Keep.
- **STATES:** value filled from `data.website.listing_views` unless source is `manual` (then whatever was typed survives — `applyBlock` guard). Demo → notice "Demo numbers — not pulled from real analytics."
- **RECOMMENDATION:** when pulled cleanly, the card can dim/fold (rarely needs correction). When manual/demo, keep it full-contrast with the amber ring on the input. Add `inputmode="numeric"` to all number inputs.

#### Card 2 — REALTOR.ca performance

- **LAYOUT:** head (badge, title, description, **the captured photo thumbnail** `[data-media-preview="realtor"]`) + a `.post-review-row` with a `<dl>` of two 136px stat tiles: **Total views** (`realtor_listing_views`) and **Days on market** (`days_on_market`).
- **THE PHOTO THUMBNAIL — call it out:** `.post-media-preview` (96×96, `hidden` until `realtor.image_url` fills it). The description notes it "appears on the report cover." The single most *review-worthy* element in Section 3 — a wrong cover photo is the most visible error a report can ship.
  - **RECOMMENDATION:** promote it. Larger preview (min 120×120), a clear label "Cover photo", caption "This image appears on the report cover." Give this card a persistent **"needs your review"** cyan rail even when pulled — it should never silently dim, because a human really should look at the photo.
  - **EMPTY/failed photo state:** when `image_url` is null, show a dashed 120×120 placeholder tile with "No cover photo captured" rather than nothing — an absent thumbnail currently just doesn't render, hiding the problem.
- **STATES:** partial capture is normal — `realtor.total_views`/`days_on_market` only overwrite when non-null (never wipe a typed value to 0). Badge flips pulled/manual on `realtor.source === "realtor_page"`. Warning surfaces at `[data-notice-anchor="realtor"]`.
- **RECOMMENDATION (copy split):** the two failure modes read identically today. If the pull result distinguishes them: expired/bad link → "This REALTOR.ca link looks expired — grab a fresh Share Listing link, or enter the numbers below." vs transient → "Couldn't reach REALTOR.ca just now — enter the numbers below, or Refresh data to retry."
- **A11y:** the two stat tiles use `<dt>`/`<dd>` with the input in the `<dd>` — the `<dt>` is not a programmatic label. **Add `aria-label` to each number input** ("Total views", "Days on market"). Currently a screen reader hears "spin button, 0" with no name.

#### Card 3 — Social performance (Meta)

- **LAYOUT:** head (shared Meta badge, title, description) + two `.post-review-row`s (Facebook, Instagram). Each row: left = **Post URL** input + **Caption** textarea (`.post-caption-field`, max 300, "appears on the report"); right = `<dl>` with one **Views** stat tile.
- **RELATIONSHIP TO THE PICKERS:** the *selection* happens in the Section-1 dropdowns (`selectCandidate` writes url/caption/media/views + sets source `meta_api`). These rows are the **review surface** for that selection. Good separation — pick above, verify here.
- **STATES per network:** filled from the preselected top candidate; `— partial` when one network is manual; no-post gate leaves the row's inputs empty and non-blocking (all social fields optional). Demo labels the shared badge.
- **CAPTION — the highest-review element in this card:** free text that *lands verbatim on the report*.
  - **RECOMMENDATION:** live character counter "0 / 300" that goes amber near the cap. Label it "Caption — appears on the report" so the stakes are visible at the field.
- **VIEWS tile a11y:** same `<dt>`/`<dd>` gap — add `aria-label="Facebook views"` / `aria-label="Instagram views"` to the inputs (two rows both say "Views").
- **PROGRESSIVE DISCLOSURE within the card:** if a network had **no matching post**, that row should visibly recede — a compact "No Facebook post matched — add one manually or skip" line with a "+ Add manually" disclosure that expands the inputs on demand, rather than three empty inputs by default.

#### The amber warning notices (`.import-fetch-notice`) + the no-overwrite rule

- **CURRENT:** `#fff7ed` bg / `#9a3412` text, one notice per block, injected/updated/removed in place by `setNotice()`. Anchored to a metric block or a `[data-notice-anchor]`.
- **THE RULE (keep, it's an invariant):** a degraded ("manual") block **never overwrites what the coordinator already typed** (`applyBlock` skips fills when `source === "manual"`; realtor/address/mls only fill when null/empty). Refreshing after a correction must not wipe it back to 0.
- **RECOMMENDATION:**
  - Give the notice a **warning icon** and treat it as an *alert* — `role="status"` (polite) so it's announced when injected after a pull. (The `!important` overrides in the current rule are a smell but out of Figma scope; note the notice must win specificity over `.post-review-row p`.)
  - Pair the amber notice with the **amber input ring** so the eye connects "there's a warning" to "*this* field needs a number."
  - Standardize the notice voice on the warmer first-person: "We couldn't fetch this — please enter it below."

### SECTION 4 — Showings & notes

- **ROUTE/where:** third `.client-form-card`, badge "4". Header: "Showings & notes" / "The one number we can't pull, plus any seller-facing note." Keep.
- **Elements:**
  - **Showings** — `showings` number input (required, min 0, placeholder "0") + toggle "Do not display showings on the report" (`hide_showings`).
  - **Notes** — textarea (max 600, `hide_notes` toggle "Do not display notes on the report").
- **RECOMMENDATION — the "do not display" toggles are inverted logic:** a checkbox you tick to *hide* is a double-negative trip hazard. Reframe to positive: a toggle labelled "Show showings on the report" **on by default**, or a two-state segmented "Show / Hide." If the negative form must stay (to preserve the `value=yes` hidden semantics), visually tie the toggle to a live preview cue ("Hidden from report" appears when ticked).
- **STATES:** Showings is required — empty on submit triggers the server bounce. Give it the same amber "needs a value" treatment as degraded metrics, since it's the one number that's *always* manual. Required means empty ≠ 0 — treat placeholder "0" carefully.
- **Notes counter:** add a live "0 / 600" counter mirroring the caption counter.
- **A11y:** toggles use `.client-toggle` with wrapped `<span>` labels — fine. Ensure the checkbox is the accessible-name target and the whole row is a 44px touch target on mobile.

### The SUBMIT PANEL

- **ROUTE/where:** `.client-submit-panel` at the block's end — approval checkbox (left) + "Create Report" button (right). Flex row, space-between; stacks to column at 760px.
- **Elements:**
  - **Approval checkbox** `.client-approval` — `approved` (required, `value=yes`), 18px box, accent-deep tick. Label: **"Review and approve"** / "I have reviewed the numbers, captions, images, and notes above."
  - **Submit button** `.client-submit-button` — ink bg / white, "Create Report."

#### States

| State | Trigger | Treatment |
|---|---|---|
| **Idle / not-yet-approved** | approval unchecked | Button enabled but visually secondary; hint that approval is the gate. |
| **Ready** | approval checked | Button reaches full primary emphasis. |
| **Submitting** | on submit | Button `disabled`, text "Creating report...", grey (`#9ca3af`). Dup-submit guard prevents duplicate snapshots. |
| **Returned from server error** | bfcache `pageshow` | Button re-enabled, text restored to "Create Report", review block stays revealed. |

- **CURRENT nuance (keep):** the `submit` handler guards against submitting while `reviewBlock.hidden`; `pageshow` re-enables after a validation bounce (critical so the coordinator can fix and resubmit). Both must survive any redesign.

#### RECOMMENDATION — make the approval gate legible

- The approval checkbox is `required` but the button is **not disabled** when unchecked — so the user can click "Create Report," get a native validation pop, and feel bounced. Instead: **disable the button until approval is checked**, with a quiet helper: "Check the box above to enable." Turns an error into a prevented error. (If native-required must stay for no-JS safety, keep it as the backstop but add the JS-disabled affordance as the primary path.)
- **Submitting feedback:** add a small inline spinner inside the button next to "Creating report..." — the snapshot embed can take several seconds; a static disabled button reads as "nothing happening."
- **Sticky panel (RECOMMENDATION):** on desktop, make the submit panel stick to the bottom of the viewport once the review block is scrolled — the coordinator often scrolls a long form and shouldn't hunt for the button. Un-sticky on mobile (already full-width at the end). Only if it doesn't clutter.

#### Microcopy (recommended, helpful-human voice)

| Context | Current | Recommended |
|---|---|---|
| Approval title | "Review and approve" | Keep. |
| Approval detail | "I have reviewed the numbers, captions, images, and notes above." | Keep — specific and honest. |
| Button idle | "Create Report" | Keep. |
| Button disabled hint | (none) | "Check the box to enable" |
| Button submitting | "Creating report..." | "Creating your report…" |
| Realtor expired-link notice | "REALTOR.ca capture unavailable…" | "This REALTOR.ca link looks expired — grab a fresh Share Listing link, or enter the numbers below." |
| Total pull failure status | "Pull failed" / "The data sources could not be reached. Enter the numbers manually below." | Keep — honest and non-blocking. Add "You can also Refresh data to retry." |

### Error handling — the server-bounce return (cross-reference)

- When `/api/snapshot` rejects (bad date, out-of-range number, disallowed URL scheme), it currently renders a bare unstyled "Report not created" page; the user hits Back and lands here via bfcache with fields preserved and the button re-enabled.
- **RECOMMENDATION for THIS stage:** rather than relying solely on the dead-end page + Back, surface validation inline. On return, render an **error summary** at the top of the review block — "We couldn't create the report: [reason]. Your entries are saved." — with an anchor link to the offending field, marked with the amber ring + `aria-invalid`. Move focus to the summary. (The dedicated error-page redesign is the Errors chapter's scope; this is the inline half that belongs to the form.)

### Accessibility summary (whole stage)

- **Keyboard order:** intake (Section 1) → after reveal, DOM order Section 2 → 3 → 4 → approval → submit, which is correct. On a *degraded* pull, move focus to the first field needing manual entry.
- **Named controls:** the recurring defect is `<dl>`-wrapped number inputs (Total views, Days on market, Views ×2) with **no programmatic label**. Add `aria-label` (network-qualified for the two "Views") to every one. Top a11y fix in the chapter.
- **Live regions:** `.import-fetch-notice` → `role="status"` polite; the pull status strip lives in an `aria-live` context; the pull modal is `role="status" aria-live="polite"` (keep).
- **Contrast:** amber notice `#9a3412` on `#fff7ed` passes; verify any new amber *badge* and the demo/violet badge meet 4.5:1.
- **Touch targets:** number inputs, toggles, dropdowns, and the approval checkbox ≥44px tall on mobile. The 18px approval box needs a ≥44px hit area via label padding.
- **Reduced motion:** dim/undim of solved cards, submit spinner, and any reveal transition must collapse to instant under `prefers-reduced-motion`.

### Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| **Desktop (>980px)** | Cards full width in the stack; `.import-review-head` is a row (metric right-aligned); post rows are row layout with the stat `<dl>` on the right. Optional sticky submit panel. |
| **Tablet (≤980px)** | `.client-form-card` collapses to single column; `.post-review-row` becomes column (stat tiles drop below the caption, full width). Section headers cap at 680px. Keep the per-card state rail. |
| **Mobile (≤760px)** | `.import-review-head` stacks (badge/title, then the big metric full-width with a top border); `.import-primary-metric` left-aligns; post-row stat `<dl>` goes column; `.client-submit-panel` stacks (approval above, full-width button below); `.client-approval` full width. The cover-photo preview should stay prominent, not shrink below ~96px. |

New elements (state rails, badges, counters, error summary, sticky panel) must degrade gracefully — rails become top borders on mobile, the sticky panel un-sticks, counters sit under their fields.

---
## Errors, Validation & Feedback (incl. the unstyled server pages)

This chapter governs every moment the app tells the coordinator or admin that something went wrong, is in progress, or succeeded. Today these are handled by three weak patterns — a bare unstyled dead-end page for server rejections, a browser-native `prompt()`/`alert()` for deletion, and a single redirect as the only "it worked" signal. The philosophy is explicit: **prevent errors before explaining them · make recovery simple · make states obvious (empty, loading, success, error, disabled) · give instant feedback after every action.** The current implementation does the opposite of all four.

### Current baseline (what exists today)

The two server error pages are **not the same**, and the difference decides what each redesigned variant must add. Read the source before designing either one:

| Surface | Function signature | Renders a recovery link? | Current treatment | Why it is weak |
|---|---|---|---|---|
| Snapshot validation fail (`/api/snapshot`) | `errorPage(status, message, backHref)` — **three** args | **Yes, always** — a "start over" `<a href={backHref}>` is always emitted | Bare `system-ui` HTML page — h1 "Report not created", the reason, "Use your browser's **Back** button… your entries are preserved", plus the start-over link | Full-page navigation away from the form; zero brand; relies on the user understanding bfcache; no field highlighted |
| Client save/create fail (`/api/client`) | `errorPage(status, message)` — **two** args | **No — none today** | Same bare page — h1 "Client not saved", reason, Back-button instruction **and nothing else** (no link of any kind) | Same, plus: a 409 slug collision reads as a generic failure and offers the user zero forward path off the page |
| Login fail (`/api/login`) | redirect | n/a (inline) | Redirect back to `/login?error=1` → red `.login-error` line "That password didn't match. Try again." | Acceptable pattern (inline, preserves the page) — keep it; use it as the model for everything else |
| Delete client | native `prompt()`/`alert()` | n/a | Native `prompt()` "Type the client name to confirm deletion" + native `alert()` "Name didn't match — nothing was deleted." | Native dialogs are unbranded, unstyleable, not screen-reader-consistent |
| Success (any save) | 303 redirect | n/a | 303 redirect to the new page | No confirmation that anything was saved |

**The load-bearing distinction:** the **snapshot** error page already ships a start-over link (it has a `backHref` to build it from); the **client-setup** error page ships **no link at all** — just a paragraph telling the user to press Back. So the two redesigns are not symmetric: one page needs its existing link *promoted*, the other needs a recovery action *added from scratch*. Do not treat "start over where a `backHref` exists" as a shared conditional — it describes only the snapshot page.

Every one of these violates **prevent errors before explaining them**: all validation is currently server-side only, so the first time a coordinator learns a number is negative or a URL is malformed is *after* they submit and get bounced.

### RECOMMENDATION — the core shift: validate inline, before submit

The dead-end error page should become a **rare last resort**. The fix is layered:
1. **Client-side validation before submit (primary).** Every rule the server enforces is also checked in the browser on blur and on submit. A failed submit never leaves the page — errors render inline against the fields.
2. **A form-level error summary (secondary).** On a blocked submit, a summary card appears at the top listing each problem as a link that jumps focus to the field.
3. **Server-side validation stays (the wall).** The server still rejects bad input (defense in depth — a snapshot must never freeze bad data). Because the client caught it first, the server page now only fires on tampering, disabled-JS, or a race.

#### Inline field-error pattern (net-new, applies to both forms)

Each invalid field enters an **error state**:
- Field border and focus ring switch from `--ss-accent` to a danger red (`--ss-danger #dc2626`, promoted to a token — see Design Foundations).
- A short message appears directly beneath the field in danger red, ~0.85rem.
- The field gets `aria-invalid="true"` and `aria-describedby` pointing at the message id.
- The message clears the instant the field becomes valid (on input).
- Only the label/message turns red; do not paint the whole card red (avoid **visual noise**).

#### Form-level error summary card (net-new)

- Appears at the top of the form (scrolls into view) only after a blocked submit attempt.
- Errors are red (`--ss-danger`), distinct from the amber degraded-pull notice (`.import-fetch-notice`, `#fff7ed`/`#9a3412`). **Keep amber = "we couldn't fetch, carry on manually" and red = "this must be fixed before you continue."** Never let the two colors collide in meaning.
- Content: heading, then a bulleted list of every problem, each a link to its field.
- `role="alert"` so a screen reader announces it immediately; focus moves to the summary heading.

Microcopy for the summary (helpful-human voice):
- Heading (snapshot form): **"Two things need a quick fix before this report can be created."** (use the live count; "One thing needs a quick fix…" for a single error).
- Heading (client form): **"Almost there — a couple of fields need attention."**
- Each list item is the field label + the specific fix, e.g. "Showings — enter a number (0 or higher)."

### Exact validation messages to surface

Server rules restated as inline, field-anchored, human messages.

#### Coordinator report form (`/c/<slug>/` → `/api/snapshot`)

**Read this before anchoring any message.** How the date and number fields actually post is not what a normal form would suggest:

- **Dates are hidden mirror fields, not editable inputs.** The posted `start_date` and `end_date` are **hidden** inputs populated by JS. The coordinator never types into them directly. The only *visible* date controls are the manual fallback inputs `[data-period-start]` / `[data-period-end]`, which **exist only on the failure path** (when REALTOR.ca's date couldn't be read) — their change handlers copy their values into the hidden `start_date` / `end_date`. So: anchor every date error to the **visible manual fallback inputs**, and only when that fallback is present. On the happy path there is no visible date field to attach an error to (the derived read-only period pill is showing instead), which is fine — a date error can't originate from the coordinator there.
- **Number fields default to `0` and can never be empty on submit.** Every number input posts `value="0"` by default, and the server's `numberField()` treats an empty value as `0`. There is therefore **no "empty number" error state** in this UI — you cannot bounce an empty number field, because it is never empty. The *only* client-side number error is a **negative or non-numeric** value the user actively typed. Do not design an "enter a number" error for a blank field; it can't happen.

| Rule (from snapshot.ts) | Field it anchors to | Inline message (recommended) |
|---|---|---|
| `address` required | Address | "Enter the listing address — it appears on the report cover." |
| `listing_url` required + must be http(s) | Website URL | "Add the listing's website link (starting with https://)." |
| `start_date` missing (hidden field unpopulated) | **Manual date fallback** (`[data-period-start]`), shown only on the failure path — never the hidden mirror field | "We couldn't read the listing date. Pull data from REALTOR.ca, or set the dates below." |
| invalid date format | Manual date fields (fallback only) | "Use a real calendar date." |
| `startDate > endDate` | Manual **end** date (fallback only) | "The end date can't be before the first day on market." |
| Facebook/Instagram post URL present but not http(s) | that Post URL field | "This doesn't look like a valid link — it should start with https://." |
| REALTOR.ca Admin URL not http(s) | Start-here URL input | "Paste the full REALTOR.ca share link (starting with https://)." |
| any number field **negative or non-numeric** (never empty — defaults to 0) | that specific number input | "Enter a number that's 0 or higher." |
| `approved !== "yes"` | Approval checkbox | "Please confirm you've reviewed the numbers before creating the report." |

The design win: the server lumps all bad numbers into one message ("These fields must be non-negative numbers: …") so the coordinator can't tell *which* box. Inline validation fixes this for free — each number field owns its own message. And because a number field is never blank on submit, that per-field message only ever fires against a value the user actively typed as negative or non-numeric — a rare, well-earned error, never a nag on an untouched field.

Additional client-side prevention (net-new, cheap): number inputs `min="0"`, `inputmode="numeric"`, strip a stray comma on blur (the server already tolerates commas). The approval checkbox should **disable** "Create Report" until ticked, with helper text next to the disabled button ("Confirm your review to enable this."). Keep both guards.

#### Client setup form (`/admin/clients/new` + edit → `/api/client`)

| Rule (from client.ts) | Field | Inline message |
|---|---|---|
| `name`/`slug` required | Client name / slug | "Give the client a name." / "Add a slug (lowercase letters, numbers, hyphens)." |
| slug collision, 409 | Slug field | "That slug is already taken — [edit the existing client] instead." (link to its edit page) |
| password < 8 on create | Coordinator password | "Use at least 8 characters." |
| password missing on create | Coordinator password | "Set a password — it protects this client's report link." |
| logo type not in allowlist | Logo upload | "Logos need to be PNG, JPEG, SVG, or WebP." |
| logo > 1 MB | Logo upload | "That file's a bit big — keep the logo under 1 MB." |
| no logo at all | Logo section | "Add a logo — upload a file or paste an https link." |
| integration ID not numeric | that ID field | "This ID should be numbers only." |
| website URL not http(s) | Website URL | "Add a valid link, like https://acmerealty.com." |

Prevention improvements (net-new): validate logo type/size **on file-select**; live-slugify the slug field; mark integration ID fields `inputmode="numeric"`.

The 409 slug collision deserves special handling — the one client-form error a user is most likely to hit. Its inline message must include a working link to the existing client's edit page, turning a dead end into a one-click recovery. This matters doubly because, as noted in the baseline table, the **current** client-error page offers no forward path at all — a collision today dumps the admin on a linkless bare page.

### The server error page — redesign as a real last resort

When JS is off or something truly slips through, the server page still renders. It must stop being a bare `system-ui` dead end and become a branded, calm, recoverable page. **The two variants start from different places — spec them separately.**

- **Route/where:** returned by `/api/snapshot` and `/api/client` on rejection.
- **Layout (shared):** the standard app shell (Supersonic chrome, never client-branded — hold the white-label wall), a centered card like `/login`.
- **Content (shared):** an icon or eyebrow, a plain-English h1, the specific reason, and a clear recovery action.
- **Recovery emphasis (shared):** the Back-button instruction is the right advice (bfcache preserves entries), but should be **secondary**, phrased warmly, paired with a primary button back to the form.

#### Snapshot variant (`/api/snapshot`) — PROMOTE the existing link

This page already emits a start-over `<a href={backHref}>`. The redesign **promotes and reframes** it rather than inventing recovery from nothing:

- H1: **"Let's fix one thing and try again."**
- Body: the specific reason.
- Primary button: **"← Back to the report form"** — this is the Back-button advice made a real, prominent control; it must return to the *populated* form (a `history.back()`-style link, honoring the bfcache guarantee, never a fresh GET that would blank the form).
- Secondary/tertiary link: the page's **existing** `backHref` link, kept but demoted to a quiet **"Start over with a blank form."** It already exists in source — this variant is a re-weighting, not an addition.
- Reassurance: **"Nothing was lost — your entries are still on the form."**

#### Client-setup variant (`/api/client`) — ADD a recovery action that doesn't exist today

This page currently renders **no link at all**. The redesign must **add a primary recovery action from scratch** — it is not promoting anything, because there is nothing to promote:

- H1: **"That didn't save — here's why."**
- Body: the specific reason.
- Primary button (**net-new for this page**): **"← Back to the client form"** — a real control that returns to the populated form via bfcache, closing the current dead-end where the admin's only option is the browser Back button.
- For the 409 slug-collision case specifically, add a second action: **"Edit the existing client instead"** linking to that client's edit page (the one place a forward path beats a back path).
- Reassurance: **"Nothing was lost — your entries are still on the form."**
- Note for the build: unlike the snapshot page there is no `backHref` in scope here today, so the "Back to the client form" target must be wired deliberately (bfcache/`history.back()`), not assumed to exist.

### Success feedback

Currently success is a silent redirect. The philosophy demands **give instant feedback** and **make states obvious: … success**.

| Action | Current | Recommended |
|---|---|---|
| Snapshot created | 303 → `/reports/<id>` | Land on the report as today, but show a dismissible success toast/banner at the top of the report toolbar: **"Report created."** (auto-dismiss ~4s, `role="status"`). The report itself is the confirmation, so keep this light. |
| Client created | 303 → `/c/<slug>/` | Land on the coordinator form with a success banner: **"Client created — this is their report form."** Helps orient the admin, who may not realize they've moved surfaces. |
| Client saved (edit) | 303 → `/c/<slug>/` | Success banner: **"Changes saved."** |
| Client deleted | 303 → `/` | On the clients dashboard, a banner: **"Client deleted."** |

Pattern: a single reusable **inline banner / toast** component, top of content, `role="status"` (polite), auto-dismissing, manually dismissible. Success = a dedicated `--ss-success` green so success ≠ brand-action cyan. One component, four messages.

### Destructive-action confirmation — replace prompt()/alert() with a modal

Delete is the one irreversible action. Today it uses native `prompt()` and `alert()`. Replace with a **branded confirmation modal**.

- **Trigger:** the "Delete client" button in the red Danger Zone card opens the modal (does not submit yet).
- **Layout:** centered dialog over a dimmed scrim; red-accented but not alarmist.
- **Content:**
  - Heading: **"Delete {Client name}?"**
  - Body: **"This removes the report endpoint and the coordinator's password. Existing reports stay viewable by admins. This can't be undone."** (accurately reflects the code: snapshots persist, endpoint + password are revoked.)
  - A **typed-confirmation input**: "Type **{Client name}** to confirm." — preserve the existing typed-name guard.
  - **Primary danger button** ("Delete client") stays **disabled** until the typed text matches exactly — replacing the after-the-fact `alert("Name didn't match")`.
  - **Cancel** button (secondary); Esc / scrim-click also cancel.
- **On confirm:** submit the existing hidden `mode=delete` form.
- **Focus & a11y:** `role="dialog"` `aria-modal="true"`, labelled by the heading; focus moves into the dialog on open (to the typed input), trapped while open, returned to the Delete button on cancel.

### Motion & reduced-motion

- Error summary and inline errors: appear instantly or with a ~120ms fade — no bounce, no shake.
- Success toast: gentle fade/slide-in (~150–200ms), fade-out on dismiss.
- Confirmation modal: scrim fade + dialog scale-from-98% (~150ms).
- **Reduced motion:** drop all transforms; state changes become instant opacity swaps. Nothing about *whether* an error/success shows depends on motion.

### Screen-reader announcement of states

- Error summary: `role="alert"` (assertive) — announced immediately; focus lands on its heading.
- Individual field errors: `aria-invalid` + `aria-describedby`.
- Success banners: `role="status"` (polite).
- The pull loading modal already uses `aria-live="polite"` (keep it).
- Confirmation modal: focus trap + `aria-modal`.

### Consistent STATE MATRIX (apply everywhere)

One vocabulary of states, styled once and reused across the report form, client form, dashboard, and login. The deliverable to pin in Figma.

| State | Visual treatment | Color family | Motion | ARIA | Example copy |
|---|---|---|---|---|---|
| **Empty** | Dashed-border box, muted icon, one-line explanation + primary CTA | `--ss-muted` text on `--ss-bg` | none | plain | Dashboard: "No clients yet — create your first one." |
| **Loading** | Spinner + short honest label; dim scrim only for blocking ops (the pull) | `--ss-accent` spinner | spinner only; respects reduced-motion | `aria-live="polite"` / `aria-busy` | "Finding your listing and matching social posts…" |
| **Success** | Dismissible top banner/toast, checkmark | `--ss-success` (new green) | fade/slide ~150ms | `role="status"` | "Report created." / "Changes saved." |
| **Error (recoverable)** | Inline field error + red focus ring; form-level summary card on submit | `--ss-danger #dc2626` | instant/120ms fade | field: `aria-invalid`; summary: `role="alert"` | "Enter a number that's 0 or higher." |
| **Degraded (domain-specific, pull only)** | Amber inline notice inside the affected card; form stays fully usable | amber `#fff7ed`/`#9a3412` (existing) | none | `role="status"` | "REALTOR.ca didn't respond — enter these numbers by hand." |
| **Disabled** | Reduced opacity (~0.5), `not-allowed` cursor, helper text explaining why | `--ss-muted` | none | `aria-disabled` + real `disabled` | "Confirm your review to enable this." |

Two hard rules for the matrix:
1. **Red ≠ amber in meaning.** Red = "you must fix this to continue." Amber = "a data source degraded; carry on manually." A degraded pull is never a blocking error — the ground-truth invariant is that a failed pull must never block PDF generation, so it must never wear the red error costume.
2. **Every disabled control explains itself.** The "Create Report" button, the disabled "No matching post found" select, and the disabled Delete button each need adjacent helper text saying why.

### Design opportunities (restrained)

- **Kill the dead-end page for 99% of cases** by front-loading validation client-side; the server page becomes the rare fallback. The single highest-leverage change in the chapter.
- **Unify error color and voice** across snapshot, client, and login into one `--ss-danger` token and one copy voice.
- **Give the client-error page a forward path at all** — today it has none; the redesign adds "Back to the client form" and, for collisions, "Edit the existing client instead."
- **Turn the 409 slug collision into a link, not a wall.**
- **Replace native dialogs entirely** — no `prompt`/`alert`/`confirm` anywhere; the delete modal is the last one to convert.
- **Add the missing success layer** — the app currently never says "done." Four calm banners close that gap without adding chrome.

---
## Cross-Cutting Standards (motion, responsive, accessibility & voice)

These rules apply to every screen in the app chrome — `/login`, the clients dashboard, the client setup form, the coordinator report form, and the designed error states. Follow them everywhere so the product reads as one deliberate system. Where a screen chapter needs a motion, breakpoint, focus, or copy decision, it should defer here rather than re-deciding.

### 1. Motion

Motion here has one job: **explain state, never decorate.** The current baseline is already restrained — a single `140ms ease` transition on buttons, inputs, cards, and nav, plus one spinner keyframe (`pull-spin 0.9s linear infinite`). Keep that spirit; formalize it into a token set.

#### Motion tokens (current baseline → recommendation)

| Token | Value | Applies to |
|---|---|---|
| `--motion-fast` | 140ms (current, keep) | Hover/focus color, border, background, box-shadow on buttons, inputs, cards, nav links |
| `--motion-reveal` | 200–240ms (net-new) | Progressive-disclosure reveals: review block, social pickers, manual-date fallback |
| `--motion-modal` | 160ms (net-new) | Pull loading overlay fade-in |
| `--ease-standard` | `ease` (current) or `cubic-bezier(0.2,0,0,1)` | All of the above |
| `--spin-duration` | 0.9s linear infinite (current, keep) | `.pull-spinner` only |

Two durations cover almost everything: `--motion-fast` for micro-feedback, `--motion-reveal` for content appearing. Resist adding a third easing curve.

#### What may animate, and how

- **Hover / focus (140ms):** color, background, border-color, box-shadow only. Never animate `width`/`height`/`top` on interactive chrome.
- **Reveals (progressive disclosure):** the review block, social post pickers, and manual-date fallback **fade + rise ~8px** over `--motion-reveal`, not pop. Motion doing its actual job — signaling "new stuff arrived, here's where to look." Fold/dim a completed stage with the same easing.
- **Spinner:** the existing `pull-spin` on the pull modal is correct and sufficient. Keep it the only continuous animation.
- **State changes:** status-dot color and pull-strip text swaps cross-fade at `--motion-fast`. Give the "Create Report" button's disabled/"Creating report…" transition the same 140ms.
- **Never animate:** amber warning notices and inline error banners must appear **instantly**, no fade. An error that eases in reads as slower and less trustworthy.

#### prefers-reduced-motion (currently MISSING — required)

The stylesheet has **no `prefers-reduced-motion` block today.** A foundational gap. Add one global rule:
- **All transitions and transforms:** collapse to `0.01ms`. Reveals should still *appear* (never hide content) — just instantly, no rise/fade.
- **The pull spinner:** must NOT vanish. Replace the rotation with a **non-animated determinate-looking or pulsing-opacity** treatment. State obvious over decoration.
- Verify the modal still reads as "loading" with motion off before shipping.

### 2. Responsive

This is an **internal, desktop-first tool.** Coordinators fill the report form and admins set up clients at a desk. Do not chase a native-mobile experience; **design tablet-up as the real target, and make phone width usable but not optimized.**

#### Breakpoint strategy (current baseline, keep the two breakpoints)

| Breakpoint | Current behavior | Recommendation |
|---|---|---|
| Default (desktop) | Shells: home/admin `min(1120px \| 880px, 100vw-32px)`; coordinator `min(1040px, 100vw-40px)` | Keep. Multi-column where it aids scanning. |
| **≤980px (tablet)** | `.client-form-card` → single column; social post-review rows stack | Keep. The primary "gets narrow" tier. |
| **≤760px (mobile)** | Nav width shrinks, hero/shells re-pad, everything single-column | Keep as the graceful-degradation floor. |

Standardize: **at ≤980px every two-up field pair becomes single-column; at ≤760px the whole page is one column and full-width cards.** Never let a form field pair persist side-by-side below 760px.

#### Design for thumbs

- **Touch targets ≥44px.** Current min-heights are inconsistent: primary buttons `42px`, small buttons `36px`, some nav `36–38px`. On touch (≤980px) **raise every interactive target to ≥44px**. The 36px small-button and the approval checkbox are the ones to watch.
- **Thumb-reachable primary actions.** On mobile, the report form's two decisive actions — **"Pull data"** and **"Create Report"** — should be full-width and sit at the natural bottom of their stack. Never float them mid-screen or shrink them below full-width on mobile.
- **Inputs comfortable to tap:** the current `min-height: 46px` on form inputs is good — hold that line on mobile.

#### Reflow specifics per surface

- **Login:** single centered card — already fluid. Cap card width (~360–400px) and full-width the "Continue" button on mobile.
- **Clients dashboard:** the client-card grid `auto-fill, minmax(~260px, 1fr)` → 2-up on tablet → 1-up ≤760px. The empty-state dashed box goes full-width.
- **Client setup form:** collapses to one column at 980px — good. Keep the wide "Brokerage address" field full-width at all sizes.
- **Coordinator report form:** the three import-review-cards stack vertically ≤980px. The big right-aligned metric number inputs stay right-aligned on desktop but go **left-aligned/full-width on mobile** so label and value don't split awkwardly.

### 3. Accessibility (the foundation, not a pass)

Treat every item below as required, not optional.

#### Keyboard & focus

- **Visible focus everywhere.** The current `:focus-visible` (2px accent outline + 2px offset) on links/buttons and the input focus ring (2px accent + 3px accent-soft glow) are good — apply them to **every** interactive element, including selects, checkboxes, the source badges if interactive, and the danger-zone delete button. Never `outline: 0` without an equally visible replacement (there's an `outline: 0` in the stylesheet — confirm a ring replaces it).
- **Logical tab order = visual order.** On the report form: URL field → Pull data → (after reveal) social pickers → listing details → performance cards → showings/notes → approval checkbox → Create Report. Progressive-disclosure reveals must **insert into tab order in place**, and focus should move to the first revealed field (or the review block heading) when a pull completes.
- **Enter-in-URL triggers pull, not submit** (current behavior) — keep, and make sure the "Pull data" button is also reachable and operable by Tab+Enter/Space.
- **Modal focus trap:** the pull loading overlay must trap focus while open and return focus to "Pull data" on close. Esc is inert here (the pull can't be cancelled) — say so via the aria-live text, don't silently swallow Esc.

#### Screen-reader labels & live regions

- **Every field has a real `<label>`.** Placeholders are never labels.
- **Icon-only / status elements need text:** the status **dot** in the pull strip is decorative color — the adjacent status text is the accessible label; mark the dot `aria-hidden`. Source **badges** must be plain text, readable verbatim.
- **aria-live regions (already partly present — formalize):**
  - Pull modal copy is `aria-live="polite"` today — keep.
  - The **pull-strip status text** should be `aria-live="polite"` too, so the outcome ("Data pulled — with warnings") is announced without moving focus.
  - **Amber degrade notices** and **inline validation errors** should announce on appearance — `role="status"` (polite) for warnings, `role="alert"` (assertive) for a submit-blocking error.
- **Thumbnails** (social post preview, captured REALTOR.ca photo) need `alt` describing purpose ("Selected Facebook post image", "Listing cover photo") — not empty, not the filename.

#### Contrast obligations

The cyan accent is a known risk. Enforce:
- **Supersonic cyan `--ss-accent #29abe2` fails ~3:1 on white** for normal text — **never use it for body or label text on white.** For accent *text* use `--ss-accent-ink #0b6d9f`. Reserve `#29abe2` for large elements, focus rings, and fills.
- **Muted text `--ss-muted #64748b`** is borderline — verify ≥4.5:1 on `--ss-bg #f5f7fa`; if under, darken toward `--ss-text-soft #47536b` for anything that must be read. Don't use `--ss-muted` for load-bearing instructions.
- **Amber notice** (`bg #fff7ed`, text `#9a3412`) — verify ≥4.5:1 (close; confirm in Figma).
- **Buttons:** ink `#0d1522` on white and white on ink both pass comfortably — keep.

#### Never rely on color alone

- **Source states** (pulled / partial / manual / demo) must carry a **text label in the badge**, not just a color. They already do — hold that line; never reduce a badge to a bare colored dot.
- **Warning blocks** pair the amber background with a **word and ideally a small ⚠ glyph**, so colorblind users and grayscale printing still parse them.
- **Pull-strip status dot** must always be accompanied by its text.
- **Required fields** get a text/asterisk marker plus programmatic `required`, not a red border alone.

### 4. Voice

Interface copy is **a helpful human being brief.** Plain, calm, active, second person. Never jargon, never blame, never cute.

#### Principles

- **Plain and active:** "Enter your password to open this workspace." (current login subtext) is the target register.
- **Calm on failure:** never sound alarmed. "Pull failed" is fine as a status label; the surrounding sentence reassures and points forward.
- **Prevent, then explain, then recover:** validate inline before submit; when an error surfaces, lead with the fix, not the fault.
- **No dead ends:** keep the "your entries are preserved" reassurance in the designed replacement for the server-error page.

#### Do / Don't (drawn from this app's real strings)

| Do | Don't | Why |
|---|---|---|
| "That password didn't match. Try again." (current) | "Authentication failed. Invalid credentials." | Human, blame-free, actionable |
| "Finding your listing and matching social posts…" (current) | "Processing request…" | Says what's actually happening |
| "This can take up to a minute." (current) | (silence during a long wait) | Sets expectations |
| "No matching post found" + non-blocking amber notice (current) | "Error: post lookup returned 0 results." | States the state plainly; doesn't block |
| "Data pulled — with warnings" (current) | "Partial success (see console)." | Honest, unalarmed, no jargon |
| "I have reviewed the numbers, captions, images, and notes above." (current approval) | "I confirm the accuracy of all data." | Concrete about what was reviewed |
| For the designed error page: "We couldn't create the report." + the reason + "Your entries are still here — fix the highlighted field and try again." | "Report not created." (current, terse dead-end) | Recovery-first, reassuring |

#### Terminology (lock these — consistency is trust)

- **"Pull data"** — the action of fetching live numbers. Not "fetch," "sync," "import," or "refresh." The button, the strip, and all copy say *pull*.
- **"Report endpoint"** — a client's report surface (the home cards call it this; the setup submit says "Create endpoint"). Keep it, or drop it consistently — if it confuses coordinators, prefer the plainer **"report form"** and reserve "endpoint" for admin context. Decide once, apply everywhere. (This doc recommends "Create client" on the setup button and "Your clients" on the dashboard.)
- **"Coordinator"** — the client-side user who fills the form. Not "user," "editor," or "client."
- **"Client"** — the brokerage/agent brand profile. Not "account," "org," or "customer."
- **"Listing"** — the property. Not "property," "home," or "unit" in UI copy.
- **"Snapshot" / "report"** — a frozen report is a *snapshot* internally but reads as **"report"** in all user-facing copy; don't leak "snapshot" into the coordinator's view.
- **Metric names:** **"Views"** everywhere for distribution (Meta deprecated reach) — never say "reach" in the UI. "Listing page views," "Total views," "Days on market" — match these exact strings across form and badges.

Ellipses use a real character consistently; sentence case for all buttons and labels ("Create client," "Pull data," "Download PDF"), never Title Case or ALL-CAPS except the tiny uppercase eyebrows (0.72rem, 0.12em tracking).

---
## Open Questions for the Team

Decisions the designer needs answered before or during the Figma work. None block starting on the token system or the login/dashboard/setup screens, but each shapes scope.

1. **Does the internal tool need a full mobile experience, or is tablet-up "usable but not optimized" enough?** This doc assumes **desktop-first, tablet the real target, phone usable but not optimized** (coordinators and admins work at a desk). Confirm — several recommendations (full-width thumb-zone actions, ≥44px targets, sticky mobile submit bar) scale up or down with the answer.
2. **Dark mode?** The report has its own neutral system; app chrome is light-only today. Given the audience (internal, daytime desk use) and KISS/YAGNI, this doc assumes **no dark mode for app chrome.** Confirm before building a second palette. (Note: the *client logo tile* on `#101725` is a fixed dark surface for contrast, not a dark-mode signal.)
3. **How many clients at scale?** The dashboard grid is un-paginated. The net-new search/sort recommendation is gated at ~12–15 clients. What's the realistic ceiling per agency? If it's dozens, prioritize search; if it's a handful, skip it entirely.
4. **Success = green or brand cyan?** Design Foundations recommends a dedicated `--ss-success` green so success ≠ brand-action cyan, but the app could keep success on-brand cyan. Pick one and apply it to the success dot, the "data pulled" state, and the new success banners.
5. **Focus-ring color at the token level.** The cyan ring is borderline for 3:1 non-text contrast. Approve either thickening to 2.5–3px or switching the ring specifically to `--ss-accent-deep #0f8ac4`.
6. **"Report endpoint" vs "report form" terminology.** Does the word "endpoint" appear anywhere a coordinator sees it, or only admin-facing? This doc recommends "report form" for user-facing copy and "Create client" (not "Create endpoint") on the setup button. Confirm the agency is comfortable dropping "endpoint."
7. **Staged pull-modal messages vs. skeletons.** The ~1-minute pull wait can be handled by (a) the modal with staged messages + a determinate-feel progress bar (recommended for v1, low build cost) or (b) skeleton placeholders in the review block (v-next, more build, softens strict progressive disclosure). Which does the team want to build first?
8. **Client identity chip in the header.** Strengthening the "which client am I in" signal could use a tiny client-logo swatch (option 1) or stay text-only with a glyph (option 2). The logo swatch brushes against the white-label wall (it *identifies* scope, doesn't *style* chrome). Confirm the team is comfortable with a small client logo appearing in Supersonic chrome for wayfinding.
9. **How much net-new is in scope?** This doc labels every net-new element (show/hide password, character counters, styled logo dropzone, live color preview, delete modal, success banners, inline validation, staged pull messages). Which land in this design pass vs. a later one?
10. **Illustration style.** Empty states and the 404 could carry a light illustration or just the paper-plane brand mark. Is there appetite/budget for custom spot illustration, or should everything lean on the existing mark + dashed-box language?

---

## Deliverables Checklist (screens × states)

Work through this in Figma. Each row is a screen; each checked cell is a state to design. States marked *(net-new)* don't exist in the build yet and are recommendations in this doc.

### Foundations (build first — everything else consumes these)
- [ ] Color tokens — including the net-new semantic set (`--ss-danger*`, `--ss-warn*`, `--ss-success`)
- [ ] Type scale (consolidated label sizes; four Inter weights only)
- [ ] Spacing scale (named `--sp-1…8`, stragglers snapped)
- [ ] Radius + elevation + motion tokens
- [ ] Button family: primary / secondary / ghost / danger / `.sm`, each with rest / hover / focus / active *(net-new)* / disabled *(net-new)* / busy-with-spinner *(net-new)*
- [ ] Form control: default / hover / focus / readonly / disabled / invalid *(net-new)*, plus color-input, file-dropzone *(net-new)*, password-with-toggle *(net-new)*, textarea-with-counter *(net-new)*, big-number input
- [ ] Chips & badges: count-badge; source-badge in pulled / manual / partial / demo colors *(net-new state colors)*
- [ ] Focus ring (contrast-fixed)
- [ ] Brand lockup + paper-plane mark with min-sizes; favicon + theme-color *(net-new)*
- [ ] The reusable STATE MATRIX component set: empty / loading / success banner *(net-new)* / error summary *(net-new)* / inline field error *(net-new)* / degraded notice / disabled-with-helper

### Global chrome
- [ ] Document shell + background wash
- [ ] Sticky header: home / setup / edit / coordinator variants (with/without context label)
- [ ] Header client-identity chip *(net-new)* + focus states *(net-new)*
- [ ] Page-header + back-link pattern (with focus ring *(net-new)*)
- [ ] Mobile header (context-priority truncation, ≥44px targets)

### `/login`
- [ ] Default / focus / error (accessible) *(a11y net-new)* / submitting *(net-new)* / mobile
- [ ] Optional show/hide password *(net-new)*
- [ ] Entrance animation (+ reduced-motion variant)

### `/` dashboard
- [ ] Empty (first run) — with brand mark *(net-new)*
- [ ] Populated grid (desktop 3-up / tablet 2-up / mobile 1-up)
- [ ] Client card: rest / hover / focus *(net-new)* / logo-missing monogram *(net-new)* / long-name clamp
- [ ] Whole-card-as-link + separate Edit control *(net-new interaction)*
- [ ] Search/sort *(net-new, at-scale only)*

### Client setup form (`/admin/clients/new` + edit)
- [ ] Create — all four sections; Integrations collapsed *(net-new)*
- [ ] Edit — prefilled, slug readonly-locked, current-logo preview (white + dark swatch *(net-new)*), Integrations expanded-if-set *(net-new)*
- [ ] Unified logo control: dropzone / file-chosen-preview / URL-fallback / precedence note *(net-new)*
- [ ] Color pickers: swatch + hex + live "on the report" preview + contrast advisory *(net-new)*
- [ ] Password: create-required / edit-optional / show-toggle / length affirmation *(net-new)*
- [ ] Submit: default / submitting *(net-new)* / success banner *(net-new)*; secondary Cancel *(net-new)*; sticky bar *(net-new)*
- [ ] Danger zone + delete confirmation modal *(net-new)*: closed / open / disabled-until-typed / deleting
- [ ] 404 "Client not found" (humanized)
- [ ] Inline field validation for every rule in the Errors chapter table *(net-new)*

### Coordinator report form (`/c/<slug>/`) — Stage 1
- [ ] Intake resting state (hero + Start-here card + URL field + pull strip Ready)
- [ ] URL field: empty / focus / filled-valid *(net-new)* / invalid-on-pull *(net-new)*
- [ ] "Where do I find this?" hint *(net-new, optional)*
- [ ] Pull strip: Ready / Pulling / Pulled / Pulled-with-warnings / Failed — with 3 distinct dot colors *(net-new)*
- [ ] Pull modal: spinner + staged messages *(net-new)* + progress bar *(net-new)* + reduced-motion variant + a11y (focus/dialog)
- [ ] Social pickers: before-pull / matched / no-post-gate / auto-fetch-unavailable; thumbnail-forward *(net-new)*
- [ ] Reveal animation + focus/scroll behavior + Stage-1 dim/fold *(net-new)*

### Coordinator report form — Stage 2 (review block, hidden until pull)
- [ ] Per-card trust states: pulled-trusted / needs-review / degraded-manual *(net-new visual language)* + dim-fold-solved *(net-new)*
- [ ] Section 2 Listing details: report-period read-only pill *(net-new)* / manual-date fallback / website auto-found vs must-type
- [ ] Section 3 Performance — Website card (pulled / manual / demo)
- [ ] Section 3 — REALTOR.ca card: pulled / manual / expired-link vs transient copy *(net-new)*; cover-photo preview promoted *(net-new)* + empty-photo placeholder *(net-new)*
- [ ] Section 3 — Social card: matched / partial / no-post-recede *(net-new)* / demo; caption counter *(net-new)*
- [ ] Amber degrade notice with icon + amber input ring *(net-new)*
- [ ] Section 4 Showings & notes: showings-required (amber-if-empty) / positive-framed display toggles *(net-new)* / notes counter *(net-new)*
- [ ] Submit panel: idle-not-approved / ready / submitting-with-spinner *(net-new)* / returned-from-error; disable-until-approved *(net-new)*; sticky-on-desktop *(net-new)*
- [ ] Inline error summary on server bounce *(net-new)*

### Errors & feedback (cross-cutting, reused above)
- [ ] Redesigned server error page (snapshot + client variants) *(net-new)*
- [ ] Success banners: report-created / client-created / changes-saved / client-deleted *(net-new)*
- [ ] Delete confirmation modal *(shared with setup)*
- [ ] All motion + reduced-motion variants
