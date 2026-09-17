# ChatGPT skills for listing production, and working with GPT-6 Astra

Date: 15 September 2026. Research notes for plan v3.2 sections 8 and 9. Sources at the end; everything attributed to OpenAI was read on their pages today.

## 1. What GPT-6 Astra is

GPT-6 Astra is OpenAI's flagship model, released to approved users on 3 September 2026 and generally on 4 September, rolling out to ChatGPT Plus, Pro, Business and Enterprise and to the API. OpenAI positions it for end-to-end work: computer use, coding, research. A restricted version for paid users refuses some cybersecurity prompts, which does not affect this workflow. The "Astra" the plan will be working with is the model inside ChatGPT conversations, Sites builds and Codex CLI.

## 2. OpenAI's own guidance for Astra, applied to this workflow

OpenAI published model guidance built around five behaviours. Each one maps onto something in the production plan.

**Initiative and follow-through.** Astra asks clarifying questions more often than earlier models. OpenAI's fix is to tell it to infer intent from context, show a "bias towards action", work independently toward the goal, and ask for approval only when it has "a concrete, reviewable result". For us: every stage prompt says "do not stop to ask unless a blocker prevents the definition of done; when blocked, name the exact SKILL.md you read and quote the instruction". The human gates are already explicit (staging, release), so the model should run to the gate, not stop before it.

**Instruction following.** Astra follows long instructions more strongly and is more sensitive to skill files and AGENTS.md; contradictory instructions can block work or send it off course. OpenAI says to audit every instruction file the model can read and that "the user's instructions take precedence over guidelines provided in a skill". For us: one owner of the skills pack, a review before any change, no duplicated rules across files, and a precedence line at the top of each stage prompt: order record, then stage prompt, then skill, then foundation notes.

**Personality and writing style.** OpenAI wants "clear, concise paragraphs", lists only for truly parallel or sequential items, plain language, and it publishes a blocklist of stock phrases. The union of the two lists OpenAI shared: "Bottom Line:", "Conclusion:", "In short", "delve", "delve into", "leverage", "promote", "it's worth noting", "what's important is", "really", "truly", "The simplest mental model is", the "Question? Answer" pattern, "This isn't about X. It's about Y", "X, not Y", "X—not Y", and invented hyphenated compounds. For us: this list joins the agency's banned phrases in the copy skill and in the QA check. The "X—not Y" entry is the em dash rule from the other side.

**Subagent delegation.** Astra under-delegates. OpenAI's guidance: "if at any point you can parallelize work by delegating tasks to another agent, you should do so", and developers should specify delegation frequency and scope. For us: the QA skill names what to parallelize (viewport and browser passes, per-listing fact checks on a project page) and what must stay serial (anything that writes to the repo or deploys).

**Testing and verification.** Astra over-tests small changes. OpenAI: "do not write tests for reversible, low-impact changes that mirror the implementation"; broaden testing "only when new changes, failures, or unresolved concerns justify it". For us: QA means running the per-page checklist and recording evidence, not writing test suites; a revision reruns only the affected checks, which the plan already says.

Two more points from the same guidance. Prompt structure: give a goal, the context, the allowed tools, and a definition of done; for long tasks ask for a decision-complete plan in one turn, then implementation with acceptance criteria and test commands. Computer use: these workflows "can affect real accounts and data", so use test tenants, block destructive actions by default, confirm before purchases, messages, deletion or permission changes, and keep screenshots and action logs. That is exactly the browser-agent runbook style already in use for Zoho, and it is why the Sites skill must refuse to deploy without a named approval reference.

Community reports add two practical warnings: writing "still carries some residual AI smell" unless steered away from earlier habits, and one maximum-effort task consumed 6.7 million tokens in 44 minutes. Stage prompts, not one mega-prompt, and the plan's AI spend field per order.

## 3. Where each kind of instruction lives

ChatGPT and Codex load instructions from different places, and Astra's sensitivity to them makes the split matter.

