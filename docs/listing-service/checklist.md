# Listing websites: what is left

Updated 16 September 2026. Plan: production-plan-v3.3.md.

## Done

- [x] Plan v3.3 agreed (pricing, project pages, review flow, Stripe model).
- [x] CRM module Listing Websites built, with the Listings subform and the Accounts section.
- [x] CRM checked through the API: create, read, update, duplicate block, delete all work.
- [x] Deploy Lock Order ID added on Accounts. Unused Stripe field removed.
- [x] Stripe Customer IDs entered on the three client Accounts.
- [x] Skill prompts written (7). CRM runbook written. Skills research written.

## Your decisions

- [x] Listings per micro-site: no cap; large developments grouped by unit type, case by case.
- [x] Delivery: aim to publish within 7 days once we have everything. No refund once published.
- [x] Legal entity: Supersonic Sites Inc., Ucluelet BC, service supersonicrealtors.com.
- [x] Stripe default retry schedule.
- [x] Staging is hidden from the portfolio; visible on approval.
- [x] Refund: full refund if the website is not produced; none once published.
- [x] 7 calendar days, counted from when we have all the information.
- [x] Final reviewer Renaud, backup Brent.
- [x] A different property on an existing route is a new order.

## Stripe (you)

Read through the Stripe connector on 15 September 2026, live and test. Reads work in both modes. Writes: products, prices and customers worked in test; Checkout Sessions and portal configurations were refused.

- [x] Hosting $99 per year exists in live: `price_1NDBSfDtyqTdM6whfbYMZHpZ` ("CAD CLIENTS - MULTISITE HOSTING BUNDLE", yearly, CAD, on the "Supersonic® Yearly Website Hosting Management" product). Judy Gray already pays it, quantity 12. Reuse it.
- [x] A $599 one-time CAD price exists in live: `price_1UFksFDtyqTdM6whRmwSEfBK`, created 11 September, no nickname, on the "Professional Setup Fee" product.
- [x] Dedicated products created 16 September, live and test, existing products and customers untouched. Live: "Listing Micro-Site Production" `prod_VGo4CLTdjdYBZQ` with `price_1UGGSVDtyqTdM6whKbXViKEV` ($599 one-time, lookup key `listing_website_production_cad`); "Listing Micro-Site Hosting" `prod_VGo4zL4Ab2olJX` with `price_1UGGSYDtyqTdM6whxX6ZdCVN` ($99 per year, lookup key `listing_website_hosting_cad`). Test: `prod_VGo4XpcojJFv1q` / `price_1UGGSdDtyqTdM6whNI5eJNDo` and `prod_VGo4ncn8rvc6Sf` / `price_1UGGShDtyqTdM6whUt78KYGl`, same lookup keys. Tax code txcd_10701200 on all four, same as your hosting and setup products. The app finds prices by lookup key, so no price ids in config.
- [x] Invoice memo convention kept: the app writes "LISTING MICRO-SITE: <address>" on the subscription, like the old "FULL CUSTOM MICRO SITE: ..." invoices. The old $599 price on the Setup Fee product is left alone.
- [x] Tax: Stripe Tax is active in live (head office Ucluelet, default tax code txcd_10701200, tax added on top). Your current payment links already use it. The new checkout uses it too. No manual GST rate needed.
- [x] Customer Portal, live: card update is on, invoice history is on, self-serve cancel is off. Keep cancel off, because turning it on would apply to every Supersonic subscription. Micro-site cancellations go by email to hello@supersonicsites.com and staff cancel at period end.
- [x] Zoho Flow filter for app checkouts is on (owner, 16 September).
- [x] Renewal reminder emails: no change, per the owner.
- [x] Test-mode restricted key in `.env` (with Prices: Read). Still needed: the live key on Railway and the webhook secret once the endpoint exists.
- [x] Test mode, built 15 September: product "Listing Website" `prod_VGeSZ5fOIuNXls`; prices `price_1UG79pDtyqTdM6whnOZL1wNo` ($599 one-time, lookup key `listing_website_production_cad`) and `price_1UG79tDtyqTdM6whCE64ccb6` ($99 per year, lookup key `listing_website_hosting_cad`); test customer `cus_VGeSnKPbhLZilo` "The Gray Team (TEST)".
- [x] Customer emails checked: Judy Gray judy@grayteam.ca; Stone Sisters marketing@stonesisters.com; Yukon felix@yukonrealestateconnection.ca. All CAD.
- [ ] Yukon's Stripe customer is past due (owner notes a card is on file). Sort out the failed invoice before they order.
- [x] Zapier's newer "Stripe" app points at another business; owner says no Zap depends on it.

