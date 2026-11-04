import { readFileSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

/** Applies the production security headers locally, so tests run under the real policy. */
function productionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of readFileSync(new URL("./public/_headers", import.meta.url), "utf8").split("\n")) {
    const match = /^\s+([\w-]+):\s*(.+)$/.exec(line);
    if (match) headers[match[1]!] = match[2]!;
  }
  return headers;
}

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    target: "es2022",
    // The preload polyfill uses fetch, which the security policy deliberately blocks.
    modulePreload: { polyfill: false },
  },
  worker: { format: "es" },
  preview: { headers: productionHeaders() },
});