| Layer | ChatGPT | Codex CLI (local portfolio repo) | Holds |
| --- | --- | --- | --- |
| Always-on rules | `AGENTS.md` at the portfolio repo root, read by the Work chat (shared Projects cannot run Work, owner 16 September 2026) | `AGENTS.md` at the repo root | Base production brief, non-negotiables, commands, deploy lock rule, "never deploy without approval reference" |
| Per-stage workflow | Skills, invoked with `@name` | Skills in `.agents/skills/`, invoked with `$name` | The how-to for one stage |
| Per-order facts | The pasted Blueprint prompt plus attached brief and assets | Same prompt, run in the repo | Goal, context, definition of done for this order |
| External systems | Connectors (MCP), optionally bundled with skills as a plugin | MCP servers in Codex config | Zoho CRM, WorkDrive |

Skills load progressively: the model sees only each skill's name and description until it decides to use one, then reads the full SKILL.md. Descriptions must front-load the trigger words. Codex caps the combined descriptions at 2 percent of the context window (8,000 characters when unknown) and shortens descriptions first, so keep them under about 200 characters.

## 4. The skill pack

Seven skills, one job each, all with `allow_implicit_invocation: false` so they never fire on unrelated chats and are always called by name from a stage prompt. Every skill returns the same trailer: order ID, facts version, commit, deployment identifiers, work performed, evidence, blockers.