## CRM (agent or admin)

- [ ] Add the producers to the module as Members or Managers.
- [x] Email templates created in CRM by the owner, 16 September. Buttons send LW Ready to review and LW Live; LW Information needed is sent by hand from the record. No Archived and no Update completed emails.
- [ ] Remove the reference-number sentence ({Staging Deployment}) from LW Ready to review: the client just replies "Approved".
- [x] Blueprint canvas created by the owner, 16 September (module Listing Websites, field Stage). Stage list: New Order, Preparing, Needs Information, Ready for Build, Building, In QA, Staged, Ready for Launch, Published, Archived, Cancelled.
- [ ] Simple flow (owner, 16 September): add the Next Step field, remove the three unused Stage values, build the 8 buttons, publish: runbook-crm-blueprint.md. The Next Step box on the record always says what to do and holds the prompt to copy (app fills the first; each button sets the next).
- [ ] Optional Cliq launch notice rule (in the runbook). Deploy lock dropped: one producer per client portfolio.
- [ ] Add a Due Date field, set by a workflow to the Ready for Build date plus 7 days.

## ChatGPT (you or the workspace admin)

- [ ] Confirm the workspace is on Business or higher. Skills do not exist on Plus or Pro.
- [ ] Turn on the four skill toggles in Permissions and Roles.
- [ ] Create the seven skills from skill-creator-prompts.md.
- [ ] Publish them to the workspace. Use "Install for others" for each producer.
- [x] No shared Projects for production: ChatGPT does not run Work inside them (owner, 16 September). Rules and client facts go in each portfolio repository as AGENTS.md, docs/brand.md, docs/portfolio.md (chatgpt-projects.md).

## Sites qualification (producer, work package 2)

- [ ] Inspect the one existing Sites and Cloudflare deployment. Write down how the domain is set up.
- [ ] Confirm the chain: a Work chat outside any Project, on the local repository clone, with the @skills available and AGENTS.md read, saves and deploys the Site; a second producer can do the same from their own clone; "Describe website edits" in the Sites view either lands in the repository or stays banned.
- [ ] Build the first real portfolio, The Gray Team, with prompt-portfolio-build.md (it doubles as the test portfolio: one sample listing route and one sample project route, both hidden).
- [ ] Run the 14 checks in plan section 9. Record results in platform-qualification.md.
- [ ] Decide: can the client preview an undeployed version, or do we use the unlisted route?
- [ ] Decide: static pages or data-driven pages.
- [ ] Confirm edits made in chat reach the Git repo. If not, edits go through Codex only.

## Feedback (Userback + Zoho Desk)

- [x] Decided 16 September: clients leave feedback with the Userback widget (project OWS, supersonicsites.app.userback.io). Every submission becomes a Zoho Desk ticket. SOP for every Supersonic website: the Userback snippet on every page and a 🛠 link in the footer that activates the widget. The review link is the route with `?ubwc=tAwyWnWOX1lBjM29i3H334195-65727`, which activates the widget on load. The Loom walkthrough is https://www.loom.com/share/b82b9b749e2b460aa43208914272ad94.
- [ ] Put the Userback snippet and the 🛠 footer link in the foundation (plan section 10 has the snippet).
- [ ] Confirm the Userback to Zoho Desk connection is on and tickets land in the right department.
- [ ] Confirm the LW Ready to review template's link ends with `?ubwc=tAwyWnWOX1lBjM29i3H334195-65727` (the Blueprint agent checks this in Phase 0).

## Foundation and repos (producer)

- [ ] Gray Team repo: run upgrade 2026.09.2 (each listing page is its own website), then ship the first real listing on it. Do not cut the foundation before that.
- [ ] Cut `portfolio-foundation` from the Gray Team repo: code, sample content, placeholder docs; no client assets, no hosting.json, no Site id. Tag it. Add it as the `foundation` remote on the Gray Team repo.
- [ ] Each new client: clone the foundation, set the new origin, push, then run the portfolio build prompt in a Work chat on the clone (plan 12.1).
- [ ] Foundation updates: fix in the foundation, tag, `git pull foundation <tag>` in each client repo, test, bump the version, deploy.
- [ ] Run the template QA once per foundation tag and save the report.

