const GRAPH_VERSION = "v21.0"; // Validated end-to-end against the live Graph API (2026-07). Supported into late 2026.
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 8000;
// A browser UA makes Facebook serve the public post HTML (with og:url) instead of a bot/login stub.
const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
// Facebook post reach/impressions were removed in Meta's 2025-2026 Page Insights deprecation
// (post_impressions*/post_reach all error #100). For distribution ("Views") we report the LARGEST
// available number: max(post_video_views, post_clicks). Video posts contribute real views; photo/
// text/album posts contribute total clicks (the only distribution signal left). One "Views" number.

export type MetaSocialResult = {
  source: "meta_api" | "manual" | "mock";
  views: number; // distribution: IG total views / FB video views (0 on failure or FB non-video post)
  caption?: string;
  media_url?: string;
  warning?: string;
};

// `.env` values live on import.meta.env under Astro/Vite; process.env only holds real runtime env
// vars. Prefer a runtime override, fall back to the .env-loaded value.
function metaToken(): string | undefined {
  return process.env.META_SYSTEM_USER_TOKEN ?? import.meta.env.META_SYSTEM_USER_TOKEN;
}

function demoMode(): boolean {
  return (process.env.DEMO_MODE ?? import.meta.env.DEMO_MODE) === "1";
}

function notConfigured(kind: "Facebook" | "Instagram", reason = "Meta is not configured for this client"): MetaSocialResult {
  return {
    source: "manual",
    views: 0,
    warning: `${reason}. Enter ${kind} numbers manually.`
  };
}

function noMatch(kind: "Facebook" | "Instagram"): MetaSocialResult {
  const owner = kind === "Facebook" ? "Page's 50 most recent posts" : "account's 50 most recent media";
  return {
    source: "manual",
    views: 0,
    warning: `${kind} post not found in the ${owner}. Older posts can't be auto-matched — check the link or enter numbers manually.`
  };
}

function graphError(kind: "Facebook" | "Instagram"): MetaSocialResult {
  return {
    source: "manual",
    views: 0,
    warning: `${kind} auto-fetch unavailable. Please enter numbers manually.`
  };
}

// Token goes in the Authorization header (Graph API supports Bearer auth), never in the
// URL — query strings end up in server logs and error messages.
async function fetchJson(url: string, token: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = await response.json();
  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || `Graph API error ${response.status}`);
  }
  return body;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  return await response.text();
}

// Under the "new Pages experience" a Page access token is required to read a Page's posts/insights.
// Mint one from the System User token; returns undefined if the token has no access to the Page.
async function getPageAccessToken(pageId: string, userToken: string): Promise<string | undefined> {
  try {
    const body = await fetchJson(`${GRAPH}/${pageId}?fields=access_token`, userToken);
    return typeof body?.access_token === "string" ? body.access_token : undefined;
  } catch {
    return undefined;
  }
}

// Resolve a pasted Facebook post URL to its numeric post id. Copied links are opaque `pfbid...` share
// URLs that do NOT match the API's numeric permalink_url, so we fetch the public post page and read
// og:url, which Facebook renders as `.../posts/<slug>/<numeric-id>/`. Numeric/story_fbid links skip the fetch.
async function resolveFacebookPostId(postUrl: string): Promise<string | undefined> {
  try {
    const url = new URL(postUrl);
    const storyFbid = url.searchParams.get("story_fbid");
    if (storyFbid && /^\d{6,}$/.test(storyFbid)) return storyFbid;
    const inPath = url.pathname.match(/\/(?:posts|videos|photos|permalink)\/(\d{10,})/);
    if (inPath) return inPath[1];

    url.host = "m.facebook.com";
    const html = await fetchText(url.toString());
    const canonical =
      html.match(/property="og:url"\s+content="([^"]+)"/i)?.[1] ??
      html.match(/rel="canonical"\s+href="([^"]+)"/i)?.[1];
    const ids = canonical?.match(/\d{10,}/g);
    return ids ? ids[ids.length - 1] : undefined; // the post id is the last long number in the canonical URL
  } catch {
    return undefined;
  }
}

