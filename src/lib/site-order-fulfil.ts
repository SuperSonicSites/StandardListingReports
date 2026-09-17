// Fulfilment of a paid listing website order: one routine, idempotent, called by
// the Stripe webhook, by the order page when the client returns from Checkout,
// and by the admin retry button. Runs under a per-order lock and walks a
// persisted step ladder (verify -> record paid -> CRM record -> email); a step
// whose result is already on the order file is skipped.
// ponytail: in-process locks — correct for the single Railway instance this app
// runs as; a second instance would need a real store first.
import { appUrl, isValidEmail, normalizeEmail } from "./auth";
import { escapeHtml, sendMail } from "./mail";
import { retrieveCheckoutSession, retrieveSubscription, resolvePrices, unixToIso, type CheckoutSession, type Subscription } from "./stripe";
import { readClient, readOrder, writeOrder } from "./storage";
import type { ClientProfile, SiteOrder } from "./types";
import { createRecord, zohoConfigured } from "./zoho";

const CRM_MODULE = "Listing_Websites";
const PROMPT_VERSION = "2026.09.3";

const locks = new Map<string, Promise<unknown>>();

/** Serialises work per key (an order id, or "client:<slug>" for route reservations). */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

const now = () => new Date().toISOString();

function note(order: SiteOrder, by: string, text: string) {
  order.history.push({ at: now(), by, note: text });
  order.updated_at = now();
}

// Zoho wants yyyy-MM-ddTHH:mm:ss+00:00, no milliseconds.
const zohoDateTime = (iso: string) => (iso ? iso.replace(/\.\d{3}Z$/, "+00:00") : undefined);
const zohoDate = (iso: string) => (iso ? iso.slice(0, 10) : undefined);
const num = (value: string) => (value === "" ? undefined : Number(value));

export function toCrmRecord(order: SiteOrder, client: ClientProfile) {
  const i = order.intake;
  const name = `${i.property_address} · ${order.route}`.slice(0, 120);
  return {
    Name: name,
    Order_ID: order.id,
    Brokerage: { id: client.zoho_account_id },
    Email: order.purchaser_email,
    Package: order.package === "project" ? "Project" : "Single Listing",
    Route: order.route,
    Page_URL: order.page_url,
    Listing_Count: i.listings.length,
    Prompt_Version: PROMPT_VERSION,
    Property_Address: i.property_address,
    Property_Type: i.property_type,
    Source_URL: i.source_url || undefined,
    Photos_Link: i.photos_url,
    Video_URL: i.video_url || undefined,
    Hero_Preference: i.hero_preference,
    Selling_Points: i.selling_points,
    Client_Notes: i.client_notes,
    Target_Date: i.target_date || undefined,
    Agent_Name: i.agent_name,
    Agent_Email: i.agent_email,
    Agent_Phone: i.agent_phone,
    Terms_Version: order.agreement.terms_version,
    Terms_Hash: order.agreement.terms_hash,
    Accepted_At: zohoDateTime(order.agreement.accepted_at),
    Stripe_Session: order.payment.session_id,
    Stripe_Subscription: order.hosting.subscription_id,
    Stripe_Payment_Intent: order.payment.payment_intent || order.payment.invoice,
    Amount_Paid: order.payment.amount_total / 100,
    Paid_At: zohoDateTime(order.payment.paid_at),
    Hosting_Status: hostingLabel(order.hosting.status),
    Hosting_Period_End: zohoDate(order.hosting.current_period_end),
    Cancel_At_Period_End: order.hosting.cancel_at_period_end,
    Stage: "New Order",
    Page_Status: "Active",
    Notes_Value: `Ordered through supersonicrealtors.com by ${order.purchaser_email}.`,
    Next_Step: firstStep(order),
    Listings: i.listings.map((row) => ({
      Unit_Name: row.unit_name || i.property_address.slice(0, 60),
      MLS_Number: row.mls_number || undefined,
      Realtor_Stats: row.realtor_stats_url || undefined,
      Listing_Price: num(row.price),
      Beds: num(row.beds),
      Baths: num(row.baths),
      Area: num(row.area),
      Listing_Status: "Active",
      Photos_Subfolder: row.photos_subfolder || undefined,
      Floor_Plan_Link: row.floor_plan_link || undefined,
      Plan_Name: row.plan_name || undefined
    }))
  };
}

