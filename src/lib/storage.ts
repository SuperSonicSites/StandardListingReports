import { randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { access, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientProfile, ExposureLedger, MarketAttempt, MarketMonth, ReportSnapshot, SiteOrder } from "./types";

const dataDir = path.join(process.cwd(), "data");
const clientsDir = path.join(dataDir, "clients");
const snapshotsDir = path.join(dataDir, "snapshots");
const ordersDir = path.join(dataDir, "orders");
const safeId = /^[a-z0-9-]+$/;

// Everything under data/ is created at runtime (client profiles, snapshots) and is
// NOT in git — on a hosted container it survives deploys ONLY if a persistent volume
// is mounted at data/. A mounted volume lives on a different device than the app dir,
// so equal st_dev in a hosted environment means every deploy wipes the client list.
// Shout at boot rather than letting the loss be discovered after the fact.
if (process.env.RAILWAY_ENVIRONMENT ?? process.env.KUBERNETES_SERVICE_HOST) {
  try {
    mkdirSync(dataDir, { recursive: true });
    if (statSync(process.cwd()).dev === statSync(dataDir).dev) {
      console.warn(
        "[storage] WARNING: data/ is on the container filesystem, NOT a mounted volume. " +
          "Clients and reports WILL BE LOST on every deploy. Mount a volume at /app/data."
      );
    } else {
      console.log("[storage] data/ is on a mounted volume — clients and reports persist across deploys.");
    }
  } catch (error) {
    console.warn("[storage] Could not verify the data volume:", error);
  }
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function assertSafeId(value: string, label: string) {
  if (!safeId.test(value)) {
    throw new Error(`Invalid ${label}. Use lowercase letters, numbers, and hyphens only.`);
  }
}

async function readJson<T>(file: string) {
  const text = await readFile(file, "utf-8");
  try {
    return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
  } catch (error) {
    console.error(`Corrupt JSON in ${file}:`, error);
    throw error;
  }
}

// Write to a temp file then rename so a concurrent reader never sees a truncated file.
async function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await rename(tmp, file);
}

export function createSnapshotId() {
  return `rpt-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export async function listClients() {
  await mkdir(clientsDir, { recursive: true });
  const files = await readdir(clientsDir);
  // One corrupt or misnamed file must not take down the client list.
  const clients = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          return await readClient(file.replace(/\.json$/, ""));
        } catch {
          return null;
        }
      })
  );

  return clients
    .filter((client): client is ClientProfile => client !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function clientExists(slug: string) {
  assertSafeId(slug, "client slug");
  try {
    await access(path.join(clientsDir, `${slug}.json`));
    return true;
  } catch {
    return false;
  }
}

export async function deleteClient(slug: string) {
  assertSafeId(slug, "client slug");
  // Snapshots are intentionally left in place: existing reports stay viewable
  // (admin-only once the client's email list is gone with the profile).
  await unlink(path.join(clientsDir, `${slug}.json`));
}

export async function readClient(slug: string) {
  assertSafeId(slug, "client slug");
  const file = path.join(clientsDir, `${slug}.json`);
  return readJson<ClientProfile>(file);
}

export async function writeClient(client: ClientProfile) {
  assertSafeId(client.slug, "client slug");
  await mkdir(clientsDir, { recursive: true });
  await writeJsonAtomic(path.join(clientsDir, `${client.slug}.json`), client);
}

export async function readSnapshot(snapshotId: string) {
  assertSafeId(snapshotId, "snapshot id");
  const file = path.join(snapshotsDir, `${snapshotId}.json`);
  return readJson<ReportSnapshot>(file);
}

export async function writeSnapshot(snapshotId: string, snapshot: ReportSnapshot) {
  assertSafeId(snapshotId, "snapshot id");
  await mkdir(snapshotsDir, { recursive: true });
  await writeJsonAtomic(path.join(snapshotsDir, `${snapshotId}.json`), snapshot);
}

// --- Listing website orders: one JSON file per order, like snapshots -------------
export function createOrderId() {
  return `ord-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export async function readOrder(orderId: string) {
  assertSafeId(orderId, "order id");
  return readJson<SiteOrder>(path.join(ordersDir, `${orderId}.json`));
}

export async function writeOrder(order: SiteOrder) {
  assertSafeId(order.id, "order id");
  await mkdir(ordersDir, { recursive: true });
  await writeJsonAtomic(path.join(ordersDir, `${order.id}.json`), order);
}

/** Every order (optionally one client's), newest first. A corrupt file is skipped, not fatal. */
export async function listOrders(clientSlug?: string) {
  await mkdir(ordersDir, { recursive: true });
  const files = await readdir(ordersDir);
  const orders = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          return await readOrder(file.replace(/\.json$/, ""));
        } catch {
          return null;
        }
      })
  );
  return orders
    .filter((order): order is SiteOrder => order !== null && (!clientSlug || order.client_slug === clientSlug))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// --- Seller Market Update: monthly board statistics cache --------------------------
// One JSON file per market and reporting month, an attempt marker per market (the
// on-demand refresh throttle), and the exposure ledger. All under data/market/.
const marketDir = path.join(dataDir, "market");
const REPORTING_MONTH = /^\d{4}-\d{2}$/;

function marketFile(key: string, month: string) {
  assertSafeId(key, "market key");
  if (!REPORTING_MONTH.test(month)) throw new Error("Invalid reporting month. Use YYYY-MM.");
  return path.join(marketDir, `${key}-${month}.json`);
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function readMarketMonth(key: string, month: string) {
  return readJsonIfExists<MarketMonth>(marketFile(key, month));
}

export async function writeMarketMonth(month: MarketMonth) {
  await mkdir(marketDir, { recursive: true });
  await writeJsonAtomic(marketFile(month.key, month.reporting_month), month);
}

/** Cached reporting months for a market, newest first. */
export async function listMarketMonths(key: string): Promise<string[]> {
  assertSafeId(key, "market key");
  await mkdir(marketDir, { recursive: true });
  const prefix = `${key}-`;
  return (await readdir(marketDir))
    .filter((file) => file.startsWith(prefix) && /-\d{4}-\d{2}\.json$/.test(file))
    .map((file) => file.slice(prefix.length, -".json".length))
    .sort()
    .reverse();
}

export async function readMarketAttempt(key: string) {
  assertSafeId(key, "market key");
  return readJsonIfExists<MarketAttempt>(path.join(marketDir, `${key}-attempt.json`));
}

export async function writeMarketAttempt(key: string, attempt: MarketAttempt) {
  assertSafeId(key, "market key");
  await mkdir(marketDir, { recursive: true });
  await writeJsonAtomic(path.join(marketDir, `${key}-attempt.json`), attempt);
}

export async function listSnapshotIds(): Promise<string[]> {
  await mkdir(snapshotsDir, { recursive: true });
  return (await readdir(snapshotsDir)).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length));
}

const exposureLedgerFile = path.join(marketDir, "exposure-ledger.json");

export async function readExposureLedger() {
  return readJsonIfExists<ExposureLedger>(exposureLedgerFile);
}

export async function writeExposureLedger(ledger: ExposureLedger) {
  await mkdir(marketDir, { recursive: true });
  await writeJsonAtomic(exposureLedgerFile, ledger);
}
