// MetadataResult must stay in lockstep with apps/extension/src/metadata/provider.ts.
// This service is a metadata catalog only: title, status, cover, genres, tags, format.
// It never stores or serves chapters or page content.
export type MangaStatus = "unknown" | "ongoing" | "completed" | "hiatus" | "cancelled"

export type MetadataResult = {
    anilistId?: number
    malId?: number
    title?: string
    status?: MangaStatus
    coverUrl?: string
    genres?: string[]
    tags?: string[]
    isOneshot?: boolean
}
