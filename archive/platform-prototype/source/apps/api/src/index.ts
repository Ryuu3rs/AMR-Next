import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Fastify from "fastify"
import cors from "@fastify/cors"
import type {
    ChapterPagesResponse,
    DashboardOverviewResponse,
    DiscoverQuery,
    DiscoverResponse,
    EventIngestInput,
    IngestChapterPagesInput,
    IngestChapterPagesResult,
    IngestErrorInput,
    HealthResponse,
    IngestCatalogInput,
    IngestCatalogResult,
    LibraryProgressInput,
    LibraryWriteInput,
    MangaChapter,
    MangaDetail,
    MangaStatus,
    RecommendationItem,
    UserLibraryEntry
} from "@amr-next/contracts"
import type { DataStore } from "./data-store.js"
import {
    resolveDatabaseUrl,
    resolveDefaultDbUser,
    resolvePostgresAutoMigrate,
    PostgresStore
} from "./postgres-store.js"
import { createSeedState } from "./seed.js"
import { FileBackedStore } from "./store.js"

const nowIso = (): string => new Date().toISOString()

const buildReaderPages = (mangaId: string, chapter: MangaChapter): ChapterPagesResponse => {
    const parsed = Number.parseInt(chapter.number, 10)
    const fallbackSeed = Number.isFinite(parsed) ? parsed : chapter.id.length
    const pageCount = Math.max(8, Math.min(24, (fallbackSeed % 9) + 10))
    const seedBase = `${mangaId}-${chapter.id}`.replace(/[^a-zA-Z0-9-]+/g, "-")
    const items = Array.from({ length: pageCount }, (_, index) => ({
        index: index + 1,
        imageUrl: `https://picsum.photos/seed/${seedBase}-p${index + 1}/1200/1800`
    }))

    return {
        mangaId,
        chapterId: chapter.id,
        sourceName: chapter.sourceName,
        sourceChapterUrl: chapter.sourceChapterUrl,
        mode: "fallback",
        items
    }
}

const toStatus = (value: unknown): MangaStatus | "any" => {
    if (value === "ongoing" || value === "completed" || value === "hiatus" || value === "cancelled") return value
    return "any"
}

const toDiscoverSort = (value: unknown): NonNullable<DiscoverQuery["sort"]> => {
    if (value === "updated" || value === "title" || value === "sources") return value
    return "relevance"
}

const asArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
    if (typeof value === "string")
        return value
            .split(",")
            .map(item => item.trim())
            .filter(Boolean)
    return []
}

const storageMode = (process.env.AMR_STORAGE ?? "file").trim().toLowerCase()
const dataFilePath = process.env.AMR_DATA_FILE
    ? resolve(process.cwd(), process.env.AMR_DATA_FILE)
    : fileURLToPath(new URL("../data/store.json", import.meta.url))
const ingestApiKey = process.env.INGEST_API_KEY

const redactConnectionString = (value: string): string => {
    try {
        const parsed = new URL(value)
        if (parsed.password) parsed.password = "***"
        return parsed.toString()
    } catch {
        return "<redacted>"
    }
}

let store: DataStore
let storageTarget: string
if (storageMode === "postgres") {
    const dbUrl = resolveDatabaseUrl()
    store = new PostgresStore({
        connectionString: dbUrl,
        userId: resolveDefaultDbUser(),
        autoMigrate: resolvePostgresAutoMigrate()
    })
    storageTarget = redactConnectionString(dbUrl)
} else {
    store = new FileBackedStore(dataFilePath, createSeedState)
    storageTarget = dataFilePath
}
await store.init()

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })

