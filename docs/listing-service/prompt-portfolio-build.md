# Prompt: build a client portfolio site (foundation)

Written 16 September 2026. First use: The Gray Team. This is the hand-run version of what the `portfolio-setup` skill will do later; the skill prompt in `skill-creator-prompts.md` is derived from it. For another client, change the first paragraph and the host.

The one idea that must not be lost (owner, 16 September 2026): **each listing route is its own website.** The portfolio has a gallery with the client's header and footer. A listing page has none of that. It is a standalone one-page site for that property, with its own header, hero, footer and look. The first Gray Team build got this wrong and was corrected with the upgrade prompt at the end of this file.

Start a **Work** chat outside any Project (ChatGPT: "Work mode isn't available in shared projects"). In the desktop app, open the new empty repository clone as the local folder for the chat. Then paste everything below the line.

---

You are building the listing portfolio website for The Gray Team, a real estate team in British Columbia, Canada. It lives at https://portfolio.grayteam.ca. Build it as a ChatGPT Site from this Work chat. Use the open local folder as the Site's source project; it is a private GitHub repository. Commit and push before every save or deploy.

This site is the foundation. Every listing website we sell this client later is one route on it, and each route is its own website: the visitor sees a site about that property, not a page of the portfolio. Build it so adding a listing later means: add one content file and its photos, nothing else.

STEP 1. READ FIRST, THEN ASK ONLY WHAT IS MISSING
Read AGENTS.md, docs/brand.md, docs/portfolio.md and the two sample pages in docs/samples/. Look in assets/brand/ for the logo files. Then send me one message with:
1. The Voice section you propose for docs/brand.md, from the two samples: two or three lines on how the client writes, plus words to avoid.
2. Every PLACEHOLDER you found in the docs, and anything else you need to build, as one numbered list.
Wait for my answers. For anything that comes later I will say "later". Keep every "later" value in one config file so I can fill them all in one place, and write it into docs/portfolio.md as PLACEHOLDER.

STEP 2. BUILD
Two layouts, one template each:
- The portfolio layout, used by / (the gallery), /privacy and the 404 page. It carries the client's header (logo, phone) and footer (brokerage block, privacy link, 🛠, "Website by Supersonic Sites").
- The micro-site layout, used by every listing route and its thank-you page. It carries none of the portfolio's header or footer, no breadcrumb, no "Listings" link. It has its own header (the property address as the site name, an in-page nav with anchor links to the sections that exist on this page, a phone button), its own hero (first photo full width with address, locality, price, status badge and the "Request information" button), the sections, and its own footer (agent block with headshot, brokerage block with the RE/MAX logo on a dark band, privacy link, 🛠, "Website by Supersonic Sites", and one small line "More listings from {client}" linking to /, the only link to the portfolio on the page). Its <title> is the address alone, its description comes from the listing, its social preview image is the hero photo.

Pages:
- / is the gallery: a grid of listing cards (hero photo, address, price, status badge). Cards come from the listing content files that are not hidden. Empty state: "Listings coming soon" plus the brokerage block.
- /<route> is a micro-site. Sections in this order after the hero: key facts (price, beds, baths, area, MLS number), description, photo gallery, floor plan, location, agent block, inquiry form, footer. A section with no content disappears. A project page (a development with several homes) shows one section per home and a home selector in the form.
- /<route>/thank-you: the micro-site layout and theme, noindex, fires the Rybbit lead event once, "Back to <address>" link. A shared /thank-you exists only as a fallback.
- /privacy: plain-language Canadian privacy page naming the client as operator, Supersonic Sites Inc. as service provider, Basin and Rybbit as processors, what the form collects, a retention line, the contact email.
- A real 404 page. robots.txt. A sitemap that leaves out hidden routes and every thank-you page.

Content model: one file per route (JSON or Markdown front matter, your call, but one file) with: route, hidden, noindex, address, price, status (Active or Sold), beds, baths, area, MLS number, description, photos with alt text, floor plan, agent, for a project the list of homes, and a theme: accent colour (or null for the brand colour), hero style (full or split), font (serif or sans, two system font stacks, no webfont downloads). The build turns the theme into CSS variables for that page only, so no two micro-sites need to look the same. A hidden route is not on the gallery, not in the sitemap, carries noindex, but opens by its URL. That is how we stage a page for the client's review. A Sold status shows a SOLD badge on the card and the page.

Form: submits to the client's Basin form by AJAX with the Turnstile token, a hidden "page" field set to the route, and on a project page a "home" select. Only Basin's accepted response fires the Rybbit "lead" event (properties: page, home), then the visitor goes to the route's thank-you page. A rejected or failed submission shows the error and keeps what the visitor typed. The submit button is disabled after acceptance so it cannot send twice.

