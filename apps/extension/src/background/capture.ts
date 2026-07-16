import { SourceRequestError } from "@amr/source-sdk"
import { cacheCover, recordAnalyticsEvent, saveResolvedChapter, trackExternalChapter } from "../database"
import { findSource, resolveChapterUrl } from "../sources"
import { getSettings } from "../settings"
import { scheduleChapterListRefresh } from "./chapter-cache"
import { fetchCoverBlob } from "./covers"
import { publishLive } from "../live"

// URLs currently being captured - deduplicate concurrent calls for the same URL
// (e.g. rapid navigation events or the same URL from multiple listener paths).
const capturingUrls = new Set<string>()

export async function captureChapter(url: string) {
    if (capturingUrls.has(url)) return { supported: true as const, added: false as const }
    capturingUrls.add(url)
    try {
        return await doCaptureChapter(url)
    } finally {
        capturingUrls.delete(url)
    }
}

async function doCaptureChapter(url: string) {
    const parsedUrl = new URL(url)
    const source = findSource(parsedUrl)

    if (!source || source.match(parsedUrl) !== "chapter") {
        return { supported: false as const }
    }

    const settings = await getSettings()
    if (!settings.autoAdd) {
        return { supported: true as const, added: false as const }
    }

    let resolved
    try {
        resolved = await resolveChapterUrl(url)
    } catch (error) {
        // The source's images can't be scraped (anti-scrape / spoiler / dead CDN).
        // Still add the title and track it by URL so the library follows progress
        // even when the chapter only reads on the source site.
        void recordAnalyticsEvent({
            event: "capture_error",
            sourceId: source.manifest.id,
            detail: JSON.stringify({ errorType: classifyError(error) }),
            ts: Date.now()
        })
        const mangaInfo = source.parseMangaUrl?.(parsedUrl) ?? undefined
        let tracked
        try {
            tracked = await trackExternalChapter({
                url,
                sourceId: source.manifest.id,
                completed: false,
                ...(mangaInfo ? { mangaInfo } : {})
            })
        } catch (trackError) {
            console.warn("[AMR] Failed to track external chapter", { url, trackError })
            return { supported: true as const, added: false as const }
        }
        console.debug("[AMR] Captured chapter without scraping", { url, error })
        // Best-effort: prime the chapter list so the on-page panel can show prev/next.
        // Uses tab injection for JS-rendered list pages (e.g. Webtoons) to get the
        // full episode count, not just what SW-fetch returns.
        // Use tracked.mangaId (the actual DB entry) not a computed ID - the existing
        // manga record may have a different ID if it was created before the fix.
        if (mangaInfo) {
            scheduleChapterListRefresh(source, mangaInfo.sourceMangaId, mangaInfo.mangaUrl, tracked.mangaId)
        }
        await flashAddedBadge()
        return { supported: true as const, added: true as const, external: true as const, title: tracked.title }
    }

    void recordAnalyticsEvent({ event: "capture_ok", sourceId: source.manifest.id, ts: Date.now() })

    await saveResolvedChapter({
        manga: resolved.manga.manga,
        chapter: resolved.chapter,
        sourceLink: {
            mangaId: resolved.manga.manga.id,
            sourceId: resolved.manga.sourceId,
            sourceMangaId: resolved.manga.sourceMangaId,
            url: resolved.manga.url,
            title: resolved.manga.manga.title,
            addedAt: Date.now(),
            updatedAt: Date.now()
        }
    })
    publishLive(["library", "chapters"], [resolved.manga.manga.id])

    // Best-effort: cache the cover as a Blob so the UI can render it from IndexedDB
    // instead of hotlinking the source CDN on every render. The manga record keeps
    // its real remote coverUrl untouched - a cover-fetch failure here must never
    // fail the capture itself.
    if (resolved.manga.manga.coverUrl) {
        try {
            const blob = await fetchCoverBlob(resolved.manga.manga.coverUrl)
            if (blob) await cacheCover(resolved.manga.manga.id, blob)
        } catch (error) {
            console.warn("[AMR] Failed to cache cover", { url: resolved.manga.manga.coverUrl, error })
        }
    }

    // Fire-and-forget: cache the full chapter list so the on-page panel can
    // show prev/next siblings without a network round-trip on each visit.
    // Dedup by manga so two rapid captures of the same series don't double-fetch.
    scheduleChapterListRefresh(source, resolved.manga.sourceMangaId, resolved.manga.url, resolved.manga.manga.id)

    await flashAddedBadge()
    return { supported: true as const, added: true as const, manga: resolved.manga.manga }
}

export async function flashAddedBadge() {
    await browser.action.setBadgeBackgroundColor({ color: "#2d8a61" })
    await browser.action.setBadgeText({ text: "ADD" })
    setTimeout(() => void browser.action.setBadgeText({ text: "" }), 4000)
}

export function classifyError(error: unknown): string {
    if (error instanceof SourceRequestError) {
        const s = error.status
        if (s === 403 || s === 502 || s === 503) return "bot-block"
        if (s === 404) return "not-found"
        if (s === undefined) return "network"
        return `http-${s}`
    }
    return "unknown"
}

export function isBotBlocked(error: unknown): boolean {
    if (!(error instanceof SourceRequestError)) return false
    const { status } = error
    // Adapter deliberately signalled bot-block - use tab fallback.
    if (error.message === "blocked") return true
    // CDN / reverse-proxy blocks that real browser session can bypass.
    return status === 403 || status === 502 || status === 503
    // NOTE: status === undefined (network timeout / connection refused) is intentionally
    // NOT treated as bot-blocked here. A genuinely-down site should fast-fail the reader
    // rather than burning 25 s on a tab that also can't load.
}
