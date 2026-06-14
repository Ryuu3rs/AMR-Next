import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
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
import type { DataStore, PersistedEvent } from "./data-store.js"

interface SourceLinkRecord extends MangaSourceLink {
    mangaId: string
}

interface AliasRecord {
    alias: string
    normalizedAlias: string
    mangaId: string
    source: string | null
    firstSeenAt: string
    lastSeenAt: string
}

interface ChapterPageRecord {
    source: string
    sourceName: string
    sourceChapterUrl: string
    chapterId: string | null
    mangaId: string | null
    pages: MangaChapterPage[]
    firstSeenAt: string
    lastSeenAt: string
}

export interface PersistedState {
    version: 1
    catalog: MangaDetail[]
    chapters: MangaChapter[]
    chapterPages: ChapterPageRecord[]
    library: UserLibraryEntry[]
    events: PersistedEvent[]
    ingestErrors: IngestErrorRecord[]
    ingestRuns: IngestRunSummary[]
    sourceLinks: SourceLinkRecord[]
    aliases: AliasRecord[]
}

type SeedFactory = () => PersistedState

const chapterSortValue = (chapter: MangaChapter): number => {
    const n = Number.parseFloat(chapter.number)
    return Number.isFinite(n) ? n : -1
}

const sortChapters = (a: MangaChapter, b: MangaChapter): number => {
    const byNumber = chapterSortValue(b) - chapterSortValue(a)
    if (byNumber !== 0) return byNumber

    const byTime = new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime()
    if (byTime !== 0) return byTime

    return a.id.localeCompare(b.id)
}

const normalizeAlias = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/[^\w\s]|_/g, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()

export class FileBackedStore implements DataStore {
    private state: PersistedState | null = null
    private writeChain: Promise<void> = Promise.resolve()

    constructor(private readonly filePath: string, private readonly seedFactory: SeedFactory) {}

