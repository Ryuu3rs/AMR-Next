import { expect, test } from "@playwright/test"
import { chromium } from "playwright"
import { chromiumExtension } from "../../src/paths.js"

test("Chromium loads the extension popup and app", async () => {
    const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        headless: true,
        args: [`--disable-extensions-except=${chromiumExtension}`, `--load-extension=${chromiumExtension}`]
    })

    try {
        let [worker] = context.serviceWorkers()
        worker ??= await context.waitForEvent("serviceworker")
        const extensionId = new URL(worker.url()).host

        const popup = await context.newPage()
        await popup.goto(`chrome-extension://${extensionId}/popup.html`)
        await expect(popup.getByRole("heading", { name: "All Mangas Reader" })).toBeVisible()
        // Opened directly, the active tab is not a supported manga page and the library is empty,
        // so the popup shows its empty-library state.
        await expect(popup.getByText("Your library is empty.")).toBeVisible()

        const app = await context.newPage()
        await app.goto(`chrome-extension://${extensionId}/app.html`)
        // The app lands on Discover; its global source-search bar is always present there.
        await expect(app.getByPlaceholder("Search every source for a title…")).toBeVisible()
        await expect(app.getByRole("navigation", { name: "Main navigation" })).toBeVisible()
    } finally {
        await context.close()
    }
})
