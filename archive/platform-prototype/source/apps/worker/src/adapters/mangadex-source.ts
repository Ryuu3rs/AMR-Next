import type { IngestCatalogItem, IngestChapterPagesItem, MangaChapter, MangaDetail } from "@amr-next/contracts"
import type { SourceAdapter } from "./types.js"

const apiBase = process.env.MANGADEX_API_BASE_URL ?? "https://api.mangadex.org"
const webBase = process.env.MANGADEX_WEB_BASE_URL ?? "https://mangadex.org"
const uploadsBase = process.env.MANGADEX_UPLOADS_BASE_URL ?? "https://uploads.mangadex.org"
const mangaLimit = Math.min(Math.max(Number(process.env.MANGADEX_MANGA_LIMIT ?? 6), 1), 20)
const chapterLimit = Math.min(Math.max(Number(process.env.MANGADEX_CHAPTER_LIMIT ?? 20), 1), 50)
const pageChapterLimit = Math.min(Math.max(Number(process.env.MANGADEX_PAGE_CHAPTER_LIMIT ?? 2), 1), 6)
const pageManifestLimit = Math.min(Math.max(Number(process.env.MANGADEX_PAGE_MANIFEST_LIMIT ?? 12), 1), 60)
const requestTimeoutMs = Math.min(Math.max(Number(process.env.MANGADEX_TIMEOUT_MS ?? 12000), 1000), 60000)

type DexRelationship = {
    id: string
    type: string
    attributes?: Record<string, unknown>
}

type DexMangaAttributes = {
    title?: Record<string, string>
    altTitles?: Array<Record<string, string>>
    description?: Record<string, string>
    status?: string
    year?: number
    lastChapter?: string
    updatedAt?: string
    tags?: Array<{
        attributes?: {
            name?: Record<string, string>
            group?: string
        }
    }>
}

type DexManga = {
    id: string
    type: "manga"
    attributes: DexMangaAttributes
    relationships?: DexRelationship[]
}

type DexChapterAttributes = {
    chapter?: string
    title?: string
    publishAt?: string
}

type DexChapter = {
    id: string
    type: "chapter"
    attributes: DexChapterAttributes
}

type DexListResponse<T> = {
    data: T[]
}

type DexAtHomeResponse = {
    baseUrl: string
    chapter: {
        hash: string
        data: string[]
    }
}

const safeText = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const mapStatus = (status: string | undefined): MangaDetail["status"] => {
    if (status === "completed") return "completed"
    if (status === "hiatus") return "hiatus"
    if (status === "cancelled") return "cancelled"
    return "ongoing"
}

const pickLocalized = (value: Record<string, string> | undefined): string => {
    if (!value) return ""
    return value.en || value["en-us"] || value.ja || Object.values(value)[0] || ""
}

const toGenresAndThemes = (attributes: DexMangaAttributes): { genres: string[]; themes: string[] } => {
    const genres: string[] = []
    const themes: string[] = []
    for (const tag of attributes.tags ?? []) {
        const label = pickLocalized(tag.attributes?.name)
        if (!label) continue
        if (tag.attributes?.group === "theme") themes.push(label)
        else genres.push(label)
    }
    return {
        genres: genres.slice(0, 8),
        themes: themes.slice(0, 8)
    }
}

const withTimeout = async (url: string): Promise<Response> => {
    const signal = AbortSignal.timeout(requestTimeoutMs)
    return fetch(url, { signal })
}

const fetchJson = async <T>(url: string): Promise<T> => {
    const response = await withTimeout(url)
    if (!response.ok) {
        const body = await response.text()
        throw new Error(`mangadex ${response.status}: ${body.slice(0, 300)}`)
    }
    return (await response.json()) as T
}

const buildMangaUrl = (): string => {
    const params = new URLSearchParams()
    params.set("limit", String(mangaLimit))
    params.append("includes[]", "cover_art")
    params.append("availableTranslatedLanguage[]", "en")
    params.append("contentRating[]", "safe")
    params.append("contentRating[]", "suggestive")
    params.append("order[followedCount]", "desc")
    return `${apiBase}/manga?${params.toString()}`
}

const buildChapterUrl = (mangaId: string): string => {
    const params = new URLSearchParams()
    params.set("manga", mangaId)
    params.set("limit", String(chapterLimit))
    params.append("translatedLanguage[]", "en")
    params.append("order[chapter]", "desc")
    return `${apiBase}/chapter?${params.toString()}`
}

