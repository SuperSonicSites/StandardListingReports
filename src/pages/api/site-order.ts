import type { APIRoute } from "astro";
import { appUrl, canAccessClient, sessionEmail } from "../../lib/auth";
import { withLock } from "../../lib/site-order-fulfil";
import { normalizeSiteOrder, validateSiteOrder, TERMS_VERSION } from "../../lib/site-orders";
import { createCheckoutSession, createCustomer, listingSitesEnabled, resolvePrices, StripeError, unixToIso } from "../../lib/stripe";
import { createOrderId, listOrders, readClient, readOrder, writeClient, writeOrder } from "../../lib/storage";
import { termsHash } from "../../lib/terms-listing-websites";
import type { ClientProfile, SiteOrder } from "../../lib/types";

export const prerender = false;

// Creates a listing website order (state draft) and its Stripe Checkout Session, or
// resumes payment for an existing draft. Self-guarded (see middleware): auth runs
// after the body names the client. Payment is never confirmed here; the webhook
// and the order page do that through fulfil().

const SUPPORT = "hello@supersonicsites.com";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// A draft with no Checkout Session (creation failed) holds nothing: it counts as expired.
const isExpired = (order: SiteOrder) => !order.payment.session_expires_at || Date.parse(order.payment.session_expires_at) < Date.now();

function urls(client: ClientProfile, orderId: string) {
  const base = `${appUrl()}/c/${client.slug}/orders/${orderId}`;
  return { success: `${base}?session_id={CHECKOUT_SESSION_ID}`, cancel: base };
}

async function ensureCustomer(client: ClientProfile, email: string) {
  if (client.stripe_customer_id) return client.stripe_customer_id;
  const customer = await createCustomer(client, email);
  await writeClient({ ...(await readClient(client.slug)), stripe_customer_id: customer.id }); // once, then reused forever
  console.log(`[site-order] ${client.slug}: Stripe customer created`);
  return customer.id;
}

function paymentsProblem(error: unknown) {
  if (error instanceof StripeError) {
    console.error(`[site-order] Stripe ${error.code}`);
    return json(503, { ok: false, code: "payments_unavailable", error: `Payment can’t be started right now, so nothing was ordered. Your entries are still here — try again in a minute, or email ${SUPPORT}.` });
  }
  throw error;
}

