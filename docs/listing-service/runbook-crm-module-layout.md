# Runbook: finish the `Listing Websites` module layout in Zoho CRM

**For:** a browser agent (or a human) signed in to Zoho CRM as an administrator.
**Org:** the Supersonic Zoho CRM org on the Canadian data centre (`https://crm.zohocloud.ca`).
**Goal:** the custom module **Listing Websites** has every field below, in the sections below, with the stated types, lengths, picklist values, lookups, the unique setting on Order ID, one **Listings** subform, and app-written sections read-only for non-administrator profiles. Then add the **Listing Portfolio** section to the Accounts module. Finish with a field-by-field report of API names.
**Time:** about 60 to 90 minutes of clicking.

Model reminder: one record is one website (one route). A website holds one or more listings; those are rows of the **Listings** subform (one row for a single listing, several for a project such as Alma on Abbott).

## Ground rules

1. **Do not delete, rename or retype any existing field** in any module. If an existing field conflicts with this list (same purpose, different name or type), leave it, skip the new one, and report the pair.
2. **Do not create a second module.** If a module with a label like "Listing Websites" already exists, work inside it even if its API name differs; report the API name. If none exists, create it (Setup → Customization → Modules and Fields → New Module) with singular label **Listing Website**, plural **Listing Websites**, and continue.
3. **Do not touch `Listing_Ads`**, Deals, Contacts or any other module, except the one Accounts section in Phase 5.
4. **Create no records.** Layout and field work only. No Blueprint, workflow, or email template work in this runbook.
5. **Set labels exactly as written** so Zoho derives the expected API name (spaces become underscores). Where Zoho generates a different API name, fix it in Phase 6 or report it.
6. Work in the order below. Each phase has an **Expect** line; if it fails, stop and report instead of improvising.
7. Nothing in this runbook involves secrets. Write nothing else down.

## Where things are

- Fields and layout: Setup (gear) → Customization → Modules and Fields → **Listing Websites** → **Layouts** → Standard. Drag field types from the **New Fields** tray into a section; use the field's **⋯ → Edit Properties** for length, picklist values, "Required", and "Do not allow duplicate values". Create a section with **New Section** from the tray. **Save Layout** after every phase.
- Multi-line sizes: "Small" is 2,000 characters, "Large" is 32,000.
- Subform: drag **Subform** from the tray, name it, then add fields inside it from the same tray.
- API names: Setup → Developer Space → APIs → **API Names** → Listing Websites.
- Profiles and field permissions: Setup → Users and Control → Security Control → **Profiles** → a profile → Field Permissions → Listing Websites.

## Phase 0: discovery (no changes)

1. Open Modules and Fields. Note whether **Listing Websites** exists, its API name, and the layouts it has.
2. Open its Standard layout. List every existing field with its type.
3. Open Setup → Users and Control → Profiles. List the profile names.
4. Note the edition's limits shown in the layout editor when you hover the tray or open Setup → General → Company Details → Subscription: custom fields per module, subforms per module, subform rows and subform fields.
   - **Expect:** at least 100 custom fields available, one subform allowed with at least 12 rows and 12 fields. If lower, report the numbers before continuing and then fit the priority order given in Phase 2.

## Phase 1: record sections and fields

Create the sections in this order. Two-column layout. Add each field to the named section. "Required" means the Required checkbox. "Unique" means "Do not allow duplicate values". Picklist values in the order shown, first value as default where a default is named.

### Section "Order"

| Label | Type | Settings |
| --- | --- | --- |
| Website | System name field (already present; rename its label to **Website** if allowed) | Leave length as is |
| Order ID | Single Line | Length 40, **Required**, **Unique** |
| Brokerage | Lookup → Accounts | **Required**; related list title on Accounts: "Listing Websites" |
| Purchaser Email | Email | |
| Package | Pick List | Values: Single Listing, Project |
| Route | Single Line | Length 60 |
| Page URL | URL | |
| Listing Count | Number | Max 3 digits |
| Prompt Version | Single Line | Length 20 |

### Section "Property"

| Label | Type | Settings |
| --- | --- | --- |
| Property Address | Single Line | Length 255 |
| Property Type | Single Line | Length 60 |
| Source URL | URL | |
| Photos Link | URL | |
| Video URL | URL | |
| Hero Preference | Single Line | Length 200 |
| Selling Points | Multi Line | Small |
| Client Notes | Multi Line | Small |
| Target Date | Date | |
| Agent Name | Single Line | Length 100 |
| Agent Email | Email | |
| Agent Phone | Phone | |

