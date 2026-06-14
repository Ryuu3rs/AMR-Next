import type { IngestCatalogItem, MangaChapter, MangaDetail } from "@amr-next/contracts"
import type { SourceAdapter } from "./types.js"

const apiBase = process.env.JIKAN_API_BASE_URL ?? "https://api.jikan.moe/v4"
const mangaLimit = Math.min(Math.max(Number(process.env.JIKAN_MANGA_LIMIT ?? 6), 1), 20)
const chapterCap = Math.min(Math.max(Number(process.env.JIKAN_CHAPTER_CAP ?? 20), 1), 80)
const requestTimeoutMs = Math.min(Math.max(Number(process.env.JIKAN_TIMEOUT_MS ?? 12000), 1000), 60000)

type JikanManga = {
    mal_id: number
    title: string
    title_english?: string
    title_japanese?: string
    synopsis?: string
    status?: string
    chapters?: number
    images?: {
        jpg?: {
            large_image_url?: string
            image_url?: string
        }
    }
    url?: string
    genres?: Array<{ name: string }>
    themes?: Array<{ name: string }>
    demographics?: Array<{ name: string }>
    authors?: Array<{ name: string }>
    published?: {
        from?: string
    }
}

type JikanResponse = {
    data: JikanManga[]
}

const safeText = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const mapStatus = (value: string | undefined): MangaDetail["status"] => {
    const normalized = safeText(value).toLowerCase()
    if (normalized.includes("finished")) return "completed"
    if (normalized.includes("hiatus")) return "hiatus"
    if (normalized.includes("cancel")) return "cancelled"
    return "ongoing"
}

const withTimeout = async (url: string): Promise<Response> => {
    const signal = AbortSignal.timeout(requestTimeoutMs)
    return fetch(url, { signal })
}

const fetchTopManga = async (): Promise<JikanManga[]> => {
    const params = new URLSearchParams()
    params.set("limit", String(mangaLimit))
    params.set("sfw", "true")
    const response = await withTimeout(`${apiBase}/top/manga?${params.toString()}`)
    if (!response.ok) {
        const body = await response.text()
        throw new Error(`jikan ${response.status}: ${body.slice(0, 240)}`)
    }
    const payload = (await response.json()) as JikanResponse
    return payload.data ?? []
}

const buildChapters = (mangaId: string, sourceUrl: string, chapterCount: number, nowIso: string): MangaChapter[] => {
    const capped = Math.max(1, Math.min(chapterCount, chapterCap))
    const items: MangaChapter[] = []
    for (let chapter = capped; chapter > Math.max(0, capped - 20); chapter -= 1) {
        items.push({
            id: `jikan-${mangaId}-ch-${chapter}`,
            mangaId,
            title: `Chapter ${chapter}`,
            number: String(chapter),
            sourceName: "jikan",
            sourceChapterUrl: `${sourceUrl}#chapter-${chapter}`,
            releasedAt: nowIso
        })
    }
    return items
}

export const jikanSourceAdapter: SourceAdapter = {
    id: "jikan",
    async pullSnapshot(context): Promise<IngestCatalogItem[]> {
        const feed = await fetchTopManga()
        return feed.map(item => {
            const mangaId = `jikan-${item.mal_id}`
            const sourceUrl = safeText(item.url) || `https://myanimelist.net/manga/${item.mal_id}`
            const title = safeText(item.title_english) || safeText(item.title) || mangaId
            const altTitles = [safeText(item.title), safeText(item.title_japanese)]
                .filter(entry => entry && entry.toLowerCase() !== title.toLowerCase())
                .slice(0, 6)
            const genres = [
                ...(item.genres ?? []).map(entry => safeText(entry.name)),
                ...(item.demographics ?? []).map(entry => safeText(entry.name))
            ].filter(Boolean)
            const themes = (item.themes ?? []).map(entry => safeText(entry.name)).filter(Boolean)
            const chapterCount = Math.max(1, item.chapters ?? 12)

            return {
                sourceMangaId: String(item.mal_id),
                sourceMangaUrl: sourceUrl,
                sourceTitle: title,
                manga: {
                    id: mangaId,
                    title,
                    coverUrl:
                        safeText(item.images?.jpg?.large_image_url) ||
                        safeText(item.images?.jpg?.image_url) ||
                        `https://picsum.photos/seed/${mangaId}/400/600`,
                    synopsis: safeText(item.synopsis) || `${title} from Jikan`,
                    genres: genres.length > 0 ? genres : ["Manga"],
                    themes,
                    status: mapStatus(item.status),
                    sourceCount: 1,
                    lastChapterNumber: String(chapterCount),
                    updatedAt: context.nowIso,
                    altTitles,
                    authors: (item.authors ?? []).map(author => safeText(author.name)).filter(Boolean),
                    artists: []
                },
                chapters: buildChapters(mangaId, sourceUrl, chapterCount, context.nowIso)
            }
        })
    }
}
