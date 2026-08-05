import { normalizeTitle } from "@amr/normalize"
import { addImportedManga, db, updateManga, type LibraryManga } from "../database"
import { getSettings } from "../settings"
import { neverRead } from "../reading-status"
import {
    getAniListConfig,
    setAniListConfig,
    getAniListStatus,
    getViewerName,
    getViewerProgress,
    saveViewerProgress,
    getViewerMangaList,
    getMediaListEntryId,
    saveMediaStatus,
    deleteMediaListEntry
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

export type AniListSyncResult = { pushed: number; added: number; checked: number; skipped: number }

export type AniListImportResult = { imported: number; skipped: number; total: number }

// Pulls the user's AniList manga list INTO the library. Each new title lands as a
// backup-style "needs a source" entry: a hostname-style (dot-containing) sourceId
// plus manualTracking, exactly the shape a broken backup import produces, so the
// SAME ImportReconcile relink flow (App.svelte's libraryNeedsAttention filter keys
// on `manualTracking && sourceId.includes(".")`) surfaces it for the user to attach a
// real mirror. Dedup + write are atomic in addImportedManga; one malformed entry
// never aborts the batch.
export async function runAniListImport(): Promise<AniListImportResult> {
    const config = await getAniListConfig()
    if (!config.token) throw new Error("Connect your AniList account first")
    const entries = await getViewerMangaList(config.token)
    const settings = await getSettings()
    const now = Date.now()
    const candidates: LibraryManga[] = []
    for (const entry of entries) {
        try {
            const title = entry.title.trim()
            if (!title || entry.anilistId <= 0) continue
            // Respect the import-status opt-outs: when the user turned off importing
            // paused/dropped titles, skip those AniList entries entirely.
            if (entry.listStatus === "paused" && !settings.anilistImportPaused) continue
            if (entry.listStatus === "dropped" && !settings.anilistImportDropped) continue
            candidates.push({
                id: `anilist:manga:${entry.anilistId}`,
                title,
                normalizedTitle: normalizeTitle(title),
                authors: [],
                status: entry.status,
                addedAt: now,
                updatedAt: now,
                anilistId: entry.anilistId,
                sourceId: "anilist.co",
                sourceUrl: `https://anilist.co/manga/${entry.anilistId}`,
                manualTracking: true,
                ...(entry.coverUrl ? { coverUrl: entry.coverUrl } : {}),
                ...(entry.genres.length > 0 ? { genres: entry.genres } : {}),
                ...(entry.progress > 0 ? { lastReadChapterNumber: entry.progress } : {}),
                ...(entry.listStatus ? { readingStatus: entry.listStatus } : {})
            })
        } catch (error) {
            console.warn("[AMR] AniList import: skipping a malformed entry", error)
        }
    }
    const { imported } = await addImportedManga(candidates)
    return { imported, skipped: entries.length - imported, total: entries.length }
}

// Deletes a title's AniList list entry when it's removed from the library. No-op
// unless membership sync is on and the title has a known AniList id. Fire-and-forget
// safe: swallows its own errors so a library removal never fails on an AniList hiccup.
export async function removeFromAniList(anilistId: number | undefined): Promise<void> {
    if (!anilistId) return
    try {
        const config = await getAniListConfig()
        if (!config.token || !config.syncMembership) return
        const entryId = await getMediaListEntryId(config.token, anilistId)
        if (entryId !== undefined) await deleteMediaListEntry(config.token, entryId)
    } catch (error) {
        console.warn("[AMR] AniList remove failed", error)
    }
}

// Pushes local read progress to the user's AniList list. For each library title with
// a numeric read position, resolves its AniList media id (cached from metadata
// enrichment, else looked up once and cached), reads the remote progress, and pushes
// the local floor only when it is higher - so a sync never lowers AniList. Rate-limited
// well under AniList's 90/min budget (two calls per title). Re-entrancy-latched and
// abort-aware like the other background loops.
export async function runAniListSync(): Promise<AniListSyncResult> {
    if (anilistSyncRunning) return { pushed: 0, added: 0, checked: 0, skipped: 0 }
    anilistSyncRunning = true
    anilistSyncAborted = false
    let pushed = 0
    let added = 0
    let checked = 0
    let skipped = 0
    try {
        const config = await getAniListConfig()
        if (!config.token) throw new Error("No AniList token configured")
        const token = config.token
        const membership = config.syncMembership

        // Read titles always push progress. With membership sync on, unread titles that
        // already have a cached AniList id are added to the list (as PLANNING) too - we
        // don't resolve every library title here to keep the request budget bounded.
        const mangas = await db.manga
            .filter(
                m => !m.onHold && (m.lastReadChapterNumber !== undefined || (membership && m.anilistId !== undefined))
            )
            .toArray()

        for (const manga of mangas) {
            if (anilistSyncAborted) break

            let anilistId = manga.anilistId
            if (anilistId === undefined && manga.lastReadChapterNumber !== undefined) {
                const meta = await resolveMetadata({
                    title: manga.title,
                    sourceId: manga.sourceId,
                    ...(manga.sourceMangaId ? { sourceMangaId: manga.sourceMangaId } : {})
                })
                if (meta?.anilistId) {
                    anilistId = meta.anilistId
                    // Cache only the id. Do NOT stamp metadataUpdatedAt here: that field
                    // means "metadata enrichment (status/cover/genres) was attempted", and
                    // this sync fetched none of that - stamping it would make the enrichment
                    // pass skip the title for the full retry window.
                    await updateManga(manga.id, { anilistId } as Partial<LibraryManga>)
                }
            }
            if (anilistId === undefined) {
                skipped++
                continue
            }

            const local =
                manga.lastReadChapterNumber !== undefined ? Math.floor(manga.lastReadChapterNumber) : undefined

            try {
                if (local !== undefined && local > 0) {
                    const remote = await getViewerProgress(token, anilistId)
                    checked++
                    if (remote === undefined || local > remote) {
                        await saveViewerProgress(token, anilistId, local)
                        pushed++
                    }
                } else if (membership) {
                    // Unread library title: add as PLANNING only when not already on the
                    // list, so an existing CURRENT/COMPLETED status is never clobbered.
                    const entryId = await getMediaListEntryId(token, anilistId)
                    checked++
                    if (entryId === undefined) {
                        await saveMediaStatus(token, anilistId, "PLANNING")
                        added++
                    }
                } else {
                    skipped++
                    continue
                }
            } catch {
                // Transient (rate limit, network) - leave it for the next run.
                skipped++
            }
            // AniList allows ~90 requests/min; two calls per title -> ~1.3s spacing.
            await new Promise<void>(r => setTimeout(r, 1300))
        }
        // Reconcile removals: a title still in the library but no longer on the user's
        // AniList list is treated as dropped IF they've read it (local read progress is
        // real signal the title was tracked, not junk). An unread local title is left
        // untouched - never delete, never tag. Gated on membership sync, the same flag
        // that authorizes AniList-driven membership changes. Skipped on abort.
        if (membership && !anilistSyncAborted) {
            try {
                const remote = await getViewerMangaList(token)
                const remoteIds = new Set(remote.map(e => e.anilistId))
                const orphaned = await db.manga
                    .filter(m => m.anilistId !== undefined && !remoteIds.has(m.anilistId))
                    .toArray()
                for (const m of orphaned) {
                    if (m.readingStatus === "dropped" || neverRead(m)) continue
                    await updateManga(m.id, { readingStatus: "dropped" } as Partial<LibraryManga>)
                }
            } catch (error) {
                // A reconcile failure (rate limit, network) must not fail the whole sync -
                // the push above already succeeded. Leave it for the next run.
                console.warn("[AMR] AniList reconcile failed", error)
            }
        }

        // Only record a completed sync when the loop actually finished. An aborted run
        // (pending extension update) processed only part of the library, so stamping
        // lastSyncAt would mislabel a partial push as a full sync.
        if (!anilistSyncAborted) await setAniListConfig({ lastSyncAt: Date.now() })
        return { pushed, added, checked, skipped }
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
        // Validate a newly-pasted token. Reject only on a genuine AUTH error (4xx) so a
        // bad paste fails fast; on a transient error (5xx / network - AniList down) save
        // the token anyway rather than rejecting a good token during an outage.
        let viewerName: string | undefined
        if (typeof patch.token === "string" && patch.token.length > 0) {
            try {
                viewerName = await getViewerName(patch.token)
            } catch (cause) {
                const status = Number(/AniList API (\d+)/.exec(cause instanceof Error ? cause.message : "")?.[1])
                if (status >= 400 && status < 500) {
                    throw new Error("That AniList token was rejected. Check it and try again.")
                }
                // transient - fall through and save the (presumably valid) token unverified
            }
        }
        const next = await setAniListConfig(patch)
        await configureAniListAlarm()
        return {
            hasToken: Boolean(next.token),
            autoSync: next.autoSync,
            syncMembership: next.syncMembership,
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
    },
    "anilist:import": async () => {
        // Awaits the full import and returns counts; the dispatcher publishes the
        // ["library"] live event from MUTATION_SCOPES once this resolves.
        return await runAniListImport()
    }
}