| Skill | Called at | Description (front-loaded triggers) | Contents |
| --- | --- | --- | --- |
| `listing-brief` | Start preparation | "Prepare a listing website brief from an order: fact table with sources, conflicts, missing items, image and plan assignment, project versus unit content." | SKILL.md steps; `references/facts-schema.md` (the content file schema, one entry per listing); `assets/clarification-email.md`; optional MCP dependency on the Zoho CRM connector to read the record by Order ID |
| `listing-copy` | Build, Revision | "Write or revise listing page copy in Canadian English from confirmed facts: no em dashes, no banned phrases, no invented claims, brokerage block." | SKILL.md voice rules; `references/banned-phrases.txt` (agency list plus OpenAI's blocklist); `references/claims-policy.md` (no awards, distances, school claims, inferred views, completion dates, undated prices); `scripts/check-copy.py` that prints violations |
| `listing-build` | Ready for build | "Add or update a listing route in a portfolio site from an approved brief: content file, assets manifest, form with Basin, Turnstile and the hidden page field, metadata, gallery card, commit and push." | SKILL.md steps in order; `references/foundation.md` (components, tokens, section order, image rules); `references/content-file.md`; `references/form-and-analytics.md` (AJAX submit, lead event, thank-you redirect, Rybbit site id); `assets/` templates |
| `listing-qa` | Start QA, after edits | "Run the per-page QA checklist on a staged or candidate listing route and produce evidence: links, facts versus approved, form accept and reject, lead event, metadata, widths, Lighthouse, regressions." | SKILL.md with the 15-item checklist and the evidence format (pass, fail, not tested, with URL, width, browser, date); delegation instructions (parallel viewport and browser passes); `scripts/check-links.py`, `scripts/content-hash.py`; `references/qa-report-template.md` |
| `sites-stage-release` | Stage for review, Publish, rollback | "Save, stage unlisted, and release a portfolio version on ChatGPT Sites: record deployment ids and commits, enforce the allowed release diff, verify live, roll back." | SKILL.md with the save versus deploy protocol, staging rules (no card, noindex, no sitemap), release diff allow-list, verification steps, rollback; a hard stop: "refuse to deploy without an approval reference that matches the staging deployment id" |
| `listing-lifecycle` | Update or archive | "Apply a lifecycle change to a live listing: free edit, SOLD badge, removal with redirects, hosting ended, project unit changes; update every parent, card, sitemap and link." | SKILL.md steps per change type; invariants (no dead links, all occurrences updated); `references/removal-rules.md` |
| `portfolio-setup` | Once per client | "Set up a client portfolio site: foundation clone, brand preset from the profile, gallery, privacy and thank-you pages, analytics ids, default Basin form, DNS handoff, template QA." | SKILL.md steps; `references/dns-and-domain.md` (the existing Cloudflare configuration once inspected); `references/template-qa.md` |

Not skills: the base production brief (Project instructions and AGENTS.md), the Blueprint stage prompts (per order, pasted), and the agency's brand voice beyond copy rules (Project files).

### What a SKILL.md looks like here

```markdown
---
name: listing-qa
description: Run the per-page QA checklist on a staged or candidate listing route and produce evidence: links, facts versus approved, form accept and reject, lead event, metadata, widths, Lighthouse, regressions.
metadata:
  version: 2026.09.1
  owner: Supersonic production
---

# Listing QA

Precedence: the order record and the stage prompt override this file. If they conflict with it, follow them and say so in the report.

## Inputs
- Order ID, route, staging or candidate URL, approved facts version and content hash (from the stage prompt).

## Steps
1. Pull the latest source. Compute the content hash with `scripts/content-hash.py <route>` and compare it with the approved hash. Stop and report if it differs.
2. Run `scripts/check-links.py <url>`. Record every failure.
3. Delegate in parallel: one pass at 375 and one at 1440 CSS pixels; one pass per browser available. Each pass returns the checklist items it covers with evidence.
4. Test the form three ways: rejected Turnstile token (no lead event, input preserved), invalid input (error shown), accepted submission (delivery to the recipients, exactly one lead event with the route, redirect to /thank-you).
5. ...

## Evidence format
Item, result (pass, fail, not tested), URL, width, browser, date, note. Never mark pass from code inspection alone.

## Done when
The QA report is saved to docs/qa/<order-id>.md, every item has a result, and the trailer lists defects by severity.
```

Optional `agents/openai.yaml` per skill:

```yaml
interface:
  display_name: "Listing QA"
  short_description: "Per-page QA checklist with evidence"
policy:
  allow_implicit_invocation: false
dependencies:
  tools: []
```

## 5. Setup and governance

**Plan check first.** Skills exist on ChatGPT Business, Enterprise, Healthcare and Edu; Plus and Pro do not have them. Sites exists on Plus, Pro, Business, Enterprise and Edu. The workspace therefore needs Business or higher for this design. On Plus or Pro the fallback is Projects with project instructions and files, which loses per-stage invocation and workspace sharing.

**Admin enables skills.** In the admin dashboard under Permissions and Roles there are separate toggles for creating, uploading, sharing with individuals, publishing workspace-wide, and installing on others' behalf.

**Source of truth is Git, not the ChatGPT editor.** Keep the pack in the private foundation repository under `skills/<name>/`, tag it, and record the tag as `Prompt_Version` on every CRM record at order creation. Publish to the workspace from that tag. Sharing grants access but does not install: every producer installs each skill once from Plugins → Skills → Shared with me. Deleting a shared skill removes it for everyone, so retire by publishing a replacement, never by deleting mid-order.

**Codex gets the same files.** Symlink or copy `skills/` to `.agents/skills/` in each portfolio repository so a Codex CLI build sees the same instructions the ChatGPT conversation sees; Codex detects changes automatically. Put the always-on rules in `AGENTS.md` at the root; files closer to the working directory take precedence.

**Plugin later.** When the Zoho CRM connector is verified, bundle the seven skills and the registered connector as a private workspace plugin (`plugin.json`, `skills/`, `.app.json` referencing the registered connection). One install per producer, admin-published, stays inside the workspace. Not before the pilot.

**Review discipline.** Astra reads these files as strong instructions. Every change to the pack is a pull request reviewed by the person who owns production, tested by running one stage prompt against a test order, then tagged.

## 6. Changes to the plan's stage prompts

The base brief in plan section 9 stays as the Project instructions and `AGENTS.md`. Each stage prompt shrinks to Goal, Context, Definition of done, and an explicit skill mention, with these lines added for Astra:

- "Precedence: this prompt and the attached order record override any skill or repository file. If they conflict, follow this prompt and say so."
- "Bias toward action. Do not stop to ask unless a blocker prevents the definition of done. When blocked, name the exact SKILL.md and quote the instruction."
- "Approval is a human gate at Stage for review and Publish. Prepare the concrete, reviewable result and stop there."
- "Delegate parallel checks to subagents where the skill says so. Never delegate a write to the repository or a deploy."
- "Do not add tests or checks beyond the skill's checklist. After an edit, rerun only the affected checks."
- "Client-facing copy: paragraphs over lists, plain language, and none of the phrases in references/banned-phrases.txt."

Example, Start QA:

```text
Goal: QA candidate {{candidate_id}} for order {{order_id}} on route {{listing_path}} using @listing-qa.
Context: approved facts version {{facts_version}}, approved content hash {{approved_content_hash}}, staging URL {{staging_url}}, recipients {{lead_emails}}.
Precedence: this prompt and the attached order record override any skill or repository file. If they conflict, follow this prompt and say so.
Bias toward action; do not stop to ask unless a blocker prevents the definition of done. When blocked, name the SKILL.md and quote the instruction.
Delegate viewport and browser passes in parallel as the skill describes. Do not add checks beyond the checklist.
Definition of done: docs/qa/{{order_id}}.md saved with every checklist item and its evidence, defects listed by severity, and the trailer (order ID, facts version, commit, candidate, work performed, evidence, blockers).
```

## Sources

- OpenAI, [Model guidance for gpt-6-astra](https://developers.openai.com/api/docs/guides/latest-model): the five behaviours, instruction precedence, blocklist, reasoning effort, testing restraint.
- The Decoder, [OpenAI shares prompting tips for GPT-6 Astra including a blocklist of slop words](https://the-decoder.com/openai-shares-prompting-tips-for-gpt-6-astra-including-a-blocklist-of-slop-words/): the extended blocklist and quoted prompt phrasings.
- Al Jazeera, [OpenAI unveils GPT-6 Astra](https://www.aljazeera.com/economy/2026/9/4/openai-unveils-gpt-6-astra-amid-rising-scrutiny-and-safety) and CNBC, [OpenAI begins rolling out Astra model](https://www.cnbc.com/2026/09/03/open-ai-astra-gpt-6-cyber.html): release dates and plan rollout.
- Wikipedia, [GPT-6 Astra](https://en.wikipedia.org/wiki/GPT-6_Astra): release facts and safety notes.
- ChatGPT Learn, [Build skills](https://learn.chatgpt.com/docs/build-skills) and [Skills and plugins](https://learn.chatgpt.com/docs/skills-and-plugins): SKILL.md format, folders, `agents/openai.yaml`, progressive disclosure, description budget, invocation, skill locations, plugins.
- OpenAI Academy, [Using skills](https://openai.com/academy/skills/) and AI Agents Library, [How to share and install ChatGPT skills](https://www.aiagentslibrary.com/blog/how-to-share-chatgpt-skills/): plans, admin toggles, sharing versus installing, deletion behaviour.
- OpenAI Developers, [Build plugins](https://developers.openai.com/plugins/build/plugins): `plugin.json`, bundled skills, registered connectors, workspace publishing.
- Codex, [Customization overview](https://learn.chatgpt.com/docs/customization/overview) and [Best practices](https://developers.openai.com/codex/learn/best-practices): AGENTS.md versus skills, precedence, goal, context, constraints, done when.
- Simon Willison, [OpenAI are quietly adopting skills](https://simonwillison.net/2025/Dec/12/openai-skills/): format compatibility with the Agent Skills specification.
- Community, [awesome-gpt-6-astra](https://github.com/Anil-matcha/awesome-gpt-6-astra): computer-use safety notes attributed to OpenAI, cost reports, writing-style reports.
