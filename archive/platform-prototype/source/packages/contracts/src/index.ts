export type MangaStatus = "ongoing" | "completed" | "hiatus" | "cancelled"

export type LibraryStatus = "following" | "reading" | "completed" | "paused" | "dropped"

export interface MangaSummary {
    id: string
    title: string
    coverUrl: string
    synopsis: string
    genres: string[]
    themes: string[]
    status: MangaStatus
    sourceCount: number
    lastChapterNumber: string
    updatedAt: string
}

export interface MangaChapter {
    id: string
    mangaId: string
    title: string
    number: string
    sourceName: string
    sourceChapterUrl: string
    releasedAt: string
}

export interface MangaDetail extends MangaSummary {
    altTitles: string[]
    authors: string[]
    artists: string[]
}

export interface UserLibraryEntry {
    mangaId: string
    status: LibraryStatus
    lastReadChapterId: string | null
    lastReadPage: number | null
    lastReadAt: string | null
    notifyOnUpdate: boolean
    addedAt: string
}

export interface RecommendationItem {
    mangaId: string
    reason: string
    score: number
}

export interface DiscoverQuery {
    q?: string
    genres?: string[]
    themes?: string[]
    status?: MangaStatus | "any"
    sort?: "relevance" | "updated" | "title" | "sources"
    page?: number
    pageSize?: number
}

export interface DiscoverResponse {
    page: number
    pageSize: number
    total: number
    items: MangaSummary[]
    facets: {
        genres: Array<{ value: string; count: number }>
        themes: Array<{ value: string; count: number }>
    }
}

export interface HealthResponse {
    ok: true
    service: "api"
    version: string
    now: string
}

export interface LibraryWriteInput {
    mangaId: string
    status?: LibraryStatus
    notifyOnUpdate?: boolean
}

export interface LibraryProgressInput {
    status?: LibraryStatus
    lastReadChapterId?: string | null
    lastReadPage?: number | null
    notifyOnUpdate?: boolean
}

export interface EventIngestInput {
    type: "search" | "view_manga" | "read_chapter" | "follow_manga"
    mangaId?: string
    chapterId?: string
    query?: string
    at?: string
}

export interface IngestCatalogItem {
    manga: MangaDetail
    chapters: MangaChapter[]
    sourceMangaId?: string
    sourceMangaUrl?: string
    sourceTitle?: string
}

export interface IngestCatalogInput {
    source: string
    harvestedAt?: string
    items: IngestCatalogItem[]
}

export interface IngestCatalogResult {
    source: string
    harvestedAt: string
    mangaUpserts: number
    chapterUpserts: number
}

export interface IngestRunSummary extends IngestCatalogResult {
    id: string
    createdAt: string
}

export interface IngestRunQuery {
    limit?: number
    source?: string
}

export interface IngestOverview {
    totalManga: number
    totalChapters: number
    totalSourceLinks: number
    totalAliases: number
    totalIngestRuns: number
    latestIngestAt: string | null
}

export interface MangaSourceLink {
    source: string
    sourceMangaId: string | null
    sourceMangaUrl: string | null
    sourceTitle: string | null
    firstSeenAt: string
    lastSeenAt: string
}

export interface DashboardLibraryMetrics {
    total: number
    following: number
    reading: number
    completed: number
    paused: number
    dropped: number
}

export interface DashboardSourceHealthItem {
    source: string
    totalRuns: number
    latestRunAt: string
    latestMangaUpserts: number
    latestChapterUpserts: number
}

export interface ContinueReadingItem {
    mangaId: string
    title: string
    coverUrl: string
    status: LibraryStatus
    lastReadChapterId: string | null
    lastReadPage: number | null
    latestChapterId: string | null
    latestChapterNumber: string | null
    latestChapterTitle: string | null
    latestReleasedAt: string | null
}

export interface DashboardOverviewResponse {
    generatedAt: string
    ingest: IngestOverview
    recentRuns: IngestRunSummary[]
    sourceHealth: DashboardSourceHealthItem[]
    ingestErrors: IngestErrorRecord[]
    library: DashboardLibraryMetrics
    continueReading: ContinueReadingItem[]
}

export interface IngestErrorInput {
    source: string
    stage: string
    message: string
    details?: string
    retryable?: boolean
    at?: string
}

export interface IngestErrorRecord extends IngestErrorInput {
    id: string
    retryable: boolean
    at: string
}

export interface IngestErrorQuery {
    limit?: number
    source?: string
}

export interface MangaChapterPage {
    index: number
    imageUrl: string
}

export interface ChapterPagesResponse {
    mangaId: string
    chapterId: string
    sourceName: string
    sourceChapterUrl: string
    mode: "adapter-cache" | "fallback"
    items: MangaChapterPage[]
}

export interface IngestChapterPagesItem {
    sourceName: string
    sourceChapterUrl: string
    chapterId?: string
    mangaId?: string
    items: MangaChapterPage[]
}

export interface IngestChapterPagesInput {
    source: string
    harvestedAt?: string
    items: IngestChapterPagesItem[]
}

export interface IngestChapterPagesResult {
    source: string
    harvestedAt: string
    upserts: number
}
