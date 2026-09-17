// The Listing Website Terms, versioned. The order stores TERMS_VERSION plus the
// SHA-256 of this exact text at acceptance, and both travel in the Stripe
// session metadata, so what a client accepted can always be reconstructed.
// Change the text -> bump TERMS_VERSION in site-orders.ts. DRAFT: business and
// legal approval of the wording is a release gate (plan v3.3, section 7).
import { createHash } from "node:crypto";
import { TERMS_VERSION } from "./site-orders";

export const TERMS_TITLE = "Listing Website Terms";
export const TERMS_EFFECTIVE = "2026-09-16";

export const TERMS_SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "Who we are",
    body: [
      "These terms are between you (the client named on the order) and Supersonic Sites Inc., 109b - 1917 Peninsula Rd, Ucluelet, BC V0R 3A0, Canada (hello@supersonicsites.com, 1 (888) 321-2666), operating the service supersonicrealtors.com. The service is offered to Canadian real estate professionals."
    ]
  },
  {
    heading: "What you are buying",
    body: [
      "One listing micro-site: a page about one listing, or a project page about a development with its listings inside, published on your portfolio site at portfolio.<your domain>/<page address>. The page includes the content described on the order form, a contact form that delivers to the email addresses you give us, and a card on your portfolio gallery.",
      "Large developments are grouped by unit type at our discretion. The number of listings on a project page does not change the price."
    ]
  },
  {
    heading: "Price and hosting",
    body: [
      "Production costs $599 CAD, charged at checkout. Hosting costs $99 CAD per year. The first year of hosting is included in the production price; the first hosting charge is one year after purchase, and yearly after that, on the card on file. Taxes are added at checkout as required by law.",
      "Hosting renews automatically until you cancel. To cancel a micro-site's hosting, email hello@supersonicsites.com; it ends at the end of the paid year and the page is taken down."
    ]
  },
  {
    heading: "Delivery",
    body: [
      "We aim to publish within seven calendar days, counted from the day we have your payment, your acceptance of these terms and your complete material (a final, shared photo folder and the details on the order form). This is a target, not a guarantee.",
      "Before we publish, you receive a review link. The review page is unlisted but reachable by anyone who has its address. The page appears on your portfolio only after you approve it by email."
    ]
  },
  {
    heading: "Edits and changes",
    body: [
      "Edits to a purchased page are free, with no fixed limit: facts, photos, prices, contact details, a SOLD badge, removing a listing from a project page.",
      "A different property on an existing page address is a new order."
    ]
  },
  {
    heading: "Refunds",
    body: ["If we do not produce the website, you get a full refund. Once the page is published, there is no refund."]
  },
  {
    heading: "Your material",
    body: [
      "You confirm that you have the right to use every photo, floor plan, video and fact you give us, and that the page meets your brokerage's advertising rules. We write original copy from the facts you confirm; we do not copy listing remarks.",
      "By accepting these terms you confirm you are authorized to make this purchase for the client named on the order."
    ]
  },
  {
    heading: "Sold listings and end of hosting",
    body: [
      "When a listing sells, tell us and we mark it SOLD; the page stays up while hosting is active. When hosting ends, the page is removed and its address redirects to your portfolio. Material we hold for the page is deleted 90 days later."
    ]
  },
  {
    heading: "Service providers and privacy",
    body: [
      "Payments are processed by Stripe. Contact form submissions are processed by Basin and delivered to the addresses on your order. Website analytics use Rybbit. Working files are stored in Zoho WorkDrive. The site is hosted on ChatGPT Sites. Personal information is handled under PIPEDA and applicable provincial law."
    ]
  },
  {
    heading: "Governing law",
    body: [
      "These terms are governed by the laws of British Columbia, Canada. In the event of a dispute, both parties first attempt informal resolution; if unsuccessful, the dispute is referred to mediation or arbitration."
    ]
  }
];

export function termsText() {
  return [`${TERMS_TITLE} v${TERMS_VERSION} (effective ${TERMS_EFFECTIVE})`, ...TERMS_SECTIONS.flatMap((s) => [s.heading, ...s.body])].join("\n");
}

export function termsHash() {
  return createHash("sha256").update(termsText(), "utf8").digest("hex");
}
