// Listing-ad request form (/c/<slug>/ads). Checks the same rules as the server,
// sends one JSON request, and swaps to a confirmation with "Create another".
// Duplicate safety: every request carries a submission id. Repeat clicks and retries
// reuse it so /api/listing-ad recognises them; "Create another" starts a fresh one.
// When an answer never arrives the request stays pending — fields locked, kept in
// sessionStorage across a reload — and "Check and send" resends exactly it, so the
// server looks for the earlier record before sending anything.

import {
  LIMITS,
  MAX_CITIES,
  normalizeListingAd,
  splitCities,
  validateListingAd,
  type ListingAdErrors,
  type ListingAdInput
} from "../lib/listing-ads";

const LABELS: Record<keyof ListingAdInput, string> = {
  listing_address: "Listing Address",
  ad_budget: "Ad Budget",
  campaign_type: "Campaign Type",
  location_targeting: "Location Targeting",
  photos_url: "Photos link",
  realtor_stats_url: "REALTOR.ca Report Stats Link",
  special_notes: "Special Notes"
};

// Longer than the server's token + create timeouts, so a slow request normally answers
// (success or a definite failure) before the browser gives up on it.
const TIMEOUT_MS = 50_000;

function newSubmissionId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

const motion = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

export function initAdsForm() {
  const form = document.getElementById("ads-form") as HTMLFormElement | null;
  const entry = document.querySelector<HTMLElement>("[data-ads-entry]");
  const success = document.querySelector<HTMLElement>("[data-ads-success]");
  const summary = document.getElementById("ads-summary");
  const summaryHead = document.getElementById("ads-summary-h");
  const summaryList = summary?.querySelector<HTMLElement>("[data-summary-list]");
  const notice = document.querySelector<HTMLElement>("[data-ads-notice]");
  const submit = form?.querySelector<HTMLButtonElement>("[data-ads-submit]");
  const status = form?.querySelector<HTMLElement>("[data-ads-status]");
  if (!form || !entry || !success || !summary || !summaryHead || !summaryList || !notice || !submit || !status) return;

  const connected = form.dataset.connected === "true";
  const slug = form.dataset.clientSlug ?? "";
  const idleLabel = submit.textContent?.trim() || "Submit listing ad";
  const idleStatus = status.innerHTML;
  let submissionId = newSubmissionId();
  let pending: ListingAdInput | null = null; // sent, not yet confirmed or refused
  let uncertain = false; // its answer never came: locked until "Check and send" settles it
  let busy = false;

  const control = (name: string) =>
    form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  const errNote = (key: string) => form.querySelector<HTMLElement>(`[data-err-for="${key}"]`);

  // A pending request survives a reload or a trip to the portal, so it is checked, not re-filed.
  const pendingKey = `listing-ad-pending:${slug}`;
  function remember() {
    try {
      if (pending) sessionStorage.setItem(pendingKey, JSON.stringify({ id: submissionId, input: pending }));
      else sessionStorage.removeItem(pendingKey);
    } catch {
      // Storage blocked: the in-page state still protects this tab.
    }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
    if (saved && typeof saved.id === "string" && saved.input && typeof saved.input === "object") {
      submissionId = saved.id;
      pending = normalizeListingAd(saved.input);
      uncertain = true;
      for (const [name, value] of Object.entries(pending)) {
        const el = control(name);
        if (el) el.value = value;
      }
    }
  } catch {
    // Nothing saved, or storage blocked.
  }

  // ---- Counters ----
  const cityCount = form.querySelector<HTMLElement>("[data-city-count]");
  const notesCount = form.querySelector<HTMLElement>("[data-notes-count]");
  function refreshCounters() {
    const cities = splitCities(control("location_targeting")?.value ?? "").length;
    if (cityCount) {
      cityCount.textContent = `${cities} / ${MAX_CITIES} cities`;
      cityCount.style.color = cities > MAX_CITIES ? "var(--ss-danger-ink)" : "var(--ss-muted)";
    }
    const notes = control("special_notes")?.value.length ?? 0;
    if (notesCount) {
      notesCount.textContent = `${notes} / ${LIMITS.notes}`;
      notesCount.style.color = notes > LIMITS.notes * 0.9 ? "var(--ss-warn-ink)" : "var(--ss-muted)";
    }
  }
  form.addEventListener("input", refreshCounters);

  // ---- Messages ----
  function clearFieldError(key: string) {
    control(key)?.removeAttribute("aria-invalid");
    const note = errNote(key);
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
  }
  function clearMessages() {
    Object.keys(LABELS).forEach(clearFieldError);
    summary!.hidden = true;
    notice!.hidden = true;
  }
  form.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
    el.addEventListener("input", () => clearFieldError(el.dataset.field!));
  });

  function revealSummary(title: string) {
    summaryHead!.textContent = title;
    summary!.hidden = false;
    window.scrollTo({ top: summary!.getBoundingClientRect().top + window.scrollY - 76, behavior: motion() });
    summaryHead!.focus({ preventScroll: true });
  }

  function showErrors(errors: ListingAdErrors) {
    const keys = Object.keys(errors) as (keyof ListingAdInput)[];
    summaryList!.innerHTML = "";
    keys.forEach((key) => {
      control(key)?.setAttribute("aria-invalid", "true");
      const note = errNote(key);
      if (note) {
        note.textContent = errors[key] ?? "";
        note.hidden = false;
      }
      const li = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = LABELS[key] ?? key;
      li.append(label, ` — ${errors[key]}`);
      summaryList!.appendChild(li);
    });
    revealSummary(
      keys.length === 1
        ? "One thing needs a quick fix before this can be sent."
        : `${keys.length} things need a quick fix before this can be sent.`
    );
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

  function showUncertain() {
    const text = notice!.querySelector("span");
    if (text) {
      text.textContent =
        "We couldn’t confirm this request reached us, so its entries are locked. Wait a moment, then press “Check and send” — we look for it first and only send it if it isn’t there, so it won’t be duplicated.";
    }
    notice!.hidden = false;
    notice!.scrollIntoView({ block: "center", behavior: motion() });
  }

  // ---- Busy / locked state ----
  function setBusy(on: boolean) {
    busy = on;
    form!.setAttribute("aria-busy", String(on));
    form!.querySelectorAll<HTMLInputElement>("input, select, textarea").forEach((el) => (el.disabled = on || uncertain));
    submit!.disabled = on || !connected;
    if (on) {
      submit!.innerHTML = '<span class="spin"></span>Sending…';
      status!.textContent = "Sending your request — this usually takes a few seconds.";
    } else {
      submit!.textContent = uncertain ? "Check and send" : idleLabel;
      status!.innerHTML = idleStatus;
    }
  }

  async function send(input: ListingAdInput): Promise<{ code: number; body: Record<string, any> | null }> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch("/api/listing-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, client_slug: slug, submission_id: submissionId, retry: uncertain }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      return { code: response.status, body: body && typeof body === "object" ? body : null };
    } catch {
      return { code: 0, body: null }; // timed out or the connection dropped: outcome unknown
    } finally {
      window.clearTimeout(timer);
    }
  }

  // ---- Submit ----
  const successHead = document.getElementById("ads-success-h");
  const successAddress = success.querySelector<HTMLElement>("[data-success-address]");
  const successRef = success.querySelector<HTMLElement>("[data-success-ref]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !connected) return;

    // An unanswered request is resent exactly as it was (its fields are locked).
    const input = uncertain && pending ? pending : normalizeListingAd(Object.fromEntries(new FormData(form)));
    const errors = validateListingAd(input);
    clearMessages();
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }

    pending = input;
    remember();
    setBusy(true);
    const { code, body } = await send(input);

    if ((code === 200 || code === 201) && body?.ok) {
      pending = null;
      uncertain = false;
      remember();
      setBusy(false);
      if (successAddress) successAddress.textContent = input.listing_address;
      if (successRef) successRef.textContent = String(body.record_name ?? "");
      entry.hidden = true;
      success.hidden = false;
      window.scrollTo({ top: 0, behavior: motion() });
      successHead?.focus({ preventScroll: true });
      return;
    }

    // Our route always labels its failures; anything unlabelled (network loss, a
    // proxy error page) or an explicit "uncertain" may have created the record.
    if (code === 0 || body?.code === "uncertain" || (!body?.code && code >= 500)) {
      uncertain = true;
      setBusy(false);
      showUncertain();
      submit.focus({ preventScroll: true });
      return;
    }

    // CRM answered and filed nothing. Any other refusal happened before CRM was touched,
    // so an earlier unanswered send stays pending until it is checked.
    if (body?.code === "crm_rejected" || body?.code === "crm_unavailable") uncertain = false;
    if (!uncertain) {
      pending = null;
      remember();
    }
    setBusy(false);
    const message = typeof body?.error === "string" ? body.error : "";
    if (code === 400 && body?.fields && typeof body.fields === "object") {
      showErrors(body.fields as ListingAdErrors);
    } else if (code === 401) {
      showProblem(
        "Your sign-in has expired.",
        "Sign in again in a new tab, then press the button here again — your entries stay on this page.",
        { href: `/login?next=${encodeURIComponent(window.location.pathname)}`, label: "Open sign-in" }
      );
    } else {
      showProblem(
        "Your listing ad wasn’t sent.",
        message || "Something went wrong on our side. Your entries are still here — try again in a minute."
      );
    }
  });

  document.querySelector("[data-ads-another]")?.addEventListener("click", () => {
    form.reset();
    clearMessages();
    submissionId = newSubmissionId();
    pending = null;
    uncertain = false;
    remember();
    setBusy(false);
    refreshCounters();
    success.hidden = true;
    entry.hidden = false;
    window.scrollTo({ top: 0, behavior: motion() });
    control("listing_address")?.focus({ preventScroll: true });
  });

  refreshCounters();
  if (uncertain) {
    setBusy(false);
    showUncertain();
  }
}
