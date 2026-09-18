// Seller Market Update: the market section of the coordinator form. Fills the editable
// market inputs from the pull, switches them when the property type changes, flips the
// source to "manual" as soon as the coordinator edits a value, and previews the
// interpretation and the cover's "Where your property stands" live with the same rules
// /api/snapshot freezes.
import {
  EMPTY_MARKET_VALUES,
  interpretMarket,
  interpretProperty,
  MARKET_VALUE_KEYS,
  monthLabel,
  sellerVerdict,
  TYPE_LABELS,
  type MarketValues,
  type RecordType
} from "../lib/market-rules";

type PulledRecord = MarketValues & { type: RecordType; type_label: string; price_label: string };
export type PulledMarket = {
  configured: boolean;
  source: "board_stats" | "manual";
  region_label: string;
  board_label: string;
  reporting_month: string;
  source_url: string;
  retrieved_at: string;
  local_label: string;
  local_source_url: string;
  by_type: Partial<Record<RecordType, PulledRecord>>;
  warnings: string[];
};

export function initMarketForm(form: HTMLFormElement, setNotice: (key: string, message: string | null) => void) {
  const section = form.querySelector<HTMLElement>("[data-market-section]");
  if (!section) return null;

  const field = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  const setVal = (name: string, value: unknown) => {
    const el = field(name);
    if (el) el.value = value === null || value === undefined ? "" : String(value);
  };
  const typeSelect = field("property_type") as HTMLSelectElement | null;
  const listMarket = section.querySelector<HTMLElement>("[data-interpretation-market]");
  const listProperty = section.querySelector<HTMLElement>("[data-interpretation-property]");
  const verdictHeadline = section.querySelector<HTMLElement>("[data-verdict-headline]");
  const verdictDetail = section.querySelector<HTMLElement>("[data-verdict-detail]");
  const meta = section.querySelector<HTMLElement>("[data-market-meta]");
  const sourceLink = section.querySelector<HTMLAnchorElement>("[data-market-source-link]");

  let pulled: PulledMarket | null = null;

  const currentType = (): RecordType => (typeSelect?.value as RecordType) || "single_family";

  function readValues(): MarketValues {
    const values: MarketValues = { ...EMPTY_MARKET_VALUES };
    for (const key of MARKET_VALUE_KEYS) {
      const raw = (field(`market_${key}`)?.value ?? "").trim().replace(/,/g, "");
      const value = raw === "" ? NaN : Number(raw);
      values[key] = Number.isFinite(value) ? value : null;
    }
    return values;
  }

  function renderList(target: HTMLElement | null, sentences: string[]) {
    if (!target) return;
    target.innerHTML = "";
    if (sentences.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nothing to say yet — fill in the market numbers above.";
      target.appendChild(li);
      return;
    }
    for (const sentence of sentences) {
      const li = document.createElement("li");
      li.textContent = sentence;
      target.appendChild(li);
    }
  }

  function refreshPreview() {
    const values = readValues();
    const ctx = {
      region_label: field("market_region_label")?.value || "your market",
      reporting_month: field("market_reporting_month")?.value || "",
      type_label: field("market_type_label")?.value || TYPE_LABELS[currentType()],
      local_label: field("market_local_label")?.value || ""
    };
    const num = (name: string) => {
      const raw = (field(name)?.value ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    const property = { days_on_market: num("days_on_market") ?? 0, realtor_views: num("realtor_listing_views") ?? 0, showings: num("showings") };
    renderList(listMarket, interpretMarket(values, ctx));
    renderList(listProperty, interpretProperty(values, ctx, property, null));
    // The exposure comparison is added at creation (it needs the archive), so the preview
    // headline can differ slightly from the final one.
    const verdict = sellerVerdict(values, ctx, property, null);
    if (verdictHeadline) verdictHeadline.textContent = verdict.headline;
    if (verdictDetail) verdictDetail.textContent = verdict.detail;
  }

  function applyRecord() {
    if (!pulled) return;
    // A board that only publishes a residential total serves every property type.
    const type = currentType();
    const record = pulled.by_type[type] ?? pulled.by_type.all ?? null;
    for (const key of MARKET_VALUE_KEYS) setVal(`market_${key}`, record ? record[key] : null);
    setVal("market_type_label", record?.type_label ?? TYPE_LABELS[type]);
    setVal("market_price_label", record?.price_label ?? "Benchmark price");
    setVal("market_source", record ? "board_stats" : "manual");
    const priceLabel = section?.querySelector<HTMLElement>("[data-market-price-label]");
    if (priceLabel) priceLabel.textContent = record?.price_label ?? "Price";
    refreshPreview();
  }

  function applyPull(block: PulledMarket | null | undefined) {
    pulled = block ?? null;
    if (!pulled || !pulled.reporting_month) {
      setVal("market_source", "manual");
      setNotice(
        "market",
        pulled?.warnings?.[0] ??
          (pulled && !pulled.configured
            ? "This client has no market region set yet — ask Supersonic to add it, or enter the numbers by hand."
            : "Market statistics couldn't be pulled — enter them by hand or leave the section blank to omit it.")
      );
      if (meta) meta.textContent = "No market data pulled.";
      refreshPreview();
      return;
    }
    setVal("market_region_label", pulled.region_label);
    setVal("market_board_label", pulled.board_label);
    setVal("market_reporting_month", pulled.reporting_month);
    setVal("market_source_url", pulled.source_url);
    setVal("market_retrieved_at", pulled.retrieved_at);
    setVal("market_local_label", pulled.local_label);
    setVal("market_local_source_url", pulled.local_source_url);
    const localLabel = section?.querySelector<HTMLElement>("[data-market-local-label]");
    if (localLabel) localLabel.textContent = pulled.local_label ? `in ${pulled.local_label}` : "locally";
    if (meta) {
      meta.textContent = `${pulled.board_label} · ${pulled.region_label} · ${monthLabel(pulled.reporting_month)}${
        pulled.local_label ? ` · live inventory for ${pulled.local_label}` : ""
      }`;
    }
    if (sourceLink) {
      sourceLink.href = pulled.source_url;
      sourceLink.hidden = !pulled.source_url;
    }
    setNotice("market", pulled.warnings?.[0] ?? null);
    applyRecord();
  }

  typeSelect?.addEventListener("change", applyRecord);
  // Any hand edit makes the block "manual" on the snapshot — the source label is honest.
  section.querySelectorAll<HTMLInputElement>("[data-market-input]").forEach((input) => {
    input.addEventListener("input", () => {
      setVal("market_source", "manual");
      refreshPreview();
    });
  });
  ["days_on_market", "realtor_listing_views", "showings", "market_reporting_month"].forEach((name) => {
    field(name)?.addEventListener("input", refreshPreview);
  });

  refreshPreview();
  return { applyPull, refreshPreview };
}
