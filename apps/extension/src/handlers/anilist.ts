import { db, updateManga, type LibraryManga } from "../database"
import {
    getAniListConfig,
    setAniListConfig,
    getAniListStatus,
    getViewerName,
    getViewerProgress,
    saveViewerProgress
} from "../anilist"
import { resolveMetadata } from "../metadata"
import { configureAniListAlarm } from "../background/alarms"
import { publishLive } from "../live"
import type { HandlerMap } from "../background/handler-types"

let anilistSyncRunning = false
let anilistSyncAborted = false

// Signal a running sync to stop at the next title boundary (pending extension update).
export function abortAniListSync(): void {
    if (anilistSyncRunning) anilistSyncAborted = true
}

export type AniListSyncResult = { pushed: number; checked: number; skipped: number }

// Pushes local read progress to the user's AniList list. For each library title with
// a numeric read position, resolves its AniList media id (cached from metadata
// enrichment, else looked up once and cached), reads the remote progress, and pushes
// the local floor only when it is higher - so a sync never lowers AniList. Rate-limited
// well under AniList's 90/min budget (two calls per title). Re-entrancy-latched and
// abort-aware like the other background loops.
export async function runAniListSync(): Promise<AniListSyncResult> {
    if (anilistSyncRunning) return { pushed: 0, checked: 0, skipped: 0 }
    anilistSyncRunning = true
    anilistSyncAborted = false
    let pushed = 0
    let checked = 0
    let skipped = 0
    try {
        const config = await getAniListConfig()
        if (!config.token) throw new Error("No AniList token configured")
        const token = config.token

        const mangas = await db.manga.filter(m => m.lastReadChapterNumber !== undefined && !m.onHold).toArray()

        for (const manga of mangas) {
            if (anilistSyncAborted) break
            const local = Math.floor(manga.lastReadChapterNumber as number)
            if (!Number.isFinite(local) || local <= 0) {
                skipped++
                continue
            }

            let anilistId = manga.anilistId
            if (!anilistId) {
                const meta = await resolveMetadata({
                    title: manga.title,
                    sourceId: manga.sourceId,
                    ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {})
                })
                if (meta?.anilistId) {
                    anilistId = meta.anilistId
                    await updateManga(manga.id, { anilistId, metadataUpdatedAt: Date.now() } as Partial<LibraryManga>)
                }
            }
            if (!anilistId) {
                skipped++
                continue
            }

            try {
                const remote = await getViewerProgress(token, anilistId)
                checked++
                if (remote === undefined || local > remote) {
                    await saveViewerProgress(token, anilistId, local)
                    pushed++
                }
            } catch {
                // Transient (rate limit, network) - leave it for the next run.
                skipped++
            }
            // AniList allows ~90 requests/min; two calls per title -> ~1.3s spacing.
            await new Promise<void>(r => setTimeout(r, 1300))
        }
        await setAniListConfig({ lastSyncAt: Date.now() })
        return { pushed, checked, skipped }
    } finally {
        anilistSyncRunning = false
        anilistSyncAborted = false
    }
}

export const anilistHandlers: HandlerMap = {
    "anilist:status": async () => {
        return await getAniListStatus()
    },
    "anilist:config": async request => {
        const patch = Object.fromEntries(Object.entries(request.config).filter(([, v]) => v !== undefined))
        // Validate a newly-pasted token before storing it, so a bad paste fails fast
        // (surfaced to the UI) instead of silently no-op-ing on the next sync.
        let viewerName: string | undefined
        if (typeof patch.token === "string" && patch.token.length > 0) {
            viewerName = await getViewerName(patch.token)
        }
        const next = await setAniListConfig(patch)
        await configureAniListAlarm()
        return {
            hasToken: Boolean(next.token),
            autoSync: next.autoSync,
            ...(viewerName ? { viewerName } : {}),
            ...(next.lastSyncAt ? { lastSyncAt: next.lastSyncAt } : {})
        }
    },
    "anilist:sync": async () => {
        const config = await getAniListConfig()
        if (!config.token) throw new Error("Connect your AniList account first")
        // Fire-and-forget: the full push can run for minutes across a large library,
        // longer than an MV3 message channel survives. The worker keeps running it;
        // the UI refreshes lastSyncAt via anilist:status on the library live event.
        void runAniListSync()
            .then(() => publishLive(["library"]))
            .catch(error => console.warn("[AMR] AniList sync failed", error))
        return { started: true }
    }
}
