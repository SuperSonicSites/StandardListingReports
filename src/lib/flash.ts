import type { AstroCookies } from "astro";

// A one-shot success message carried across a 303 redirect via a short-lived
// cookie, so the confirmation ("Client created", "Changes saved", "X was
// deleted") survives the navigation without leaking the text into browser
// history the way a query string would. Read once, then cleared.
const FLASH_COOKIE = "ss_flash";

export function redirectWithFlash(location: string, message: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Set-Cookie": `${FLASH_COOKIE}=${encodeURIComponent(message)}; Path=/; Max-Age=15; SameSite=Lax`
    }
  });
}

export function takeFlash(cookies: AstroCookies): string | null {
  const cookie = cookies.get(FLASH_COOKIE);
  if (!cookie?.value) return null;
  cookies.delete(FLASH_COOKIE, { path: "/" });
  try {
    return decodeURIComponent(cookie.value);
  } catch {
    return cookie.value;
  }
}
