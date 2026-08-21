# Runbook — launch `supersonicrealtors.com` (Resend + Cloudflare + Railway)

**For:** a browser agent (or a human) with logged-in access to Cloudflare, Resend, Railway, and GitHub.
**Goal:** the Seller Report Generator answers at `https://supersonicrealtors.com`, sends magic-link
sign-in emails from `login@supersonicrealtors.com` through Resend, and the three clients can sign in.
**Time:** ~45 minutes of clicking plus DNS propagation (usually minutes, up to an hour).

---

## Ground rules (read before touching anything)

1. **Never paste a secret into chat, a commit, a ticket, or a screenshot.** Secrets in this runbook:
   the Resend API key and `AUTH_SECRET`. Copy them straight from where they are generated into the
   Railway variable field. In your final report write only `set`, never the value.
2. **Do not delete or overwrite an existing DNS record without reporting it first.** If
   `supersonicrealtors.com` already has records at `@` or `www` (for example a marketing site), stop
   and show the owner what exists before replacing it. This runbook assumes the root domain is meant
   to become the app.
3. **Only touch the `supersonicrealtors.com` zone** in Cloudflare. Leave `supersonicsites.com` and
   every other zone alone.
4. **Keep `reporting.supersonicsites.com` attached** to the Railway service so old bookmarks and
   already-sent report links keep working. Sign-in emails always use `APP_URL`, so the new domain is
   the one clients see.
5. Work in the order below — each phase has an **Expect** line. If the expectation fails, stop and
   report instead of improvising.

## Values you will collect along the way

| Name | Where it comes from | Where it goes |
| --- | --- | --- |
| Railway CNAME target (looks like `xxxx.up.railway.app`) | Railway → service → Settings → Networking → Custom Domain | Cloudflare DNS (Phase 3) |
| Resend DNS records (DKIM TXT, SPF TXT, MX) | Resend → Domains → `supersonicrealtors.com` | Cloudflare DNS (Phase 1) |
| Resend API key | Resend → API Keys (shown once) | Railway variable `RESEND_API_KEY` (Phase 4) |
| `AUTH_SECRET` | Generated locally (Phase 4) | Railway variable `AUTH_SECRET` |
| Admin email address(es) | `dev@supersonicsites.com` (decided by the owner; add more only if told) | Railway variable `ADMIN_EMAILS` |

---

## Phase 0 — Discovery (no changes yet)

1. **Railway.** Open the Railway project that hosts the report generator (it is the service currently
   serving `https://reporting.supersonicsites.com`; the repo is `SuperSonicSites/StandardListingReports`,
   branch `main`). Note the project and service names. Open **Variables** and list the variable
   *names* (not values). Open **Settings → Networking** and list the custom domains.
   - **Expect:** variables include `HOST`, `ADMIN_PASSWORD`, `META_SYSTEM_USER_TOKEN`,
     `RYBBIT_API_KEY`; custom domain `reporting.supersonicsites.com`; a volume mounted at `/app/data`.
2. **Cloudflare.** Check whether `supersonicrealtors.com` is already a zone in the account.
   - If yes: open **DNS → Records** and list every record. Note anything at `@`, `www`, `send`,
     `resend._domainkey`, `_dmarc`.
   - If no: the domain must be added as a zone first (Add a site → `supersonicrealtors.com` → Free plan),
     and its nameservers changed at the registrar to the two Cloudflare nameservers shown. Report this
     to the owner — changing nameservers is theirs to confirm. Continue only once the zone shows
     **Active**.
3. **Resend.** Open **Domains** and **API Keys**. Note whether `supersonicrealtors.com` already exists.
4. **Report** the findings from 1–3 before proceeding.

---

## Phase 1 — Resend: add and verify the sending domain

1. Resend → **Domains → Add Domain**.
   - Domain: `supersonicrealtors.com` (root domain; the sender will be `login@supersonicrealtors.com`).
   - Region: **US East (us-east-1)** unless the owner says otherwise.
   - Click **Add**.
2. Resend now shows the DNS records it needs. There are normally three, plus an optional DMARC:
   | Type | Name (host) | Value | Notes |
   | --- | --- | --- | --- |
   | TXT | `resend._domainkey` | `p=MIGf…` (long DKIM key, copy exactly) | DKIM |
   | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | priority **10** |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the return path |
   | TXT | `_dmarc` | `v=DMARC1; p=none;` | optional but recommended; add only if no `_dmarc` record exists |
   Copy the **exact** names and values from the Resend page — the host names above are relative to
   the domain (Cloudflare shows them the same way).
3. Cloudflare → zone `supersonicrealtors.com` → **DNS → Records → Add record**, one per row above.
   - TXT and MX records have no proxy toggle; if one appears, it must be **DNS only** (grey cloud).
   - Cloudflare may show the DKIM value split into quoted chunks after saving — that is fine.
4. Back in Resend, click **Verify DNS Records**. Reload after a minute if it is still pending.
   - **Expect:** domain status **Verified** (each record shows a green check). If it stays pending after
     15 minutes, re-open each Cloudflare record and compare character by character; the usual mistake
     is an extra `.supersonicrealtors.com` appended to the host name or a trailing space in the value.

