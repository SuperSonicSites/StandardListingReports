# Zoho CRM custom module `Listing_Websites`: field list

> **Superseded on 15 September 2026** by [runbook-crm-module-layout.md](runbook-crm-module-layout.md), which uses the project-page model: per-listing facts live in a `Listings` subform (one row per listing) and the packages are Single Listing and Project. The list below still shows the older per-route unit layout.

One record per route (plan v3.2). API names below; labels are yours. Verify the API names and lengths against `settings/fields` metadata before mapping, as was done for `Listing_Ads`.

## Identity

| Field | Type | Notes | Set by |
| --- | --- | --- | --- |
| `Name` | System, single line (120 as in Listing_Ads; verify) | `<address> · <route>` | App |
| `Order_ID` | Single line 40, **unique** ("do not allow duplicate values") | The fulfillment idempotency key | App |
| `Brokerage` | Lookup → Accounts, mandatory | From the profile's Account ID, never from the browser | App |
| `Purchaser_Email` | Email | Session email at checkout | App |
| `Package` | Pick list: Single Listing, Development Overview, Development Unit | | App |
| `Parent_Website` | Lookup → Listing_Websites | Units only | App |
| `Route` | Single line 60 | Immutable after payment | App |
| `Page_URL` | URL | `https://<portfolio host>/<route>` | App |
| Owner | System user | Producer | Staff |

## Intake facts

| Field | Type | Notes |
| --- | --- | --- |
| `Listing_Address` | Single line 255 | |
| `MLS_Number` | Single line 20 | |
| `Property_Type` | Single line 60 | |
| `Listing_Price` | Currency | |
| `Beds` | Number | |
| `Baths` | Decimal | |
| `Area` | Number | |
| `Area_Unit` | Pick list: sq ft, m² | |
| `Realtor_Stats` | URL | Member share link |
| `Source_URL` | URL | Listing or development page |
| `Photos_Link` | URL | Client's Dropbox or Drive folder |
| `Floor_Plan_Link` | URL | |
| `Video_URL` | URL | |
| `Hero_Preference` | Single line 200 | |
| `Selling_Points` | Multi line 2000 | |
| `Client_Notes` | Multi line 2000 | |
| `Target_Date` | Date | Informational |
| `Agent_Name` | Single line | Page contact block |
| `Agent_Email` | Email | |
| `Agent_Phone` | Phone | |

All set by the app at creation.

## Agreement and payment (app-written; read-only layout for staff)

| Field | Type |
| --- | --- |
| `Terms_Version` | Single line 20 |
| `Terms_Hash` | Single line 64 |
| `Accepted_At` | Date/Time |
| `Stripe_Customer` | Single line |
| `Stripe_Session` | Single line |
| `Stripe_Subscription` | Single line |
| `Stripe_Payment_Intent` | Single line |
| `Amount_Paid` | Currency |
| `Tax_Amount` | Currency |
| `Paid_At` | Date/Time |

## Hosting (app-written from the fetched subscription)

| Field | Type | Notes |
| --- | --- | --- |
| `Hosting_Status` | Pick list: Active, Past Due, Unpaid, Cancelled, Incomplete | Mirrors Stripe status |
| `Hosting_Period_End` | Date | `current_period_end` |
| `Cancel_At_Period_End` | Checkbox | |
| `Hosting_Ended_At` | Date/Time | Triggers "Hosting ended" |
| `Shell_Overview` | Checkbox | Overview kept unbilled while units are active |

## Production (Blueprint)

| Field | Type | Notes | Set by |
| --- | --- | --- | --- |
| `Stage` | Pick list (Blueprint field): New Order, Preparing, Needs Information, Ready for Build, Building, In QA, Staged, Review Requested, Edits Requested, Ready for Launch, Published, Updating, Archived, Cancelled | App sets New Order; Blueprint owns the rest | App, Blueprint |
| `Blocker` | Multi line 2000 | | Staff |
| `Conversation_URL` | URL | The listing conversation | Staff |
| `WorkDrive_Folder` | URL | Order folder | Staff |
| `Foundation_Version` | Single line | | Staff |
| `Prompt_Version` | Single line | Set at order creation | App |
| `Facts_Version` | Single line | Frozen build input | Staff |
| `Fact_Snapshot` | Multi line 32000 (or attachment) | Fact table with sources | AI, Staff |
| `Build_Commit` | Single line 40 | Git SHA | Staff |
| `Candidate_ID` | Single line | Sites saved version | Staff |
| `QA_Result` | Pick list: Pass, Pass with exceptions, Fail | | Staff |
| `QA_Evidence` | URL | `docs/qa` path or WorkDrive | Staff |
| `QA_Date` | Date/Time | | Staff |

