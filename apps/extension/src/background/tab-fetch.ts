// Tab IDs opened internally by fetchChapterHtmlViaTab. Excluded from the main
// tabs.onUpdated listener so our own background tabs don't re-trigger captureChapter
// and race against the in-flight tab fetch.
const internalTabIds = new Set<number>()

export function isInternalTab(tabId: number): boolean {
    return internalTabIds.has(tabId)
}

// Open a background tab, wait for it to fully load, then extract the page HTML.
// Used as a fallback when direct fetch is blocked by bot-detection (5xx, 403).
// The tab uses the user's real browser session (cookies, TLS fingerprint).
export async function fetchChapterHtmlViaTab(url: string): Promise<string> {
    const tab = await browser.tabs.create({ url, active: false })
    const tabId = tab.id
    if (!tabId) throw new Error("Tab creation failed")
    internalTabIds.add(tabId)
    try {
        await new Promise<void>((resolve, reject) => {
            const listener = (changedId: number, info: { status?: string }) => {
                if (changedId === tabId && info.status === "complete") {
                    clearTimeout(timeoutId)
                    browser.tabs.onUpdated.removeListener(listener)
                    resolve()
                }
            }
            const timeoutId = setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener)
                reject(new Error("Tab load timed out"))
            }, 25_000)
            browser.tabs.onUpdated.addListener(listener)
        })
        const results = await browser.scripting.executeScript({
            target: { tabId },
            func: () => document.documentElement.outerHTML
        })
        const html = results[0]?.result
        return typeof html === "string" ? html : ""
    } finally {
        internalTabIds.delete(tabId)
        await browser.tabs.remove(tabId).catch(() => {})
    }
}
