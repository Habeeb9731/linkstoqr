import { defineConfig, devices } from "@playwright/test";

const deployedUrl = process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  reporter: "list",
  use: { baseURL: deployedUrl ?? "http://localhost:4173", acceptDownloads: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: deployedUrl
    ? undefined
    : { command: "npm run build && npm run preview", url: "http://localhost:4173", reuseExistingServer: false },
});
