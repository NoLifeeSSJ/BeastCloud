import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5090",
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        "/workspace/tools/chrome/opt/google/chrome/chrome",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e/server.mjs",
    url: "http://127.0.0.1:5090/api/health",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "../../test-results/browser.json" }],
  ],
});
