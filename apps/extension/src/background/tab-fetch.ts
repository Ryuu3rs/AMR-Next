// Tab IDs opened internally by fetchChapterHtmlViaTab. Excluded from the main
// tabs.onUpdated listener so our own background tabs don't re-trigger captureChapter
// and race against the in-flight tab fetch.
const internalTabIds = new Set<number>()

// URLs currently loading in an internal fetch tab. Registered synchronously BEFORE
// tabs.create resolves, closing the window where the tab's first onUpdated url event
// fires before we learn its tabId and would be mistaken for user navigation.
const internalUrls = new Set<string>()

export function isInternalTab(tabId: number): boolean {
    return internalTabIds.has(tabId)
}

export function isInternalUrl(url: string | undefined): boolean {
    return url !== undefined && internalUrls.has(url)
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
        let settled = false
        const cleanup = () => {
            clearTimeout(timeoutId)
            browser.tabs.onUpdated.removeListener(listener)
        }
        const listener = (changedId: number, info: { status?: string }) => {
            if (changedId === tabId && info.status === "complete" && !settled) {
                settled = true
                cleanup()
                resolve()
            }
        }
        const timeoutId = setTimeout(() => {
            if (settled) return
            settled = true
            cleanup()
            reject(new Error("Tab load timed out"))
        }, timeoutMs)
        browser.tabs.onUpdated.addListener(listener)
        // A fast or cached page can reach "complete" before the listener attached, so
        // the event never arrives - poll once so we don't wait out the full timeout for
        // a load that already finished.
        void browser.tabs
            .get(tabId)
            .then(tab => {
                if (tab.status === "complete" && !settled) {
                    settled = true
                    cleanup()
                    resolve()
                }
            })
            .catch(() => {})
    })
}

// Open a background tab, wait for it to fully load, then extract the page HTML.
// Used as a fallback when direct fetch is blocked by bot-detection (5xx, 403).
// The tab uses the user's real browser session (cookies, TLS fingerprint).
export async function fetchChapterHtmlViaTab(url: string): Promise<string> {
    // Mark the URL internal before creating the tab: onUpdated can fire the tab's first
    // url event before tabs.create resolves and we learn its tabId, and without this
    // that event would be captured as if the user had navigated there.
    internalUrls.add(url)
    let tabId: number | undefined
    try {
        const tab = await browser.tabs.create({ url, active: false })
        tabId = tab.id
        if (!tabId) throw new Error("Tab creation failed")
        internalTabIds.add(tabId)
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
        internalUrls.delete(url)
        if (tabId !== undefined) {
            internalTabIds.delete(tabId)
            await browser.tabs.remove(tabId).catch(() => {})
        }
    }
}