On every page, both layouts: the Rybbit snippet with the portfolio site ID; the Userback snippet (access token P-uHmAAlapQCpsBBd7vOAtnJrmT, script https://static.userback.io/widget/v1.js, no user_data block) and a 🛠 link in the footer that activates the feedback widget.

Every client string comes from one config file (client name, locality line, title suffix for portfolio pages, gallery heading, © line, privacy operator text). Nothing about the client is typed into the build code. This repository becomes the template for the next client.

Design: mobile first, one column on phones, fast. No framework that costs speed. Brand colours and logo from docs/brand.md on the portfolio pages; the theme on each micro-site. Restrained type, consistent spacing. Images in real sizes (480, 960, 1600 and 2400 wide), lazy loaded below the fold, never upscaled. Accessible: keyboard, visible focus, labels, contrast, reduced motion respected. Canadian English. No em dashes. No filler words.

Sample content: build one sample listing route and one sample project route with made-up content and neutral placeholder images, both hidden, with two different themes, so I can see the template and the range. Never use another client's content, colours or assets.

STEP 3. CHECK
Widths 320, 375, 390, 768, 1024 and 1440, on the gallery and both samples. A micro-site page must contain none of the portfolio header or footer markup and exactly one link to /. Form three ways: rejected Turnstile token (error shown, input kept, no lead event), invalid input (field errors), accepted submission (delivery, page and home fields present, exactly one lead event, redirect to the route's thank-you, button disabled). Hidden route: opens by URL, not on the gallery, not in the sitemap, has noindex. Lighthouse mobile on the gallery and the sample listing: aim for 95 or more. Fix what fails, then run the checks again.

STEP 4. HAND BACK
- The deployed site and the exact DNS record I must add in Cloudflare for portfolio.grayteam.ca (type, name, target). I add DNS myself.
- The repository or source project, and a five-line how-to for adding a listing page later: which file, which folder for photos, how to pick a theme, how to flip hidden.
- The config file with every value and every remaining PLACEHOLDER.
- What you checked, with results, and what still fails.
- docs/portfolio.md updated with the Site ID and every id you produced, docs/brand.md with the approved Voice section, and AGENTS.md left as it is unless something in it is wrong (then tell me). Commit and push them.

RULES
Ask me only in step 1. After that keep going; if you are truly blocked, say what and why in one line. Never invent a fact about the client: colours, addresses, names and phone numbers come from grayteam.ca or from me. Never publish a real listing. The Turnstile secret never goes in the site; only the site key does. Report the DNS record; do not try to change DNS by any other route.

---

# Upgrade 2026.09.2: each listing page is its own website

Run in the same Work chat, on the same clone, after the first build. Paste everything below the line.

---

UPGRADE: each listing page is its own website.

What went wrong: the listing pages share the portfolio's header and footer, so they read as pages of The Gray Team site. That is not the product. Each listing route is a micro-site: a standalone one-page website for that property. A visitor on it should not see portfolio navigation. Only the gallery (/), /privacy and the 404 page carry the portfolio's header and footer.

DO THIS
1. Two layouts in the build: "portfolio" for /, /privacy and 404, which keeps today's header and footer; "micro-site" for every listing route and its thank-you page, which has no portfolio header, no "Listings" link, no "All listings" breadcrumb and no portfolio footer.
2. The micro-site's own header: the property address as the site name on the left, an in-page nav with anchor links only to the sections that exist on this page (Photos, Floor plan, Location, Contact), and a phone button. Sticky on desktop; a compact bar on phones.
3. The micro-site's own hero: the first photo full width, with the address, locality, price and status badge over it or right under it, and the "Request information" button. Then the sections as today.
4. The micro-site's own footer: agent block (names, phone, email, headshot), brokerage block with the RE/MAX logo on the dark band, privacy link, the 🛠 feedback link, "Website by Supersonic Sites", and one small line "More listings from The Gray Team" linking to /. That line is the only link to the portfolio on the whole page.
5. Its own identity in the head: the title is the address alone (no "| The Gray Team"), the description comes from the listing, og:image is the hero photo, og:site_name is the address.
6. A theme per listing so two micro-sites do not look the same. In the content file: "theme": { "accent": "#hex or null", "hero": "full" or "split", "font": "serif" or "sans" }. Null accent falls back to the brand teal. Serif and sans are two system font stacks, no webfont downloads. The build turns the theme into CSS variables on the html element of that page only. Give the two samples different themes so the range is visible.
7. Thank-you per micro-site: /<route>/thank-you in the micro-site layout and theme, noindex, not in the sitemap, fires the Rybbit lead event once exactly as today, with a "Back to <address>" link. The shared /thank-you stays only as a fallback for a receipt with no route.
8. Every client string in the build script comes from config/portfolio.json: client name, the locality line, the portfolio title suffix, the gallery heading and intro, the agent photo alt text, the © line, the privacy operator sentence. Nothing typed into the build code. This repository is the template for the next client.
9. Tests: a micro-site page contains none of the portfolio header or footer markup and exactly one link to /; the gallery still contains them; two themes produce different CSS variables; the per-route thank-you exists and is noindex. Replace the symlink in tests/render.test.mjs with a copy so the suite passes on Windows.
10. Unchanged: Rybbit once per page, Userback once per page, the form pattern, hidden and noindex rules, sitemap and robots, the image pipeline.
11. Docs: README (add a listing, theme knobs), docs/portfolio.md and AGENTS.md (foundation version 2026.09.2; the line about the shared layout now says "both layouts"; the ALWAYS line about source becomes: "Run git pull before you touch anything. Commit and push before every save or deploy. Commit messages start with the order id, then what changed in plain words."), docs/qa/template-2026.09.2.md with what you checked at 320, 375, 390, 768, 1024 and 1440 and what you could not.
12. Commit and push. Save a review version and deploy it. Tell me whether Sites ran the build or you had to commit dist. Give me the review links for /sample-listing and /sample-project, and the trailer.

RULES
One template with knobs, not one codebase per listing. No frameworks. No new dependencies. Same plain, fast, accessible standard as before. Do not change the gallery's look beyond what step 1 needs. Ask me only if a step cannot be done as written; otherwise keep going and report at the end.
