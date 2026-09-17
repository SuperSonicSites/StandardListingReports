// Stripe, server-side only, plain fetch (form-encoded like the API expects).
// STRIPE_SECRET_KEY is a restricted key (checkout sessions write, customers write,
// prices read, subscriptions read). STRIPE_WEBHOOK_SECRET signs the webhook.
// Neither ever reaches the browser or a log line; logs carry HTTP status only.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ClientProfile, SiteOrder } from "./types";

const API = "https://api.stripe.com";
const TIMEOUT_MS = 15_000;
const PRICE_CACHE_MS = 10 * 60_000;
export const LOOKUP_KEYS = { production: "listing_website_production_cad", hosting: "listing_website_hosting_cad" } as const;
// First year of hosting is included in the production price: the $99 subscription
// starts today with a one-year trial and first charges on the anniversary.
export const HOSTING_TRIAL_DAYS = 365;

function env(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET"): string | undefined {
  const value = (process.env[name] ?? import.meta.env[name])?.trim();
  return value || undefined;
}

export function stripeConfigured() {
  return Boolean(env("STRIPE_SECRET_KEY"));
}

// The website service ships dark: until LISTING_SITES_ENABLED=1 is set on the server
// (and Stripe is configured) the portal shows a "Coming soon" card and the order page
// and route refuse. Flipping it on is a config change, not a deploy.
export function listingSitesEnabled() {
  const flag = (process.env.LISTING_SITES_ENABLED ?? import.meta.env.LISTING_SITES_ENABLED)?.trim();
  return stripeConfigured() && flag === "1";
}

console.log(`[stripe] STRIPE_SECRET_KEY is ${env("STRIPE_SECRET_KEY") ? "set" : "NOT set — listing website orders are unavailable"}`);
console.log(`[stripe] listing websites are ${listingSitesEnabled() ? "ENABLED" : "coming soon (set LISTING_SITES_ENABLED=1 with Stripe configured to open ordering)"}`);
console.log(`[stripe] STRIPE_WEBHOOK_SECRET is ${env("STRIPE_WEBHOOK_SECRET") ? "set" : "NOT set — webhook events will be rejected"}`);

type Params = Record<string, unknown>;

// {a:{b:1}, c:[x,y]} -> a[b]=1&c[0]=x&c[1]=y (Stripe's nested form encoding).
function flatten(value: unknown, prefix: string, out: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
  else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Params)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else out.append(prefix, String(value));
}

export function encodeForm(params: Params) {
  const out = new URLSearchParams();
  flatten(params, "", out);
  return out;
}

// Plain fields (not parameter properties): the check script runs this file through
// Node's type stripping, which only removes types.
export class StripeError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T = Record<string, any>>(method: "GET" | "POST", path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new StripeError(0, "not_configured", "STRIPE_SECRET_KEY is not set");
  const encoded = encodeForm(params);
  const url = method === "GET" && encoded.size ? `${API}${path}?${encoded}` : `${API}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: method === "POST" ? encoded : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new StripeError(0, "no_response", `Stripe ${method} ${path}: no response`);
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    const code = String(body.error?.code ?? body.error?.type ?? `HTTP_${response.status}`);
    // Stripe's message names the misconfiguration (a missing tax address, a bad price); it carries no card data.
    console.error(`[stripe] ${method} ${path}: HTTP ${response.status} ${code}: ${String(body.error?.message ?? "").slice(0, 200)}`);
    throw new StripeError(response.status, code, String(body.error?.message ?? "Stripe request failed"));
  }
  return body as T;
}

export type Price = { id: string; unit_amount: number; currency: string; lookup_key: string; recurring: { interval: string } | null };
let priceCache: { at: number; prices: { production: Price; hosting: Price } } | undefined;

/** The two prices, found by lookup key (same keys in test and live). Cached briefly. */
export async function resolvePrices(force = false) {
  if (!force && priceCache && Date.now() - priceCache.at < PRICE_CACHE_MS) return priceCache.prices;
  const body = await call<{ data: Price[] }>("GET", "/v1/prices", { active: true, lookup_keys: [LOOKUP_KEYS.production, LOOKUP_KEYS.hosting], limit: 10 });
  const production = body.data.find((p) => p.lookup_key === LOOKUP_KEYS.production);
  const hosting = body.data.find((p) => p.lookup_key === LOOKUP_KEYS.hosting);
  if (!production || !hosting) throw new StripeError(0, "prices_missing", "Listing website prices are not set up in Stripe (lookup keys).");
  priceCache = { at: Date.now(), prices: { production, hosting } };
  return priceCache.prices;
}

export async function createCustomer(client: ClientProfile, email: string) {
  return call<{ id: string }>("POST", "/v1/customers", {
    name: client.name,
    email,
    metadata: { client_slug: client.slug, crm_account_id: client.zoho_account_id ?? "", service: "supersonicrealtors" }
  });
}

export type CheckoutSession = {
  id: string;
  url: string | null;
  status: string;
  payment_status: string;
  expires_at: number;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | Subscription | null;
  invoice: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
  line_items?: { data: { price: { id: string } | null; quantity: number | null }[] };
};

export type Subscription = {
  id: string;
  status: string;
  current_period_end: number | null;
  trial_end: number | null;
  cancel_at_period_end: boolean;
  ended_at: number | null;
  latest_invoice: string | null;
  metadata: Record<string, string>;
  items?: { data: { current_period_end?: number }[] };
};

export async function createCheckoutSession(order: SiteOrder, client: ClientProfile, urls: { success: string; cancel: string }) {
  const prices = await resolvePrices();
  const memo = `LISTING MICRO-SITE: ${order.intake.property_address}`.slice(0, 500);
  return call<CheckoutSession>(
    "POST",
    "/v1/checkout/sessions",
    {
      mode: "subscription",
      customer: order.payment.customer_id,
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      line_items: [
        { price: prices.hosting.id, quantity: 1 },
        { price: prices.production.id, quantity: 1 }
      ],
      client_reference_id: order.id,
      metadata: {
        service: "supersonicrealtors",
        order_id: order.id,
        client_slug: client.slug,
        route: order.route,
        terms_version: order.agreement.terms_version,
        terms_hash: order.agreement.terms_hash,
        accepted_at: order.agreement.accepted_at,
        purchaser_email: order.purchaser_email
      },
      subscription_data: {
        trial_period_days: HOSTING_TRIAL_DAYS,
        description: memo,
        metadata: { service: "supersonicrealtors", order_id: order.id, client_slug: client.slug, route: order.route }
      },
      success_url: urls.success,
      cancel_url: urls.cancel,
      locale: "en"
    },
    `${order.id}:${order.payment.attempts}`
  );
}

export async function retrieveCheckoutSession(sessionId: string) {
  return call<CheckoutSession>("GET", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { expand: ["line_items", "subscription"] });
}

export async function retrieveSubscription(subscriptionId: string) {
  return call<Subscription>("GET", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export type StripeEvent = { id: string; type: string; livemode: boolean; created: number; data: { object: Record<string, any> } };

/**
 * Stripe-Signature: t=<unix>,v1=<hex hmac of "<t>.<raw body>">. Rejects stale
 * timestamps (5 min) and anything not signed with STRIPE_WEBHOOK_SECRET.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, now = Date.now()): boolean {
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const i = part.indexOf("=");
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    })
  ) as Record<string, string>;
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const given = header
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return given.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

/** Test helper and Stripe-CLI stand-in: sign a payload the way Stripe does. */
export function signWebhookPayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

export const unixToIso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : "");
