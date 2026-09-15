// Integration check for POST /api/listing-ad against a fake Zoho CRM (no network):
//   npm run check:listing-ad
// Runs the real route module (TypeScript via Node's type stripping) and covers field
// mapping + trusted account association, rejection of unauthenticated and invalid
// requests, duplicate-submission protection, and CRM failure handling.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The route's imports follow Astro/Vite conventions: extensionless TS paths and
// import.meta.env. Map both onto plain Node for this process.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context); }
        catch (error) {
          if (specifier.startsWith(".") && !/\\.[a-z]+$/i.test(specifier)) return next(specifier + ".ts", context);
          throw error;
        }
      }
      export async function load(url, context, next) {
        const result = await next(url, context);
        const file = new URL(url).pathname;
        if (!file.includes("/src/") || !file.endsWith(".ts")) return result;
        return { ...result, source: String(result.source).replaceAll("import.meta.env", "globalThis.__ASTRO_ENV__") };
      }
    `)
);

const root = path.resolve(import.meta.dirname, "..");
const work = mkdtempSync(path.join(tmpdir(), "listing-ad-check-"));
mkdirSync(path.join(work, "data", "clients"), { recursive: true });
function writeClient(slug, extra) {
  const profile = { slug, name: `Team ${slug}`, logo_url: "data:,", brand_primary: "#111111", brand_accent: "#222222", footer_text: "", brokerage_name: "", brokerage_address: "", brokerage_contact: "", emails: ["coordinator@example.com"], ...extra };
  writeFileSync(path.join(work, "data", "clients", `${slug}.json`), JSON.stringify(profile));
}
const ACCOUNT_ID = "3201000000000001";
writeClient("team-a", { zoho_account_id: ACCOUNT_ID });
writeClient("team-b", {}); // not connected to a Zoho Account
process.chdir(work); // storage resolves data/ against the working directory

Object.assign(process.env, {
  AUTH_SECRET: "check-secret",
  APP_URL: "http://127.0.0.1",
  ADMIN_EMAILS: "admin@example.com",
  client_id: "fake-id",
  client_secret: "fake-secret",
  refresh_token: "fake-refresh",
  api_domain: "https://crm.test"
});
globalThis.__ASTRO_ENV__ = { DEV: false };

// Controllable clock for the route's settle window (Date.now only).
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;

// ---- Fake Zoho: token endpoint, Insert Records, Get Records ----
// Like Zoho, Get Records answers with the picklist label, not the stored value.
const PICKLIST_LABELS = { "Extend Existing Ad Campaign": "Extend Existing Campaign" };
const crm = { tokens: 0, inserts: [], records: [], script: [] };
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === "https://accounts.zohocloud.ca/oauth/v2/token") {
    assert.ok(String(init.body).includes("fake-refresh"), "credentials travel in the body");
    crm.tokens += 1;
    return Response.json({ access_token: `token-${crm.tokens}`, api_domain: "https://crm.test", expires_in: 3600 });
  }
  if (url === "https://crm.test/crm/v8/Listing_Ads" && init.method === "POST") {
    const behaviour = crm.script.shift() ?? "ok";
    if (behaviour === "expired") return Response.json({ code: "INVALID_TOKEN", details: {}, status: "error" }, { status: 401 });
    if (behaviour === "invalid") {
      return Response.json({ data: [{ code: "INVALID_DATA", details: { api_name: "Ad_Budget" }, status: "error" }] }, { status: 400 });
    }
    if (behaviour === "dropped") throw new TypeError("fetch failed"); // never reached Zoho
    const sent = JSON.parse(init.body);
    const id = String(3201000009000000n + BigInt(crm.inserts.length));
    crm.inserts.push({ body: sent, auth: new Headers(init.headers).get("authorization") });
    crm.records.unshift({ id, ...sent.data[0], Created_Time: new Date(Date.now()).toISOString() });
    if (behaviour === "lost") throw new TypeError("fetch failed"); // stored, but the answer never arrives
    await new Promise((resolve) => setTimeout(resolve, 25)); // a duplicate click lands mid-flight
    return Response.json({ data: [{ code: "SUCCESS", details: { id }, status: "success" }] }, { status: 201 });
  }
  if (url.startsWith("https://crm.test/crm/v8/Listing_Ads?")) {
    const query = new URL(url).searchParams;
    assert.equal(query.get("sort_by"), "Created_Time");
    const fields = query.get("fields").split(",");
    return Response.json({
      data: crm.records.map((record) =>
        Object.fromEntries([["id", record.id], ...fields.map((f) => [f, PICKLIST_LABELS[record[f]] ?? record[f] ?? null])])
      )
    });
  }
  throw new Error(`unexpected request: ${url}`);
};

const routeUrl = pathToFileURL(path.join(root, "src/pages/api/listing-ad.ts")).href;
const { AUTH_COOKIE, createSessionToken } = await import(pathToFileURL(path.join(root, "src/lib/auth.ts")).href);
const { POST } = await import(routeUrl);
let restarts = 0;
const restartedRoute = async () => (await import(`${routeUrl}?restart=${++restarts}`)).POST; // fresh in-memory state

async function post(body, { email = "coordinator@example.com", type = "application/json", route = POST } = {}) {
  const headers = { "Content-Type": type };
  if (email) headers.Cookie = `${AUTH_COOKIE}=${encodeURIComponent(createSessionToken(email))}`;
  const response = await route({ request: new Request("http://127.0.0.1/api/listing-ad", { method: "POST", headers, body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

const valid = {
  client_slug: "team-a",
  listing_address: "  12  Main St, Kelowna ",
  ad_budget: "$150",
  campaign_type: "Extend Existing Campaign",
  location_targeting: "Kelowna,  West Kelowna ; Vernon",
  photos_url: "https://www.dropbox.com/sh/example",
  realtor_stats_url: "https://member.realtor.ca/Reports/ListingDestination/example-token",
  special_notes: "Lead with the lake view.",
  // A browser can't choose the Account: both of these must be ignored.
  zoho_account_id: "999",
  Brokerage: { id: "999" }
};
const newId = () => crypto.randomUUID();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
const SETTLE = 31_000;
let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

await check("unauthenticated, wrong-team and non-JSON requests never reach CRM", async () => {
  assert.equal((await post({ ...valid, submission_id: newId() }, { email: null })).status, 401);
  assert.equal((await post({ ...valid, submission_id: newId() }, { email: "stranger@example.com" })).status, 403);
  assert.equal((await post({ ...valid, client_slug: "../team-a", submission_id: newId() })).status, 403);
  assert.equal((await post({ ...valid, submission_id: newId() }, { type: "text/plain" })).status, 415);
  assert.equal(crm.inserts.length, 0);
});

await check("invalid fields are rejected one by one", async () => {
  const r = await post({
    ...valid,
    submission_id: newId(),
    listing_address: " ",
    ad_budget: "$75",
    campaign_type: "Boost",
    location_targeting: "a,b,c,d,e,f,g,h,i,j,k",
    photos_url: "javascript:alert(1)",
    realtor_stats_url: "https://www.realtor.ca/real-estate/123"
  });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.fields).sort(), ["ad_budget", "campaign_type", "listing_address", "location_targeting", "photos_url", "realtor_stats_url"]);
  assert.equal((await post({ ...valid, submission_id: "not-an-id" })).status, 400);
  assert.equal(crm.inserts.length, 0);
});

await check("a team without a Zoho Account cannot submit", async () => {
  const r = await post({ ...valid, client_slug: "team-b", submission_id: newId() });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "not_connected");
  assert.equal(crm.inserts.length, 0);
});

const firstId = newId();
await check("maps every field and files it under the profile's Account", async () => {
  const r = await post({ ...valid, submission_id: firstId });
  assert.equal(r.status, 201);
  assert.equal(crm.inserts.length, 1);
  const sent = crm.inserts[0].body;
  assert.equal("trigger" in sent, false, "CRM workflows must run as for any new record");
  assert.equal(crm.inserts[0].auth, "Zoho-oauthtoken token-1");
  assert.deepEqual(sent.data[0], {
    Name: `12 Main St, Kelowna - ${today}`,
    Listing_Address: "12 Main St, Kelowna",
    Ad_Budget: "$150",
    Campaign_Type: "Extend Existing Ad Campaign", // the picklist's stored value for that label
    Location_Targeting: "Kelowna, West Kelowna, Vernon",
    Realtor_Stats: valid.realtor_stats_url,
    Campaign_Status: "New Order",
    Brokerage: { id: ACCOUNT_ID },
    Dropbox_Google_Drive: valid.photos_url,
    Notes_Special_Requests: valid.special_notes
  });
  assert.deepEqual(r.body, { ok: true, record_id: crm.records[0].id, record_name: `12 Main St, Kelowna - ${today}` });
});

await check("optional fields are left out when blank", async () => {
  const r = await post({ ...valid, listing_address: "3 Bare Rd", campaign_type: "New Ad Campaign", photos_url: "", special_notes: "", submission_id: newId() });
  assert.equal(r.status, 201);
  const record = crm.inserts.at(-1).body.data[0];
  assert.equal(record.Campaign_Type, "New Ad Campaign");
  assert.equal("Dropbox_Google_Drive" in record, false);
  assert.equal("Notes_Special_Requests" in record, false);
});

await check("long addresses are cut to fit the 120-character record name", async () => {
  const address = `${"1234 Very Long Street Name ".repeat(9)}Whitehorse`; // 253 characters
  const r = await post({ ...valid, listing_address: address, submission_id: newId() });
  assert.equal(r.status, 201);
  const record = crm.inserts.at(-1).body.data[0];
  assert.ok(record.Name.length <= 120, `Name is ${record.Name.length} characters`);
  assert.ok(record.Name.endsWith(` - ${today}`));
  assert.equal(record.Listing_Address, address);
});

await check("a city list that fits the input is never rejected for length", async () => {
  const cities = Array.from({ length: 10 }, (_, i) => `City${i}`.padEnd(24, "x")).join(","); // 249 typed, 258 re-joined
  assert.equal((await post({ ...valid, listing_address: "4 Cities Ct", location_targeting: cities, submission_id: newId() })).status, 201);
});

await check("double clicks and replays of one submission create one record", async () => {
  const before = crm.inserts.length;
  const id = newId();
  const [a, b] = await Promise.all([post({ ...valid, listing_address: "8 Twice St", submission_id: id }), post({ ...valid, listing_address: "8 Twice St", submission_id: id })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.body.record_id, b.body.record_id);
  const replay = await post({ ...valid, submission_id: firstId }); // a retried request, minutes later
  assert.equal(replay.status, 200);
  assert.equal(crm.inserts.length, before + 1);
});

await check("'Create another' with identical values is a new request", async () => {
  const before = crm.inserts.length;
  assert.equal((await post({ ...valid, submission_id: newId() })).status, 201);
  assert.equal(crm.inserts.length, before + 1);
});

await check("CRM rejection sends nothing and the same request can be retried", async () => {
  const id = newId();
  const before = crm.inserts.length;
  crm.script.push("invalid");
  const rejected = await post({ ...valid, listing_address: "9 Rejected Rd", submission_id: id });
  assert.equal(rejected.status, 502);
  assert.equal(rejected.body.code, "crm_rejected");
  assert.equal(crm.inserts.length, before);
  const retried = await post({ ...valid, listing_address: "9 Rejected Rd", submission_id: id });
  assert.equal(retried.status, 201);
  assert.equal(crm.inserts.length, before + 1);
});

await check("an expired access token is refreshed once", async () => {
  const tokens = crm.tokens;
  crm.script.push("expired");
  assert.equal((await post({ ...valid, listing_address: "7 Token Ave", submission_id: newId() })).status, 201);
  assert.equal(crm.tokens, tokens + 1);
});

let lostRecord;
await check("a lost answer is uncertain; retries wait for Zoho to settle, then find the record", async () => {
  const id = newId();
  crm.script.push("lost");
  const lost = await post({ ...valid, listing_address: "5 Lost Way", submission_id: id });
  assert.equal(lost.status, 504);
  assert.equal(lost.body.code, "uncertain");
  lostRecord = crm.records[0].id;
  const count = crm.inserts.length;
  const early = await post({ ...valid, listing_address: "5 Lost Way", submission_id: id, retry: true });
  assert.equal(early.status, 504, "too soon: Zoho may still be committing");
  clockOffset += SETTLE;
  // Even with an edited field the retry stays the first request (the browser locks the form).
  const retry = await post({ ...valid, listing_address: "5 Lost Way", ad_budget: "$200", submission_id: id, retry: true });
  assert.equal(retry.status, 201);
  assert.equal(retry.body.record_id, lostRecord); // matched although Campaign_Type reads back as its label
  assert.equal(crm.inserts.length, count);
});

await check("a retry is never answered with a different request's record", async () => {
  const count = crm.inserts.length;
  // Same listing, different budget; the first send never reached Zoho.
  const other = newId();
  crm.script.push("dropped");
  assert.equal((await post({ ...valid, listing_address: "5 Lost Way", ad_budget: "$50", submission_id: other })).status, 504);
  clockOffset += SETTLE;
  const otherRetry = await post({ ...valid, listing_address: "5 Lost Way", ad_budget: "$50", submission_id: other, retry: true });
  assert.equal(otherRetry.status, 201);
  assert.notEqual(otherRetry.body.record_id, lostRecord);
  // 'Create another' with identical values whose send was dropped: the earlier identical record is taken.
  const again = newId();
  crm.script.push("dropped");
  assert.equal((await post({ ...valid, listing_address: "5 Lost Way", submission_id: again })).status, 504);
  clockOffset += SETTLE;
  const againRetry = await post({ ...valid, listing_address: "5 Lost Way", submission_id: again, retry: true });
  assert.equal(againRetry.status, 201);
  assert.notEqual(againRetry.body.record_id, lostRecord);
  assert.equal(crm.inserts.length, count + 2);
});

await check("after a restart, the browser's retry flag still finds an unanswered record", async () => {
  const id = newId();
  crm.script.push("lost");
  assert.equal((await post({ ...valid, listing_address: "6 Restart Rd", submission_id: id })).status, 504);
  const stored = crm.records[0].id;
  const count = crm.inserts.length;
  const route = await restartedRoute();
  const r = await post({ ...valid, listing_address: "6 Restart Rd", submission_id: id, retry: true }, { route });
  assert.equal(r.status, 201);
  assert.equal(r.body.record_id, stored);
  assert.equal(crm.inserts.length, count);
});

console.log(`listing-ad submission boundary: ${passed} checks passed`);
