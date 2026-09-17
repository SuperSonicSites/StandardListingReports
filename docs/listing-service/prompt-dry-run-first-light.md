# Dry run prompt: recreate First Light Ucluelet, high fidelity

Written 16 September 2026. Owner's call: no facts pasted, just the URL and the goal. The live page is the answer key, and the copy must match it.

Two prompts here: the CRM record (browser agent), then the Work chat prompt (ChatGPT). The CRM record's Next Step box carries the Work chat prompt, so the producer copies it from the record like any other order.

## 1. CRM record (browser agent, already on the create form)

Start the agent on `https://crm.zohocloud.ca/crm/org110000235343/tab/CustomModule6/create?layoutId=3201000004217119&redirect=false`. Replace [your email] before pasting.

---

You are on the "create record" form of the Listing Websites module in Zoho CRM. Fill it in for a dry run, save it once, and report. Create nothing else. Send no email. Click no Blueprint button. Change no field settings. If a field named below is not on the form, skip it and list it in your report.

First, in a second tab, read https://www.firstlightucluelet.ca/. It is the only source for the property facts below. Then come back to the form.

Fields, by section as they appear on the form (labels may differ a little; use the closest):
- Website (the name field at the top): First Light Affordable Living · first-light-ucluelet
- Order ID: DRY-RUN-001
- Brokerage (lookup): type Testing Zoho Dev and pick that Account from the list. Not The Gray Team; this is a test.
- Email, or Purchaser Email: [your email]
- Package: Project
- Route: first-light-ucluelet
- Page URL: https://portfolio.grayteam.ca/first-light-ucluelet
- Listing Count: the number of unit types on the page
- Prompt Version: 2026.09.3
- Property Address: the project name and address as written on the page
- Property Type: Modular homes development
- Source URL: https://www.firstlightucluelet.ca/
- Photos Link: https://www.firstlightucluelet.ca/ (the images come from the page)
- Agent Name: The Gray Team. Agent Email: info@grayteam.ca. Agent Phone: 250-900-8200.
- Stage: New Order. Page Status: Active.
- Notes Value: Dry run, 16 September 2026. No payment. Rebuild of the existing landing page, high fidelity. Stripe and terms fields left empty on purpose.
- Leave every Stripe, terms, hosting and production field empty.

Listings subform: one row per unit type from the page's pricing table. Unit Name = the unit type as written; Plan Name = the plan number; Beds; Area in sq ft; Listing Price = the lowest market price for that type; Listing Status = Sold if every lot of that type is sold, otherwise Active. Nothing else in the row.

Next Step (the large text box in the Production section): paste the text between the lines below exactly, line breaks included. If the field does not exist yet, paste it into Notes Value under the note above and say so in your report.
----------
NOW
1. Start a new Work chat on the Gray Team portfolio clone, outside any shared Project. Name it DRY-RUN-001 First Light Ucluelet.
2. Copy everything below the line into the chat. Send.
3. ChatGPT rebuilds the page, checks it, and stages it hidden. It ends with a review link.
4. Got the review link? Click Start, then Build (paste the chat link), then Send for review. Ignore the build text that appears in this box after Build: the page is already built.
----------
Recreate https://www.firstlightucluelet.ca/ as the first landing page on this portfolio.

Goal: high fidelity. Same pictures at full size, same layout, same sections in the same order, same wording, same links and documents. A visitor should not be able to tell the two apart, except that the new page runs on our foundation: our form pattern (Basin, Turnstile, hidden page field, one lead event, thank-you), Rybbit, Userback with the 🛠 link, the image pipeline, and the hidden and noindex rules.

Route: first-light-ucluelet. Hidden and noindex. Stage it. Do not release it.

RULES
- The source page is the answer key. Take facts, copy, images and links from it. Do not invent, tighten or improve anything.
- Fidelity beats the template. Where the foundation cannot express something on that page, add it to the foundation as an optional section that disappears when empty, in its own commit before the listing commit. If a piece is truly one-off, keep it in the route's own folder and say so.
- Download every image from the source at its largest available size and run it through our image pipeline.
- Form fields as on the original, submitted through our pattern.
- Read AGENTS.md, docs/brand.md and docs/portfolio.md first. Commit and push before saving or deploying.

CHECK
Screenshots of the original and the copy at 390 and 1440 wide, top to bottom. List every visible difference. Fix what you can, then list what remains and why.

DONE WHEN
The route is staged hidden on the Site, the difference list is saved in docs/qa/first-light-ucluelet.md, and you give me the review link and the trailer: commit, version, deployment id, what you could not verify.
----------

Click Save once. If the form stays open after saving (the page was opened with redirect=false), do not save again; open the Listing Websites list and find the record by Order ID DRY-RUN-001.

Report: the record's link and id, the subform rows you entered (unit type, plan, beds, area, price, status), whether the Next Step field existed, and anything the form refused or that you skipped.

---

## 2. Work chat prompt (ChatGPT), the same text the record carries

Paste everything below the line into a Work chat on the Gray Team clone.

---

Recreate https://www.firstlightucluelet.ca/ as the first landing page on this portfolio.

Goal: high fidelity. Same pictures at full size, same layout, same sections in the same order, same wording, same links and documents. A visitor should not be able to tell the two apart, except that the new page runs on our foundation: our form pattern (Basin, Turnstile, hidden page field, one lead event, thank-you), Rybbit, Userback with the 🛠 link, the image pipeline, and the hidden and noindex rules.

Route: first-light-ucluelet. Hidden and noindex. Stage it. Do not release it.

RULES
- The source page is the answer key. Take facts, copy, images and links from it. Do not invent, tighten or improve anything.
- Fidelity beats the template. Where the foundation cannot express something on that page, add it to the foundation as an optional section that disappears when empty, in its own commit before the listing commit. If a piece is truly one-off, keep it in the route's own folder and say so.
- Download every image from the source at its largest available size and run it through our image pipeline.
- Form fields as on the original, submitted through our pattern.
- Read AGENTS.md, docs/brand.md and docs/portfolio.md first. Commit and push before saving or deploying.

CHECK
Screenshots of the original and the copy at 390 and 1440 wide, top to bottom. List every visible difference. Fix what you can, then list what remains and why.

DONE WHEN
The route is staged hidden on the Site, the difference list is saved in docs/qa/first-light-ucluelet.md, and you give me the review link and the trailer: commit, version, deployment id, what you could not verify.