export const POST: APIRoute = async ({ request }) => {
  const email = sessionEmail(request);
  if (!email) return json(401, { ok: false, code: "signin", error: "Sign-in required." });
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
    return json(403, { ok: false, code: "forbidden", error: `This account can’t order for that team. If it should, email ${SUPPORT}.` });
  }
  if (!client.zoho_account_id || !client.portfolio_host) {
    return json(409, { ok: false, code: "not_connected", error: `Listing websites aren’t set up for ${client.name} yet. Email ${SUPPORT} and we’ll set it up.` });
  }
  if (!listingSitesEnabled()) {
    console.error("[site-order] listing websites are not enabled (LISTING_SITES_ENABLED=1 with Stripe configured).");
    return json(503, { ok: false, code: "payments_unavailable", error: `Listing websites are coming soon. Email ${SUPPORT} if you'd like to be first in line.` });
  }
  const slug = client.slug;

  // --- Resume payment for an existing draft (a second "Pay" click, or a return from a cancelled Checkout).
  if (typeof body.order_id === "string" && body.order_id) {
    const orderId = body.order_id;
    try {
      return await withLock(orderId, async () => {
        const order = await readOrder(orderId);
        if (order.client_slug !== slug) return json(403, { ok: false, code: "forbidden", error: "That order belongs to another team." });
        if (order.state === "paid") return json(200, { ok: true, paid: true, order_id: order.id, url: `${appUrl()}/c/${slug}/orders/${order.id}` });
        if (order.state !== "draft") return json(409, { ok: false, code: "closed", error: "This order is closed. Start a new one." });
        if (!isExpired(order) && order.payment.session_url) return json(200, { ok: true, order_id: order.id, url: order.payment.session_url });
        order.payment.attempts += 1;
        const session = await createCheckoutSession(order, client!, urls(client!, order.id));
        order.payment = { ...order.payment, session_id: session.id, session_url: session.url ?? "", session_expires_at: unixToIso(session.expires_at) };
        order.state = "draft";
        order.updated_at = new Date().toISOString();
        order.history.push({ at: order.updated_at, by: email, note: `checkout session ${session.id} (attempt ${order.payment.attempts})` });
        await writeOrder(order);
        return json(200, { ok: true, order_id: order.id, url: session.url });
      });
    } catch (error) {
      if (error instanceof StripeError) return paymentsProblem(error);
      return json(404, { ok: false, code: "not_found", error: "That order doesn’t exist." });
    }
  }

  // --- New order.
  const input = normalizeSiteOrder(body);
  const errors = validateSiteOrder(input);
  if (Object.keys(errors).length) return json(400, { ok: false, code: "invalid", error: "Some fields need a fix.", fields: errors });

  try {
    await resolvePrices(); // fail early and clearly if Stripe isn't ready
  } catch (error) {
    return paymentsProblem(error);
  }

  return withLock(`client:${slug}`, async () => {
    // Lazy expiry: a draft whose Checkout Session lapsed frees its route.
    const orders = await listOrders(slug);
    for (const other of orders) {
      if (other.state === "draft" && isExpired(other)) {
        other.state = "expired";
        other.updated_at = new Date().toISOString();
        other.history.push({ at: other.updated_at, by: "app", note: "checkout expired; route released" });
        await writeOrder(other);
      }
    }
    if (orders.some((other) => other.route === input.route && (other.state === "paid" || (other.state === "draft" && !isExpired(other))))) {
      return json(400, { ok: false, code: "invalid", error: "Some fields need a fix.", fields: { route: "That page address is already taken on your portfolio. Choose another." } });
    }

    const nowIso = new Date().toISOString();
    const { package: pkg, route, terms_accepted: _accepted, ...intake } = input;
    const order: SiteOrder = {
      id: createOrderId(),
      client_slug: slug,
      purchaser_email: email,
      package: pkg,
      route,
      page_url: `https://${client!.portfolio_host}/${route}`,
      state: "draft",
      created_at: nowIso,
      updated_at: nowIso,
      intake,
      agreement: { terms_version: TERMS_VERSION, terms_hash: termsHash(), accepted_at: nowIso },
      payment: { provider: "stripe", customer_id: "", session_id: "", session_url: "", session_expires_at: "", attempts: 1, payment_intent: "", invoice: "", amount_total: 0, currency: "cad", paid_at: "", event_id: "" },
      hosting: { subscription_id: "", status: "", current_period_end: "", trial_end: "", cancel_at_period_end: false, ended_at: "" },
      fulfillment: { paid_recorded_at: "", crm_record_id: "", crm_error: "", email_message_id: "", email_error: "" },
      history: [{ at: nowIso, by: email, note: "draft created; terms accepted" }]
    };

    try {
      order.payment.customer_id = await ensureCustomer(client!, email);
      await writeOrder(order); // the route is reserved from here
      const session = await createCheckoutSession(order, client!, urls(client!, order.id));
      order.payment = { ...order.payment, session_id: session.id, session_url: session.url ?? "", session_expires_at: unixToIso(session.expires_at) };
      order.history.push({ at: new Date().toISOString(), by: email, note: `checkout session ${session.id} (attempt 1)` });
      await writeOrder(order);
      console.log(`[site-order] ${slug}: order ${order.id} draft, route /${route}`);
      return json(201, { ok: true, order_id: order.id, url: session.url });
    } catch (error) {
      // No session, no reservation: the draft is closed so the route is free again.
      order.state = "expired";
      order.history.push({ at: new Date().toISOString(), by: "app", note: "checkout could not be started; draft closed" });
      await writeOrder(order).catch(() => undefined);
      return paymentsProblem(error);
    }
  });
};
