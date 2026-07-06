// Self-contained branded server error page, returned by /api/client and
// /api/snapshot when validation fails (JS-off or a race — inline validation
// catches the rest). It can't import an Astro component, so it ships its own
// minimal styles using the app-chrome tokens. App chrome only (never client
// brand — the white-label wall holds even on the error page).

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ErrorPageOptions = {
  status: number;
  eyebrow: string;
  title: string;
  reason: string;
  reassure?: boolean;
  primaryLabel: string;
  secondary?: { label: string; href: string };
};

export function brandedErrorPage(opts: ErrorPageOptions): Response {
  const { status, eyebrow, title, reason, reassure = false, primaryLabel, secondary } = opts;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d1522">
<title>${esc(title)}</title>
<style>
:root{--ss-ink:#0d1522;--ss-text-soft:#47536b;--ss-muted:#64748b;--ss-accent-ink:#0b6d9f;--ss-bg:#f5f7fa;--ss-border:#e4e9f0;--ss-border-strong:#cdd6e1;--ss-danger:#dc2626;--ss-danger-ink:#b91c1c;--ss-danger-soft:#fef2f2}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#182230;background:radial-gradient(1100px 380px at 50% -120px,rgba(41,171,226,.08),transparent 70%),var(--ss-bg);display:grid;place-items:center;padding:56px 16px}
.card{width:min(480px,100%);border:1px solid var(--ss-border);border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(13,21,34,.05);padding:34px 32px;text-align:center}
.icon{width:48px;height:48px;border-radius:12px;background:var(--ss-danger-soft);display:grid;place-items:center;margin:0 auto 16px}
.eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ss-danger-ink);margin:0 0 8px}
h1{font-size:1.5rem;font-weight:700;color:var(--ss-ink);margin:0 0 10px;letter-spacing:-.02em}
.reason{color:var(--ss-text-soft);line-height:1.6;margin:0 0 8px}
.reassure{color:var(--ss-muted);font-size:.86rem;margin:0 0 22px}
.actions{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;width:100%;border-radius:10px;padding:0 1.1rem;font-size:.92rem;font-weight:600;border:1px solid transparent;cursor:pointer;text-decoration:none;font-family:inherit}
.btn.primary{background:var(--ss-ink);color:#fff}
.btn.ghost{background:transparent;color:var(--ss-text-soft)}
.btn.ghost:hover{color:var(--ss-accent-ink)}
:focus-visible{outline:2.5px solid #0f8ac4;outline-offset:2px;border-radius:3px}
</style>
</head>
<body>
<main class="card">
<div class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="#dc2626" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>
<p class="eyebrow">${esc(eyebrow)}</p>
<h1>${esc(title)}</h1>
<p class="reason">${esc(reason)}</p>
${reassure ? `<p class="reassure">Nothing was lost — your entries are still on the form.</p>` : ""}
<div class="actions">
<button type="button" class="btn primary" onclick="history.back()">${esc(primaryLabel)}</button>
${secondary ? `<a class="btn ghost" href="${esc(secondary.href)}">${esc(secondary.label)}</a>` : ""}
</div>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
