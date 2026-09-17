import type { APIRoute } from "astro";
import { applySubscriptionEvent, fulfil } from "../../lib/site-order-fulfil";
import { retrieveCheckoutSession, retrieveSubscription, verifyWebhookSignature, type StripeEvent } from "../../lib/stripe";

export const prerender = false;

// Stripe -> app. Open in the middleware (no session cookie); the signature is the
// gate. Events for other Supersonic checkouts (payment links, invoices) reach this
// endpoint too and are ignored unless the object carries our order metadata.
// Nothing here trusts the event body for money: fulfil() re-reads the session
// from Stripe and derives hosting state from the fetched subscription.

const OURS = "supersonicrealtors";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function handle(event: StripeEvent) {
  const object = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const orderId = String(object.client_reference_id ?? object.metadata?.order_id ?? "");
      if (object.metadata?.service !== OURS || !orderId) return "ignored";
      if (object.payment_status !== "paid") return "unpaid";
      const session = await retrieveCheckoutSession(String(object.id)); // fresh, with line items and subscription
      const order = await fulfil(orderId, { session, eventId: event.id, by: "stripe" });
      return order.state;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return "noted"; // the draft expires lazily and the route is released
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.finalization_failed":
    case "invoice.payment_action_required": {
      const subscriptionId = String(object.subscription ?? object.parent?.subscription_details?.subscription ?? "");
      if (!subscriptionId) return "ignored";
      const sub = await retrieveSubscription(subscriptionId);
      if (sub.metadata?.service !== OURS || !sub.metadata?.order_id) return "ignored";
      await applySubscriptionEvent(sub.metadata.order_id, sub, event.id);
      return "applied";
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end": {
      if (object.metadata?.service !== OURS || !object.metadata?.order_id) return "ignored";
      const sub = await retrieveSubscription(String(object.id)); // the fetched truth, not the event snapshot
      await applySubscriptionEvent(String(object.metadata.order_id), sub, event.id);
      return "applied";
    }
    default:
      return "ignored";
  }
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("stripe-signature"))) {
    return json(400, { error: "invalid signature" });
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
    if (!event?.id || !event?.type || !event?.data?.object) throw new Error("shape");
  } catch {
    return json(400, { error: "invalid payload" });
  }
  try {
    const result = await handle(event);
    console.log(`[stripe-webhook] ${event.type} ${event.id}: ${result}`);
    return json(200, { received: true, result });
  } catch (error) {
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, error instanceof Error ? error.message : error);
    return json(500, { received: false }); // Stripe retries
  }
};