    async init(): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true })

        if (await this.exists(this.filePath)) {
            const raw = await readFile(this.filePath, "utf8")
            const parsed = this.parseState(raw)
            if (parsed) {
                this.state = parsed
                return
            }
        }

        this.state = this.seedFactory()
        await this.persist()
    }

    async listCatalog(): Promise<MangaDetail[]> {
        return structuredClone(this.asState().catalog)
    }

    async getManga(mangaId: string): Promise<MangaDetail | null> {
        const manga = this.asState().catalog.find(item => item.id === mangaId)
        return manga ? structuredClone(manga) : null
    }

    async listChapters(mangaId: string): Promise<MangaChapter[]> {
        const chapters = this.asState()
            .chapters.filter(chapter => chapter.mangaId === mangaId)
            .sort(sortChapters)
        return structuredClone(chapters)
    }

    async listLibrary(): Promise<UserLibraryEntry[]> {
        return structuredClone(this.asState().library)
    }

    async upsertLibrary(input: LibraryWriteInput, nowIso: string): Promise<UserLibraryEntry> {
        const state = this.asState()
        const existingIndex = state.library.findIndex(entry => entry.mangaId === input.mangaId)

        if (existingIndex >= 0) {
            const existing = state.library[existingIndex]
            const next: UserLibraryEntry = {
                ...existing,
                status: input.status ?? existing.status,
                notifyOnUpdate: input.notifyOnUpdate ?? existing.notifyOnUpdate
            }
            state.library[existingIndex] = next
            await this.queuePersist()
            return structuredClone(next)
        }

        const next: UserLibraryEntry = {
            mangaId: input.mangaId,
            status: input.status ?? "following",
            lastReadChapterId: null,
            lastReadPage: null,
            lastReadAt: null,
            notifyOnUpdate: input.notifyOnUpdate ?? true,
            addedAt: nowIso
        }
        state.library.push(next)
        await this.queuePersist()
        return structuredClone(next)
    }

    async patchLibrary(mangaId: string, patch: LibraryProgressInput, nowIso: string): Promise<UserLibraryEntry | null> {
        const state = this.asState()
        const existingIndex = state.library.findIndex(entry => entry.mangaId === mangaId)
        if (existingIndex < 0) return null

        const existing = state.library[existingIndex]
        const patchedPage =
            patch.lastReadPage === undefined
                ? undefined
                : patch.lastReadPage === null
                ? null
                : Math.max(1, Math.floor(patch.lastReadPage))
        const next: UserLibraryEntry = {
            ...existing,
            status: patch.status ?? existing.status,
            lastReadChapterId:
                patch.lastReadChapterId !== undefined ? patch.lastReadChapterId : existing.lastReadChapterId,
            lastReadPage:
                patchedPage !== undefined
                    ? patchedPage
                    : patch.lastReadChapterId !== undefined
                    ? null
                    : existing.lastReadPage,
            notifyOnUpdate: patch.notifyOnUpdate !== undefined ? patch.notifyOnUpdate : existing.notifyOnUpdate,
            lastReadAt:
                patch.lastReadChapterId !== undefined || patch.lastReadPage !== undefined ? nowIso : existing.lastReadAt
        }

        state.library[existingIndex] = next
        await this.queuePersist()
        return structuredClone(next)
    }

    async appendEvent(event: EventIngestInput, nowIso: string): Promise<PersistedEvent> {
        const state = this.asState()
        const persistedEvent: PersistedEvent = {
            ...event,
            at: event.at ?? nowIso
        }
        state.events.push(persistedEvent)

        if (state.events.length > 5000) {
            state.events.splice(0, state.events.length - 5000)
        }

        await this.queuePersist()
        return structuredClone(persistedEvent)
    }

    async listRecentEvents(limit: number): Promise<PersistedEvent[]> {
        const max = Math.min(Math.max(limit, 1), 2000)
        const recent = this.asState()
            .events.slice(-max)
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        return structuredClone(recent)
    }

    async appendIngestError(error: IngestErrorInput, nowIso: string): Promise<IngestErrorRecord> {
        const state = this.asState()
        const persisted: IngestErrorRecord = {
            id: `${nowIso}-${Math.random().toString(16).slice(2, 10)}`,
            source: error.source.trim(),
            stage: error.stage.trim() || "unknown",
            message: error.message.trim() || "Unknown ingest error",
            details: error.details,
            retryable: error.retryable ?? true,
            at: error.at ?? nowIso
        }
        state.ingestErrors.unshift(persisted)
        if (state.ingestErrors.length > 1000) {
            state.ingestErrors = state.ingestErrors.slice(0, 1000)
        }
        await this.queuePersist()
        return structuredClone(persisted)
    }

    async listIngestErrors(query: IngestErrorQuery = {}): Promise<IngestErrorRecord[]> {
        const max = Math.min(Math.max(query.limit ?? 50, 1), 500)
        const source = query.source?.trim().toLowerCase()
        const items = this.asState().ingestErrors.filter(error => {
            if (!source) return true
            return error.source.toLowerCase() === source
        })
        return structuredClone(items.slice(0, max))
    }

    async upsertCatalog(input: IngestCatalogInput): Promise<IngestCatalogResult> {
        const state = this.asState()
        const harvestedAt = input.harvestedAt ?? new Date().toISOString()
        const mangaById = new Map(state.catalog.map(manga => [manga.id, manga]))
        const chaptersByKey = new Map(state.chapters.map(chapter => [`${chapter.mangaId}::${chapter.id}`, chapter]))
        const sourceById = new Map(
            state.sourceLinks
                .filter(link => link.sourceMangaId)
                .map(link => [`${link.source}::${link.sourceMangaId}`, link.mangaId])
        )
        const sourceByUrl = new Map(
            state.sourceLinks
                .filter(link => link.sourceMangaUrl)
                .map(link => [`${link.source}::${link.sourceMangaUrl}`, link.mangaId])
        )
        const aliasToMangaId = new Map(state.aliases.map(alias => [alias.normalizedAlias, alias.mangaId]))
        const aliasesByKey = new Map(state.aliases.map(alias => [alias.normalizedAlias, alias]))

        let mangaUpserts = 0
        let chapterUpserts = 0

        const upsertAlias = (alias: string | null | undefined, mangaId: string, source: string | null): void => {
            const raw = alias?.trim() || ""
            const normalized = normalizeAlias(raw)
            if (normalized.length < 2) return

            const existing = aliasesByKey.get(normalized)
            if (existing) {
                const next: AliasRecord = {
                    ...existing,
                    alias: raw,
                    mangaId,
                    source: source ?? existing.source,
                    lastSeenAt: harvestedAt
                }
                aliasesByKey.set(normalized, next)
            } else {
                aliasesByKey.set(normalized, {
                    alias: raw,
                    normalizedAlias: normalized,
                    mangaId,
                    source,
                    firstSeenAt: harvestedAt,
                    lastSeenAt: harvestedAt
                })
            }

            aliasToMangaId.set(normalized, mangaId)
        }

        const upsertSourceLink = (
            mangaId: string,
            sourceMangaId: string | null,
            sourceMangaUrl: string | null,
            sourceTitle: string | null
        ): void => {
            if (!sourceMangaId && !sourceMangaUrl) return

            const existingIndex = state.sourceLinks.findIndex(link => {
                if (sourceMangaId) return link.source === input.source && link.sourceMangaId === sourceMangaId
                return link.source === input.source && link.sourceMangaUrl === sourceMangaUrl
            })

            if (existingIndex >= 0) {
                const current = state.sourceLinks[existingIndex]
                state.sourceLinks[existingIndex] = {
                    ...current,
                    mangaId,
                    sourceMangaUrl: sourceMangaUrl ?? current.sourceMangaUrl,
                    sourceTitle: sourceTitle ?? current.sourceTitle,
                    lastSeenAt: harvestedAt
                }
            } else {
                state.sourceLinks.push({
                    mangaId,
                    source: input.source,
                    sourceMangaId,
                    sourceMangaUrl,
                    sourceTitle,
                    firstSeenAt: harvestedAt,
                    lastSeenAt: harvestedAt
                })
            }

            if (sourceMangaId) sourceById.set(`${input.source}::${sourceMangaId}`, mangaId)
            if (sourceMangaUrl) sourceByUrl.set(`${input.source}::${sourceMangaUrl}`, mangaId)
        }

        for (const item of input.items) {
            const sourceMangaId = item.sourceMangaId?.trim() || null
            const sourceMangaUrl = item.sourceMangaUrl?.trim() || null
            const sourceTitle = item.sourceTitle?.trim() || null
            const candidateAlias = normalizeAlias(sourceTitle || item.manga.title || "")

            const canonicalMangaId =
                (sourceMangaId ? sourceById.get(`${input.source}::${sourceMangaId}`) : undefined) ??
                (sourceMangaUrl ? sourceByUrl.get(`${input.source}::${sourceMangaUrl}`) : undefined) ??
                (candidateAlias ? aliasToMangaId.get(candidateAlias) : undefined) ??
                item.manga.id

            const normalizedManga: MangaDetail = {
                ...item.manga,
                id: canonicalMangaId,
                updatedAt: item.manga.updatedAt || harvestedAt
            }
            mangaById.set(normalizedManga.id, normalizedManga)
            mangaUpserts += 1

            for (const chapter of item.chapters) {
                if (!chapter.id) continue

                const normalizedChapter: MangaChapter = {
                    ...chapter,
                    mangaId: normalizedManga.id,
                    releasedAt: chapter.releasedAt || harvestedAt
                }
                chaptersByKey.set(`${normalizedManga.id}::${normalizedChapter.id}`, normalizedChapter)
                chapterUpserts += 1
            }

            upsertSourceLink(normalizedManga.id, sourceMangaId, sourceMangaUrl, sourceTitle)
            upsertAlias(normalizedManga.title, normalizedManga.id, "catalog")
            upsertAlias(sourceTitle, normalizedManga.id, input.source)
            for (const alias of normalizedManga.altTitles) {
                upsertAlias(alias, normalizedManga.id, "catalog")
            }
        }

        state.catalog = Array.from(mangaById.values())
        state.chapters = Array.from(chaptersByKey.values())
        const result: IngestCatalogResult = {
            source: input.source,
            harvestedAt,
            mangaUpserts,
            chapterUpserts
        }

        state.ingestRuns.unshift({
            id: `${result.harvestedAt}-${result.source}-${Math.random().toString(16).slice(2, 10)}`,
            source: result.source,
            harvestedAt: result.harvestedAt,
            mangaUpserts: result.mangaUpserts,
            chapterUpserts: result.chapterUpserts,
            createdAt: new Date().toISOString()
        })

        if (state.ingestRuns.length > 500) {
            state.ingestRuns = state.ingestRuns.slice(0, 500)
        }

        state.aliases = Array.from(aliasesByKey.values())

        await this.queuePersist()
        return result
    }

    async upsertChapterPages(input: IngestChapterPagesInput): Promise<IngestChapterPagesResult> {
        const state = this.asState()
        const harvestedAt = input.harvestedAt ?? new Date().toISOString()
        let upserts = 0

        for (const item of input.items) {
            const sourceName = item.sourceName.trim()
            const sourceChapterUrl = item.sourceChapterUrl.trim()
            if (!sourceName || !sourceChapterUrl) continue

            const pages = item.items
                .filter(page => Number.isFinite(page.index) && page.index > 0 && typeof page.imageUrl === "string")
                .map(page => ({
                    index: Math.max(1, Math.floor(page.index)),
                    imageUrl: page.imageUrl
                }))
                .sort((a, b) => a.index - b.index)

            if (pages.length === 0) continue

            const existingIndex = state.chapterPages.findIndex(
                entry => entry.sourceName === sourceName && entry.sourceChapterUrl === sourceChapterUrl
            )

            if (existingIndex >= 0) {
                const existing = state.chapterPages[existingIndex]
                state.chapterPages[existingIndex] = {
                    ...existing,
                    source: input.source,
                    chapterId: item.chapterId ?? existing.chapterId,
                    mangaId: item.mangaId ?? existing.mangaId,
                    pages,
                    lastSeenAt: harvestedAt
                }
            } else {
                state.chapterPages.push({
                    source: input.source,
                    sourceName,
                    sourceChapterUrl,
                    chapterId: item.chapterId ?? null,
                    mangaId: item.mangaId ?? null,
                    pages,
                    firstSeenAt: harvestedAt,
                    lastSeenAt: harvestedAt
                })
            }

            upserts += 1
        }

        if (state.chapterPages.length > 5000) {
            state.chapterPages = state.chapterPages
                .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
                .slice(0, 5000)
        }

        await this.queuePersist()
        return {
            source: input.source,
            harvestedAt,
            upserts
        }
    }

    async getChapterPages(sourceName: string, sourceChapterUrl: string): Promise<MangaChapterPage[] | null> {
        const record = this.asState().chapterPages.find(
            entry => entry.sourceName === sourceName && entry.sourceChapterUrl === sourceChapterUrl
        )
        if (!record) return null
        return structuredClone(record.pages)
    }

    async listIngestRuns(query: IngestRunQuery = {}): Promise<IngestRunSummary[]> {
        const max = Math.min(Math.max(query.limit ?? 25, 1), 200)
        const sourceNeedle = query.source?.trim().toLowerCase()
        const runs = this.asState().ingestRuns.filter(run => {
            if (!sourceNeedle) return true
            return run.source.toLowerCase() === sourceNeedle
        })
        return structuredClone(runs.slice(0, max))
    }

    async getIngestOverview(): Promise<IngestOverview> {
        const state = this.asState()
        const latest = state.ingestRuns[0]?.createdAt ?? null
        return {
            totalManga: state.catalog.length,
            totalChapters: state.chapters.length,
            totalSourceLinks: state.sourceLinks.length,
            totalAliases: state.aliases.length,
            totalIngestRuns: state.ingestRuns.length,
            latestIngestAt: latest
        }
    }

    async listMangaSources(mangaId: string): Promise<MangaSourceLink[]> {
        const items = this.asState()
            .sourceLinks.filter(link => link.mangaId === mangaId)
            .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
            .map(({ mangaId: _mangaId, ...link }) => link)
        return structuredClone(items)
    }

    private asState(): PersistedState {
        if (!this.state) throw new Error("FileBackedStore is not initialized")
        return this.state
    }

    private async queuePersist(): Promise<void> {
        const writeTask = this.writeChain
            .catch(() => undefined)
            .then(async () => {
                await this.persist()
            })
        this.writeChain = writeTask
        await writeTask
    }

    private async persist(): Promise<void> {
        const tmpPath = `${this.filePath}.tmp`
        const serialized = JSON.stringify(this.asState(), null, 2)
        await writeFile(tmpPath, serialized, "utf8")
        await rename(tmpPath, this.filePath)
    }

    private parseState(raw: string): PersistedState | null {
        try {
            const parsed = JSON.parse(raw) as Partial<PersistedState> & {
                manga?: MangaDetail[]
            }

            const catalog = Array.isArray(parsed.catalog)
                ? parsed.catalog
                : Array.isArray(parsed.manga)
                ? parsed.manga
                : null
            if (!catalog) return null
            if (!Array.isArray(parsed.chapters) || !Array.isArray(parsed.library) || !Array.isArray(parsed.events)) {
                return null
            }

            const chapterPages = Array.isArray((parsed as { chapterPages?: unknown[] }).chapterPages)
                ? (parsed as { chapterPages: ChapterPageRecord[] }).chapterPages ?? []
                : []
            const ingestErrors = Array.isArray((parsed as { ingestErrors?: unknown[] }).ingestErrors)
                ? (parsed as { ingestErrors: IngestErrorRecord[] }).ingestErrors ?? []
                : []
            const library = parsed.library.map(entry => {
                const item = entry as UserLibraryEntry & { lastReadPage?: number | null }
                return {
                    ...item,
                    lastReadPage:
                        item.lastReadPage === null || item.lastReadPage === undefined
                            ? null
                            : Math.max(1, Math.floor(item.lastReadPage))
                }
            })

            const ingestRuns = Array.isArray((parsed as { ingestRuns?: unknown[] }).ingestRuns)
                ? (parsed as { ingestRuns: IngestRunSummary[] }).ingestRuns ?? []
                : []
            const sourceLinks = Array.isArray((parsed as { sourceLinks?: unknown[] }).sourceLinks)
                ? (parsed as { sourceLinks: SourceLinkRecord[] }).sourceLinks ?? []
                : []
            const aliases = Array.isArray((parsed as { aliases?: unknown[] }).aliases)
                ? (parsed as { aliases: AliasRecord[] }).aliases ?? []
                : []

            return {
                version: 1,
                catalog,
                chapters: parsed.chapters,
                chapterPages,
                library,
                events: parsed.events,
                ingestErrors,
                ingestRuns,
                sourceLinks,
                aliases
            }
        } catch {
            return null
        }
    }

    private async exists(path: string): Promise<boolean> {
        try {
            await stat(path)
            return true
        } catch {
            return false
        }
    }
}
