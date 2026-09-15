import type { APIRoute } from "astro";
import { canAccessClient, sessionEmail } from "../../lib/auth";
import { normalizeListingAd, validateListingAd, type ListingAdInput } from "../../lib/listing-ads";
import { readClient } from "../../lib/storage";
import type { ClientProfile } from "../../lib/types";
import { createRecord, listRecentRecords, zohoConfigured } from "../../lib/zoho";

export const prerender = false;

// Files one Listing_Ads record in Zoho CRM per listing-ad request and answers only
// once CRM has confirmed it. Self-guarded (see middleware): auth runs after the
// body names the client.

const MODULE = "Listing_Ads";
const SUPPORT = "hello@supersonicsites.com";
const SUBMISSION_ID = /^[0-9a-f-]{32,36}$/i;
// ponytail: in-memory, one process (like the login throttle). After a restart the browser
// resends an unanswered request with retry:true and the server looks back this far in CRM.
const REMEMBER_MS = 24 * 60 * 60_000;
// An unanswered create may still be committing inside Zoho: hold its retries back this long.
const SETTLE_MS = 30_000;

type Outcome =
  | { kind: "created"; id: string; name: string }
  | { kind: "rejected"; status: number; code: string; field?: string }
  | { kind: "uncertain" };

type Submission = { at: number; record: ListingAdRecord; outcome: Promise<Outcome>; id?: string; settled?: number };
const submissions = new Map<string, Submission>();

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

// Record names carry the business day in Vancouver, where the clients are.
function vancouverDay(now: Date) {
  const part = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return `${part.year}-${part.month}-${part.day}`;
}

// Listing_Ads API names, types and lengths checked against live metadata (GET
// /crm/v8/settings/fields?module=Listing_Ads, 2026-09-15). Ad_Budget is a text field
// holding "$50" etc., like the records the old form created. Destination_URL is left for
// staff: nothing the app has reliably knows a brand-new listing's page.
const NAME_MAX = 120; // "Listing Name" field length
// Campaign_Type picklist: the stored value of one option differs from its label, and
// Get Records answers with labels.
const CAMPAIGN_TYPE_VALUES: Record<string, string> = {
  "New Ad Campaign": "New Ad Campaign",
  "Extend Existing Campaign": "Extend Existing Ad Campaign"
};

function toRecord(input: ListingAdInput, accountId: string, now: Date) {
  const day = vancouverDay(now);
  return {
    // The full address is in Listing_Address; the name cuts it to fit 120 characters.
    Name: `${input.listing_address.slice(0, NAME_MAX - day.length - 3).trimEnd()} - ${day}`,
    Listing_Address: input.listing_address,
    Ad_Budget: input.ad_budget,
    Campaign_Type: CAMPAIGN_TYPE_VALUES[input.campaign_type],
    Location_Targeting: input.location_targeting,
    Realtor_Stats: input.realtor_stats_url,
    Campaign_Status: "New Order",
    Brokerage: { id: accountId },
    ...(input.photos_url ? { Dropbox_Google_Drive: input.photos_url } : {}),
    ...(input.special_notes ? { Notes_Special_Requests: input.special_notes } : {})
  };
}

type ListingAdRecord = ReturnType<typeof toRecord>;

// Written fields that identify a request (Name is only the address plus a day).
const MATCHED = ["Listing_Address", "Ad_Budget", "Location_Targeting", "Realtor_Stats", "Dropbox_Google_Drive", "Notes_Special_Requests"] as const;

// The record an unanswered attempt may have created: every written field matches, same
// Account, created since that attempt, and not already confirmed for another submission.
// Get Records, not Search — search lags behind creates.
async function findEarlier(record: ListingAdRecord, since: number): Promise<string | undefined> {
  const taken = new Set([...submissions.values()].flatMap((entry) => (entry.id ? [entry.id] : [])));
  const rows = await listRecentRecords(MODULE, [...MATCHED, "Campaign_Type", "Brokerage", "Created_Time"], 200);
  const sent = record as Record<string, unknown>;
  const match = rows.find(
    (row) =>
      !taken.has(String(row.id)) &&
      MATCHED.every((field) => (row[field] ?? "") === (sent[field] ?? "")) &&
      (CAMPAIGN_TYPE_VALUES[String(row.Campaign_Type)] ?? row.Campaign_Type) === record.Campaign_Type &&
      (row.Brokerage as { id?: unknown } | null)?.id === record.Brokerage.id &&
      Date.parse(String(row.Created_Time)) >= since
  );
  return match ? String(match.id) : undefined;
}