### Section "Agreement and Payment"

| Label | Type | Settings |
| --- | --- | --- |
| Terms Version | Single Line | Length 20 |
| Terms Hash | Single Line | Length 64 |
| Accepted At | Date/Time | |
| Stripe Customer | Single Line | Length 40 |
| Stripe Session | Single Line | Length 80 |
| Stripe Subscription | Single Line | Length 40 |
| Stripe Payment Intent | Single Line | Length 40 |
| Amount Paid | Currency | 2 decimals |
| Tax Amount | Currency | 2 decimals |
| Paid At | Date/Time | |

### Section "Hosting"

| Label | Type | Settings |
| --- | --- | --- |
| Hosting Status | Pick List | Values: Active, Past Due, Unpaid, Cancelled, Incomplete |
| Hosting Period End | Date | |
| Cancel At Period End | Checkbox | |
| Hosting Ended At | Date/Time | |

### Section "Production"

| Label | Type | Settings |
| --- | --- | --- |
| Stage | Pick List | Values, in order: New Order, Preparing, Needs Information, Ready for Build, Building, In QA, Staged, Review Requested, Edits Requested, Ready for Launch, Published, Updating, Archived, Cancelled. Default: New Order |
| Blocker | Multi Line | Small |
| Conversation URL | URL | |
| WorkDrive Folder | URL | |
| Foundation Version | Single Line | Length 20 |
| Facts Version | Single Line | Length 40 |
| Fact Snapshot | Multi Line | Large |
| Build Commit | Single Line | Length 40 |
| Candidate ID | Single Line | Length 80 |
| QA Result | Pick List | Values: Pass, Pass with exceptions, Fail |
| QA Evidence | URL | |
| QA Date | Date/Time | |

### Section "Staging and Approval"

| Label | Type | Settings |
| --- | --- | --- |
| Staging Deployment | Single Line | Length 80 |
| Staging Commit | Single Line | Length 40 |
| Content Hash | Single Line | Length 64 |
| Staged At | Date/Time | |
| Review Sent At | Date/Time | |
| Review Message ID | Single Line | Length 120 |
| Client Approval Quote | Multi Line | Small |
| Approved By | Email | |
| Approved At | Date/Time | |
| Approved Staging Deployment | Single Line | Length 80 |
| Approved Commit | Single Line | Length 40 |
| Edit Requests | Multi Line | Large |
| Edit Count | Number | Max 3 digits |

### Section "Release"

| Label | Type | Settings |
| --- | --- | --- |
| Release Reviewer | User | Single user |
| Release Diff OK | Checkbox | |
| Release Approved At | Date/Time | |
| Release Commit | Single Line | Length 40 |
| Release Deployment | Single Line | Length 80 |
| Published At | Date/Time | |
| Rollback Target | Single Line | Length 80 |
| Lead Event Verified | Checkbox | |
| Rybbit Verified | Checkbox | |

### Section "Lifecycle"

| Label | Type | Settings |
| --- | --- | --- |
| Page Status | Pick List | Values: Active, Sold, Archived. Default: Active |
| Redirect To | Single Line | Length 60 |
| Archive Reason | Pick List | Values: Client request, Hosting ended, Replaced, Cancelled order |
| Archived At | Date/Time | |

### Section "Communications and Economics"

| Label | Type | Settings |
| --- | --- | --- |
| Emails Log | Multi Line | Large |
| Cliq Notified At | Date/Time | |
| Uptime Confirmed At | Date/Time | |
| Human Minutes | Number | Max 5 digits |
| AI Spend | Currency | 2 decimals |
| Notes | Multi Line | Large |

Save Layout.
- **Expect:** every field above present in its section; Order ID shows the unique setting; Brokerage and Order ID show as required; Stage defaults to New Order on a new (unsaved, then cancelled) record form.

## Phase 2: the Listings subform

Add a **Subform** named **Listings** directly under the "Property" section. Add these fields inside it, in this priority order (if the edition caps subform fields, keep the first ones that fit and report which were dropped):