const mapCoverUrl = (mangaId: string, relationships: DexRelationship[] | undefined): string => {
    const cover = relationships?.find(relation => relation.type === "cover_art")
    const fileName = safeText(cover?.attributes?.fileName)
    if (fileName) return `${uploadsBase}/covers/${mangaId}/${fileName}.256.jpg`
    return `https://picsum.photos/seed/mangadex-${mangaId}/400/600`
}

const mapManga = (item: DexManga, nowIso: string): MangaDetail => {
    const title = pickLocalized(item.attributes.title) || `manga-${item.id}`
    const altTitles = (item.attributes.altTitles ?? [])
        .map(alt => pickLocalized(alt))
        .filter(alt => alt && alt.toLowerCase() !== title.toLowerCase())
        .slice(0, 8)
    const { genres, themes } = toGenresAndThemes(item.attributes)
    const year = item.attributes.year ? String(item.attributes.year) : ""

    return {
        id: item.id,
        title,
        coverUrl: mapCoverUrl(item.id, item.relationships),
        synopsis: pickLocalized(item.attributes.description) || `${title} from MangaDex`,
        genres: genres.length > 0 ? genres : ["Manga"],
        themes,
        status: mapStatus(item.attributes.status),
        sourceCount: 1,
        lastChapterNumber: safeText(item.attributes.lastChapter) || "?",
        updatedAt: safeText(item.attributes.updatedAt) || nowIso,
        altTitles,
        authors: year ? [`Serialized ${year}`] : ["Unknown"],
        artists: ["Unknown"]
    }
}

const mapChapters = (mangaId: string, chapters: DexChapter[], nowIso: string): MangaChapter[] => {
    return chapters.map(chapter => {
        const number = safeText(chapter.attributes.chapter) || "0"
        const titlePart = safeText(chapter.attributes.title)
        return {
            id: chapter.id,
            mangaId,
            title: titlePart ? `Ch ${number}: ${titlePart}` : `Chapter ${number}`,
            number,
            sourceName: "mangadex",
            sourceChapterUrl: `${webBase}/chapter/${chapter.id}`,
            releasedAt: safeText(chapter.attributes.publishAt) || nowIso
        }
    })
}

const toPageItems = (chapterId: string, payload: DexAtHomeResponse): IngestChapterPagesItem["items"] => {
    const hash = payload.chapter.hash
    return (payload.chapter.data ?? []).map((fileName, index) => ({
        index: index + 1,
        imageUrl: `${payload.baseUrl}/data/${hash}/${fileName}`
    }))
}

export const mangadexSourceAdapter: SourceAdapter = {
    id: "mangadex",
    async pullSnapshot(context): Promise<IngestCatalogItem[]> {
        const mangaFeed = await fetchJson<DexListResponse<DexManga>>(buildMangaUrl())
        const items: IngestCatalogItem[] = []

        for (const manga of mangaFeed.data) {
            const detail = mapManga(manga, context.nowIso)
            const chapterFeed = await fetchJson<DexListResponse<DexChapter>>(buildChapterUrl(manga.id))
            const chapters = mapChapters(manga.id, chapterFeed.data, context.nowIso)
            if (chapters.length > 0) detail.lastChapterNumber = chapters[0].number

            items.push({
                sourceMangaId: manga.id,
                sourceMangaUrl: `${webBase}/title/${manga.id}`,
                sourceTitle: detail.title,
                manga: detail,
                chapters
            })
        }

        return items
    },
    async pullChapterPages(_context, snapshot): Promise<IngestChapterPagesItem[]> {
        const items: IngestChapterPagesItem[] = []
        let remaining = pageManifestLimit

        for (const manga of snapshot) {
            if (remaining <= 0) break
            const chapters = manga.chapters.slice(0, pageChapterLimit)
            for (const chapter of chapters) {
                if (remaining <= 0) break
                try {
                    const payload = await fetchJson<DexAtHomeResponse>(`${apiBase}/at-home/server/${chapter.id}`)
                    const pages = toPageItems(chapter.id, payload)
                    if (pages.length === 0) continue
                    items.push({
                        sourceName: chapter.sourceName,
                        sourceChapterUrl: chapter.sourceChapterUrl,
                        chapterId: chapter.id,
                        mangaId: manga.manga.id,
                        items: pages
                    })
                    remaining -= 1
                } catch {
                    // Skip failed chapters so the worker can continue ingesting other manifests.
                }
            }
        }

        return items
    }
}
