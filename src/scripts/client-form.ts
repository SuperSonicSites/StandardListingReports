// Client-side behavior for the admin client-setup form. All of this is
// progressive enhancement over a plain POST to /api/client — the server still
// validates every rule (the wall). Field `name` attributes and the /api/client
// contract are unchanged; this only adds inline validation, live previews, and
// the delete confirmation modal.

type ErrMap = Record<string, string>;

const LABELS: Record<string, string> = {
  name: "Client name",
  slug: "Slug",
  footer_text: "Footer text",
  brokerage_name: "Brokerage",
  brokerage_contact: "Contact",
  brokerage_address: "Brokerage address",
  password: "Coordinator password",
  logo: "Logo"
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initClientForm() {
  const form = document.getElementById("client-form") as HTMLFormElement | null;
  if (!form) return;

  const mode = form.dataset.mode ?? "create";
  const existing: { slug: string; name: string }[] = JSON.parse(
    form.dataset.existing || "[]"
  );
  const byName = (name: string) =>
    form.querySelector<HTMLInputElement>(`[name="${name}"]`);

  // ---- Live slug + URL preview ----
  const nameInput = byName("name");
  const slugInput = byName("slug");
  const slugPreview = form.querySelector("[data-slug-preview]");
  let slugTouched = mode === "edit";

  const updateSlugPreview = () => {
    if (slugPreview) slugPreview.textContent = slugInput?.value || "…";
  };
  slugInput?.addEventListener("input", () => {
    slugTouched = true;
    slugInput.value = slugify(slugInput.value);
    updateSlugPreview();
    clearFieldError("slug");
  });

  // ---- Live "on the report" color preview ----
  const primarySwatch = form.querySelector<HTMLInputElement>('[data-color="primary"]');
  const accentSwatch = form.querySelector<HTMLInputElement>('[data-color="accent"]');
  const primaryHex = form.querySelector<HTMLInputElement>('[data-hex="primary"]');
  const accentHex = form.querySelector<HTMLInputElement>('[data-hex="accent"]');
  const previewName = form.querySelector<HTMLElement>("[data-preview-name]");
  const previewRule = form.querySelector<HTMLElement>("[data-preview-rule]");

  const updateColorPreview = () => {
    if (previewName && primarySwatch) {
      previewName.style.color = primarySwatch.value;
      previewName.textContent = nameInput?.value || "Client name";
    }
    if (previewRule && accentSwatch) previewRule.style.background = accentSwatch.value;
  };
  const wireColor = (
    swatch: HTMLInputElement | null,
    hex: HTMLInputElement | null
  ) => {
    swatch?.addEventListener("input", () => {
      if (hex) hex.value = swatch.value;
      updateColorPreview();
    });
    hex?.addEventListener("input", () => {
      const val = hex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(val) && swatch) {
        swatch.value = val;
        updateColorPreview();
      }
    });
  };
  wireColor(primarySwatch, primaryHex);
  wireColor(accentSwatch, accentHex);

  nameInput?.addEventListener("input", () => {
    if (mode === "create" && !slugTouched && slugInput) {
      slugInput.value = slugify(nameInput.value);
      updateSlugPreview();
    }
    updateColorPreview();
    clearFieldError("name");
  });

  // ---- Live disclaimer fine-print preview ----
  const disclaimerEl = form.querySelector("[data-disclaimer-preview]");
  const updateDisclaimer = () => {
    if (!disclaimerEl) return;
    const contact = byName("brokerage_contact")?.value.trim() || "Contact name";
    const brokerage = byName("brokerage_name")?.value.trim() || "Brokerage";
    const address = byName("brokerage_address")?.value.trim() || "Address";
    disclaimerEl.textContent = `${contact}, ${brokerage} · ${address}`;
  };
  form
    .querySelectorAll("[data-disclaimer-src]")
    .forEach((el) => el.addEventListener("input", updateDisclaimer));
  updateDisclaimer();

  // ---- Password: show/hide + "looks good" affirmation ----
  const pw = byName("password");
  const pwToggle = form.querySelector("[data-pw-toggle]");
  const pwAffirm = form.querySelector<HTMLElement>("[data-pw-affirm]");
  pwToggle?.addEventListener("click", () => {
    if (!pw) return;
    const reveal = pw.type === "password";
    pw.type = reveal ? "text" : "password";
    pwToggle.textContent = reveal ? "Hide" : "Show";
    pwToggle.setAttribute("aria-pressed", String(reveal));
    pwToggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    pw.focus();
  });
  pw?.addEventListener("input", () => {
    if (pwAffirm) pwAffirm.hidden = pw.value.length < 8;
    clearFieldError("password");
  });

  // ---- Data-sources connected count (edit) ----
  const intCount = form.querySelector("[data-int-count]");
  if (intCount) {
    const ints = Array.from(form.querySelectorAll<HTMLInputElement>("[data-int]"));
    const updateIntCount = () => {
      const n = ints.filter((i) => i.value.trim()).length;
      intCount.textContent = `${n} of 4 connected`;
    };
    ints.forEach((i) => i.addEventListener("input", updateIntCount));
  }

  // ---- Unified logo control (dropzone preview) ----
  const logoFile = form.querySelector<HTMLInputElement>("[data-logo-file]");
  const chosen = form.querySelector<HTMLElement>("[data-logo-chosen]");
  const currentLogo = form.querySelector<HTMLElement>("[data-current-logo]");
  const logoWhite = form.querySelector<HTMLImageElement>("[data-logo-white]");
  const logoDark = form.querySelector<HTMLImageElement>("[data-logo-dark]");
  const logoName = form.querySelector<HTMLElement>("[data-logo-name]");
  logoFile?.addEventListener("change", () => {
    const file = logoFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      if (logoWhite) logoWhite.src = src;
      if (logoDark) logoDark.src = src;
      if (logoName) logoName.textContent = file.name;
      if (chosen) chosen.hidden = false;
      if (currentLogo) currentLogo.hidden = true;
    };
    reader.readAsDataURL(file);
    clearFieldError("logo");
  });
  form.querySelector("[data-logo-remove]")?.addEventListener("click", () => {
    if (logoFile) logoFile.value = "";
    if (chosen) chosen.hidden = true;
    if (currentLogo) currentLogo.hidden = false;
  });

  // ---- Inline validation ----
  const summary = document.getElementById("client-summary") as HTMLElement | null;
  const summaryList = summary?.querySelector("[data-summary-list]");
  const summaryHead = document.getElementById("client-summary-h");

  const errNoteFor = (key: string) =>
    form.querySelector<HTMLElement>(`[data-err-for="${key}"]`);
  const inputFor = (key: string) =>
    (byName(key) as HTMLElement | null) ??
    form.querySelector<HTMLElement>(`[data-field="${key}"]`);

  function clearFieldError(key: string) {
    inputFor(key)?.removeAttribute("aria-invalid");
    const note = errNoteFor(key);
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
  }
  function clearAllErrors() {
    Object.keys(LABELS).forEach(clearFieldError);
    if (summary) summary.hidden = true;
  }
  form.querySelectorAll("[data-field]").forEach((el) => {
    const key = (el as HTMLElement).dataset.field!;
    el.addEventListener("input", () => clearFieldError(key));
  });

  function validate(): ErrMap {
    const errs: ErrMap = {};
    const v = (name: string) => (byName(name)?.value ?? "").trim();
    if (!v("name")) errs.name = "Give the client a name.";
    const slug = v("slug");
    if (!slug) errs.slug = "Add a slug (lowercase letters, numbers, and hyphens).";
    else if (mode === "create" && existing.some((c) => c.slug === slug))
      errs.slug = "collision";
    if (!v("footer_text"))
      errs.footer_text = "Add the footer line that appears on every report.";
    if (!v("brokerage_name")) errs.brokerage_name = "Enter the brokerage name.";
    if (!v("brokerage_contact")) errs.brokerage_contact = "Enter a contact name.";
    if (!v("brokerage_address")) errs.brokerage_address = "Enter the brokerage address.";
    const pwVal = byName("password")?.value ?? "";
    if (mode === "create") {
      if (!pwVal) errs.password = "Set a password — it protects this client’s report link.";
      else if (pwVal.length < 8) errs.password = "Use at least 8 characters.";
    } else if (pwVal && pwVal.length < 8) {
      errs.password = "Use at least 8 characters.";
    }
    const hasFile = (logoFile?.files?.length ?? 0) > 0;
    const hasUrl = (byName("logo_url")?.value ?? "").trim().length > 0;
    if (mode === "create" && !hasFile && !hasUrl)
      errs.logo = "Add a logo — upload a file or paste an https link.";
    return errs;
  }

  function showErrors(errs: ErrMap) {
    const keys = Object.keys(errs);
    if (summaryList) summaryList.innerHTML = "";
    keys.forEach((key) => {
      inputFor(key)?.setAttribute("aria-invalid", "true");
      const note = errNoteFor(key);
      const collision = errs[key] === "collision";
      const collideName = collision
        ? existing.find((c) => c.slug === byName("slug")?.value)?.name
        : "";
      const collideSlug = byName("slug")?.value ?? "";
      if (note) {
        if (collision) {
          note.innerHTML = `That slug is already taken — <a href="/admin/clients/${collideSlug}/edit" style="text-decoration: underline">edit ${collideName} instead</a>.`;
        } else {
          note.textContent = errs[key];
        }
        note.hidden = false;
      }
      if (summaryList) {
        const li = document.createElement("li");
        const msg = collision ? "That slug is already taken." : errs[key];
        li.innerHTML = `<strong>${LABELS[key] ?? key}</strong> — ${msg}`;
        summaryList.appendChild(li);
      }
    });
    if (summary && summaryHead) {
      summaryHead.textContent =
        keys.length === 1
          ? "One field needs a quick fix before this can be saved."
          : `${keys.length} fields need a quick fix before this can be saved.`;
      summary.hidden = false;
      window.scrollTo({
        top: summary.getBoundingClientRect().top + window.scrollY - 76,
        behavior: "smooth"
      });
      summaryHead.focus();
    }
  }

  const saveBtn = document.querySelector<HTMLButtonElement>("[data-save]");
  form.addEventListener("submit", (event) => {
    const errs = validate();
    clearAllErrors();
    if (Object.keys(errs).length) {
      event.preventDefault();
      showErrors(errs);
      return;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
      form.setAttribute("aria-busy", "true");
      saveBtn.innerHTML = `<span class="spin"></span>${
        mode === "edit" ? "Saving…" : "Creating client…"
      }`;
    }
  });
  window.addEventListener("pageshow", () => {
    if (!saveBtn) return;
    saveBtn.disabled = false;
    saveBtn.textContent = mode === "edit" ? "Save changes" : "Create client";
    form.removeAttribute("aria-busy");
  });

  // ---- Delete confirmation modal ----
  initDeleteModal();
}

