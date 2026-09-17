// Integration check for listing website orders against a fake Stripe, a fake Zoho
// CRM and a fake Resend (no network):
//   npm run check:site-order
// Covers: access control, validation, route reservation and lazy expiry, Checkout
// creation against the client's Customer, resuming payment, webhook signature,
// idempotent fulfilment (webhook + return page), CRM duplicate recovery, and
// hosting events applied from the fetched subscription.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
const work = mkdtempSync(path.join(tmpdir(), "site-order-check-"));
mkdirSync(path.join(work, "data", "clients"), { recursive: true });
function writeClient(slug, extra) {
  const profile = { slug, name: `Team ${slug}`, logo_url: "data:,", brand_primary: "#111111", brand_accent: "#222222", footer_text: "", brokerage_name: "", brokerage_address: "", brokerage_contact: "", emails: ["coordinator@example.com", "@team-a.test"], ...extra };
  writeFileSync(path.join(work, "data", "clients", `${slug}.json`), JSON.stringify(profile));
}
writeClient("team-a", { zoho_account_id: "3201000000000001", portfolio_host: "portfolio.team-a.test" });
writeClient("team-b", { zoho_account_id: "3201000000000002" }); // no portfolio yet
process.chdir(work);

Object.assign(process.env, {
  AUTH_SECRET: "check-secret",
  APP_URL: "https://app.test",
  ADMIN_EMAILS: "admin@example.com",
  client_id: "fake-id",
  client_secret: "fake-secret",
  refresh_token: "fake-refresh",
  api_domain: "https://crm.test",
  STRIPE_SECRET_KEY: "rk_test_fake",
  LISTING_SITES_ENABLED: "1",
  STRIPE_WEBHOOK_SECRET: "whsec_fake",
  RESEND_API_KEY: "re_fake"
});
globalThis.__ASTRO_ENV__ = { DEV: false };

// ---- Fakes ----
const PRICES = { production: "price_prod_fake", hosting: "price_host_fake" };
const stripe = { sessions: {}, customers: 0, sessionCount: 0, subs: {} };
const crm = { inserts: [], script: [] };
const mail = { sent: [] };
const nowSec = () => Math.floor(Date.now() / 1000);

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = init.method ?? "GET";
  if (url === "https://accounts.zohocloud.ca/oauth/v2/token") return Response.json({ access_token: "token", api_domain: "https://crm.test", expires_in: 3600 });
  if (url === "https://crm.test/crm/v8/Listing_Websites" && method === "POST") {
    const sent = JSON.parse(init.body).data[0];
    const behaviour = crm.script.shift() ?? "ok";
    if (behaviour === "duplicate") {
      return Response.json({ data: [{ code: "DUPLICATE_DATA", details: { api_name: "Order_ID", duplicate_record: { id: "3201000009999999" } }, status: "error" }] }, { status: 400 });
    }
    if (behaviour === "lost") throw new TypeError("fetch failed");
    crm.inserts.push(sent);
    return Response.json({ data: [{ code: "SUCCESS", details: { id: String(3201000009000000n + BigInt(crm.inserts.length)) }, status: "success" }] }, { status: 201 });
  }
  if (url === "https://api.resend.com/emails" && method === "POST") {
    mail.sent.push(JSON.parse(init.body));
    return Response.json({ id: `email_${mail.sent.length}` });
  }
  if (url.startsWith("https://api.stripe.com/")) {
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer rk_test_fake");
    const u = new URL(url);
    if (u.pathname === "/v1/prices") {
      return Response.json({ data: [
        { id: PRICES.production, unit_amount: 59900, currency: "cad", lookup_key: "listing_website_production_cad", recurring: null },
        { id: PRICES.hosting, unit_amount: 9900, currency: "cad", lookup_key: "listing_website_hosting_cad", recurring: { interval: "year" } }
      ] });
    }
    if (u.pathname === "/v1/customers" && method === "POST") {
      stripe.customers += 1;
      return Response.json({ id: `cus_fake_${stripe.customers}` });
    }
    if (u.pathname === "/v1/checkout/sessions" && method === "POST") {
      const params = new URLSearchParams(init.body);
      stripe.sessionCount += 1;
      const id = `cs_test_${stripe.sessionCount}`;
      const session = {
        id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_status: "unpaid", expires_at: nowSec() + 86400,
        client_reference_id: params.get("client_reference_id"), customer: params.get("customer"), subscription: null, invoice: null,
        amount_total: 59900, currency: "cad", metadata: { service: params.get("metadata[service]"), order_id: params.get("metadata[order_id]") },
        params: Object.fromEntries(params), idempotency: new Headers(init.headers).get("idempotency-key")
      };
      stripe.sessions[id] = session;
      return Response.json(session);
    }
    const sessionMatch = u.pathname.match(/^\/v1\/checkout\/sessions\/(cs_test_\d+)$/);
    if (sessionMatch && method === "GET") {
      const s = stripe.sessions[sessionMatch[1]];
      if (!s) return Response.json({ error: { code: "resource_missing", message: "No such session" } }, { status: 404 });
      const sub = s.subscription ? stripe.subs[s.subscription] : null;
      return Response.json({ ...s, subscription: sub, line_items: { data: [{ price: { id: PRICES.hosting }, quantity: 1 }, { price: { id: PRICES.production }, quantity: 1 }] } });
    }
    const subMatch = u.pathname.match(/^\/v1\/subscriptions\/(sub_\w+)$/);
    if (subMatch && method === "GET") return Response.json(stripe.subs[subMatch[1]]);
  }
  throw new Error(`unexpected request: ${method} ${url}`);
};