async function attempt(record: ListingAdRecord, lookFirst: boolean, since: number): Promise<Outcome> {
  if (lookFirst) {
    try {
      const id = await findEarlier(record, since);
      if (id) return { kind: "created", id, name: record.Name };
    } catch (error) {
      console.error("[listing-ad] could not check CRM for an earlier record:", error instanceof Error ? error.message : error);
      return { kind: "uncertain" }; // can't tell — never risk a duplicate
    }
  }
  const outcome = await createRecord(MODULE, record);
  return outcome.kind === "created" ? { ...outcome, name: record.Name } : outcome;
}

function respond(outcome: Outcome, replay: boolean) {
  if (outcome.kind === "created") {
    return json(replay ? 200 : 201, { ok: true, record_id: outcome.id, record_name: outcome.name });
  }
  if (outcome.kind === "uncertain") {
    return json(504, { ok: false, code: "uncertain", error: "We couldn’t confirm the request reached our CRM." });
  }
  if (outcome.field === "Brokerage") {
    return json(502, {
      ok: false,
      code: "crm_rejected",
      error: `Your team’s CRM account link isn’t valid, so nothing was sent. Your entries are still here — email ${SUPPORT} and we’ll fix it.`
    });
  }
  if ([401, 403, 429, 503].includes(outcome.status)) {
    return json(503, {
      ok: false,
      code: "crm_unavailable",
      error: `Listing ads can’t be sent right now, so nothing was sent. Your entries are still here — try again in a few minutes, or email ${SUPPORT}.`
    });
  }
  return json(502, {
    ok: false,
    code: "crm_rejected",
    error: `Our CRM didn’t accept this request, so nothing was sent. Your entries are still here — try again, or email ${SUPPORT}.`
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!sessionEmail(request)) {
    return json(401, { ok: false, code: "signin", error: "Sign-in required." });
  }
  // JSON only: with the SameSite=Lax session cookie this keeps cross-site form posts out.
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { ok: false, code: "invalid", error: "Unsupported request." });
  }
  const raw = await request.json().catch(() => null);
  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  let client: ClientProfile | undefined;
  try {
    client = await readClient(String(body.client_slug ?? ""));
  } catch {
    // Unknown or malformed slug: same answer as another team's client.
  }
  if (!client || !canAccessClient(request, client)) {
    return json(403, { ok: false, code: "forbidden", error: `This account can’t send listing ads for that team. If it should, email ${SUPPORT}.` });
  }

  const input = normalizeListingAd(body);
  const errors = validateListingAd(input);
  if (Object.keys(errors).length) {
    return json(400, { ok: false, code: "invalid", error: "Some fields need a fix.", fields: errors });
  }

  // Trusted association only: the Account comes from the profile the agency set up,
  // never from anything in the request.
  const accountId = client.zoho_account_id;
  if (!accountId) {
    return json(409, {
      ok: false,
      code: "not_connected",
      error: `Listing ads aren’t connected for ${client.name} yet, so nothing was sent. Email ${SUPPORT} and we’ll set it up.`
    });
  }
  if (!zohoConfigured()) {
    console.error("[listing-ad] Zoho CRM variables (client_id, client_secret, refresh_token) are not set.");
    return respond({ kind: "rejected", status: 503, code: "NOT_CONFIGURED" }, false);
  }

  const submissionId = typeof body.submission_id === "string" ? body.submission_id : "";
  if (!SUBMISSION_ID.test(submissionId)) {
    return json(400, { ok: false, code: "invalid", error: "Reload the page, then send the request again." });
  }

  const key = `${client.slug}:${submissionId}`;
  const now = Date.now();
  for (const [k, entry] of submissions) if (now - entry.at > REMEMBER_MS) submissions.delete(k);

  // One submission id is one request. While it is unanswered its content stays the first
  // attempt's (the browser locks the form too), so a retry can only find or file that record.
  let record = toRecord(input, accountId, new Date());
  let at = now;
  let since = now - REMEMBER_MS;
  let lookFirst = body.retry === true;
  for (let entry = submissions.get(key); entry; entry = submissions.get(key)) {
    const previous = await entry.outcome;
    if (previous.kind === "created") return respond(previous, true);
    if (submissions.get(key) !== entry) continue; // another retry already took over
    if (previous.kind === "uncertain") {
      if (Date.now() - (entry.settled ?? 0) < SETTLE_MS) return respond(previous, true);
      ({ record, at } = entry);
      since = at - 60_000; // from the unanswered attempt (with clock-skew slack), not from now
      lookFirst = true;
    }
    submissions.delete(key); // nothing confirmed: this request tries again
    break;
  }

  const entry = { at, record } as Submission;
  entry.outcome = attempt(record, lookFirst, since).then((result) => {
    if (result.kind === "created") entry.id = result.id;
    if (result.kind === "uncertain") entry.settled = Date.now();
    return result;
  });
  submissions.set(key, entry);
  const result = await entry.outcome;
  if (result.kind === "created") console.log(`[listing-ad] ${client.slug}: ${MODULE} record ${result.id} confirmed`);
  return respond(result, false);
};