## Portfolio setup, once per client (agency)

- [ ] Create the client's private repository, empty. Start a Work chat on its clone and run `@portfolio-setup` (or prompt-portfolio-build.md); it asks the questions and drives the steps below.
- [ ] DNS record for portfolio.<client domain> in Cloudflare.
- [ ] Portfolio Site connected to that host.
- [ ] Rybbit site for the portfolio.
- [ ] Basin form with Turnstile.
- [ ] WorkDrive client folder.
- [ ] Fill the Listing Portfolio fields on the Account and the matching fields in the app profile.
- [ ] Last: AGENTS.md, docs/brand.md and docs/portfolio.md committed by the skill; add docs/sample-listing.pdf; give the producers repository access and Site editor rights (chatgpt-projects.md). Done before the client's first order.

## Legal (you)

- [ ] Terms page text approved (plan section 7).
- [ ] Privacy page template approved.

## App build (me, work package 3)

Built 16 September 2026, uncommitted. Verified end to end against the Stripe sandbox and the live CRM (test Account): order form → Checkout → return → paid order, subscription trialing for a year, CRM record with the listing row, confirmation email.

- [x] Order record type and storage (`data/orders/<id>.json`).
- [x] Client profile fields: portfolio host, Stripe Customer ID.
- [x] Order form with the repeatable listing block, REALTOR.ca prefill and the folder notice.
- [x] Route reservation, protected paths, lazy expiry of unpaid drafts.
- [x] Terms page and the agreement checkbox with stored version and hash (also in Stripe metadata).
- [x] Stripe: Checkout against the existing Customer, first year of hosting as a 365-day trial, webhook signature check, subscription fetch.
- [x] One fulfillment routine with the per-order lock and persisted steps.
- [x] CRM record with subform rows, duplicate recovery.
- [x] Order-confirmed email. Confirmation page. Portal card.
- [x] Admin recovery panel with Retry and Mark cancelled.
- [x] Check script with a fake Stripe, CRM and Resend: `npm run check:site-order` (9 checks).
- [ ] Rybbit site and Basin form ids on the profile (portfolio setup; not needed for ordering).
- [ ] Production webhook endpoint in Stripe live, secret on Railway; live restricted key on Railway.
- [ ] Commit and deploy.
- [ ] Run the remaining acceptance tests in plan section 14 on the deployed app (webhook race, renewal events).

## Dry run: First Light Ucluelet (owner, 16 September)

Rebuild the existing First Light Ucluelet landing page as a project micro-site on the Gray Team portfolio, through every station, with the owner playing the client. No fee. The old page is the source of truth for facts and photos.

Before it starts, in this order:
- [ ] Upgrade 2026.09.2 deployed on the Gray Team Site (each listing page is its own website).
- [ ] Next Step field added and the 8-button Blueprint published (runbook-crm-blueprint.md). The field must exist before the app creates a record.
- [ ] The four core skills created and installed: listing-brief, listing-build, listing-qa, sites-stage-release. The Next Step cards name them.
- [ ] Local app profile for the test: Testing Zoho Dev as the Account (approved for tests), portfolio host portfolio.grayteam.ca, the test Stripe customer. Purchaser email: the owner's own inbox.
- [ ] First Light photos in a Dropbox or Drive folder link, one row per home or unit type ready to type into the order form.

Run:
- [ ] Order through the app (Stripe test card) so the record and its first Next Step card come from the app, not by hand.
- [ ] Every button, in order, reading only the Next Step box. Note every moment of doubt: that is a card to rewrite.
- [ ] Review email received; the review link opens the widget; 🛠 works; reply "Approved" from the owner's inbox; Publish by Renaud; Live email received.
- [ ] Decide before Publish: if the client agrees to move First Light to the portfolio, redirect the old page to the new route and keep it published. Otherwise stop at Staged and click Cancel, which tests Cancel too.

Record: minutes per station, Sites build behaviour, what the skills got wrong, which cards needed rewording, Rybbit lead event seen, template merge fields rendered.

## Pilot

- [ ] Two clients agree to the price by email.
- [ ] Three paid orders, one of them a project page.
- [ ] Record human minutes, AI spend, edits, delivery.
- [ ] Go or no-go.

## Housekeeping

- [ ] Commit the docs folder to git.
