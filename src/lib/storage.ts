import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientProfile, ReportSnapshot } from "./types";

const dataDir = path.join(process.cwd(), "data");
const clientsDir = path.join(dataDir, "clients");
const snapshotsDir = path.join(dataDir, "snapshots");
const safeId = /^[a-z0-9-]+$/;

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