// The first "Next Step" card on the CRM record: what to do now, a line, then the
// prompt to copy into ChatGPT, pre-filled with the record's values so the producer
// types nothing. Later cards are fixed texts set by the Blueprint buttons
// (docs/listing-service/runbook-crm-blueprint.md); keep the wording in step.
function firstStep(order: SiteOrder) {
  const i = order.intake;
  const or = (v: string | undefined, fallback = "none") => (v && v.trim()) || fallback;
  const rows =
    i.listings.length > 1
      ? [
          "Listings:",
          ...i.listings.map(
            (r) =>
              `- ${or(r.unit_name, "?")}: MLS ${or(r.mls_number, "?")}, price ${or(r.price, "?")}, ${or(r.beds, "?")} beds, ${or(r.baths, "?")} baths, ${or(r.area, "?")} sq ft, plan ${or(r.plan_name, "-")}, photos ${or(r.photos_subfolder, "-")}, floor plan ${or(r.floor_plan_link, "-")}`
          )
        ]
      : [];
  return [
    "NOW",
    "1. Open Photos Link on this record. Download all the photos and files.",
    "2. Attach them to this record (Attachments, at the bottom).",
    "3. In ChatGPT, start a new Work chat on the client's portfolio folder (not inside a shared Project). Name it with the address.",
    "4. Copy everything below the line into the chat. Attach the photos. Send.",
    "5. ChatGPT gives a fact sheet and a list of what is missing. Missing something? Click Ask the client. All good? Click Build.",
    "----------",
    "@listing-brief",
    `Order: ${order.id}`,
    `Property: ${i.property_address} (${or(i.property_type)})`,
    `Route: ${order.route}`,
    `Listing page: ${or(i.source_url)}`,
    `Video: ${or(i.video_url)}`,
    `Hero photo wish: ${or(i.hero_preference)}`,
    `Selling points: ${or(i.selling_points)}`,
    `Client notes: ${or(i.client_notes)}`,
    `Agent: ${i.agent_name}, ${i.agent_email}, ${i.agent_phone}`,
    `Target date: ${or(i.target_date)}`,
    ...rows,
    "Make the brief from these details and the attached photos and files. Give me the fact sheet and the list of missing items."
  ].join("\n");
}

// Stripe subscription status -> the CRM picklist. "trialing" is the included first year.
function hostingLabel(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return "Active";
    case "past_due":
      return "Past Due";
    case "unpaid":
      return "Unpaid";
    case "canceled":
      return "Cancelled";
    case "incomplete":
    case "incomplete_expired":
      return "Incomplete";
    default:
      return undefined;
  }
}

