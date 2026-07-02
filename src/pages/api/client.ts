import type { APIRoute } from "astro";
import { clientExists, slugify, writeClient } from "../../lib/storage";
import type { ClientProfile } from "../../lib/types";

export const prerender = false;

const hex = /^#[0-9a-fA-F]{6}$/;
const digits = /^[0-9]{1,32}$/;

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
  const form = await request.formData();
  const name = field(form, "name");
  const slug = slugify(field(form, "slug") || name);
  const logoUrl = field(form, "logo_url");

  if (!name || !slug) {
    return errorPage(400, "Client name and slug are required.");
  }

  // A white-label profile must carry its own logo — never another client's.
  if (!logoUrl) {
    return errorPage(400, "Logo URL is required (a local /clients/... path or an https link).");
  }

  // Creating must not silently overwrite an existing profile; edits declare themselves.
  if (field(form, "mode") !== "edit" && (await clientExists(slug))) {
    return errorPage(409, `A client with the slug "${slug}" already exists. Edit it from the home page instead.`);
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
    ...(metaPageId ? { meta_page_id: metaPageId } : {}),
    ...(metaInstagramId ? { meta_instagram_id: metaInstagramId } : {}),
    ...(rybbitSiteId ? { rybbit_site_id: rybbitSiteId } : {})
  };

  await writeClient(client);
  return redirect(`/c/${client.slug}/`);
};