// Instagram shortcode from a /p/, /reel/, /reels/, or /tv/ URL (e.g. .../p/DaQkKgEjwkD/ -> "DaQkKgEjwkD").
// The share sheet produces /reel/, but browser-address-bar copies use /reels/ — accept both.
function instagramShortcode(value: string): string | undefined {
  try {
    const match = new URL(value).pathname.match(/\/(?:p|reels?|tv)\/([^/]+)/i);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch views for an organic Facebook post. NEVER throws. Distribution is video views
 * (post_video_views): a real count for video posts, 0 for photo/text posts (Meta returns no view
 * metric for those). Organic posts only.
 */
export async function fetchFacebookPostMetrics(
  pageId: string | undefined,
  postUrl: string
): Promise<MetaSocialResult> {
  const token = metaToken();
  if (!token) {
    // Demo stub: fabricated data labeled "mock", only when explicitly opted in (see rybbit.ts).
    if (demoMode()) return { source: "mock", views: 512 };
    return notConfigured("Facebook", "Meta token is not configured");
  }
  if (!pageId || !postUrl) {
    return notConfigured("Facebook");
  }

  try {
    const pageToken = await getPageAccessToken(pageId, token);
    if (!pageToken) {
      return graphError("Facebook"); // token cannot access this Page (asset not assigned / no role)
    }

    const numericId = await resolveFacebookPostId(postUrl);
    if (!numericId) {
      return noMatch("Facebook");
    }

    const postId = `${pageId}_${numericId}`;
    const post = await fetchJson(`${GRAPH}/${postId}?fields=message,full_picture`, pageToken);

    // Distribution ("Views"): report the largest available number (client-facing reporting).
    // post_video_views is a real count on videos and 0 (not an error) on non-video posts; post_clicks
    // is the only distribution signal left for photo/text/album posts. Both are always valid, so we
    // take the max of whatever values come back.
    let views = 0;
    try {
      const insights = await fetchJson(
        `${GRAPH}/${postId}/insights?metric=post_video_views,post_clicks`,
        pageToken
      );
      const values = (insights?.data ?? [])
        .map((m: any) => m?.values?.[0]?.value)
        .filter((n: any): n is number => typeof n === "number");
      views = values.length ? Math.max(...values) : 0;
    } catch {
      views = 0;
    }

    return {
      source: "meta_api",
      views,
      caption: post?.message,
      media_url: post?.full_picture
    };
  } catch {
    return graphError("Facebook");
  }
}

/**
 * Fetch views for an organic Instagram media item matched by shortcode. NEVER throws.
 * Distribution is `views` (total).
 */
export async function fetchInstagramMediaMetrics(
  igUserId: string | undefined,
  mediaUrl: string
): Promise<MetaSocialResult> {
  const token = metaToken();
  if (!token) {
    // Demo stub: fabricated data labeled "mock", only when explicitly opted in (see rybbit.ts).
    if (demoMode()) return { source: "mock", views: 167 };
    return notConfigured("Instagram", "Meta token is not configured");
  }
  if (!igUserId || !mediaUrl) {
    return notConfigured("Instagram");
  }

  const targetShortcode = instagramShortcode(mediaUrl);
  if (!targetShortcode) {
    return noMatch("Instagram");
  }

  try {
    const fields = "permalink,caption,media_url,thumbnail_url,media_type,timestamp";
    const list = await fetchJson(`${GRAPH}/${igUserId}/media?fields=${fields}&limit=50`, token);
    const media: any[] = Array.isArray(list?.data) ? list.data : [];
    const match = media.find((item) => instagramShortcode(item.permalink ?? "") === targetShortcode);

    if (!match) {
      return noMatch("Instagram");
    }

    let views = 0;
    let warning: string | undefined;
    try {
      const viewsInsights = await fetchJson(`${GRAPH}/${match.id}/insights?metric=views`, token);
      views = viewsInsights?.data?.[0]?.values?.[0]?.value ?? 0;
    } catch {
      warning = "Instagram views metric unavailable for this media.";
    }

    return {
      source: "meta_api",
      views,
      caption: match.caption,
      // Reels/videos return the video file in media_url; thumbnail_url is the poster image and is
      // present only for videos, so preferring it yields a still image for any media type.
      media_url: match.thumbnail_url ?? match.media_url,
      warning
    };
  } catch {
    return graphError("Instagram");
  }
}

// --- Candidate selection ------------------------------------------------------
// Rather than make a busy realtor find and paste the exact post URL, we LIST their
// recent posts, rank the ones most likely to be this listing (MLS# / address / recency),
// and let them pick from a short dropdown. One number still ships per network.

export type MetaCandidate = {
  id: string; // Graph node id (FB: "<pageid>_<postid>", IG: media id) — used for insights
  permalink: string;
  caption: string;
  media_url: string;
  views: number | null; // null until enriched (we only enrich the shortlist)
  timestamp: string; // ISO-ish created time
};

export type MetaCandidatesResult = {
  source: "meta_api" | "manual" | "mock";
  candidates: MetaCandidate[];
  warning?: string;
};

function noCandidates(kind: "Facebook" | "Instagram", reason: string): MetaCandidatesResult {
  return { source: "manual", candidates: [], warning: `${reason} Enter the ${kind} post manually.` };
}

// DEMO_MODE only, labeled source: "mock" — never reaches a real client (see integration rules).
function mockCandidates(prefix: string, base: number): MetaCandidate[] {
  const captions = ["Just listed ✨ book your showing", "Price improved — don't miss it", "Open house this weekend"];
  return captions.map((caption, i) => ({
    id: `mock_${prefix}_${i}`,
    permalink: `https://example.com/${prefix}/mock-${i}`,
    caption,
    media_url: "",
    views: base + i * 41,
    timestamp: `2026-0${i + 4}-15T12:00:00+0000`
  }));
}

/** List a Page's recent posts as ranking candidates. NEVER throws. */
export async function fetchFacebookPostCandidates(pageId: string | undefined): Promise<MetaCandidatesResult> {
  const token = metaToken();
  if (!token) {
    if (demoMode()) return { source: "mock", candidates: mockCandidates("facebook", 420) };
    return noCandidates("Facebook", "Meta token is not configured.");
  }
  if (!pageId) return noCandidates("Facebook", "Meta is not configured for this client.");

  try {
    const pageToken = await getPageAccessToken(pageId, token);
    if (!pageToken) return noCandidates("Facebook", "Facebook auto-fetch unavailable.");
    const body = await fetchJson(
      `${GRAPH}/${pageId}/posts?fields=message,full_picture,permalink_url,created_time&limit=25`,
      pageToken
    );
    const items: any[] = Array.isArray(body?.data) ? body.data : [];
    const candidates = items
      .map((item) => ({
        id: String(item.id ?? ""),
        permalink: String(item.permalink_url ?? ""),
        caption: String(item.message ?? ""),
        media_url: String(item.full_picture ?? ""),
        views: null,
        timestamp: String(item.created_time ?? "")
      }))
      .filter((c) => c.id);
    return { source: "meta_api", candidates };
  } catch {
    return noCandidates("Facebook", "Facebook auto-fetch unavailable.");
  }
}

/** List an IG account's recent media as ranking candidates. NEVER throws. */
export async function fetchInstagramMediaCandidates(igUserId: string | undefined): Promise<MetaCandidatesResult> {
  const token = metaToken();
  if (!token) {
    if (demoMode()) return { source: "mock", candidates: mockCandidates("instagram", 150) };
    return noCandidates("Instagram", "Meta token is not configured.");
  }
  if (!igUserId) return noCandidates("Instagram", "Meta is not configured for this client.");

  try {
    const fields = "permalink,caption,media_url,thumbnail_url,media_type,timestamp";
    const list = await fetchJson(`${GRAPH}/${igUserId}/media?fields=${fields}&limit=50`, token);
    const items: any[] = Array.isArray(list?.data) ? list.data : [];
    const candidates = items
      .map((item) => ({
        id: String(item.id ?? ""),
        permalink: String(item.permalink ?? ""),
        caption: String(item.caption ?? ""),
        media_url: String(item.thumbnail_url ?? item.media_url ?? ""),
        views: null,
        timestamp: String(item.timestamp ?? "")
      }))
      .filter((c) => c.id);
    return { source: "meta_api", candidates };
  } catch {
    return noCandidates("Instagram", "Instagram auto-fetch unavailable.");
  }
}

export type RankContext = {
  mls?: string | null;
  address?: string | null;
  listDate?: string | null;
  startDate?: string | null;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Rank candidates by how likely each is THIS listing's post: MLS# exact match in the
 * caption (strongest), then address-token overlap, then recency near the listing date.
 * Returns the top `limit` (default 4). Pure — no I/O.
 */
export function rankCandidates(candidates: MetaCandidate[], ctx: RankContext, limit = 4): MetaCandidate[] {
  const addrTokens = ctx.address ? tokenize(ctx.address) : [];
  const mls = normalize(ctx.mls ?? "");
  const anchorMs = dateMs(ctx.listDate) ?? dateMs(ctx.startDate);

  const scored = candidates.map((candidate) => {
    let score = 0;
    if (mls && normalize(candidate.caption).includes(mls)) score += 100;
    if (addrTokens.length) {
      const capTokens = new Set(tokenize(candidate.caption));
      const hits = addrTokens.filter((t) => capTokens.has(t)).length;
      score += (hits / addrTokens.length) * 50;
    }
    const ts = dateMs(candidate.timestamp);
    if (anchorMs && ts) {
      const days = Math.abs(ts - anchorMs) / 86_400_000;
      score += Math.max(0, 20 - days); // posts within ~20 days of listing get a bump
    }
    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score || (dateMs(b.candidate.timestamp) ?? 0) - (dateMs(a.candidate.timestamp) ?? 0));
  return scored.slice(0, limit).map((s) => s.candidate);
}

/** Fill `views` for the FB shortlist only (one insights call each). NEVER throws. */
export async function enrichFacebookViews(candidates: MetaCandidate[], pageId: string | undefined): Promise<MetaCandidate[]> {
  const token = metaToken();
  if (!token || !pageId || candidates.length === 0) return candidates;
  const pageToken = await getPageAccessToken(pageId, token);
  if (!pageToken) return candidates;
  return Promise.all(
    candidates.map(async (candidate) => {
      try {
        const insights = await fetchJson(`${GRAPH}/${candidate.id}/insights?metric=post_video_views,post_clicks`, pageToken);
        const values = (insights?.data ?? [])
          .map((m: any) => m?.values?.[0]?.value)
          .filter((n: any): n is number => typeof n === "number");
        return { ...candidate, views: values.length ? Math.max(...values) : 0 };
      } catch {
        return { ...candidate, views: 0 };
      }
    })
  );
}

/** Fill `views` for the IG shortlist only (one insights call each). NEVER throws. */
export async function enrichInstagramViews(candidates: MetaCandidate[]): Promise<MetaCandidate[]> {
  const token = metaToken();
  if (!token || candidates.length === 0) return candidates;
  return Promise.all(
    candidates.map(async (candidate) => {
      try {
        const insights = await fetchJson(`${GRAPH}/${candidate.id}/insights?metric=views`, token);
        const value = insights?.data?.[0]?.values?.[0]?.value;
        return { ...candidate, views: typeof value === "number" ? value : 0 };
      } catch {
        return { ...candidate, views: 0 };
      }
    })
  );
}