| Label | Type | Settings |
| --- | --- | --- |
| Unit Name | Single Line | Length 60 (e.g. "#201", or the street address for a single listing) |
| MLS Number | Single Line | Length 20 |
| Realtor Stats | URL | |
| Listing Price | Currency | 2 decimals |
| Beds | Number | Max 2 digits |
| Baths | Decimal | 1 decimal |
| Area | Number | Max 6 digits |
| Listing Status | Pick List | Values: Active, Sold, Leased, Withdrawn. Default: Active |
| Photos Subfolder | URL | |
| Floor Plan Link | URL | |
| Plan Name | Single Line | Length 40 |
| Status Changed At | Date/Time | |
| Sold Badge Applied | Checkbox | |
| Row Notes | Single Line | Length 255 |

Save Layout.
- **Expect:** a new record form shows the Listings subform with an "Add row" control; the row limit shown (or documented for the edition) is at least 12. Report the actual limit.

## Phase 3: pick list and lookup checks

1. Open each pick list created above and confirm the values and their order match exactly, with no trailing spaces.
2. Open **Brokerage** and confirm the lookup targets **Accounts** and that Accounts now shows a related list for Listing Websites.
3. Open **Release Reviewer** and confirm it is a User field (single user).
- **Expect:** no differences. Report any value Zoho refused (for example a reserved word).

## Phase 4: field permissions

For every profile that is **not** Administrator: open the profile → Field Permissions → Listing Websites and set these sections to **Read only** (every field in them): Order (except Website), Agreement and Payment, Hosting. Leave Property, Listings, Production, Staging and Approval, Release, Lifecycle, and Communications and Economics editable. Administrator keeps full access.
- **Expect:** a user on a non-admin profile opening a record sees Order ID, the Stripe fields and Hosting Status greyed out. Report the profiles changed.

## Phase 5: Accounts module, section "Listing Portfolio"

Open Modules and Fields → **Accounts** → Standard layout. Add a section **Listing Portfolio** at the end with:

| Label | Type | Settings |
| --- | --- | --- |
| Portfolio Host | Single Line | Length 120 |
| Site ID | Single Line | Length 80 |
| Portfolio Repo | URL | |
| Rybbit Site ID | Single Line | Length 64 |
| Basin Form ID | Single Line | Length 64 |
| WorkDrive Client Folder | URL | |
| Default Lead Recipients | Single Line | Length 255 |
| Stripe Customer | Single Line | Length 40 |
| Deploy Lock Holder | User | Single user |
| Deploy Lock Order | Lookup → Listing Websites | |
| Deploy Lock Taken At | Date/Time | |
| Portfolio Status | Pick List | Values: Not set up, Live. Default: Not set up |

Save Layout.
- **Expect:** an Account record shows the section; Deploy Lock Order offers Listing Websites records in its picker (there are none yet, which is fine).

## Phase 6: API names

Open Setup → Developer Space → APIs → API Names → **Listing Websites**, then **Accounts**. For every field created in this runbook, record the API name. The expected API name is the label with spaces replaced by underscores (for example `Approved_Staging_Deployment`, subform `Listings`, subform field `Unit_Name`). Where Zoho generated something else, edit the API name to the expected value if the editor allows it; otherwise leave it and mark it in the report.
- **Expect:** every API name matches, or is listed as an exception.

## Final report (what to send back)

No secrets, no record data. Three tables plus notes.

1. **Fields:** one row per field in this runbook, including subform and Accounts fields: label, API name, type, section, status (created / already existed / changed / could not create, with the reason).
2. **Limits:** custom fields used and available, subforms used, subform row and field limits, edition name.
3. **Permissions:** profiles found and which were set read-only for which sections.

Notes: the module's API name; any pre-existing field that conflicted and was left alone; any picklist value Zoho refused; anything you were unsure about and did not do.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Do not allow duplicate values" is missing for Order ID | Option not offered for that type | Confirm the field is Single Line, not Multi Line; if still missing, report; uniqueness will be enforced by the app instead |
| Cannot add another field | Edition field limit reached | Stop; report the count; do not delete anything to make room |
| Subform allows fewer fields than listed | Edition limit | Keep the priority order in Phase 2; report what was dropped |
| A label is rejected as reserved | Zoho reserved word | Append " Value" to the label (for example "Route Value"), report the change so the app mapping can follow |
| Save Layout fails with a required-field warning | A new required field in a section with existing records | There are no records yet; if there are, report before continuing |

## As built (browser-agent report, 15 September 2026)

