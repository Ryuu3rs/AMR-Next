import type {
    EventIngestInput,
    IngestChapterPagesInput,
    IngestChapterPagesResult,
    IngestErrorInput,
    IngestErrorQuery,
    IngestErrorRecord,
    IngestOverview,
    IngestRunQuery,
    IngestRunSummary,
    IngestCatalogInput,
    IngestCatalogResult,
    LibraryProgressInput,
    LibraryWriteInput,
    MangaChapter,
    MangaChapterPage,
    MangaDetail,
    MangaSourceLink,
    UserLibraryEntry
} from "@amr-next/contracts"

export interface PersistedEvent extends EventIngestInput {
    at: string
}

export interface DataStore {
    init(): Promise<void>
    listCatalog(): Promise<MangaDetail[]>
    getManga(mangaId: string): Promise<MangaDetail | null>
    listChapters(mangaId: string): Promise<MangaChapter[]>
    listLibrary(): Promise<UserLibraryEntry[]>
    upsertLibrary(input: LibraryWriteInput, nowIso: string): Promise<UserLibraryEntry>
    patchLibrary(mangaId: string, patch: LibraryProgressInput, nowIso: string): Promise<UserLibraryEntry | null>
    appendEvent(event: EventIngestInput, nowIso: string): Promise<PersistedEvent>
    listRecentEvents(limit: number): Promise<PersistedEvent[]>
    appendIngestError(error: IngestErrorInput, nowIso: string): Promise<IngestErrorRecord>
    listIngestErrors(query?: IngestErrorQuery): Promise<IngestErrorRecord[]>
    upsertCatalog(input: IngestCatalogInput): Promise<IngestCatalogResult>
    upsertChapterPages(input: IngestChapterPagesInput): Promise<IngestChapterPagesResult>
    getChapterPages(sourceName: string, sourceChapterUrl: string): Promise<MangaChapterPage[] | null>
    listIngestRuns(query?: IngestRunQuery): Promise<IngestRunSummary[]>
    getIngestOverview(): Promise<IngestOverview>
    listMangaSources(mangaId: string): Promise<MangaSourceLink[]>
}
