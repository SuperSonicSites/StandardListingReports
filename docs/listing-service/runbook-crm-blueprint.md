# Runbook: build the Listing Websites Blueprint in Zoho CRM (simple flow)

**For:** a browser agent (or a human) signed in to Zoho CRM as an administrator, as a member of the Listing Websites team module with the Admins profile.
**Org:** Supersonic Sites on the Canadian data centre, `https://crm.zohocloud.ca`. Blueprint settings: `https://crm.zohocloud.ca/crm/org110000235343/settings/blueprint`.
**Already done by the owner (16 September 2026):** the email templates exist; the Blueprint canvas exists (name, module Listing Websites, field Stage). You do not create either.
**Goal:** one new field, three picklist values removed, eight buttons on the existing Blueprint, published. Then a short report.
**Time:** about 40 minutes of clicking.

## The idea

One box on the record, **Next Step**, always says what to do now and holds the text to copy into ChatGPT. Buttons move the record. Each button asks for one field at most. Nothing else.

- The app fills Next Step when the order is created (the first card, with the property details already in it).
- Each button's **After** action replaces Next Step with the card for the next station (a **Field Update** with the fixed text given below).
- The transition message is one line, always the same idea: open Next Step and do what it says.
- Two emails go out by themselves: **LW Ready to review** (button Send for review) and **LW Live** (button Publish). **LW Information needed** is sent by hand from the record.

Stages used: New Order → Preparing → (Needs Information) → Building → Staged → Published → Archived. Cancelled from any stage before Published. The values Ready for Build, In QA and Ready for Launch are not used and get removed.

## Ground rules

1. **Change nothing in Modules and Fields except Phase 1.** If a field the runbook names is missing, report it and continue without it.
2. **Do not create, delete or edit any email template, and do not create a second Blueprint.** If you find no Blueprint for Listing Websites, stop and report it.
3. **Create no records** and do not move the one existing test record through any button.
4. **Set names and texts exactly as written.**
5. Every phase has an **Expect** line. If it fails, stop and report instead of improvising.
6. No secrets are involved.

## Where things are

- Blueprint: Setup (gear) → Automation → Blueprint. The Listing Websites one is already listed.
- Fields: Setup → Customization → Modules and Fields → Listing Websites → Standard layout.
- Email templates: Setup → Customization → Templates → Email → module Listing Websites.

## Phase 0: discovery (no changes)

1. Open the Blueprint for Listing Websites. Confirm: module Listing Websites, field Stage. Write down its name. Leave name and criteria as they are.
   - **Expect:** exactly one Blueprint, no transitions yet. If some exist, list them and build only what is missing.
2. Open Templates → Email, module Listing Websites. Write down the names. The buttons use **LW Ready to review** and **LW Live**. If the names differ a little, use the closest match and report the mapping.
3. Preview **LW Ready to review**. Report two things: does the review link end with `?ubwc=tAwyWnWOX1lBjM29i3H334195-65727`, and does the text still mention a reference number (a merge field like {Staging Deployment})? Do not edit. The owner removes that sentence; the field is not used any more.
   - **Expect:** both templates exist.

## Phase 1: fields

1. Modules and Fields → Listing Websites → Standard layout → section **Production** (holds Blocker and Conversation URL). Add one field:

| Label | Type | Settings |
| --- | --- | --- |
| Next Step | Multi Line | **Large**; place it first in the section |

   Save. Confirm the API name is `Next_Step`. If Zoho gave another one, do not rename; report it.

2. Open the **Stage** field's pick list values. Remove **Ready for Build**, **In QA** and **Ready for Launch**. Keep the order of the rest: New Order, Preparing, Needs Information, Building, Staged, Published, Archived, Cancelled. If Zoho refuses because a record uses a value, stop and report.

- **Expect:** a record form shows Next Step as a large box at the top of Production, and Stage offers eight values.

## Phase 2: the eight buttons

Open the Blueprint editor. Place the eight states left to right in list order, Cancelled below. Create each transition with the exact name. "Who" is the profiles that see the button. "Field" is the one mandatory field in During (none means no fields). "Message" is the During message, one line. "After" lists the actions: email, and **Next Step =** meaning a Field Update on Next Step with the text in the box, line breaks included. If the value box drops line breaks, paste as one line and report it.

### B1 "Start": New Order → Preparing

