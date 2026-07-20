import { SourceError } from "@amr/source-sdk"
import {
    bookmarkedPagesForChapter,
    getAnalyticsSummary,
    getDownload,
    listBookmarks,
    listDownloads,
    recordAnalyticsEvent,
    removeBookmark,
    removeDownload,
    saveDownload,
    toggleBookmark,
    type AnalyticsEvent
} from "../database"
import { resolveChapterUrl } from "../sources"
import { delay, type HandlerMap } from "../background/handler-types"

async function fetchPageBlob(url: string): Promise<Blob> {
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let res: Response
        try {
            res = await fetch(url)
        } catch (cause) {
            if (attempt < maxAttempts) {
                await delay(attempt * 300)
                continue
            }
            throw new SourceError("request-failed", "Failed to download a page", {
                url,
                cause: cause instanceof Error ? cause.message : String(cause)
            })
        }
        if (!res.ok) {
            const expired = res.status === 404 || res.status === 410
            if (!expired && attempt < maxAttempts) {
                await delay(attempt * 300)
                continue
            }
            throw new SourceError("request-failed", `Failed to download a page (${res.status})`, {
                url,
                status: res.status
            })
        }
        return res.blob()
    }
    throw new SourceError("request-failed", "Failed to download a page", { url })
}

export const downloadsBookmarksAnalyticsHandlers: HandlerMap = {
    "chapter:download": async request => {
        const resolved = await resolveChapterUrl(request.url)
        let pages = resolved.pages.slice(0, 200)
        const pageBlobs: Blob[] = []
        let reResolved = false
        for (let index = 0; index < pages.length; index += 1) {
            const page = pages[index]
            if (!page) continue
            let blob: Blob
            try {
                blob = await fetchPageBlob(page.url)
            } catch (error) {
                const expired =
                    error instanceof SourceError &&
                    (error.details?.["status"] === 404 || error.details?.["status"] === 410)
                if (expired && !reResolved) {
                    reResolved = true
                    const refreshed = await resolveChapterUrl(request.url)
                    pages = refreshed.pages.slice(0, 200)
                    // The refreshed resolution can differ in page count or order, so
                    // blobs already fetched from the stale list cannot be interleaved
                    // with it - discard them and re-download the whole chapter from the
                    // fresh list to keep the saved pages consistent.
                    pageBlobs.length = 0
                    index = -1
                    continue
                }
                throw error
            }
            pageBlobs.push(blob)
        }
        await saveDownload({
            chapterId: resolved.chapter.id,
            mangaId: resolved.manga.manga.id,
            pageBlobs,
            pageCount: pageBlobs.length,
            downloadedAt: Date.now()
        })
        return { chapterId: resolved.chapter.id, pageCount: pageBlobs.length }
    },

    "chapter:download:get": async request => {
        return (await getDownload(request.chapterId)) ?? null
    },

    "chapter:download:remove": async request => {
        await removeDownload(request.chapterId)
        return null
    },

    "downloads:list": async () => {
        return listDownloads()
    },

    "bookmark:toggle": async request => {
        return toggleBookmark({
            mangaId: request.mangaId,
            chapterId: request.chapterId,
            pageIndex: request.pageIndex,
            mangaTitle: request.mangaTitle,
            chapterTitle: request.chapterTitle,
            chapterUrl: request.chapterUrl
        })
    },

    "bookmark:pages": async request => {
        return bookmarkedPagesForChapter(request.chapterId)
    },

    "bookmark:list": async () => {
        return listBookmarks()
    },

    "bookmark:remove": async request => {
        await removeBookmark(request.id)
        return null
    },

    "analytics:record": async request => {
        void recordAnalyticsEvent({
            event: request.event as AnalyticsEvent["event"],
            ...(request.sourceId ? { sourceId: request.sourceId } : {}),
            ...(request.detail ? { detail: request.detail } : {}),
            ts: Date.now()
        })
        return null
    },

    "analytics:summary": async request => {
        return getAnalyticsSummary(request.days)
    }
}