## Phase 2 — Resend: create the API key

1. Resend → **API Keys → Create API Key**.
   - Name: `supersonicrealtors-login`
   - Permission: **Sending access**
   - Domain: **supersonicrealtors.com** (restrict it to this domain)
2. Click **Add**. The key is shown **once**. Keep this tab open and go straight to Phase 4 step 3 to
   paste it into Railway, then close the tab. Do not store it anywhere else.

---

## Phase 3 — Railway + Cloudflare: point the domain at the app

1. Railway → the service → **Settings → Networking → Custom Domain → + Custom Domain**.
   - Enter `supersonicrealtors.com` → Add. Railway shows a DNS instruction with a **CNAME target**
     (e.g. `abc123.up.railway.app`). Copy the target.
   - Repeat for `www.supersonicrealtors.com` (same target).
   - Leave `reporting.supersonicsites.com` in place (ground rule 4).
2. Cloudflare → zone `supersonicrealtors.com` → **DNS → Records**:
   | Type | Name | Target | Proxy |
   | --- | --- | --- | --- |
   | CNAME | `@` | the Railway target | **DNS only** (grey cloud) |
   | CNAME | `www` | the Railway target | **DNS only** (grey cloud) |
   Cloudflare accepts a CNAME at the root (it flattens it automatically). If an `A`/`AAAA`/`CNAME`
   record already exists at `@` or `www`, apply ground rule 2 before replacing it.
   - Why DNS only: Railway issues the TLS certificate itself and needs to see the domain directly.
     Proxying through Cloudflare can be turned on later (then set **SSL/TLS → Full (strict)** in
     Cloudflare first), but it is not needed for launch.
3. Back in Railway, the custom domain row changes from "Waiting for DNS" to a green **check** once the
   record is visible and the certificate is issued (a few minutes; occasionally up to an hour).
   - **Expect:** `https://supersonicrealtors.com` loads **without a certificate warning** and shows the
     current app (at this point still the old password sign-in page — that is fine; the new code
     arrives in Phase 5). `https://www.supersonicrealtors.com` should load the same page.
4. Optional polish (Cloudflare → Rules → Redirect Rules): redirect `www.supersonicrealtors.com/*` →
   `https://supersonicrealtors.com/$1` (301). Skip if unsure — the app works on both hosts.

---

## Phase 4 — Railway: set the sign-in variables

Railway → the service → **Variables**. Add or change the following. Railway offers **Deploy** after
variable edits — you can stage all of them and deploy once.

1. `AUTH_SECRET` — a random 64-character hex string. Generate it **locally**, never on a third-party
   website: in the browser open DevTools (F12) → Console on any page and run
   `Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("")`
   → copy the printed string into the variable. (Alternative on a machine with a terminal:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)
