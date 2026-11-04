import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "linkstoqr-web",
    compatibilityDate: "2026-11-01",
    // The privacy notice promises no tracking, so keep no request logs.
    observability: { enabled: false, logs: { enabled: false }, traces: { enabled: false } },
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
  },
});