const scoreRecommendations = async (): Promise<RecommendationItem[]> => {
    const [catalog, library, events] = await Promise.all([
        store.listCatalog(),
        store.listLibrary(),
        store.listRecentEvents(1000)
    ])
    const followed = library
        .map(entry => catalog.find(manga => manga.id === entry.mangaId))
        .filter((manga): manga is MangaDetail => manga !== undefined)
    const genreWeights = new Map<string, number>()
    const eventWeights = new Map<string, number>()

    for (const manga of followed) {
        for (const genre of manga.genres) {
            genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + 1)
        }
    }

    const now = Date.now()
    for (const event of events) {
        if (!event.mangaId) continue
        const ageDays = Math.max(0, (now - new Date(event.at).getTime()) / (1000 * 60 * 60 * 24))
        const decay = Math.exp(-ageDays / 14)
        const base =
            event.type === "follow_manga" ? 5 : event.type === "read_chapter" ? 4 : event.type === "view_manga" ? 2 : 0
        if (base <= 0) continue
        eventWeights.set(event.mangaId, (eventWeights.get(event.mangaId) ?? 0) + base * decay)
    }

    const followedIds = new Set(library.map(entry => entry.mangaId))
    const ranked = catalog
        .filter(manga => !followedIds.has(manga.id))
        .map(manga => {
            const genreScore = manga.genres.reduce((sum, genre) => sum + (genreWeights.get(genre) ?? 0), 0)
            const sourceScore = Math.min(manga.sourceCount, 10) / 10
            const eventScore = eventWeights.get(manga.id) ?? 0
            const freshnessDays = Math.max(0, (now - new Date(manga.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
            const freshnessScore = Math.max(0, 2 - freshnessDays / 15)
            const score = genreScore + sourceScore + eventScore + freshnessScore
            let reason = "Popular across indexed sources"
            if (eventScore >= genreScore && eventScore >= 1) reason = "Based on your recent reading activity"
            else if (genreScore > 0) reason = "Matches your followed genres"

            return {
                mangaId: manga.id,
                score,
                reason
            } satisfies RecommendationItem
        })
        .sort((a, b) => b.score - a.score)

    return ranked.slice(0, 20)
}

const summarizeLibrary = (library: UserLibraryEntry[]): DashboardOverviewResponse["library"] => {
    const summary: DashboardOverviewResponse["library"] = {
        total: library.length,
        following: 0,
        reading: 0,
        completed: 0,
        paused: 0,
        dropped: 0
    }

    for (const entry of library) {
        summary[entry.status] += 1
    }

    return summary
}

app.get(
    "/health",
    async (): Promise<HealthResponse & { storage: string; storageTarget: string; catalogCount: number }> => {
        const catalogCount = (await store.listCatalog()).length
        return {
            ok: true,
            service: "api",
            version: "0.4.0",
            now: nowIso(),
            storage: storageMode,
            storageTarget,
            catalogCount
        }
    }
)

app.get("/v1/discover", async (request): Promise<DiscoverResponse> => {
    const query = request.query as Record<string, unknown>
    const discover: DiscoverQuery = {
        q: typeof query.q === "string" ? query.q : undefined,
        genres: asArray(query.genres),
        themes: asArray(query.themes),
        status: toStatus(query.status),
        sort: toDiscoverSort(query.sort),
        page: typeof query.page === "string" ? Number(query.page) : 1,
        pageSize: typeof query.pageSize === "string" ? Number(query.pageSize) : 20
    }

    const page = Number.isFinite(discover.page) && (discover.page ?? 0) > 0 ? (discover.page as number) : 1
    const pageSize =
        Number.isFinite(discover.pageSize) && (discover.pageSize ?? 0) > 0
            ? Math.min(discover.pageSize as number, 50)
            : 20

    const queryNeedle = (discover.q ?? "").trim().toLowerCase()
    const genreFilter = discover.genres ?? []
    const themeFilter = discover.themes ?? []
    const statusFilter = discover.status ?? "any"
    const sort = discover.sort ?? "relevance"

    const catalog = await store.listCatalog()
    let filtered = catalog.filter(manga => {
        if (statusFilter !== "any" && manga.status !== statusFilter) return false
        if (genreFilter.length > 0 && !genreFilter.every(genre => manga.genres.includes(genre))) return false
        if (themeFilter.length > 0 && !themeFilter.every(theme => manga.themes.includes(theme))) return false
        if (!queryNeedle) return true

        const haystack = `${manga.title} ${manga.altTitles.join(" ")} ${manga.synopsis}`.toLowerCase()
        return haystack.includes(queryNeedle)
    })

    const byUpdated = (a: MangaDetail, b: MangaDetail): number =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    if (sort === "updated") {
        filtered = filtered.sort((a, b) => byUpdated(a, b) || a.title.localeCompare(b.title))
    } else if (sort === "title") {
        filtered = filtered.sort((a, b) => a.title.localeCompare(b.title) || byUpdated(a, b))
    } else if (sort === "sources") {
        filtered = filtered.sort((a, b) => b.sourceCount - a.sourceCount || byUpdated(a, b))
    } else {
        filtered = filtered.sort((a, b) => {
            const aTitleHit = queryNeedle && a.title.toLowerCase().includes(queryNeedle) ? 1 : 0
            const bTitleHit = queryNeedle && b.title.toLowerCase().includes(queryNeedle) ? 1 : 0
            return bTitleHit - aTitleHit || byUpdated(a, b) || a.title.localeCompare(b.title)
        })
    }

    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize)

    const genreFacets = new Map<string, number>()
    const themeFacets = new Map<string, number>()
    for (const manga of filtered) {
        for (const genre of manga.genres) genreFacets.set(genre, (genreFacets.get(genre) ?? 0) + 1)
        for (const theme of manga.themes) themeFacets.set(theme, (themeFacets.get(theme) ?? 0) + 1)
    }

    return {
        page,
        pageSize,
        total: filtered.length,
        items,
        facets: {
            genres: Array.from(genreFacets.entries())
                .map(([value, count]) => ({ value, count }))
                .sort((a, b) => b.count - a.count),
            themes: Array.from(themeFacets.entries())
                .map(([value, count]) => ({ value, count }))
                .sort((a, b) => b.count - a.count)
        }
    }
})

app.get("/v1/manga/:id", async (request, reply) => {
    const { id } = request.params as { id: string }
    const manga = await store.getManga(id)
    if (!manga) return reply.code(404).send({ error: "Not found" })
    return manga
})

app.get("/v1/manga/:id/chapters", async (request, reply) => {
    const { id } = request.params as { id: string }
    const manga = await store.getManga(id)
    if (!manga) return reply.code(404).send({ error: "Not found" })

    return {
        mangaId: id,
        items: await store.listChapters(id)
    }
})

app.get("/v1/manga/:id/chapters/:chapterId/pages", async (request, reply) => {
    const { id, chapterId } = request.params as { id: string; chapterId: string }
    const manga = await store.getManga(id)
    if (!manga) return reply.code(404).send({ error: "Not found" })

    const chapter = (await store.listChapters(id)).find(item => item.id === chapterId)
    if (!chapter) return reply.code(404).send({ error: "Chapter not found" })
    const cachedPages = await store.getChapterPages(chapter.sourceName, chapter.sourceChapterUrl)
    if (cachedPages && cachedPages.length > 0) {
        return {
            mangaId: id,
            chapterId: chapter.id,
            sourceName: chapter.sourceName,
            sourceChapterUrl: chapter.sourceChapterUrl,
            mode: "adapter-cache" as const,
            items: cachedPages
        }
    }

    return buildReaderPages(id, chapter)
})

app.get("/v1/manga/:id/sources", async (request, reply) => {
    const { id } = request.params as { id: string }
    const manga = await store.getManga(id)
    if (!manga) return reply.code(404).send({ error: "Not found" })
    return {
        mangaId: id,
        items: await store.listMangaSources(id)
    }
})

app.get("/v1/users/me/library", async () => {
    return {
        items: await store.listLibrary()
    }
})

app.post("/v1/users/me/library", async (request, reply) => {
    const input = request.body as LibraryWriteInput
    if (!input || typeof input.mangaId !== "string" || !input.mangaId.trim()) {
        return reply.code(400).send({ error: "mangaId is required" })
    }

    const manga = await store.getManga(input.mangaId)
    if (!manga) return reply.code(404).send({ error: "Manga not found" })

    const eventAt = nowIso()
    const entry = await store.upsertLibrary(input, eventAt)
    await store.appendEvent({ type: "follow_manga", mangaId: input.mangaId, at: eventAt }, eventAt)
    return entry
})

app.patch("/v1/users/me/library/:mangaId", async (request, reply) => {
    const { mangaId } = request.params as { mangaId: string }
    const patchBody = (request.body ?? {}) as LibraryProgressInput
    const parsedPage =
        patchBody.lastReadPage === undefined
            ? undefined
            : patchBody.lastReadPage === null
            ? null
            : Number(patchBody.lastReadPage)
    const patch: LibraryProgressInput = {
        ...patchBody,
        lastReadPage:
            parsedPage === undefined
                ? undefined
                : parsedPage === null
                ? null
                : Number.isFinite(parsedPage)
                ? Math.max(1, Math.floor(parsedPage))
                : undefined
    }
    const next = await store.patchLibrary(mangaId, patch ?? {}, nowIso())
    if (!next) return reply.code(404).send({ error: "Library entry not found" })
    return next
})

app.get("/v1/users/me/recommendations", async () => {
    return {
        items: await scoreRecommendations()
    }
})

app.get("/v1/users/me/updates", async () => {
    const library = await store.listLibrary()
    const latestByEntry = await Promise.all(
        library.map(async entry => {
            const latest = (await store.listChapters(entry.mangaId))[0]
            if (!latest) return null
            if (entry.lastReadChapterId === latest.id) return null

            return {
                mangaId: entry.mangaId,
                latestChapterId: latest.id,
                latestChapterNumber: latest.number,
                latestChapterTitle: latest.title,
                releasedAt: latest.releasedAt
            }
        })
    )

    return {
        items: latestByEntry.filter((item): item is NonNullable<typeof item> => item !== null)
    }
})

app.get("/v1/dashboard", async (): Promise<DashboardOverviewResponse> => {
    const [catalog, library, ingest, recentRuns, ingestErrors] = await Promise.all([
        store.listCatalog(),
        store.listLibrary(),
        store.getIngestOverview(),
        store.listIngestRuns({ limit: 50 }),
        store.listIngestErrors({ limit: 20 })
    ])

    const catalogById = new Map(catalog.map(item => [item.id, item]))
    const continueReading = await Promise.all(
        library
            .filter(entry => entry.status === "reading" || entry.lastReadChapterId)
            .slice(0, 12)
            .map(async entry => {
                const manga = catalogById.get(entry.mangaId)
                if (!manga) return null
                const latest = (await store.listChapters(entry.mangaId))[0] ?? null
                return {
                    mangaId: manga.id,
                    title: manga.title,
                    coverUrl: manga.coverUrl,
                    status: entry.status,
                    lastReadChapterId: entry.lastReadChapterId,
                    lastReadPage: entry.lastReadPage,
                    latestChapterId: latest?.id ?? null,
                    latestChapterNumber: latest?.number ?? null,
                    latestChapterTitle: latest?.title ?? null,
                    latestReleasedAt: latest?.releasedAt ?? null
                }
            })
    )

    const sourceHealthMap = new Map<
        string,
        {
            source: string
            totalRuns: number
            latestRunAt: string
            latestMangaUpserts: number
            latestChapterUpserts: number
        }
    >()
    for (const run of recentRuns) {
        const existing = sourceHealthMap.get(run.source)
        if (!existing) {
            sourceHealthMap.set(run.source, {
                source: run.source,
                totalRuns: 1,
                latestRunAt: run.createdAt,
                latestMangaUpserts: run.mangaUpserts,
                latestChapterUpserts: run.chapterUpserts
            })
            continue
        }
        existing.totalRuns += 1
    }

    return {
        generatedAt: nowIso(),
        ingest,
        recentRuns: recentRuns.slice(0, 10),
        sourceHealth: Array.from(sourceHealthMap.values()).sort(
            (a, b) => new Date(b.latestRunAt).getTime() - new Date(a.latestRunAt).getTime()
        ),
        ingestErrors,
        library: summarizeLibrary(library),
        continueReading: continueReading.filter((item): item is NonNullable<typeof item> => item !== null)
    }
})

app.post("/v1/users/me/events", async (request, reply) => {
    const event = request.body as EventIngestInput
    if (!event || typeof event.type !== "string") return reply.code(400).send({ error: "event.type is required" })

    await store.appendEvent(event, nowIso())
    return { ok: true }
})

app.post("/internal/ingest/catalog", async (request, reply): Promise<IngestCatalogResult | { error: string }> => {
    if (ingestApiKey) {
        const header = request.headers["x-amr-ingest-key"]
        const key = Array.isArray(header) ? header[0] : header
        if (key !== ingestApiKey) return reply.code(401).send({ error: "Unauthorized ingest key" })
    }

    const input = request.body as IngestCatalogInput
    if (!input || typeof input.source !== "string" || !input.source.trim()) {
        return reply.code(400).send({ error: "source is required" })
    }
    if (!Array.isArray(input.items)) {
        return reply.code(400).send({ error: "items[] is required" })
    }

    const sanitizedInput: IngestCatalogInput = {
        source: input.source.trim(),
        harvestedAt: input.harvestedAt ?? nowIso(),
        items: input.items
            .filter(item => item && item.manga && typeof item.manga.id === "string")
            .map(item => ({
                manga: item.manga,
                sourceMangaId: typeof item.sourceMangaId === "string" ? item.sourceMangaId : undefined,
                sourceMangaUrl: typeof item.sourceMangaUrl === "string" ? item.sourceMangaUrl : undefined,
                sourceTitle: typeof item.sourceTitle === "string" ? item.sourceTitle : undefined,
                chapters: (Array.isArray(item.chapters) ? item.chapters : [])
                    .filter((chapter): chapter is MangaChapter => Boolean(chapter && typeof chapter.id === "string"))
                    .map(chapter => ({
                        ...chapter,
                        mangaId: item.manga.id
                    }))
            }))
    }

    return await store.upsertCatalog(sanitizedInput)
})

app.post(
    "/internal/ingest/chapter-pages",
    async (request, reply): Promise<IngestChapterPagesResult | { error: string }> => {
        if (ingestApiKey) {
            const header = request.headers["x-amr-ingest-key"]
            const key = Array.isArray(header) ? header[0] : header
            if (key !== ingestApiKey) return reply.code(401).send({ error: "Unauthorized ingest key" })
        }

        const input = request.body as IngestChapterPagesInput
        if (!input || typeof input.source !== "string" || !input.source.trim()) {
            return reply.code(400).send({ error: "source is required" })
        }
        if (!Array.isArray(input.items)) {
            return reply.code(400).send({ error: "items[] is required" })
        }

        const sanitizedInput: IngestChapterPagesInput = {
            source: input.source.trim(),
            harvestedAt: input.harvestedAt ?? nowIso(),
            items: input.items
                .filter(
                    item => item && typeof item.sourceName === "string" && typeof item.sourceChapterUrl === "string"
                )
                .map(item => ({
                    sourceName: item.sourceName.trim(),
                    sourceChapterUrl: item.sourceChapterUrl.trim(),
                    chapterId: typeof item.chapterId === "string" ? item.chapterId : undefined,
                    mangaId: typeof item.mangaId === "string" ? item.mangaId : undefined,
                    items: (Array.isArray(item.items) ? item.items : [])
                        .filter(page => page && Number.isFinite(page.index) && typeof page.imageUrl === "string")
                        .map(page => ({
                            index: Math.max(1, Math.floor(page.index)),
                            imageUrl: page.imageUrl
                        }))
                }))
        }

        return await store.upsertChapterPages(sanitizedInput)
    }
)

app.post("/internal/ingest/errors", async (request, reply) => {
    if (ingestApiKey) {
        const header = request.headers["x-amr-ingest-key"]
        const key = Array.isArray(header) ? header[0] : header
        if (key !== ingestApiKey) return reply.code(401).send({ error: "Unauthorized ingest key" })
    }

    const input = request.body as IngestErrorInput
    if (!input || typeof input.source !== "string" || !input.source.trim()) {
        return reply.code(400).send({ error: "source is required" })
    }
    if (!input || typeof input.stage !== "string" || !input.stage.trim()) {
        return reply.code(400).send({ error: "stage is required" })
    }
    if (!input || typeof input.message !== "string" || !input.message.trim()) {
        return reply.code(400).send({ error: "message is required" })
    }

    return await store.appendIngestError(
        {
            source: input.source.trim(),
            stage: input.stage.trim(),
            message: input.message.trim(),
            details: typeof input.details === "string" ? input.details : undefined,
            retryable: typeof input.retryable === "boolean" ? input.retryable : true,
            at: typeof input.at === "string" ? input.at : undefined
        },
        nowIso()
    )
})

app.get("/internal/ingest/errors", async (request, reply) => {
    if (ingestApiKey) {
        const header = request.headers["x-amr-ingest-key"]
        const key = Array.isArray(header) ? header[0] : header
        if (key !== ingestApiKey) return reply.code(401).send({ error: "Unauthorized ingest key" })
    }

    const query = request.query as Record<string, unknown>
    const parsedLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : 50
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50
    const source = typeof query.source === "string" ? query.source : undefined
    return {
        items: await store.listIngestErrors({ limit, source })
    }
})

app.get("/internal/ingest/runs", async (request, reply) => {
    if (ingestApiKey) {
        const header = request.headers["x-amr-ingest-key"]
        const key = Array.isArray(header) ? header[0] : header
        if (key !== ingestApiKey) return reply.code(401).send({ error: "Unauthorized ingest key" })
    }

    const query = request.query as Record<string, unknown>
    const parsedLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : 25
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 25
    const source = typeof query.source === "string" ? query.source : undefined
    return {
        items: await store.listIngestRuns({ limit, source })
    }
})

app.get("/internal/ingest/overview", async (request, reply) => {
    if (ingestApiKey) {
        const header = request.headers["x-amr-ingest-key"]
        const key = Array.isArray(header) ? header[0] : header
        if (key !== ingestApiKey) return reply.code(401).send({ error: "Unauthorized ingest key" })
    }

    return await store.getIngestOverview()
})

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? "0.0.0.0"

await app.listen({ port, host })
app.log.info(`AMR Next API listening on ${host}:${port} (storage=${storageMode})`)
