// Listing website order form (/c/<slug>/site). Same rules as the server, one JSON
// request, then off to Stripe Checkout. Listing rows are cloned from a template;
// "Fetch details" prefills a row from the REALTOR.ca share link.
import { LABELS, normalizeSiteOrder, routeSlug, validateSiteOrder, type SiteOrderErrors } from "../lib/site-orders";

const TIMEOUT_MS = 50_000;
const ROW_FIELDS = ["unit_name", "mls_number", "realtor_stats_url", "price", "beds", "baths", "area", "plan_name", "photos_subfolder", "floor_plan_link"] as const;

const motion = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

export function initSiteOrderForm() {
  const form = document.getElementById("order-form") as HTMLFormElement | null;
  const summary = document.getElementById("order-summary");
  const summaryHead = document.getElementById("order-summary-h");
  const summaryList = summary?.querySelector<HTMLElement>("[data-summary-list]");
  const rowsHost = form?.querySelector<HTMLElement>("[data-listing-rows]");
  const template = document.querySelector<HTMLTemplateElement>("[data-listing-template]");
  const submit = form?.querySelector<HTMLButtonElement>("[data-order-submit]");
  const status = form?.querySelector<HTMLElement>("[data-order-status]");
  if (!form || !summary || !summaryHead || !summaryList || !rowsHost || !template || !submit || !status) return;

  const slug = form.dataset.clientSlug ?? "";
  const connected = form.dataset.connected === "true";
  const idleLabel = submit.textContent?.trim() || "Continue to payment";
  const idleStatus = status.innerHTML;
  let busy = false;
  let routeEdited = false;

  const control = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  const packageSelect = control("package") as HTMLSelectElement;
  const address = control("property_address") as HTMLInputElement;
  const route = control("route") as HTMLInputElement;

  // ---- Listing rows ----
  function rows() {
    return Array.from(rowsHost!.querySelectorAll<HTMLElement>("[data-listing-row]"));
  }
  function relabel() {
    const project = packageSelect.value === "project";
    rows().forEach((row, i) => {
      const title = row.querySelector<HTMLElement>("[data-row-title]");
      if (title) title.textContent = project ? `Listing ${i + 1}` : "The listing";
      row.querySelector<HTMLElement>("[data-req-project]")!.hidden = !project;
      row.querySelector<HTMLButtonElement>("[data-remove-listing]")!.hidden = rows().length === 1;
    });
    const add = form!.querySelector<HTMLButtonElement>("[data-add-listing]");
    if (add) add.hidden = !project;
    const help = form!.querySelector<HTMLElement>("[data-listings-help]");
    if (help) help.textContent = project ? "One row per home, or per unit type when there are many similar units. Large developments are grouped case by case." : "One row for the listing.";
  }
  function addRow() {
    const node = template!.content.firstElementChild!.cloneNode(true) as HTMLElement;
    rowsHost!.appendChild(node);
    node.querySelector<HTMLButtonElement>("[data-remove-listing]")?.addEventListener("click", () => {
      if (rows().length > 1) node.remove();
      relabel();
    });
    node.querySelector<HTMLButtonElement>("[data-fetch-listing]")?.addEventListener("click", () => fetchDetails(node));
    node.querySelectorAll<HTMLInputElement>("[data-row-field]").forEach((el) => el.addEventListener("input", () => clearRowError(node, el.dataset.rowField!)));
    relabel();
    return node;
  }
  function rowValue(row: HTMLElement, field: string) {
    return row.querySelector<HTMLInputElement>(`[data-row-field="${field}"]`)?.value ?? "";
  }
  function collectListings() {
    return rows().map((row) => Object.fromEntries(ROW_FIELDS.map((f) => [f, rowValue(row, f)])));
  }

  // If a single listing has no unit name, the address is the name (server does the same).
  addRow();
  form.querySelector("[data-add-listing]")?.addEventListener("click", () => {
    if (rows().length >= 40) return;
    addRow().querySelector<HTMLInputElement>("[data-row-field='unit_name']")?.focus();
  });
  packageSelect.addEventListener("change", () => {
    if (packageSelect.value === "single") rows().slice(1).forEach((row) => row.remove());
    relabel();
  });

  // ---- Route from address, until the client edits it ----
  address.addEventListener("input", () => {
    if (!routeEdited) route.value = routeSlug(address.value);
  });
  route.addEventListener("input", () => {
    routeEdited = route.value.trim() !== "";
  });
  route.addEventListener("blur", () => {
    route.value = routeSlug(route.value);
  });

  // ---- REALTOR.ca prefill ----
  async function fetchDetails(row: HTMLElement) {
    const url = rowValue(row, "realtor_stats_url").trim();
    const notice = row.querySelector<HTMLElement>("[data-row-notice]")!;
    const button = row.querySelector<HTMLButtonElement>("[data-fetch-listing]")!;
    if (!url) {
      showRowError(row, "realtor_stats_url", "Paste the REALTOR.ca share link first.");
      return;
    }
    button.disabled = true;
    button.textContent = "Fetching…";
    notice.hidden = true;
    try {
      const response = await fetch("/api/listing-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_slug: slug, realtor_stats_url: url }),
        signal: AbortSignal.timeout(90_000)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        showRowError(row, "realtor_stats_url", body?.error ?? "We couldn’t read that link. Type the details instead.");
        return;
      }
      const mls = row.querySelector<HTMLInputElement>("[data-row-field='mls_number']")!;
      if (body.mls_number && !mls.value) mls.value = body.mls_number;
      if (body.address && !address.value) {
        address.value = body.address;
        if (!routeEdited) route.value = routeSlug(body.address);
      }
      const unit = row.querySelector<HTMLInputElement>("[data-row-field='unit_name']")!;
      if (body.address && !unit.value && packageSelect.value === "project") unit.value = body.address.split(",")[0].slice(0, 100);
      if (body.warning) {
        notice.textContent = body.warning;
        notice.hidden = false;
      }
    } catch {
      showRowError(row, "realtor_stats_url", "That took too long. Type the details instead.");
    } finally {
      button.disabled = false;
      button.textContent = "Fetch details";
    }
  }

  // ---- Messages ----
  function clearFieldError(key: string) {
    control(key)?.removeAttribute("aria-invalid");
    const note = form!.querySelector<HTMLElement>(`[data-err-for="${key}"]`);
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
  }
  function clearRowError(row: HTMLElement, field: string) {
    row.querySelector<HTMLInputElement>(`[data-row-field="${field}"]`)?.removeAttribute("aria-invalid");
    const note = row.querySelector<HTMLElement>(`[data-row-err="${field}"]`);
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
  }
  function showRowError(row: HTMLElement, field: string, message: string) {
    row.querySelector<HTMLInputElement>(`[data-row-field="${field}"]`)?.setAttribute("aria-invalid", "true");
    const note = row.querySelector<HTMLElement>(`[data-row-err="${field}"]`);
    if (note) {
      note.textContent = message;
      note.hidden = false;
    }
  }
  function clearMessages() {
    Object.keys(LABELS).forEach(clearFieldError);
    rows().forEach((row) => ROW_FIELDS.forEach((f) => clearRowError(row, f)));
    summary!.hidden = true;
  }
  form.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => el.addEventListener("input", () => clearFieldError(el.dataset.field!)));

  function revealSummary(title: string) {
    summaryHead!.textContent = title;
    summary!.hidden = false;
    window.scrollTo({ top: summary!.getBoundingClientRect().top + window.scrollY - 76, behavior: motion() });
    summaryHead!.focus({ preventScroll: true });
  }
  function showErrors(errors: SiteOrderErrors) {
    summaryList!.innerHTML = "";
    let count = 0;
    for (const [key, message] of Object.entries(errors)) {
      if (!message) continue;
      count += 1;
      const rowMatch = key.match(/^listings\.(\d+)\.(\w+)$/);
      let label = LABELS[key] ?? key;
      if (rowMatch) {
        const row = rows()[Number(rowMatch[1])];
        if (row) showRowError(row, rowMatch[2], message);
        label = `Listing ${Number(rowMatch[1]) + 1}`;
      } else {
        control(key)?.setAttribute("aria-invalid", "true");
        const note = form!.querySelector<HTMLElement>(`[data-err-for="${key}"]`);
        if (note) {
          note.textContent = message;
          note.hidden = false;
        }
      }
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = label;
      li.append(strong, ` — ${message}`);
      summaryList!.appendChild(li);
    }
    revealSummary(count === 1 ? "One thing needs a quick fix before payment." : `${count} things need a quick fix before payment.`);
  }
  function showProblem(title: string, detail: string, link?: { href: string; label: string }) {
    summaryList!.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = detail;
    if (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.label;
      a.target = "_blank";
      a.rel = "noopener";
      li.append(" ", a);
    }
    summaryList!.appendChild(li);
    revealSummary(title);
  }

  function setBusy(on: boolean) {
    busy = on;
    form!.setAttribute("aria-busy", String(on));
    form!.querySelectorAll<HTMLInputElement>("input, select, textarea, button").forEach((el) => (el.disabled = on));
    submit!.disabled = on || !connected;
    submit!.innerHTML = on ? '<span class="spin"></span>Reserving your page…' : idleLabel;
    status!.innerHTML = on ? "Reserving the page address and opening Stripe. A few seconds." : idleStatus;
  }

  // ---- Submit ----
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !connected) return;
    const raw = Object.fromEntries(new FormData(form)) as Record<string, unknown>;
    raw.listings = collectListings();
    raw.terms_accepted = (control("terms_accepted") as HTMLInputElement | null)?.checked === true;
    const input = normalizeSiteOrder(raw);
    const errors = validateSiteOrder(input);
    clearMessages();
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    let code = 0;
    let body: Record<string, any> | null = null;
    try {
      const response = await fetch("/api/site-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, client_slug: slug }),
        signal: controller.signal
      });
      code = response.status;
      body = await response.json().catch(() => null);
    } catch {
      code = 0;
    } finally {
      window.clearTimeout(timer);
    }

    if ((code === 200 || code === 201) && body?.ok && typeof body.url === "string") {
      status!.textContent = "Opening Stripe…";
      window.location.assign(body.url);
      return;
    }
    setBusy(false);
    const message = typeof body?.error === "string" ? body.error : "";
    if (code === 400 && body?.fields && typeof body.fields === "object") showErrors(body.fields as SiteOrderErrors);
    else if (code === 401) showProblem("Your sign-in has expired.", "Sign in again in a new tab, then press the button here again — your entries stay on this page.", { href: `/login?next=${encodeURIComponent(window.location.pathname)}`, label: "Open sign-in" });
    else showProblem("We couldn’t start the payment.", message || "Something went wrong on our side. Your entries are still here — try again in a minute.");
  });

  relabel();
}
