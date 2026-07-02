import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone"
  }),
  security: {
    // Behind a TLS-terminating proxy (Railway, Cloudflare) Astro reconstructs an
    // http:// origin that never matches the browser's https Origin header, so the
    // default CSRF check rejects every form POST. This is an internal tool gated by
    // an access layer (Cloudflare Access) in front, not by origin checks.
    checkOrigin: false
  }
});