## Staging and approval

| Field | Type | Notes |
| --- | --- | --- |
| `Staging_Deployment` | Single line | Unlisted deploy id |
| `Staging_Commit` | Single line 40 | |
| `Content_Hash` | Single line 64 | Route content file plus manifest |
| `Staged_At` | Date/Time | |
| `Review_Sent_At` | Date/Time | |
| `Review_Message_ID` | Single line | |
| `Client_Approval_Quote` | Multi line 2000 | Quoted reply |
| `Approved_By` | Email | Sender of the reply |
| `Approved_At` | Date/Time | |
| `Approved_Staging_Deployment` | Single line | Void if it changes |
| `Approved_Commit` | Single line 40 | Void if it changes |
| `Edit_Requests` | Multi line 32000 | Log; edits are free |
| `Edit_Count` | Number | Informational |

## Release

| Field | Type | Notes |
| --- | --- | --- |
| `Release_Reviewer` | User | Named human |
| `Release_Diff_OK` | Checkbox | Diff limited to card, noindex, sitemap, navigation |
| `Release_Approved_At` | Date/Time | |
| `Release_Commit` | Single line 40 | |
| `Release_Deployment` | Single line | |
| `Published_At` | Date/Time | |
| `Rollback_Target` | Single line | Previous release deployment |
| `Lead_Event_Verified` | Checkbox | One Rybbit `lead` on accepted submission |
| `Rybbit_Verified` | Checkbox | Page views arrive |

## Listing status and lifecycle

| Field | Type | Notes |
| --- | --- | --- |
| `Listing_Status` | Pick list: Active, Sold, Leased, Withdrawn | Separate from Stage |
| `Status_Changed_At` | Date/Time | |
| `Sold_Badge_Applied` | Checkbox | |
| `Redirect_To` | Single line 60 | Route after removal or rename |
| `Archive_Reason` | Pick list: Client request, Hosting ended, Replaced, Cancelled order | |
| `Archived_At` | Date/Time | |

## Communications and economics

| Field | Type | Notes |
| --- | --- | --- |
| `Emails_Log` | Multi line 32000 | Template, message id, date |
| `Cliq_Notified_At` | Date/Time | |
| `Uptime_Confirmed_At` | Date/Time | Separate from notification |
| `Human_Minutes` | Number | Pilot economics |
| `AI_Spend` | Currency | Pilot economics |
| `Notes` | Multi line 32000 | |

## On the Account, not on the record (one portfolio per client)

| Field | Type |
| --- | --- |
| `Portfolio_Host` | Single line |
| `Site_ID` | Single line |
| `Portfolio_Repo` | URL |
| `Rybbit_Site_ID` | Single line |
| `Basin_Form_ID` | Single line |
| `WorkDrive_Client_Folder` | URL |
| `Default_Lead_Recipients` | Single line 255 |
| `Stripe_Customer` | Single line |
| `Deploy_Lock_Holder` | User |
| `Deploy_Lock_Order` | Lookup → Listing_Websites |
| `Deploy_Lock_Taken_At` | Date/Time |
| `Portfolio_Status` | Pick list: Not set up, Live |

## Never on the record

Card data, raw Basin submissions, the agreement text (version and hash only), any secret.

## Setup notes

- About 90 custom fields; check the edition's per-module field limit before creating.
- Mark every app-written section read-only for staff profiles so the app stays the source of those values.
- `Stage` is the Blueprint field; Blueprint validation reads `Deploy_Lock_Order` on the Account.
- `Order_ID` uniqueness is what makes CRM creation idempotent; confirm the `DUPLICATE_DATA` response carries the existing record id (work package 1).