function initDeleteModal() {
  const modal = document.querySelector<HTMLElement>("[data-delete-modal]");
  const deleteForm = document.getElementById("delete-form") as HTMLFormElement | null;
  if (!modal || !deleteForm) return;

  const openBtn = document.querySelector<HTMLButtonElement>("[data-delete-open]");
  const cancelBtn = modal.querySelector<HTMLButtonElement>("[data-delete-cancel]");
  const confirmBtn = modal.querySelector<HTMLButtonElement>("[data-delete-confirm]");
  const input = modal.querySelector<HTMLInputElement>("[data-delete-input]");
  const card = modal.querySelector<HTMLElement>("[data-delete-card]");
  const targetName = input?.placeholder ?? "";

  const open = () => {
    modal.hidden = false;
    if (input) input.value = "";
    if (confirmBtn) confirmBtn.disabled = true;
    setTimeout(() => input?.focus(), 0);
  };
  const close = () => {
    modal.hidden = true;
    openBtn?.focus();
  };

  openBtn?.addEventListener("click", open);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  card?.addEventListener("click", (event) => event.stopPropagation());
  input?.addEventListener("input", () => {
    if (confirmBtn) confirmBtn.disabled = input.value !== targetName;
  });
  confirmBtn?.addEventListener("click", () => {
    if (!input || input.value !== targetName) return;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spin"></span>Deleting…';
    deleteForm.submit();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) close();
    if (event.key === "Tab" && !modal.hidden && card) {
      const focusables = card.querySelectorAll<HTMLElement>(
        'button, input, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}
