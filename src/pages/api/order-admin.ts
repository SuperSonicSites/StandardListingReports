import type { APIRoute } from "astro";
import { isAdmin, sessionEmail } from "../../lib/auth";
import { brandedErrorPage } from "../../lib/error-page";
import { redirectWithFlash } from "../../lib/flash";
import { fulfil, pendingOperations, withLock } from "../../lib/site-order-fulfil";
import { readOrder, writeOrder } from "../../lib/storage";

export const prerender = false;

// Admin recovery panel actions (dashboard form POST): re-run fulfilment for a paid
// order whose CRM record or email is still missing, or mark an order cancelled
// after a refund done in Stripe. Agency-only; self-guarded (see middleware).

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return brandedErrorPage({ status: 401, eyebrow: "Orders", title: "Admin sign-in required.", reason: "Only Supersonic admins can act on orders.", primaryLabel: "← Back" });
  }
  const form = await request.formData();
  const orderId = String(form.get("order_id") ?? "");
  const action = String(form.get("action") ?? "");
  const by = sessionEmail(request) ?? "admin";

  try {
    if (action === "retry") {
      const order = await fulfil(orderId, { by });
      const left = pendingOperations(order);
      return redirectWithFlash("/", left.length ? `${orderId}: still pending — ${left.join("; ")}` : `${orderId}: fulfilment complete.`);
    }
    if (action === "cancel") {
      await withLock(orderId, async () => {
        const order = await readOrder(orderId);
        order.state = "cancelled";
        order.updated_at = new Date().toISOString();
        order.history.push({ at: order.updated_at, by, note: "cancelled by admin (refund handled in Stripe)" });
        await writeOrder(order);
      });
      return redirectWithFlash("/", `${orderId} marked cancelled.`);
    }
  } catch (error) {
    console.error(`[order-admin] ${action} ${orderId} failed:`, error instanceof Error ? error.message : error);
    return brandedErrorPage({ status: 500, eyebrow: "Orders", title: "That didn’t work.", reason: "The order file couldn’t be read or updated. Check the server log.", primaryLabel: "← Back" });
  }
  return brandedErrorPage({ status: 400, eyebrow: "Orders", title: "Unknown action.", reason: "Use the buttons on the dashboard.", primaryLabel: "← Back" });
};
