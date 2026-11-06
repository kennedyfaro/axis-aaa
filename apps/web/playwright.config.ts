import path from "node:path";
import { defineConfig } from "@playwright/test";

try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // Em CI as variaveis podem vir do ambiente.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
