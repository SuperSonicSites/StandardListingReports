// Coordinator report-form behavior. The pull/apply/period/notice logic and the
// /api/pull → /api/snapshot wiring are preserved from the original inline
// script; the new UI (staged pull modal, coloured status dot, per-card trust
// rails, info-dot tooltips, cover photo, caption counters, image zoom, inline
// validation, sticky approval gate) is layered on top. All form field `name`
// attributes and the snapshot shape are unchanged.

type Candidate = {
  permalink: string;
  caption: string;
  media_url: string;
  views: number | null;
  timestamp: string;
};

const MAX_CAPTION = 300;

const WARN_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const CHECK_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const X_SVG =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path></svg>';

const STAGES = [
  "Opening your REALTOR.ca listing…",
  "Reading listing views and days on market…",
  "Matching your Facebook and Instagram posts…",
  "Checking website analytics…",
  "Almost there — finishing up…"
];

type Strip = {
  dot: "hollow" | "accent" | "warn" | "danger";
  status: string;
  detail: string;
  btn: string;
  primary: boolean;
  disabled: boolean;
};

const STRIP: Record<string, Strip> = {
  ready: {
    dot: "hollow",
    status: "Ready to pull",
    detail:
      "Paste the REALTOR.ca link above, then pull — everything else fills in for you to confirm.",
    btn: "Pull data",
    primary: true,
    disabled: false
  },
  pulling: {
    dot: "accent",
    status: "Pulling your data…",
    detail: "Reading REALTOR.ca stats and matching your posts.",
    btn: "Pulling…",
    primary: true,
    disabled: true
  },
  pulled: {
    dot: "accent",
    status: "Data pulled",
    detail:
      "Review the values below, edit anything that looks off, then create the report.",
    btn: "Refresh data",
    primary: false,
    disabled: false
  },
  warnings: {
    dot: "warn",
    status: "Data pulled — with warnings",
    detail:
      "Some sources could not be fetched — see the notes below and fill those numbers in manually.",
    btn: "Refresh data",
    primary: false,
    disabled: false
  },
  failed: {
    dot: "danger",
    status: "Pull failed",
    detail:
      "The data sources could not be reached. Enter the numbers manually below — or Refresh data to retry.",
    btn: "Refresh data",
    primary: false,
    disabled: false
  },
  urlerror: {
    dot: "danger",
    status: "That doesn’t look like a REALTOR.ca link",
    detail:
      "Check the link and try again — it should start with https:// and be from realtor.ca.",
    btn: "Pull data",
    primary: true,
    disabled: false
  }
};

const SNAP_LABELS: Record<string, string> = {
  address: "Address",
  listing_url: "Website URL",
  showings: "Showings",
  website_views: "Website views",
  realtor_listing_views: "Total views",
  days_on_market: "Days on market",
  facebook_views: "Facebook views",
  instagram_views: "Instagram views",
  facebook_post_url: "Facebook post URL",
  instagram_post_url: "Instagram post URL"
};

