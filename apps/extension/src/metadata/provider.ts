// A metadata provider resolves catalog metadata (status, cover, genres, tags,
// oneshot flag, cross-id) for a title by name, independent of the mirror it was added
// from. This is the robust alternative to scraping status/genres in every source
// adapter: look the title up once in a proper catalog and cache the answer.
//
// The extension resolves through a chain of providers (the self-hosted VPS catalog
// first, then AniList directly as a fallback) - see metadata/index.ts. The same
// resolved anilistId is reused for status/cover enrichment AND personal-list sync.

import type { RecCandidate } from "./recommendations"

export type MangaStatus = "unknown" | "ongoing" | "completed" | "hiatus" | "cancelled"

export type MetadataResult = {
    // AniList media id, cached on the manga for reuse by enrichment and sync.
    anilistId?: number
    // MAL id (from Jikan fallback or AniList idMal) - the cross-tracker pivot id.
    malId?: number
    title?: string
    status?: MangaStatus
    coverUrl?: string
    genres?: string[]
    tags?: string[]
    // AniList format ONE_SHOT - an authoritative single-chapter signal.
    isOneshot?: boolean
}

export type MetadataQuery = {
    title: string
    sourceId?: string
    sourceMangaId?: string
}

export interface MetadataProvider {
    readonly name: string
    resolve(query: MetadataQuery): Promise<MetadataResult | null>
    getByAnilistId?(id: number): Promise<MetadataResult | null>
    // Titles that "readers who liked this also liked", for the Suggestions engine.
    // Returns [] on no match or any network/parse failure so callers can fall through.
    getRecommendations?(id: number): Promise<RecCandidate[]>
}
