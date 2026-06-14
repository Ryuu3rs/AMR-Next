import type { ChapterRecord, MangaRecord } from "@amr/contracts"
import type { ZodType } from "zod"

export type SourcePageMatch = "chapter" | "manga" | "none"

export type SourceCapability = "chapters" | "manga" | "pages"

export type SourceManifest = {
    id: string
    name: string
    domains: string[]
    languages: string[]
    capabilities: SourceCapability[]
    requestRateLimit: {
        requests: number
        intervalMs: number
    }
    fixtureVersion: number
}

export type SourceManga = {
    manga: MangaRecord
    sourceId: string
    sourceMangaId: string
    url: string
}

export type SourceChapter = ChapterRecord & {
    sourceChapterId: string
    language: string
}

export type ResolvedPage = {
    id: string
    url: string
}

export type ResolvedChapter = {
    manga: SourceManga
    chapter: SourceChapter
    pages: ResolvedPage[]
}

export type ResolveMangaInput = {
    url?: URL
    sourceMangaId?: string
}

export type ListChaptersInput = {
    manga: SourceManga
    languages?: readonly string[]
    limit?: number
}

export type ResolveChapterInput = {
    url?: URL
    sourceChapterId?: string
}

export type SourceSearchResult = {
    sourceId: string
    sourceMangaId: string
    title: string
    url: string
    coverUrl?: string
    // Latest hosted chapter number/label if the search surface exposes it — lets
    // the UI show which mirrors are actively updated (G7).
    latestChapter?: string
}

export type SourceRequestOptions = {
    headers?: Readonly<Record<string, string>>
}

export interface SourceRequestClient {
    getJson<T>(url: URL, schema: ZodType<T>, options?: SourceRequestOptions): Promise<T>
    getText(url: URL, options?: SourceRequestOptions): Promise<string>
    postForm(url: URL, params: Record<string, string>, options?: SourceRequestOptions): Promise<string>
}

export type SourceLogger = {
    debug(message: string, details?: Readonly<Record<string, unknown>>): void
    warn(message: string, details?: Readonly<Record<string, unknown>>): void
}

export type SourceContext = {
    request: SourceRequestClient
    now(): number
    logger: SourceLogger
}

export interface SourceAdapter {
    readonly manifest: SourceManifest
    match(url: URL): SourcePageMatch
    resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga>
    listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]>
    resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter>
    // Optional: fetch just the cover image URL for a series, by its source manga id
    // and/or manga page URL. Used to backfill covers for library entries that were
    // added by reading a chapter (which may not carry a reliable cover).
    resolveCover?(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string | undefined>
    // Optional: search this source for a title. Adapters that can't search omit it.
    search?(query: string, context: SourceContext): Promise<SourceSearchResult[]>
}