2. `ADMIN_EMAILS` = `dev@supersonicsites.com`. This is the agency admin address (it is also the
   code's default, so the app still works if the variable is missing). Add more addresses
   comma-separated only if the owner says so. No trailing spaces or newlines.
3. `RESEND_API_KEY` — paste the key from Phase 2. Close the Resend tab afterwards.
4. `APP_URL` = `https://supersonicrealtors.com` (no trailing slash).
5. `MAIL_FROM` = `Supersonic Realtors <login@supersonicrealtors.com>` (the domain must be the one
   verified in Phase 1 — it is).
6. **Delete** `ADMIN_PASSWORD` — the new code never reads it.
7. Leave every other variable as it is: `HOST=0.0.0.0`, `META_SYSTEM_USER_TOKEN`, `RYBBIT_API_KEY`,
   `RYBBIT_API_URL` (if present), `DEMO_MODE` (must stay unset/empty in production).
8. Click **Deploy** (or accept the "Apply changes" prompt).
   - **Expect:** a new deployment starts. It may still be the old code until Phase 5 — that is fine.

---

## Phase 5 — Deploy the magic-link code

1. GitHub → `SuperSonicSites/StandardListingReports` → confirm the commit titled along the lines of
   "Magic-link sign-in, Realtor Hub login, client portal" is on `main`. If it is still only on the
   owner's machine, ask them to push; nothing else in this phase can happen before that.
2. Railway auto-deploys `main`. Open **Deployments** and wait for the newest one to show **Success**.
3. Open the deployment **Logs** and visit `https://supersonicrealtors.com/login` once (the auth and mail
   modules load on first request). Then search the logs for `[auth]` and `[mail]`.
   - **Expect:**
     ```
     [auth] AUTH_SECRET is set
     [auth] ADMIN_EMAILS: N address(es)        (N ≥ 1)
     [auth] APP_URL: https://supersonicrealtors.com
     [mail] RESEND_API_KEY is set
     [storage] data/ is on a mounted volume — clients and reports persist across deploys.
     ```
     If any line says **NOT set**, go back to Phase 4 — the variable name is misspelled or empty.
     If the storage line warns that data/ is on the container filesystem, stop and report: the volume
     is not mounted and client profiles would be lost on deploy.

---

## Phase 6 — Smoke test the sign-in flow

1. Open `https://supersonicrealtors.com/login`.
   - **Expect:** the blue "Your real estate marketing launchpad." page with a **Work email** field and
     a **Continue securely** button. No password field anywhere.
2. Enter `dev@supersonicsites.com` → Continue securely (someone with access to that inbox must
   open the email).
   - **Expect:** "Your link is on its way." page. Within a minute an email arrives from
     **Supersonic Realtors** `<login@supersonicrealtors.com>`, subject "Your Supersonic Realtors
     sign-in link". Check the spam/promotions folder if it is not in the inbox.
   - If the page instead shows "We couldn't send the email just now": Railway logs will contain a
     `[mail] Sign-in email … failed: Resend 4xx …` line. `403`/`422` almost always means the domain is
     not Verified in Resend or `MAIL_FROM` uses a different domain.
3. Click **Sign in securely** in the email.
   - **Expect:** you land on the admin dashboard (client cards). The header shows **Portal** and
     **Sign out** links.
4. Click **Portal**.
   - **Expect:** "Welcome aboard." with a card pair per client. The "Submit Listing Ads" cards say
     **Not set up yet** until Phase 7 is done.

## Phase 7 — Give each client its emails and ads link (admin dashboard)

For each client, click **Edit**, scroll to **3 · Access**, fill both fields, click **Save changes**:

| Client (dashboard name) | Authorized sign-in emails | Listing ads form link |
| --- | --- | --- |
| The Gray Team | their coordinator address(es), and/or `@grayteam.ca` for the whole team | `https://nowforsale.co/grayteam` |
| Stone Sisters | their coordinator address(es), and/or `@stonesisters.com` | `https://nowforsale.co/stonesisters` |
| Yukon Real Estate Connection | their coordinator address(es), and/or `@yukonrealestateconnection.ca` | `https://nowforsale.co/felix` |

- The exact coordinator addresses must come from the owner. A `@domain` entry means *anyone with an
  email at that domain* can sign in to that client — convenient for a team, so confirm the owner wants
  that before using it.
- One entry per line. The form rejects anything that is not an email or an `@domain`.
- **Expect** after saving: "Changes saved." toast, and the client's portal cards now show
  **Open the ads form →**.

Then **Sign out** (header) and test as a client: enter one of the addresses you just added →
email → click → **Expect:** `/portal` shows **only that client's** two cards, "Submit Listing Ads"
opens the nowforsale.co form, "Generate Listing Reports" opens `/c/<slug>/`. Trying
`https://supersonicrealtors.com/c/<another-client-slug>/` in that session must show the red
"This account can't open that page." card (403).

---

## Final report (what to send back)

A table with one row per checkpoint — **no secret values**:

| Checkpoint | Status | Notes |
| --- | --- | --- |
| Cloudflare zone `supersonicrealtors.com` active | | pre-existing records at `@`/`www`, if any, and what was done with them |
| Resend domain Verified (DKIM / SPF / MX / DMARC) | | region |
| Resend API key created (`supersonicrealtors-login`, sending, domain-restricted) | | |
| Railway custom domains: `supersonicrealtors.com`, `www`, `reporting.supersonicsites.com` kept | | certificate status |
| Railway variables: `AUTH_SECRET`, `ADMIN_EMAILS`, `APP_URL`, `RESEND_API_KEY`, `MAIL_FROM` set; `ADMIN_PASSWORD` removed | | which admin addresses were configured |
| Deployment Success + `[auth]`/`[mail]` log lines | | |
| Admin sign-in email received and works | | From name/address as seen in the inbox |
| Three clients updated (emails + ads link) | | which addresses were added per client |
| Client sign-in scoped to own client (403 on another client) | | |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "That sign-in link has expired" immediately after clicking | `AUTH_SECRET` or the deployment changed between sending and clicking, or the link was sent by another deployment | Request a new link. Do not rotate `AUTH_SECRET` again unless needed — every rotation signs everyone out. |
| "That email isn't on the access list yet" for an admin address | `ADMIN_EMAILS` typo, wrong separator, or stray whitespace | Fix the variable, redeploy. Matching is case-insensitive. |
| "We couldn't send the email just now" | Resend domain not Verified, `MAIL_FROM` on an unverified domain, or wrong API key | Check Railway logs for the `Resend <status>` line; fix in Resend/Railway. |
| Sign-in loops back to `/login` after clicking the link | Cookie not stored: `APP_URL` must start with `https://` and match the host in the address bar | Set `APP_URL=https://supersonicrealtors.com`, redeploy, use that exact host. |
| Domain shows a certificate warning or Railway 404 | DNS not propagated, record proxied (orange cloud), or the custom domain not added in Railway | Set the CNAME to DNS only, wait, confirm the green check in Railway. |
| Email lands in spam | DMARC/SPF missing or domain brand-new | Confirm Phase 1 records; reputation improves after a few sends. Tell coordinators to look for the sender "Supersonic Realtors". |
| Storage warning in logs | Volume not mounted at `/app/data` | Stop; mount the volume before creating/editing clients. |