Org 110000235343 on crm.zohocloud.ca. Module label Listing Websites, API name `Listing_Websites` (internal `CustomModule6`), created as a **Team Module** in one teamspace (built from the owner's unsaved "Realtor Micro-Sites" draft, approved mid-run). No records created.

Deviations from the runbook and what the app must use:

| Item | As built | Consequence |
| --- | --- | --- |
| Purchaser Email | System field `Email` (API name cannot change) | App writes `Email` |
| Notes | Label "Notes Value", API `Notes_Value` (reserved word) | App writes `Notes_Value` |
| Website | System `Name` | App writes `Name` |
| Stripe Customer | Lives on Accounts as `Accounts.Stripe_Customer`; the record shows a read-only mirror through Brokerage; a plain `Listing_Websites.Stripe_Customer` sits in Unused Fields | App reads and writes the Account field; delete the unused record field before records exist |
| Deploy Lock Order | Not created: an org module (Accounts) cannot hold a lookup to a team module | Replace with Single Line `Deploy_Lock_Order_ID` (40) on Accounts |
| Order ID, Brokerage | Required, therefore cannot be read-only in Zoho | App and staff discipline protect them |
| Listing Portfolio section | On the Accounts **Brokerage** layout only | Every client Account must use the Brokerage layout, or add the section to Standard |
| Profiles | Team-module profiles Admins, Managers, Members, Participants, Requesters; org profiles do not apply | Producers must be added to the module; the API user must be an Admin of it |
| Subform | `Listings`, 14 fields, max 100 rows | App writes rows as the `Listings` array |

Team-module facts from Zoho's help pages (read 15 September 2026): Blueprint, workflow rules, approval processes, assignment rules, layout and validation rules, custom functions, reports and dashboards are supported; review process and escalation rules are not; multiselect lookup and multi-user fields are not available; team modules can look up org modules and other team modules, org modules cannot look up team modules; org administrators are not automatically members. API access to team-module records is not documented and must be verified with one test record before ordering is implemented.

Follow-ups for the agent: add `Deploy_Lock_Order_ID` to Accounts; delete the unused `Listing_Websites.Stripe_Customer`; confirm the three client Accounts use the Brokerage layout; add the API user as a module Admin; optionally add a lookup `Listing_Ad` to Listing_Ads on the record (team to org is allowed) for the destination-URL handoff.

## API verification (15 September 2026, evening)

Run with the app's existing OAuth token (scopes: `ZohoCRM.modules.custom.ALL`, `ZohoCRM.settings.fields.READ`, `ZohoCRM.modules.accounts.READ`, files and attachments create, WorkDrive files create). API user: the owner's account (id 3201000000071001), who created the module and is therefore its Admin.

| Check | Result |
| --- | --- |
| Field metadata for `Listing_Websites` | 200, 94 fields; every runbook field present with the expected API name and length; `Email`, `Name`, `Notes_Value` as reported |
| Subform `Listings` metadata | 200, 14 custom fields plus `Parent_Id`, `Created_Time`, `Modified_Time` |
| Accounts fields | All Listing Portfolio fields present; `Deploy_Lock_Order_ID` (text 255) already added; `Deploy_Lock_Order` absent as expected |
| Client Accounts layout | The Gray Team, Stone Sisters, Yukon and Testing Zoho Dev all use the Brokerage layout |
| Create with two subform rows under Testing Zoho Dev | 201; `Currency` defaulted to CAD; datetimes stored in the org's time zone (returned as -04:00) |
| Read back including `Listings` | 200; rows returned with their own ids |
| Update record fields | 200 |
| Update one subform row by id (full row set sent with ids) | 200; only that row changed |
| Create with a duplicate `Order_ID` | 400 `DUPLICATE_DATA`, `details.api_name` = `Order_ID`, `details.duplicate_record.id` = the existing record id. This is the idempotent-create recovery path |
| Update an Account | 401 `OAUTH_SCOPE_MISMATCH`: the token can read Accounts but not write them |
| Delete the test record | 200; read after delete 204 |
| `settings/modules`, `settings/layouts`, `users` | 401: not in scope; not needed by the app |

Consequences: the team module works with the current token for records and subforms; no re-mint is needed for the app's own writes. The app cannot write `Accounts.Stripe_Customer` or the deploy-lock fields; the admin fills the Stripe Customer on the Account by hand (one value per client) and the app keeps `stripe_customer_id` on the client profile as its source. When updating subform rows, always send the complete row set with ids.