export function applySubscription(order: SiteOrder, sub: Subscription) {
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  order.hosting = {
    subscription_id: sub.id,
    status: sub.status,
    current_period_end: unixToIso(periodEnd),
    trial_end: unixToIso(sub.trial_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    ended_at: unixToIso(sub.ended_at)
  };
}

/** Verifies a Checkout Session against the order. Returns a reason when it must not be fulfilled. */
export async function verifySession(order: SiteOrder, session: CheckoutSession): Promise<string | null> {
  if (order.payment.session_id && session.id !== order.payment.session_id) return "session does not belong to this order";
  if (session.client_reference_id !== order.id || session.metadata?.order_id !== order.id) return "order id mismatch";
  if (session.payment_status !== "paid") return `payment status is ${session.payment_status}`;
  if ((session.currency ?? "cad").toLowerCase() !== "cad") return `unexpected currency ${session.currency}`;
  if (session.line_items) {
    const prices = await resolvePrices();
    const allowed = new Set([prices.production.id, prices.hosting.id]);
    const ids = session.line_items.data.map((item) => item.price?.id ?? "");
    if (ids.length !== 2 || !ids.every((id) => allowed.has(id))) return "line items do not match the listing website prices";
  }
  return null;
}

// The Supersonic voice: short, warm, one emoji, "PS:", the standing sign-off. The
// CRM templates for the later stages follow the same shape (docs/listing-service).
function orderEmail(order: SiteOrder, _client: ClientProfile) {
  const terms = `${appUrl()}/terms/listing-websites`;
  const address = order.intake.property_address;
  const greeting = order.intake.agent_name ? `Hi ${order.intake.agent_name},` : "Hi there,";
  const paragraphs = [
    greeting,
    `We've got your order! Our team is now crafting your listing website for ${address}. 💥`,
    `Your page will live at:\n${order.page_url}`,
    `Here is how it goes from here:\n1. We build the page from your details and your photo folder.\n2. You get a private review link by email, with a feedback button for changes.\n3. You approve, and we launch it on your portfolio. We aim to publish within 7 days once we have everything.`,
    `Billing: $599 today for the page. Hosting is $99 per year, and your first year is on us, so the first hosting charge is one year from today. Taxes as shown on your Stripe receipt.`,
    `PS: Your order reference is ${order.id}. The terms you accepted (v${order.agreement.terms_version}) are here -> ${terms}`,
    `If you have any questions in the meantime, please let us know.`,
    `Have a super wonderful day!`,
    `Renaud Gagne\nProject Manager\nsupersonicsites.com\n1-888-321-BOOM`
  ];
  const text = paragraphs.join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6">
${paragraphs
  .map((p) => {
    const safe = escapeHtml(p).replace(/\n/g, "<br>");
    return `<p style="margin:0 0 16px">${safe.replace(escapeHtml(order.page_url), `<a href="${escapeHtml(order.page_url)}" style="color:#0b5fd7">${escapeHtml(order.page_url)}</a>`).replace(escapeHtml(terms), `<a href="${escapeHtml(terms)}" style="color:#0b5fd7">${escapeHtml(terms)}</a>`)}</p>`;
  })
  .join("\n")}
</body></html>`;
  return { subject: `Your listing website for ${address} is in production! 💥`, text, html };
}

function recipients(order: SiteOrder, client: ClientProfile) {
  const all = [order.purchaser_email, ...(client.emails ?? [])].map(normalizeEmail).filter(isValidEmail); // "@domain" rules are skipped
  return [...new Set(all)];
}

export type FulfilOptions = { session?: CheckoutSession; eventId?: string; by?: string };

/**
 * Marks the order paid (after verifying the Checkout Session), then files the CRM
 * record and sends the confirmation, recording each result so a retry only does
 * what is still missing. Returns the order as it stands; look at `state` and
 * `fulfillment` to see how far it got.
 */
export async function fulfil(orderId: string, opts: FulfilOptions = {}): Promise<SiteOrder> {
  return withLock(orderId, async () => {
    const order = await readOrder(orderId);
    const by = opts.by ?? "app";

    if (order.state === "draft") {
      if (!order.payment.session_id && !opts.session) return order;
      const session = opts.session ?? (await retrieveCheckoutSession(order.payment.session_id));
      const reason = await verifySession(order, session);
      if (reason) {
        console.log(`[site-order] ${order.id}: not fulfilled (${reason})`);
        return order;
      }
      const sub =
        session.subscription && typeof session.subscription === "object"
          ? session.subscription
          : session.subscription
            ? await retrieveSubscription(session.subscription)
            : null;
      order.state = "paid";
      order.payment = {
        ...order.payment,
        session_id: session.id,
        customer_id: session.customer ?? order.payment.customer_id,
        invoice: session.invoice ?? "",
        amount_total: session.amount_total ?? 0,
        currency: (session.currency ?? "cad").toLowerCase(),
        paid_at: now(),
        event_id: opts.eventId ?? ""
      };
      if (sub) applySubscription(order, sub);
      order.fulfillment.paid_recorded_at = now();
      note(order, by, `paid (session ${session.id}${opts.eventId ? `, event ${opts.eventId}` : ""})`);
      await writeOrder(order); // persisted before anything external happens
      console.log(`[site-order] ${order.id}: paid`);
    }

    if (order.state !== "paid") return order;
    const client = await readClient(order.client_slug);

    if (!order.fulfillment.crm_record_id) {
      if (!zohoConfigured() || !client.zoho_account_id) {
        order.fulfillment.crm_error = "CRM not configured";
      } else {
        const outcome = await createRecord(CRM_MODULE, toCrmRecord(order, client));
        if (outcome.kind === "created") {
          order.fulfillment.crm_record_id = outcome.id;
          order.fulfillment.crm_error = "";
          note(order, by, `CRM record ${outcome.id}`);
        } else if (outcome.kind === "rejected" && outcome.code === "DUPLICATE_DATA" && outcome.duplicateId) {
          order.fulfillment.crm_record_id = outcome.duplicateId; // an earlier attempt landed
          order.fulfillment.crm_error = "";
          note(order, by, `CRM record ${outcome.duplicateId} (recovered)`);
        } else {
          order.fulfillment.crm_error = outcome.kind === "rejected" ? `${outcome.code}${outcome.field ? ` (${outcome.field})` : ""}` : "no answer from CRM";
          note(order, by, `CRM failed: ${order.fulfillment.crm_error}`);
        }
      }
      await writeOrder(order);
    }

    if (!order.fulfillment.email_message_id) {
      try {
        const { id } = await sendMail({ to: recipients(order, client), ...orderEmail(order, client) });
        order.fulfillment.email_message_id = id || "sent";
        order.fulfillment.email_error = "";
        note(order, by, "confirmation email sent");
      } catch (error) {
        order.fulfillment.email_error = error instanceof Error ? error.message.slice(0, 200) : "send failed";
        note(order, by, `email failed: ${order.fulfillment.email_error}`);
      }
      await writeOrder(order);
    }

    return order;
  });
}

/** Stores the current subscription state on the order (hosting events, out of order safe). */
export async function applySubscriptionEvent(orderId: string, sub: Subscription, eventId: string, by = "stripe") {
  return withLock(orderId, async () => {
    const order = await readOrder(orderId);
    if (order.history.some((h) => h.note.includes(`event ${eventId}`))) return order; // already applied
    applySubscription(order, sub);
    note(order, by, `hosting ${sub.status} (event ${eventId})`);
    await writeOrder(order);
    return order;
  });
}

/** Everything a paid order still needs; empty when fulfilment is complete. */
export function pendingOperations(order: SiteOrder): string[] {
  if (order.state !== "paid") return [];
  const pending: string[] = [];
  if (!order.fulfillment.crm_record_id) pending.push(`CRM record${order.fulfillment.crm_error ? `: ${order.fulfillment.crm_error}` : ""}`);
  if (!order.fulfillment.email_message_id) pending.push(`confirmation email${order.fulfillment.email_error ? `: ${order.fulfillment.email_error}` : ""}`);
  return pending;
}