// Simulates the client paying: Stripe marks the session paid and creates the trialing subscription.
function pay(sessionId, orderId) {
  const s = stripe.sessions[sessionId];
  const subId = `sub_${sessionId.slice(8)}`;
  stripe.subs[subId] = { id: subId, status: "trialing", current_period_end: nowSec() + 365 * 86400, trial_end: nowSec() + 365 * 86400, cancel_at_period_end: false, ended_at: null, latest_invoice: "in_fake", metadata: { service: "supersonicrealtors", order_id: orderId } };
  Object.assign(s, { status: "complete", payment_status: "paid", subscription: subId, invoice: "in_fake" });
  return subId;
}

const lib = (file) => pathToFileURL(path.join(root, "src", file)).href;
const { AUTH_COOKIE, createSessionToken } = await import(lib("lib/auth.ts"));
const { signWebhookPayload } = await import(lib("lib/stripe.ts"));
const { readOrder, writeOrder, readClient } = await import(lib("lib/storage.ts"));
const { fulfil } = await import(lib("lib/site-order-fulfil.ts"));
const { POST: order } = await import(lib("pages/api/site-order.ts"));
const { POST: webhook } = await import(lib("pages/api/stripe-webhook.ts"));

async function post(body, { email = "coordinator@example.com", type = "application/json" } = {}) {
  const headers = { "Content-Type": type };
  if (email) headers.Cookie = `${AUTH_COOKIE}=${encodeURIComponent(createSessionToken(email))}`;
  const response = await order({ request: new Request("https://app.test/api/site-order", { method: "POST", headers, body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function hook(event, { secret = "whsec_fake", header } = {}) {
  const raw = JSON.stringify(event);
  const response = await webhook({ request: new Request("https://app.test/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": header ?? signWebhookPayload(raw, secret) }, body: raw }) });
  return { status: response.status, body: await response.json() };
}
const event = (type, object, id) => ({ id: id ?? `evt_${Math.random().toString(16).slice(2)}`, type, livemode: false, created: nowSec(), data: { object } });

const valid = {
  client_slug: "team-a",
  package: "single",
  property_address: "985 Academy Way Unit 208, Kelowna, BC",
  property_type: "Condo",
  photos_url: "https://www.dropbox.com/scl/fo/abc",
  agent_name: "Jane Stone",
  agent_email: "Jane@StoneSisters.com",
  agent_phone: "+1 250 555 0100",
  listings: [{ unit_name: "", mls_number: "10345678", realtor_stats_url: "https://member.realtor.ca/Reports/ListingDestination/x", price: "749,900", beds: "2", baths: "2.5", area: "1180" }],
  terms_accepted: true,
  // A browser can't choose these: both must be ignored.
  purchaser_email: "evil@example.com",
  state: "paid"
};

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

await check("unauthenticated, wrong-team, non-JSON and not-set-up requests never reach Stripe", async () => {
  assert.equal((await post(valid, { email: null })).status, 401);
  assert.equal((await post(valid, { email: "stranger@example.com" })).status, 403);
  assert.equal((await post(valid, { type: "text/plain" })).status, 415);
  assert.equal((await post({ ...valid, client_slug: "team-b" })).status, 409);
  assert.equal(stripe.sessionCount, 0);
});

await check("validation: missing address, wrong folder host, reserved route, no terms", async () => {
  const r = await post({ ...valid, property_address: "", photos_url: "https://example.com/x", route: "thank-you", terms_accepted: false });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.fields).sort(), ["photos_url", "property_address", "route", "terms_accepted"]);
  const r2 = await post({ ...valid, listings: [{ ...valid.listings[0], price: "abc" }] });
  assert.equal(r2.status, 400);
  assert.ok(r2.body.fields["listings.0.price"]);
});

let orderId, sessionId;
await check("a valid order reserves the route, creates the Customer once and answers with the Checkout URL", async () => {
  const r = await post(valid);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  orderId = r.body.order_id;
  sessionId = `cs_test_${stripe.sessionCount}`;
  assert.equal(r.body.url, `https://checkout.stripe.test/${sessionId}`);
  const saved = await readOrder(orderId);
  assert.equal(saved.state, "draft");
  assert.equal(saved.route, "985-academy-way-unit-208-kelowna-bc");
  assert.equal(saved.page_url, "https://portfolio.team-a.test/985-academy-way-unit-208-kelowna-bc");
  assert.equal(saved.purchaser_email, "coordinator@example.com");
  assert.equal(saved.intake.agent_email, "jane@stonesisters.com");
  assert.equal(saved.intake.listings[0].price, "749900");
  assert.equal(saved.agreement.terms_version, "2026.09.1");
  assert.match(saved.agreement.terms_hash, /^[0-9a-f]{64}$/);
  const s = stripe.sessions[sessionId];
  assert.equal(s.params.mode, "subscription");
  assert.equal(s.params.customer, "cus_fake_1");
  assert.equal(s.params["subscription_data[trial_period_days]"], "365");
  assert.equal(s.params["automatic_tax[enabled]"], "true");
  assert.equal(s.params["customer_update[address]"], "auto");
  assert.equal(s.params["metadata[terms_hash]"], saved.agreement.terms_hash);
  assert.equal(s.params["success_url"], `https://app.test/c/team-a/orders/${orderId}?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(s.idempotency, `${orderId}:1`);
  assert.equal((await readClient("team-a")).stripe_customer_id, "cus_fake_1", "customer id written back to the profile");
});

await check("the same route cannot be reserved twice; a second Pay click reuses the session", async () => {
  const r = await post(valid);
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.route);
  const again = await post({ client_slug: "team-a", order_id: orderId });
  assert.equal(again.status, 200);
  assert.equal(again.body.url, `https://checkout.stripe.test/${sessionId}`);
  assert.equal(stripe.sessionCount, 1);
  assert.equal(stripe.customers, 1, "no second Customer");
});

await check("webhooks: forged or missing signatures are refused, unpaid sessions are not fulfilled", async () => {
  const completed = event("checkout.session.completed", { id: sessionId, client_reference_id: orderId, metadata: { service: "supersonicrealtors", order_id: orderId }, payment_status: "unpaid" });
  assert.equal((await hook(completed, { secret: "whsec_wrong" })).status, 400);
  assert.equal((await hook(completed, { header: "" })).status, 400);
  const r = await hook(completed);
  assert.equal(r.status, 200);
  assert.equal(r.body.result, "unpaid");
  assert.equal((await readOrder(orderId)).state, "draft");
});

await check("payment: the webhook fulfils once (paid, CRM record with subform rows, one email); replay and return page are no-ops", async () => {
  pay(sessionId, orderId);
  const completed = event("checkout.session.completed", { id: sessionId, client_reference_id: orderId, metadata: { service: "supersonicrealtors", order_id: orderId }, payment_status: "paid" }, "evt_paid_1");
  const r = await hook(completed);
  assert.equal(r.status, 200);
  assert.equal(r.body.result, "paid");
  const saved = await readOrder(orderId);
  assert.equal(saved.state, "paid");
  assert.equal(saved.hosting.status, "trialing");
  assert.match(saved.hosting.trial_end, /^20\d\d-/);
  assert.equal(saved.fulfillment.crm_record_id, "3201000009000001");
  assert.equal(saved.fulfillment.email_message_id, "email_1");
  const record = crm.inserts[0];
  assert.equal(record.Order_ID, orderId);
  assert.deepEqual(record.Brokerage, { id: "3201000000000001" });
  assert.equal(record.Email, "coordinator@example.com");
  assert.equal(record.Package, "Single Listing");
  assert.equal(record.Amount_Paid, 599);
  assert.equal(record.Hosting_Status, "Active");
  assert.equal(record.Listings.length, 1);
  assert.equal(record.Listings[0].Listing_Price, 749900);
  assert.equal(record.Listings[0].Baths, 2.5);
  assert.match(record.Next_Step, /^NOW\n1\. .*\n----------\n@listing-brief\nOrder: ord-.*\nProperty: 985 Academy Way/s, "first Next Step card: steps, a line, the prompt pre-filled from the record");
  assert.deepEqual(mail.sent[0].to, ["coordinator@example.com"], "@domain access rules are not email recipients");
  assert.match(mail.sent[0].subject, /985 Academy Way/);
  assert.match(mail.sent[0].text, new RegExp(orderId), "the order reference is in the body");

  // Replay of the same event, and the return-page path: nothing happens twice.
  assert.equal((await hook(completed)).body.result, "paid");
  await fulfil(orderId, { session: JSON.parse(JSON.stringify({ ...stripe.sessions[sessionId], subscription: stripe.subs[`sub_${sessionId.slice(8)}`] })), by: "return" });
  assert.equal(crm.inserts.length, 1);
  assert.equal(mail.sent.length, 1);
  assert.equal((await post({ client_slug: "team-a", order_id: orderId })).body.paid, true);
});

await check("CRM duplicate on retry is recovered as the existing record; a lost CRM answer stays pending until retried", async () => {
  // Order 2: the CRM answer is lost on the first attempt, the retry hits DUPLICATE_DATA and recovers the id.
  const r = await post({ ...valid, property_address: "12 Main St, Kelowna", route: "main-12" });
  assert.equal(r.status, 201);
  const id2 = r.body.order_id;
  const cs2 = `cs_test_${stripe.sessionCount}`;
  pay(cs2, id2);
  crm.script.push("lost");
  await hook(event("checkout.session.completed", { id: cs2, client_reference_id: id2, metadata: { service: "supersonicrealtors", order_id: id2 }, payment_status: "paid" }));
  let saved = await readOrder(id2);
  assert.equal(saved.state, "paid");
  assert.equal(saved.fulfillment.crm_record_id, "");
  assert.match(saved.fulfillment.crm_error, /no answer/);
  assert.equal(saved.fulfillment.email_message_id, "email_2", "email still went out");
  crm.script.push("duplicate");
  await fulfil(id2, { by: "admin" });
  saved = await readOrder(id2);
  assert.equal(saved.fulfillment.crm_record_id, "3201000009999999");
  assert.equal(saved.fulfillment.crm_error, "");
  assert.equal(mail.sent.length, 2, "retry did not resend the email");
});

await check("hosting events are applied from the fetched subscription, once per event, and other checkouts are ignored", async () => {
  const subId = `sub_${sessionId.slice(8)}`;
  stripe.subs[subId].status = "past_due";
  const updated = event("customer.subscription.updated", { id: subId, object: "subscription", metadata: { service: "supersonicrealtors", order_id: orderId } }, "evt_sub_1");
  assert.equal((await hook(updated)).body.result, "applied");
  let saved = await readOrder(orderId);
  assert.equal(saved.hosting.status, "past_due");
  const before = saved.history.length;
  await hook(updated);
  assert.equal((await readOrder(orderId)).history.length, before, "replayed event ignored");
  const foreign = event("checkout.session.completed", { id: "cs_test_other", client_reference_id: null, metadata: {}, payment_status: "paid" });
  assert.equal((await hook(foreign)).body.result, "ignored");
});

await check("an expired draft releases its route", async () => {
  const r = await post({ ...valid, property_address: "44 Lake Rd", route: "lake-44" });
  assert.equal(r.status, 201);
  const stale = await readOrder(r.body.order_id);
  stale.payment.session_expires_at = new Date(Date.now() - 60_000).toISOString();
  await writeOrder(stale);
  const r2 = await post({ ...valid, property_address: "44 Lake Rd", route: "lake-44" });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.equal((await readOrder(stale.id)).state, "expired");
});

console.log(`\nall ${passed} checks passed (${work})`);
