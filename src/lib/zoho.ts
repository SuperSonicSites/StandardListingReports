// Zoho CRM API v8, Canadian data centre. Server-side only: the OAuth client comes
// from the variables client_id / client_secret / refresh_token / api_domain, and
// neither they nor the access token ever reach the browser or a log line. Logs carry
// HTTP status and Zoho codes only — never record bodies (the REALTOR.ca link in a
// listing ad is private).

const ACCOUNTS_URL = "https://accounts.zohocloud.ca"; // Canada DC; pairs with https://www.zohoapis.ca
// Access tokens live 1 h, and a refresh token mints at most 10 per 10 min (a limit the
// REALTOR import Worker may share), so keep one and reuse it.
const TOKEN_TTL_MS = 55 * 60_000;
const TIMEOUT_MS = 15_000;
// A create gets longer: giving up early doesn't stop Zoho committing, it only makes the outcome unknown.
const CREATE_TIMEOUT_MS = 30_000;
const NO_RESPONSE = "NO_RESPONSE";

type Env = "client_id" | "client_secret" | "refresh_token" | "api_domain";

function env(name: Env): string | undefined {
  // The names were given lowercase for Railway but pasted uppercase into a local .env,
  // and Linux env names are case-sensitive — accept either spelling. Trim: platform
  // variable UIs love to smuggle in trailing whitespace/newlines.
  const upper = name.toUpperCase();
  const value = (process.env[name] ?? process.env[upper] ?? import.meta.env[name] ?? import.meta.env[upper])?.trim();
  return value || undefined;
}

export function zohoConfigured() {
  return Boolean(env("client_id") && env("client_secret") && env("refresh_token"));
}

let cached: { token: string; apiDomain: string; expires: number } | undefined;
let refreshing: Promise<{ token: string; apiDomain: string }> | undefined;

async function refresh() {
  const response = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    // Credentials in the body, never the query string (query strings end up in logs).
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env("client_id") ?? "",
      client_secret: env("client_secret") ?? "",
      refresh_token: env("refresh_token") ?? ""
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const apiDomain = String(env("api_domain") ?? body.api_domain ?? "").replace(/\/+$/, "");
  if (!response.ok || typeof body.access_token !== "string" || !apiDomain.startsWith("https://")) {
    console.error(`[zoho] token refresh failed: HTTP ${response.status} ${String(body.error ?? "")}`.trim());
    throw new Error("token refresh failed");
  }
  cached = { token: body.access_token, apiDomain, expires: Date.now() + TOKEN_TTL_MS };
  return cached;
}

function accessToken(force = false) {
  if (!force && cached && cached.expires > Date.now()) return Promise.resolve(cached);
  refreshing ??= refresh().finally(() => (refreshing = undefined));
  return refreshing;
}

// One authenticated call. An expired/revoked token (401 INVALID_TOKEN) is refreshed and
// the call repeated once — safe even for a create, since a 401 means nothing was done.
async function call(path: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS, retried = false): Promise<Response> {
  const { token, apiDomain } = await accessToken(retried);
  let response: Response;
  try {
    response = await fetch(`${apiDomain}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Zoho-oauthtoken ${token}` },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new Error(NO_RESPONSE); // timed out or dropped: the request may or may not have landed
  }
  if (response.status === 401 && !retried) {
    const code = ((await response.clone().json().catch(() => ({}))) as { code?: string }).code;
    if (code === "INVALID_TOKEN") return call(path, init, timeoutMs, true);
  }
  return response;
}

export type CreateOutcome =
  | { kind: "created"; id: string }
  // CRM answered and did not create anything (bad data, permissions, rate limit, auth).
  | { kind: "rejected"; status: number; code: string; field?: string }
  // No usable answer: the record may exist. Look before trying again.
  | { kind: "uncertain" };

/** Insert one record. No `trigger` key, so CRM workflows run exactly as for any new record. */
export async function createRecord(module: string, record: Record<string, unknown>): Promise<CreateOutcome> {
  let response: Response;
  try {
    response = await call(
      `/crm/v8/${module}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: [record] }) },
      CREATE_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof Error && error.message === NO_RESPONSE) {
      console.error(`[zoho] create ${module}: no response`);
      return { kind: "uncertain" };
    }
    return { kind: "rejected", status: 503, code: "AUTH_UNAVAILABLE" }; // token refresh failed; nothing sent
  }

  const body = (await response.json().catch(() => null)) as Record<string, any> | null;
  const item = Array.isArray(body?.data) ? body.data[0] : undefined;
  if (response.ok && item?.code === "SUCCESS" && item.details?.id) {
    return { kind: "created", id: String(item.details.id) };
  }
  // A 5xx, or a success status whose body never arrived, says nothing about the record.
  if (response.status >= 500 || (response.ok && !body)) {
    console.error(`[zoho] create ${module}: HTTP ${response.status}, outcome unknown`);
    return { kind: "uncertain" };
  }
  const code = String(item?.code ?? body?.code ?? `HTTP_${response.status}`);
  const field = item?.details?.api_name ?? body?.details?.api_name;
  console.error(`[zoho] create ${module} rejected: HTTP ${response.status} ${code}${field ? ` (${field})` : ""}`);
  return { kind: "rejected", status: response.status, code, ...(field ? { field: String(field) } : {}) };
}

/** Newest records first (Created_Time desc). Throws when CRM can't be read. */
export async function listRecentRecords(module: string, fields: string[], perPage = 50) {
  const query = new URLSearchParams({
    fields: fields.join(","),
    sort_by: "Created_Time",
    sort_order: "desc",
    per_page: String(perPage)
  });
  const response = await call(`/crm/v8/${module}?${query}`);
  if (response.status === 204) return [];
  const body = (await response.json().catch(() => null)) as { data?: unknown; code?: string } | null;
  if (!response.ok || !Array.isArray(body?.data)) {
    throw new Error(`list ${module} failed: HTTP ${response.status} ${body?.code ?? ""}`.trim());
  }
  return body.data as Record<string, unknown>[];
}
