import { Buffer } from "node:buffer";
import type { APIRoute } from "astro";
import { isAdmin, sha256 } from "../../lib/auth";
import { clientExists, deleteClient, readClient, slugify, writeClient } from "../../lib/storage";
import type { ClientProfile } from "../../lib/types";

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

function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: location }
  });
}

function errorPage(status: number, message: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Client not saved</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;">
<h1 style="font-size:1.25rem;">Client not saved</h1>
<p>${message}</p>
<p>Use your browser's <strong>Back</strong> button to return to the form — your entries are preserved there.</p>
</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
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
    try {
      await deleteClient(field(form, "slug"));
    } catch {
      return errorPage(404, "Client profile not found.");
    }
    return redirect("/");
  }

  const name = field(form, "name");
  const slug = slugify(field(form, "slug") || name);
  const isEdit = field(form, "mode") === "edit";

  if (!name || !slug) {
    return errorPage(400, "Client name and slug are required.");
  }

  // Creating must not silently overwrite an existing profile; edits declare themselves.
  if (!isEdit && (await clientExists(slug))) {
    return errorPage(409, `A client with the slug "${slug}" already exists. Edit it from the home page instead.`);
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
    ...(rybbitSiteId ? { rybbit_site_id: rybbitSiteId } : {})
  };

  await writeClient(client);
  return redirect(`/c/${client.slug}/`);
};