- Who: Admins, Managers, Members.
- Field: none.
- Message: `Then open Next Step on this record and do what it says.`
- After: nothing. (The app already wrote the first Next Step.)

### B2 "Ask the client": Preparing → Needs Information

- Who: Admins, Managers, Members.
- Field: **Blocker**.
- Message: `Then send the email LW Information needed from this record: Send Mail, pick the template.`
- After: Next Step =
```
WAITING FOR THE CLIENT.
Send them the email LW Information needed from this record if you have not yet (Send Mail, pick the template; it fills in the Blocker list).
When the client answers:
1. Attach any new files to this record.
2. Copy everything below the line into the order's chat. Add what the client sent. Send.
3. Still missing something? Send them another email. All good? Click Build.
----------
The client sent more details. Update the brief with them.
[Paste what the client sent here.]
Give me the new fact sheet and the list of missing items.
```

### B3 "Build": Preparing → Building, and Needs Information → Building

Create it with both source states selected. If the editor allows one source per transition, create it twice with the same name and report it.
- Who: Admins, Managers, Members.
- Field: **Conversation URL** (the link of the order's chat).
- Message: `Then open Next Step on this record and do what it says.`
- After: Next Step =
```
NOW
1. Copy everything below the line into the order's chat. Send.
2. ChatGPT builds the page, checks it, and puts it online hidden. It ends with a review link.
3. Got the review link? Click Send for review.
----------
@listing-build
Build the page for this order from the fact sheet in this chat and the attached photos. Use @listing-copy for the words.
Then run @listing-qa and fix everything it finds.
Then run @sites-stage-release in stage mode: online but hidden (no gallery card, noindex, not in the sitemap).
When done, give me the review link.
```

### B4 "Send for review": Building → Staged

- Who: Admins, Managers, Members.
- Field: none.
- Message: `The email LW Ready to review goes to the client by itself. Then open Next Step.`
- After: send email template **LW Ready to review** to the record's **Email** field. Next Step =
```
WAITING FOR THE CLIENT. The review email went out.
Client wants changes? Click Client wants changes.
Client replied "Approved"?
1. Copy everything below the line into the order's chat. Send.
2. ChatGPT makes the page public and gives you the live link.
3. Open the live link on your phone: photos, price, phone number, send one test lead.
4. All good? Renaud or Brent clicks Publish.
----------
@sites-stage-release
Mode: release. The client approved the staged page.
Make it public: gallery card on, noindex off, in the sitemap. Deploy.
Check the live page. Give me the live link.
```

### B5 "Client wants changes": Staged → Building

- Who: Admins, Managers, Members.
- Field: **Edit Requests** (what the client asked, in their words).
- Message: `Then open Next Step on this record and do what it says.`
- After: Next Step =
```
NOW
1. Copy everything below the line into the order's chat. Paste the client's request where it says. Send.
2. ChatGPT makes the changes, checks them, and gives you a new review link.
3. Got the review link? Click Send for review.
----------
@listing-build
The client wants these changes:
[Paste the request from Edit Requests here.]
Make only these changes. Use @listing-copy for any new words.
Then run @listing-qa on what changed, then @sites-stage-release in stage mode (still hidden).
When done, give me the review link.
```

### B6 "Publish": Staged → Published

- Who: **Admins and Managers only** (Renaud, backup Brent).
- Field: **Client Approval Quote** (paste the client's "Approved" reply).
- Message: `Only when the live link is checked. The email LW Live goes to the client by itself.`
- After: send email template **LW Live** to the record's **Email** field. Next Step =
```
THE PAGE IS LIVE. Nothing to do.

Client asks for a change or a SOLD badge? Start a new Work chat on the portfolio clone, name it with this order's ID and today's date, copy PROMPT A into it, add the request, send. Check the live page. Answer the client. Archive the chat when done.
PROMPT A
@listing-lifecycle
Change this page: [Paste the request here.]
Make only this change. Deploy. Check the live page. Give me the live link.

Taking the page down? Start a new Work chat the same way, copy PROMPT B into it, send, then click Archive.
PROMPT B
@listing-lifecycle
Archive this page: remove the gallery card, redirect its address to the portfolio home page. Deploy.
```

### B7 "Archive": Published → Archived

- Who: Admins, Managers.
- Field: **Archive Reason**.
- Message: `Only after PROMPT B ran. No email goes out.`
- After: Next Step = `Archived. Nothing to do.`

### B8 "Cancel": New Order, Preparing, Needs Information, Building, Staged → Cancelled

Create it with all five source states selected. If the editor allows one source per transition, create it from New Order, Preparing and Staged and report it.
- Who: Admins, Managers.
- Field: **Blocker** (why).
- Message: `Never published? Refund the client in Stripe.`
- After: Next Step = `Cancelled. Nothing to do.`

Save and **publish** the Blueprint.

- **Expect:** the Blueprint is active. The existing test record shows one button, "Start". Do not click it.

## Phase 3 (optional): Cliq launch notice

Setup → Automation → Workflow Rules → Create Rule → module Listing Websites. Name **LW launched: notify Design Team**. Trigger: Edit, condition Stage is Published, first time only. Action: the Cliq action, channel **Design Team**, message `Listing website live: {Property Address} at {Page URL} (order {Order ID}).` If no Cliq action is offered, skip this phase and say so.

## Final report

1. The new field (label, API name) and the Stage values now in the list.
2. Blueprint: name, published or draft, the eight buttons with from → to, who, the field asked, and the After actions attached. Anything the editor refused (two-source Build, five-source Cancel, a message too long, Next Step losing line breaks).
3. Templates: names found, the mapping, the two answers from Phase 0 step 3.
4. Cliq rule: built or skipped.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The message is too long | Keep the first sentence; report the limit |
| Field Update does not list Next Step | Report it; the owner attaches a function instead |
| Field Update drops line breaks | Paste as one line; report it |
| Cannot send to the Email field | Choose "Email" under record email fields; if absent, report |
| Publish refused: a state has no way in | Check every state except New Order has an incoming button |
| A Stage value cannot be removed | Report which record uses it; leave the value |

## Appendix: the email templates (reference; already in CRM)

The owner created these on 16 September 2026. The CRM version wins. Greeting uses the Agent Name field. Information needed is sent by hand from the record; the other two by the buttons.

### "LW Information needed" (manual)

Subject: `Status Update: A few details before we build {Property Address}`

```
Hi {Agent Name},

We are ready to build your listing website for {Property Address}, but a few things are missing:

{Blocker}

Simply reply to this email with the details (or the updated folder link) and we are back on it right away.

PS: The sooner we have everything, the sooner your page is live. We aim to publish within 7 days once it is all in. 😊

If you have any questions in the meantime, please let us know.

Have a super wonderful day!

Renaud Gagne
Project Manager
supersonicsites.com
1-888-321-BOOM
```

### "LW Ready to review" (button Send for review)

Subject: `Status Update: Your listing website is ready for review ✨`

```
Hi {Agent Name},

Your listing website for {Property Address} is ready to look at! Here is your private review link:
{Page URL}?ubwc=tAwyWnWOX1lBjM29i3H334195-65727

Want a change? The feedback tool opens with the page. Point at the spot, type your note and send. You can also open it any time from the 🛠 icon at the bottom of the page. Here is a 1-minute video showing how -> https://www.loom.com/share/b82b9b749e2b460aa43208914272ad94

Love it as is? Reply to this email with "Approved". We then put it live on your portfolio.

PS: This link is not on your portfolio yet, but anyone who has it can open it. And don't forget, the sooner you send feedback the sooner we can launch. 😊

If you have any questions in the meantime, please let us know.

Have a super wonderful day!

Renaud Gagne
Project Manager
supersonicsites.com
1-888-321-BOOM
```

The reference-number sentence from the earlier version is gone: the client replies to the latest review email, and that reply is what gets pasted into Client Approval Quote.

### "LW Live" (button Publish)

Subject: `3...2...1...BOOM! Your listing website is live!`

```
Hi {Agent Name},

Your listing website for {Property Address} is now live on your portfolio:
{Page URL}

Share it, point your ads at it, and watch the leads come in. 💥

Need a change later (a new price, a SOLD badge, a photo swap)? Click the 🛠 icon at the bottom of the page and send us a note, or simply reply to this email. Edits are on us.

Thanks again for being part of the Supersonic family! #Boom

If you have any questions, please let us know.

Have a super wonderful day!

Renaud Gagne
Project Manager
supersonicsites.com
1-888-321-BOOM
```
