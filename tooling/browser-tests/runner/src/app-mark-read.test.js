import { expect, test } from "@playwright/test"
import { chromium } from "playwright"
import { chromiumExtension } from "../../src/paths.js"

// Regression test for a real bug fixed in this codebase: marking a title "caught up"
// updated lastReadChapterNumber but not lastReadChapterId, so the Unread badge (which
// compares latestChapterId/lastReadChapterId, not the chapter numbers) never cleared.
test("marking a title caught up clears its Unread badge and survives reload", async () => {
    const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        headless: true,
        args: [`--disable-extensions-except=${chromiumExtension}`, `--load-extension=${chromiumExtension}`]
    })

    try {
        let [worker] = context.serviceWorkers()
        worker ??= await context.waitForEvent("serviceworker")
        const extensionId = new URL(worker.url()).host

        const app = await context.newPage()
        await app.goto(`chrome-extension://${extensionId}/app.html`)
        await expect(app.getByRole("heading", { name: "Your shelf is empty" })).toBeVisible()

        const now = Date.now()
        const envelope = {
            format: "all-mangas-reader",
            version: 1,
            data: {
                manga: [
                    {
                        id: "e2e:manga:reading-test",
                        title: "E2E Reading Test",
                        normalizedTitle: "e2e reading test",
                        authors: [],
                        status: "ongoing",
                        addedAt: now,
                        updatedAt: now,
                        sourceId: "e2e",
                        sourceUrl: "https://example.com/e2e-reading-test",
                        latestChapterId: "e2e:manga:reading-test:ch-2",
                        lastReadChapterId: "e2e:manga:reading-test:ch-1",
                        latestChapterNumber: 2,
                        lastReadChapterNumber: 1
                    }
                ]
            }
        }

        const importResult = await app.evaluate(
            async env => chrome.runtime.sendMessage({ type: "data:import", envelope: env }),
            envelope
        )
        expect(importResult?.ok).toBe(true)

        // activeSection/libraryView are plain $state, not persisted — every reload lands
        // back on the Home tab in grid view, so each round needs to navigate to Library
        // and switch to list view (the "Caught up" action only exists in list view).
        async function goToLibraryListView() {
            await app
                .getByRole("navigation", { name: "Main navigation" })
                .getByRole("button", { name: "Library" })
                .click()
            await app.getByRole("button", { name: "List" }).click()
        }

        await app.reload()
        await goToLibraryListView()

        const row = app.locator(".list-row", { hasText: "E2E Reading Test" })
        await expect(row).toBeVisible()
        await expect(row.getByText("Unread", { exact: true })).toBeVisible()

        await row.getByRole("button", { name: "Caught up" }).click()
        await expect(row.getByText("Unread", { exact: true })).toHaveCount(0)

        await app.reload()
        await goToLibraryListView()
        const rowAfterReload = app.locator(".list-row", { hasText: "E2E Reading Test" })
        await expect(rowAfterReload.getByText("Unread", { exact: true })).toHaveCount(0)
    } finally {
        await context.close()
    }
})
