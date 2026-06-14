import { defineConfig } from "@playwright/test"

export default defineConfig({
    testDir: "./src",
    testMatch: "chromium-smoke.test.js",
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI
        ? [["line"], ["html", { outputFolder: "../artifacts/playwright-report", open: "never" }]]
        : "line",
    outputDir: "../artifacts/test-results",
    use: {
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    }
})
