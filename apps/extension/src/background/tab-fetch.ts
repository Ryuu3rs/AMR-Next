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

// A src worth replacing from a data-* lazy attr: truly empty, an inline data: URI, or a
// URL whose FILENAME is itself a known placeholder ("loading.gif", "1x1.png", "spacer.png").
// Kept as an exported twin of the copy inlined into extractHtml's injected function below
// (browser.scripting serializes that function, so it cannot close over this) - the two MUST
// stay in sync. Testing the whole-URL tokens flagged real page images on any CDN whose path
// happened to contain "loading"/"blank"/"spacer"/"1x1".
export function isLazyPlaceholderSrc(src: string | null): boolean {
    if (!src || !src.trim()) return true
    if (/^data:/i.test(src)) return true
    const path = src.split(/[?#]/)[0] ?? src
    const file = (path.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "")
    return /^(1x1|blank|spacer|placeholder|loading)$/i.test(file) || /^\d{1,3}x\d{1,3}$/i.test(file)
}

async function extractHtml(tabId: number): Promise<string> {
    const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
            // Lazy-loading readers keep the real image URL on a data-* attribute until
            // each <img> scrolls into view, so an un-scrolled outerHTML snapshot only has
            // real src on the initial preload window. Fill any empty/placeholder src from
            // those data-* attrs so the snapshot carries every page. Best-effort only.
            try {
                // Only a truly empty/inline src, or a src whose FILENAME is itself a known
                // placeholder ("loading.gif", "1x1.png", "spacer.png"...), counts as a
                // placeholder to replace. Testing the tokens against the whole URL matched
                // real page images on any CDN whose path/title happened to contain "loading",
                // "blank", "spacer" or "1x1" (e.g. .../loading-scans/1.jpg) and clobbered
                // them with the wrong lazy attr.
                const isPlaceholder = (s: string | null): boolean => {
                    if (!s || !s.trim()) return true
                    if (/^data:/i.test(s)) return true
                    const path = s.split(/[?#]/)[0] ?? s
                    const file = (path.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "")
                    return /^(1x1|blank|spacer|placeholder|loading)$/i.test(file) || /^\d{1,3}x\d{1,3}$/i.test(file)
                }
                for (const img of Array.from(document.querySelectorAll("img"))) {
                    const src = img.getAttribute("src")
                    if (!isPlaceholder(src)) continue
                    const lazy =
                        img.getAttribute("data-src") ??
                        img.getAttribute("data-original") ??
                        img.getAttribute("data-lazy-src")
                    if (lazy) img.setAttribute("src", lazy)
                }
            } catch {
                // Snapshot whatever is present rather than failing the whole fetch.
            }
            return document.documentElement.outerHTML
        }
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