export function initCoordinatorForm() {
  const form = document.getElementById("report-form") as HTMLFormElement | null;
  if (!form) return;

  const pullCard = document.querySelector("[data-pull-card]");
  const statusText = document.querySelector("[data-pull-status]");
  const statusDetail = document.querySelector("[data-pull-detail]");
  const submitButton = document.querySelector(
    "[data-submit-button]"
  ) as HTMLButtonElement | null;
  const reviewBlock = document.querySelector(
    "[data-review-block]"
  ) as HTMLElement | null;
  const socialPicker = document.querySelector(
    "[data-social-picker]"
  ) as HTMLElement | null;
  const pullModal = document.querySelector("[data-pull-modal]") as HTMLElement | null;
  const stageEl = document.querySelector("[data-pull-stage]");
  const progressEl = document.querySelector("[data-pull-progress]") as HTMLElement | null;

  const state: Record<string, string> = {
    website: "manual",
    realtor: "manual",
    facebook: "manual",
    instagram: "manual"
  };
  const selected: Record<string, Candidate | null> = {
    facebook: null,
    instagram: null
  };
  const candidateStore: Record<string, Candidate[]> = {
    facebook: [],
    instagram: []
  };

  const field = (name: string) =>
    form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  const setVal = (name: string, value: unknown) => {
    const el = field(name);
    if (el) el.value = String(value ?? 0);
  };
  const mapState = (source: string) =>
    source === "mock" ? "demo" : source === "manual" ? "manual" : "pulled";

  // ---- Notices (amber, one per anchored block) ----
  function setNotice(key: string, message: string | null) {
    const target = document.querySelector(`[data-notice-anchor="${key}"]`);
    if (!target) return;
    let notice = target.querySelector<HTMLElement>("[data-fetch-notice]");
    if (!message) {
      notice?.remove();
      return;
    }
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "notice";
      notice.setAttribute("role", "status");
      notice.dataset.fetchNotice = "";
      notice.style.marginTop = "10px";
      notice.innerHTML = `${WARN_SVG}<span></span>`;
      target.appendChild(notice);
    }
    const span = notice.querySelector("span");
    if (span) span.textContent = message;
  }
  const hasNotice = (key: string) =>
    !!document.querySelector(`[data-notice-anchor="${key}"] [data-fetch-notice]`);

  // ---- Post images (picker thumbnail + review thumbnail) ----
  function setPostImage(net: string, url: string) {
    if (!url) return;
    document
      .querySelectorAll<HTMLImageElement>(
        `[data-media-preview="${net}"], [data-review-media="${net}"]`
      )
      .forEach((img) => {
        img.src = url;
        img.hidden = false;
        const icon = img.parentElement?.querySelector<HTMLElement>(
          "[data-thumb-icon]"
        );
        if (icon) icon.style.display = "none";
      });
  }

  function setCover(url: string | null) {
    const tile = document.querySelector("[data-cover-tile]") as HTMLElement | null;
    const empty = document.querySelector("[data-cover-empty]") as HTMLElement | null;
    const img = document.querySelector(
      '[data-media-preview="realtor"]'
    ) as HTMLImageElement | null;
    const icon = document.querySelector("[data-cover-icon]") as HTMLElement | null;
    if (url && tile && img) {
      img.src = url;
      img.hidden = false;
      if (icon) icon.style.display = "none";
      tile.hidden = false;
      if (empty) empty.hidden = true;
      setVal("property_image_url", url);
    } else {
      if (tile) tile.hidden = true;
      if (empty) empty.hidden = false;
    }
  }

  // ---- Caption / notes counters ----
  function updateCounter(key: string, len: number, cap: number) {
    const el = document.querySelector(`[data-counter="${key}"]`) as HTMLElement | null;
    if (!el) return;
    el.textContent = `${len} / ${cap}`;
    el.style.color = len > cap * 0.9 ? "var(--ss-warn-ink)" : "var(--ss-muted)";
  }
  form.querySelectorAll<HTMLTextAreaElement>("[data-counter-src]").forEach((ta) => {
    const key = ta.dataset.counterSrc!;
    const cap = ta.maxLength > 0 ? ta.maxLength : 600;
    const refresh = () => updateCounter(key, ta.value.length, cap);
    ta.addEventListener("input", refresh);
    refresh();
  });

  // ---- Social candidates ----
  function fmtDate(iso: string): string {
    if (!iso) return "";
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
  }
  function candidateLabel(candidate: Candidate): string {
    const date = candidate.timestamp
      ? fmtDate(String(candidate.timestamp).slice(0, 10))
      : "";
    const caption = (candidate.caption || "(no caption)")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    const views =
      typeof candidate.views === "number" ? ` · ${candidate.views} views` : "";
    return [date, caption].filter(Boolean).join(" — ") + views;
  }
  function selectCandidate(net: string, index: number) {
    const candidate = candidateStore[net]?.[index];
    if (!candidate) return;
    selected[net] = candidate;
    const urlInput = field(`${net}_post_url`);
    if (urlInput) urlInput.value = candidate.permalink ?? "";
    const caption = String(candidate.caption ?? "").slice(0, MAX_CAPTION);
    setVal(`${net}_caption`, caption);
    setVal(`${net}_media_url`, candidate.media_url ?? "");
    if (typeof candidate.views === "number") setVal(`${net}_views`, candidate.views);
    const sourceInput = field(`${net}_source`);
    if (sourceInput) sourceInput.value = "meta_api";
    state[net] = "meta_api";
    if (candidate.media_url) setPostImage(net, candidate.media_url);
    updateCounter(net, caption.length, MAX_CAPTION);
  }
  function populateCandidates(
    net: string,
    candidates: unknown,
    source: string,
    warning: string | null
  ) {
    const select = document.querySelector(
      `[data-candidate-select="${net}"]`
    ) as HTMLSelectElement | null;
    candidateStore[net] = Array.isArray(candidates) ? (candidates as Candidate[]) : [];
    if (!select) return;
    select.innerHTML = "";
    const label = net === "facebook" ? "Facebook" : "Instagram";

    if (candidateStore[net].length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        source === "manual" ? "No posts available — enter manually" : "No matching post found";
      select.appendChild(opt);
      select.disabled = true;
      const sourceInput = field(`${net}_source`);
      if (sourceInput) sourceInput.value = "manual";
      state[net] = "manual";
      selected[net] = null;
      setNotice(
        net,
        warning ??
          `No ${label} post found for this listing — did you post it? Enter it manually or leave blank.`
      );
      return;
    }

    select.disabled = false;
    candidateStore[net].forEach((candidate, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = candidateLabel(candidate);
      select.appendChild(opt);
    });
    select.value = "0";
    selectCandidate(net, 0);
    setNotice(net, warning);
  }
  ["facebook", "instagram"].forEach((net) => {
    const select = document.querySelector(
      `[data-candidate-select="${net}"]`
    ) as HTMLSelectElement | null;
    select?.addEventListener("change", () => {
      const idx = Number(select.value);
      if (Number.isInteger(idx)) selectCandidate(net, idx);
    });
  });

  // ---- Report period ----
  const periodTextEl = document.querySelector("[data-period-text]");
  const periodPill = document.querySelector("[data-period-pill]") as HTMLElement | null;
  const periodFallback = document.querySelector(
    "[data-period-fallback]"
  ) as HTMLElement | null;
  const periodStartInput = document.querySelector(
    "[data-period-start]"
  ) as HTMLInputElement | null;
  const periodEndInput = document.querySelector(
    "[data-period-end]"
  ) as HTMLInputElement | null;

  function refreshPeriodText() {
    const start = field("start_date")?.value ?? "";
    const end = field("end_date")?.value ?? "";
    if (periodTextEl && start && end)
      periodTextEl.textContent = `${fmtDate(start)} → ${fmtDate(end)}`;
  }
  function applyPeriod(
    period: { start_date?: string; end_date?: string; derived?: boolean } | undefined
  ) {
    if (!period) return;
    if (period.start_date) setVal("start_date", period.start_date);
    if (period.end_date) setVal("end_date", period.end_date);
    refreshPeriodText();
    const needsManual = !period.derived || !period.start_date;
    if (periodFallback) periodFallback.hidden = !needsManual;
    if (periodPill) periodPill.hidden = needsManual;
    if (needsManual) {
      if (periodStartInput && period.start_date) periodStartInput.value = period.start_date;
      if (periodEndInput && period.end_date) periodEndInput.value = period.end_date;
    }
  }
  periodStartInput?.addEventListener("change", () => {
    if (periodStartInput.value) setVal("start_date", periodStartInput.value);
    refreshPeriodText();
  });
  periodEndInput?.addEventListener("change", () => {
    if (periodEndInput.value) setVal("end_date", periodEndInput.value);
    refreshPeriodText();
  });

  function applyBlock(
    key: string,
    source: string,
    fills: Record<string, unknown>,
    warning: string | null
  ) {
    if (source !== "manual") {
      Object.entries(fills).forEach(([name, value]) => setVal(name, value));
    }
    const sourceInput = field(`${key}_source`);
    if (sourceInput) sourceInput.value = source;
    state[key] = source;
    setNotice(key, source === "mock" ? "Demo numbers — not pulled from real analytics." : warning);
  }

  // ---- Status dot + strip ----
  function setDot(kind: Strip["dot"]) {
    const dot = document.querySelector("[data-pull-dot]") as HTMLElement | null;
    if (!dot) return;
    const map: Record<string, { bg: string; border: string }> = {
      hollow: { bg: "transparent", border: "2px solid var(--ss-border-strong)" },
      accent: { bg: "var(--ss-accent)", border: "none" },
      warn: { bg: "var(--ss-warn)", border: "none" },
      danger: { bg: "var(--ss-danger)", border: "none" }
    };
    const s = map[kind] ?? map.hollow;
    dot.style.background = s.bg;
    dot.style.border = s.border;
  }
  function setStrip(key: string) {
    const s = STRIP[key];
    if (!s) return;
    setDot(s.dot);
    if (statusText) statusText.textContent = s.status;
    if (statusDetail) statusDetail.textContent = s.detail;
    const btn = document.querySelector("[data-pull-trigger]") as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = s.disabled;
      btn.classList.toggle("primary", s.primary);
      btn.classList.toggle("secondary", !s.primary);
      btn.innerHTML = s.disabled ? `<span class="spin"></span>${s.btn}` : s.btn;
    }
  }

  // ---- Trust rails + info-dot tooltips + fold ----
  function setRail(key: string, color: string) {
    const el = document.querySelector(`[data-rail="${key}"]`) as HTMLElement | null;
    if (el) el.style.borderLeftColor = color;
  }
  function setFold(key: string, folded: boolean) {
    document.querySelector(`[data-fold="${key}"]`)?.classList.toggle("folded", folded);
  }
  function setInfoDot(key: string, ok: boolean, tipText: string) {
    const wrap = document.querySelector(`[data-info="${key}"]`) as HTMLElement | null;
    const dot = document.querySelector(`[data-tip-toggle="${key}"]`) as HTMLElement | null;
    const tip = document.querySelector(`[data-tip="${key}"]`) as HTMLElement | null;
    if (!wrap || !dot || !tip) return;
    wrap.hidden = false;
    dot.innerHTML = ok ? CHECK_SVG : X_SVG;
    dot.style.background = ok ? "var(--ss-success-soft)" : "var(--ss-danger-soft)";
    dot.style.color = ok ? "#15803d" : "#dc2626";
    tip.textContent = tipText;
  }
  function refreshStates() {
    const w = mapState(state.website);
    const wNote = hasNotice("website");
    setRail(
      "website",
      w === "demo" ? "#8b5cf6" : w === "manual" || wNote ? "var(--ss-warn)" : "#5b9e88"
    );
    setFold("website", w === "pulled" && !wNote);
    const wTip =
      w !== "manual"
        ? "Automatically found — no action needed"
        : "Couldn’t auto-find this — double-check the link";
    setInfoDot("website", w !== "manual", wTip);
    setInfoDot("listing", w !== "manual", wTip);

    const r = mapState(state.realtor);
    setRail("realtor", r === "manual" ? "var(--ss-danger)" : "var(--ss-success)");
    setInfoDot(
      "realtor",
      r !== "manual",
      r !== "manual"
        ? "Automatically pulled from REALTOR.ca — no action needed"
        : "Couldn’t auto-pull — enter the numbers below"
    );

    const fb = mapState(state.facebook);
    const ig = mapState(state.instagram);
    setRail("facebook", fb === "manual" ? "var(--ss-danger)" : "var(--ss-success)");
    setRail("instagram", ig === "manual" ? "var(--ss-danger)" : "var(--ss-success)");
    const social =
      fb === "demo" || ig === "demo"
        ? "demo"
        : fb === "manual" && ig === "manual"
          ? "manual"
          : fb === "manual" || ig === "manual"
            ? "partial"
            : "pulled";
    setFold("social", social === "pulled" && !hasNotice("facebook") && !hasNotice("instagram"));
    setInfoDot(
      "social",
      social === "pulled" || social === "demo",
      social === "pulled" || social === "demo"
        ? "Automatically pulled from Meta — no action needed"
        : social === "partial"
          ? "Partial data — one platform needs manual entry"
          : "Couldn’t auto-pull — enter the posts below"
    );
  }

  // ---- Pull modal staging ----
  let timers: number[] = [];
  function startModal() {
    if (pullModal) pullModal.hidden = false;
    if (stageEl) stageEl.textContent = STAGES[0];
    if (progressEl) progressEl.style.width = "8%";
    let i = 0;
    timers = [];
    const step = () => {
      i += 1;
      if (i < STAGES.length) {
        if (stageEl) stageEl.textContent = STAGES[i];
        if (progressEl) progressEl.style.width = `${Math.min(90, 8 + i * 20)}%`;
        timers.push(window.setTimeout(step, 1050));
      }
    };
    timers.push(window.setTimeout(step, 1050));
  }
  function stopModal(done: () => void) {
    timers.forEach((t) => clearTimeout(t));
    if (progressEl) progressEl.style.width = "100%";
    window.setTimeout(() => {
      if (pullModal) pullModal.hidden = true;
      done();
    }, 320);
  }

  function revealAfterPull() {
    if (reviewBlock) reviewBlock.hidden = false;
    if (socialPicker) socialPicker.hidden = false;
  }

  const isRealtorUrl = (url: string) =>
    /^https?:\/\//i.test(url) && /realtor\.ca/i.test(url);

  async function pull() {
    const url = (field("realtor_admin_url")?.value ?? "").trim();
    if (!isRealtorUrl(url)) {
      setStrip("urlerror");
      field("realtor_admin_url")?.focus();
      return;
    }

    setStrip("pulling");
    startModal();

    const payload = {
      client_slug: field("client_slug")?.value ?? "",
      listing_url: field("listing_url")?.value ?? "",
      facebook_post_url: field("facebook_post_url")?.value ?? "",
      instagram_post_url: field("instagram_post_url")?.value ?? "",
      realtor_admin_url: url
    };

    let data: any = null;
    try {
      const response = await fetch("/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) data = await response.json();
    } catch {
      // degrade below
    }

    let outcome = "failed";
    if (data) {
      applyBlock(
        "website",
        data.website.source,
        {
          website_views: data.website.listing_views,
          site_total_views: data.website.site_total_views
        },
        data.website.warnings?.[0] ?? null
      );

      const listingUrlFound =
        data.website.listing_source === "search" || data.website.listing_source === "mock";
      if (listingUrlFound && data.website.listing_url && !field("listing_url")?.value) {
        setVal("listing_url", data.website.listing_url);
      }
      setNotice("listing", listingUrlFound ? null : data.website.listing_warning ?? null);

      const realtor = data.realtor ?? {};
      if (realtor.total_views != null) setVal("realtor_listing_views", realtor.total_views);
      if (realtor.days_on_market != null) setVal("days_on_market", realtor.days_on_market);
      setCover(realtor.image_url ?? null);
      if (realtor.address && !field("address")?.value) setVal("address", realtor.address);
      if (realtor.mls_number && !field("mls_number")?.value)
        setVal("mls_number", realtor.mls_number);
      applyPeriod(realtor.period);
      state.realtor = realtor.source ?? "manual";
      setNotice("realtor", realtor.warnings?.[0] ?? null);

      populateCandidates(
        "facebook",
        data.facebook.candidates,
        data.facebook.source,
        data.facebook.warnings?.[0] ?? null
      );
      populateCandidates(
        "instagram",
        data.instagram.candidates,
        data.instagram.source,
        data.instagram.warnings?.[0] ?? null
      );

      outcome = (data.warnings ?? []).length > 0 ? "warnings" : "pulled";
    } else {
      // Total failure: everything stays editable.
      ["website", "facebook", "instagram"].forEach((key) => {
        const sourceInput = field(`${key}_source`);
        if (sourceInput) sourceInput.value = "manual";
        state[key] = "manual";
      });
      state.realtor = "manual";
      setNotice("website", "Auto-fetch unavailable. Please enter the numbers manually.");
      setNotice(
        "realtor",
        "Couldn’t reach REALTOR.ca just now — enter the numbers below, or Refresh data to retry."
      );
      setCover(null);
      populateCandidates(
        "facebook",
        [],
        "manual",
        "Auto-fetch unavailable — enter the Facebook post manually or leave blank."
      );
      populateCandidates(
        "instagram",
        [],
        "manual",
        "Auto-fetch unavailable — enter the Instagram post manually or leave blank."
      );
      if (periodFallback) periodFallback.hidden = false;
      if (periodPill) periodPill.hidden = true;
    }

    stopModal(() => {
      pullCard?.classList.add("is-pulled");
      revealAfterPull();
      refreshStates();
      setStrip(outcome);
      requestAnimationFrame(() => {
        if (reviewBlock) {
          window.scrollTo({
            top: reviewBlock.getBoundingClientRect().top + window.scrollY - 76,
            behavior: "smooth"
          });
        }
        const focusId = outcome === "failed" ? "period-start-focus" : "addr";
        if (outcome === "failed") periodStartInput?.focus({ preventScroll: true });
        else document.getElementById(focusId)?.focus({ preventScroll: true });
      });
    });
  }

  document.querySelector("[data-pull-trigger]")?.addEventListener("click", () => pull());
  field("realtor_admin_url")?.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") {
      event.preventDefault();
      pull();
    }
  });
  // Clear the url-error state as soon as the coordinator edits the link.
  field("realtor_admin_url")?.addEventListener("input", () => {
    const btn = document.querySelector("[data-pull-trigger]") as HTMLButtonElement | null;
    if (btn && statusText?.textContent?.startsWith("That doesn’t look")) setStrip("ready");
  });

  // ---- Tooltips ----
  function closeTips() {
    document
      .querySelectorAll<HTMLElement>("[data-tip]")
      .forEach((tip) => (tip.hidden = true));
  }
  document.querySelectorAll("[data-tip-toggle]").forEach((dot) => {
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      const key = (dot as HTMLElement).dataset.tipToggle!;
      const tip = document.querySelector(`[data-tip="${key}"]`) as HTMLElement | null;
      const wasOpen = tip && !tip.hidden;
      closeTips();
      if (tip) tip.hidden = !!wasOpen;
    });
  });
  document.addEventListener("click", closeTips);

  // ---- Image zoom ----
  const zoomModal = document.querySelector("[data-zoom-modal]") as HTMLElement | null;
  function openZoom(net: string) {
    const cand = selected[net];
    if (!cand || !zoomModal) return;
    const img = zoomModal.querySelector("[data-zoom-img]") as HTMLImageElement | null;
    if (img) img.src = cand.media_url || "";
    const cap = zoomModal.querySelector("[data-zoom-caption]");
    if (cap) cap.textContent = cand.caption || "";
    const views = zoomModal.querySelector("[data-zoom-views]");
    if (views) views.textContent = String(cand.views ?? 0);
    const platform = zoomModal.querySelector("[data-zoom-platform]");
    if (platform)
      platform.textContent = net === "instagram" ? "Instagram post" : "Facebook post";
    zoomModal.hidden = false;
  }
  function closeZoom() {
    if (zoomModal) zoomModal.hidden = true;
  }
  document.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", () => openZoom((btn as HTMLElement).dataset.zoom!));
  });
  zoomModal?.addEventListener("click", (event) => {
    if (event.target === zoomModal) closeZoom();
  });
  zoomModal?.querySelector("[data-zoom-close]")?.addEventListener("click", closeZoom);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && zoomModal && !zoomModal.hidden) closeZoom();
  });

  // ---- Approval gate ----
  const approval = form.querySelector("[data-approval]") as HTMLInputElement | null;
  const approvalHint = document.querySelector("[data-approval-hint]") as HTMLElement | null;
  function syncApproval() {
    if (submitButton) submitButton.disabled = !approval?.checked;
    if (approvalHint) approvalHint.hidden = !!approval?.checked;
  }
  approval?.addEventListener("change", syncApproval);
  syncApproval();

  // ---- Inline validation ----
  const summary = document.getElementById("coord-summary") as HTMLElement | null;
  const summaryList = summary?.querySelector("[data-summary-list]");
  const summaryHead = document.getElementById("coord-summary-h");

  const errNoteFor = (key: string) =>
    document.querySelector<HTMLElement>(`[data-err-for="${key}"]`);
  function clearFieldError(key: string) {
    field(key)?.removeAttribute("aria-invalid");
    const note = errNoteFor(key);
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
  }
  function clearAllErrors() {
    Object.keys(SNAP_LABELS).forEach(clearFieldError);
    if (summary) summary.hidden = true;
  }
  Object.keys(SNAP_LABELS).forEach((key) => {
    field(key)?.addEventListener("input", () => clearFieldError(key));
  });

  function validateSnapshot(): Record<string, string> {
    const errs: Record<string, string> = {};
    const v = (name: string) => (field(name)?.value ?? "").trim();
    if (!v("address"))
      errs.address = "Enter the listing address — it appears on the report cover.";
    const url = v("listing_url");
    if (!url || !/^https?:\/\//i.test(url))
      errs.listing_url = "Add the listing’s website link (starting with https://).";
    const showings = field("showings")?.value ?? "";
    if (showings === "") errs.showings = "Enter the number of showings (0 or higher).";
    else if (Number.isNaN(Number(showings)) || Number(showings) < 0)
      errs.showings = "Enter a number that’s 0 or higher.";
    ["website_views", "realtor_listing_views", "days_on_market", "facebook_views", "instagram_views"].forEach(
      (key) => {
        const val = field(key)?.value ?? "";
        if (val !== "" && (Number.isNaN(Number(val)) || Number(val) < 0))
          errs[key] = "Enter a number that’s 0 or higher.";
      }
    );
    ["facebook_post_url", "instagram_post_url"].forEach((key) => {
      const val = v(key);
      if (val && !/^https?:\/\//i.test(val))
        errs[key] = "This doesn’t look like a valid link — it should start with https://.";
    });
    return errs;
  }
  function showErrors(errs: Record<string, string>) {
    const keys = Object.keys(errs);
    if (summaryList) summaryList.innerHTML = "";
    keys.forEach((key) => {
      field(key)?.setAttribute("aria-invalid", "true");
      const note = errNoteFor(key);
      if (note) {
        note.textContent = errs[key];
        note.hidden = false;
      }
      if (summaryList) {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${SNAP_LABELS[key] ?? key}</strong> — ${errs[key]}`;
        summaryList.appendChild(li);
      }
    });
    if (summary && summaryHead) {
      summaryHead.textContent =
        keys.length === 1
          ? "One thing needs a quick fix before this report can be created."
          : `${keys.length} things need a quick fix before this report can be created.`;
      summary.hidden = false;
      window.scrollTo({
        top: summary.getBoundingClientRect().top + window.scrollY - 76,
        behavior: "smooth"
      });
      summaryHead.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    if (reviewBlock?.hidden) {
      event.preventDefault();
      return;
    }
    const errs = validateSnapshot();
    clearAllErrors();
    if (Object.keys(errs).length) {
      event.preventDefault();
      showErrors(errs);
      return;
    }
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = '<span class="spin"></span>Creating your report…';
    }
  });
  window.addEventListener("pageshow", () => {
    if (submitButton) {
      submitButton.textContent = "Create Report";
      syncApproval();
    }
  });

  // Initial paint.
  setStrip("ready");
}
