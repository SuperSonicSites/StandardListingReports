import { Buffer } from "node:buffer";
import type { APIRoute } from "astro";
import { isAdmin, sha256 } from "../../lib/auth";
import { clientExists, deleteClient, readClient, slugify, writeClient } from "../../lib/storage";
import type { ClientProfile } from "../../lib/types";
import { brandedErrorPage } from "../../lib/error-page";
import { redirectWithFlash } from "../../lib/flash";

export const prerender = false;

const hex = /^#[0-9a-fA-F]{6}$/;
const digits = /^[0-9]{1,32}$/;

// Uploaded logos are stored as data URIs inside the client profile JSON itself:
// data/clients/ already lives on the persistent volume, and snapshot creation passes
// data URIs through untouched, so frozen reports keep the exact logo bytes forever.
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);
const MAX_LOGO_BYTES = 1_000_000;

function field(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function errorPage(status: number, message: string) {
  return brandedErrorPage({
    status,
    eyebrow: "Client not saved",
    title: "That didn’t save — here’s why.",
    reason: message,
    reassure: true,
    primaryLabel: "← Back to the client form"
  });
}

export const POST: APIRoute = async ({ request }) => {
  // Creating/editing clients is agency-only (self-guarded — see middleware).
  if (!isAdmin(request)) {
    return errorPage(401, "Admin sign-in required.");
  }

  const form = await request.formData();

  // Deleting removes the endpoint and revokes the coordinator password with it.
  // Snapshots stay on disk, so existing reports remain viewable by the admin.
  if (field(form, "mode") === "delete") {
    const slug = field(form, "slug");
    let name = slug;
    try {
      name = (await readClient(slug)).name;
    } catch {
      // fall back to the slug for the confirmation message
    }
    try {
      await deleteClient(slug);
    } catch {
      return errorPage(404, "Client profile not found.");
    }
    return redirectWithFlash("/", `${name} was deleted.`);
  }

  const name = field(form, "name");
  const slug = slugify(field(form, "slug") || name);
  const isEdit = field(form, "mode") === "edit";

  if (!name || !slug) {
    return errorPage(400, "Client name and slug are required.");
  }

  // Creating must not silently overwrite an existing profile; edits declare themselves.
  if (!isEdit && (await clientExists(slug))) {
    return brandedErrorPage({
      status: 409,
      eyebrow: "Client not saved",
      title: "That slug is already taken.",
      reason: `A client with the slug "${slug}" already exists.`,
      reassure: true,
      primaryLabel: "← Back to the client form",
      secondary: {
        label: "Edit the existing client instead",
        href: `/admin/clients/${slug}/edit`
      }
    });
  }

  const existing = isEdit ? await readClient(slug).catch(() => undefined) : undefined;

  // Coordinator password: required on create; blank on edit keeps the current one.
  const password = field(form, "password");
  if (password && password.length < 8) {
    return errorPage(400, "Coordinator password must be at least 8 characters.");
  }
  const passwordHash = password ? sha256(password) : existing?.password_hash;
  if (!passwordHash) {
    return errorPage(400, "A coordinator password is required — it protects this client's report link.");
  }

  // Logo resolution order: uploaded file > pasted URL > (on edit) the existing logo.
  // A white-label profile must carry its own logo — never another client's.
  let logoUrl = field(form, "logo_url");
  const logoFile = form.get("logo_file");
  if (logoFile instanceof File && logoFile.size > 0) {
    if (!LOGO_TYPES.has(logoFile.type)) {
      return errorPage(400, "Logo must be a PNG, JPEG, SVG, or WebP image.");
    }
    if (logoFile.size > MAX_LOGO_BYTES) {
      return errorPage(400, "Logo file is too large — keep it under 1 MB.");
    }
    const bytes = Buffer.from(await logoFile.arrayBuffer());
    logoUrl = `data:${logoFile.type};base64,${bytes.toString("base64")}`;
  }
  if (!logoUrl && existing) {
    logoUrl = existing.logo_url;
  }
  if (!logoUrl) {
    return errorPage(400, "A logo is required — upload an image file or paste an https link.");
  }

  // A malformed integration ID must be rejected, not silently dropped — otherwise the
  // admin believes the client is configured and pulls later degrade with no explanation.
  const ids: Record<string, string | undefined> = {};
  for (const name of ["meta_page_id", "meta_instagram_id", "rybbit_site_id"] as const) {
    const value = field(form, name);
    if (!value) continue;
    if (!digits.test(value)) {
      return errorPage(400, `${name.replaceAll("_", " ")} must be a numeric ID (up to 32 digits).`);
    }
    ids[name] = value;
  }
  const metaPageId = ids.meta_page_id;
  const metaInstagramId = ids.meta_instagram_id;
  const rybbitSiteId = ids.rybbit_site_id;

  // Optional client website — validated as http(s) so a typo can't silently break the
  // listing-URL search later.
  const websiteUrl = field(form, "website_url");
  if (websiteUrl && !isHttpUrl(websiteUrl)) {
    return errorPage(400, "Website URL must be a valid http(s) link (e.g. https://acmerealty.com).");
  }

  const client: ClientProfile = {
    slug,
    name,
    logo_url: logoUrl,
    brand_primary: hex.test(field(form, "brand_primary")) ? field(form, "brand_primary") : "#111111",
    brand_accent: hex.test(field(form, "brand_accent")) ? field(form, "brand_accent") : "#c9a86a",
    footer_text: field(form, "footer_text") || name,
    brokerage_name: field(form, "brokerage_name") || name,
    brokerage_address: field(form, "brokerage_address"),
    brokerage_contact: field(form, "brokerage_contact"),
    password_hash: passwordHash,
    ...(metaPageId ? { meta_page_id: metaPageId } : {}),
    ...(metaInstagramId ? { meta_instagram_id: metaInstagramId } : {}),
    ...(rybbitSiteId ? { rybbit_site_id: rybbitSiteId } : {}),
    ...(websiteUrl ? { website_url: websiteUrl } : {})
  };

  await writeClient(client);
  return redirectWithFlash(
    `/c/${client.slug}/`,
    isEdit ? "Changes saved." : "Client created — this is their report form."
  );
};
