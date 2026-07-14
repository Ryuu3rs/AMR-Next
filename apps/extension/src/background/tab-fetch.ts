// Tab IDs opened internally by fetchChapterHtmlViaTab. Excluded from the main
// tabs.onUpdated listener so our own background tabs don't re-trigger captureChapter
// and race against the in-flight tab fetch.
const internalTabIds = new Set<number>()

export function isInternalTab(tabId: number): boolean {
    return internalTabIds.has(tabId)
}

// A Cloudflare (or similar) managed challenge reports "complete" for the interim
// "Just a moment..." page itself, then auto-solves and reloads the real page a
// few seconds later - a second "complete" event we'd otherwise miss since we
// only waited for the first one. Detect the challenge markers so we know to
// keep waiting instead of extracting the challenge page's HTML by mistake.
function looksLikeChallengePage(html: string): boolean {
    return (
        /id=["']challenge-(running|error-text|form)["']/i.test(html) ||
        /cf-turnstile/i.test(html) ||
        /Just a moment\.\.\./i.test(html) ||
        /cdn-cgi\/challenge-platform/i.test(html)
    )
}

async function extractHtml(tabId: number): Promise<string> {
    const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => document.documentElement.outerHTML
    })
    const html = results[0]?.result
    return typeof html === "string" ? html : ""
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
        }, timeoutMs)
        browser.tabs.onUpdated.addListener(listener)
    })
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
        await waitForTabComplete(tabId, 25_000)
        let html = await extractHtml(tabId)
        // The challenge auto-solves and reloads within a few seconds for a real
        // browser session - poll a bit longer rather than giving up immediately.
        for (let attempt = 0; attempt < 5 && looksLikeChallengePage(html); attempt++) {
            await new Promise<void>(resolve => setTimeout(resolve, 2_000))
            html = await extractHtml(tabId)
        }
        return html
    } finally {
        internalTabIds.delete(tabId)
        await browser.tabs.remove(tabId).catch(() => {})
    }
}
