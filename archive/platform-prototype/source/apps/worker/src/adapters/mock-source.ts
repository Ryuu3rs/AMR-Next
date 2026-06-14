import type { IngestCatalogItem, IngestChapterPagesItem, MangaChapter, MangaChapterPage } from "@amr-next/contracts"
import type { SourceAdapter } from "./types.js"

const buildChapters = (mangaId: string, latestChapter: number, nowIso: string): MangaChapter[] => {
    const items: MangaChapter[] = []
    for (let chapter = latestChapter; chapter > latestChapter - 20; chapter -= 1) {
        items.push({
            id: `${mangaId}-ch-${chapter}`,
            mangaId,
            title: `Chapter ${chapter}`,
            number: String(chapter),
            sourceName: "mock-source",
            sourceChapterUrl: `https://example.org/${mangaId}/chapter-${chapter}`,
            releasedAt: nowIso
        })
    }
    return items
}

const buildSnapshot = (nowIso: string): IngestCatalogItem[] => {
    const cycleMarker = Math.floor(Date.now() / (1000 * 60 * 60 * 6))
    return [
        {
            sourceMangaId: "dandadan",
            sourceMangaUrl: "https://example.org/title/dandadan",
            sourceTitle: "Dandadan",
            manga: {
                id: "dandadan",
                title: "Dandadan",
                coverUrl: "https://picsum.photos/seed/dandadan/400/600",
                synopsis: "A high-speed occult action series mixing aliens, yokai, and absurd comedy.",
                genres: ["Action", "Supernatural", "Comedy"],
                themes: ["Occult", "Aliens", "Romance"],
                status: "ongoing",
                sourceCount: 4,
                lastChapterNumber: String(180 + (cycleMarker % 3)),
                updatedAt: nowIso,
                altTitles: ["Dan Da Dan"],
                authors: ["Yukinobu Tatsu"],
                artists: ["Yukinobu Tatsu"]
            },
            chapters: buildChapters("dandadan", 180 + (cycleMarker % 3), nowIso)
        },
        {
            sourceMangaId: "sakamoto-days",
            sourceMangaUrl: "https://example.org/title/sakamoto-days",
            sourceTitle: "Sakamoto Days",
            manga: {
                id: "sakamoto-days",
                title: "Sakamoto Days",
                coverUrl: "https://picsum.photos/seed/sakamoto-days/400/600",
                synopsis: "A retired hitman runs a store and keeps getting dragged back into deadly trouble.",
                genres: ["Action", "Comedy"],
                themes: ["Assassins", "Family", "Shonen"],
                status: "ongoing",
                sourceCount: 3,
                lastChapterNumber: String(220 + (cycleMarker % 4)),
                updatedAt: nowIso,
                altTitles: ["Sakamoto DAYS"],
                authors: ["Yuto Suzuki"],
                artists: ["Yuto Suzuki"]
            },
            chapters: buildChapters("sakamoto-days", 220 + (cycleMarker % 4), nowIso)
        }
    ]
}

const buildPages = (chapter: MangaChapter): MangaChapterPage[] => {
    const parsed = Number.parseInt(chapter.number, 10)
    const total = Math.max(8, Math.min(24, Number.isFinite(parsed) ? (parsed % 9) + 10 : 12))
    const base = chapter.sourceChapterUrl.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()
    return Array.from({ length: total }, (_, index) => ({
        index: index + 1,
        imageUrl: `https://picsum.photos/seed/${base}-p${index + 1}/1200/1800`
    }))
}

export const mockSourceAdapter: SourceAdapter = {
    id: "mock-source",
    async pullSnapshot(context) {
        return buildSnapshot(context.nowIso)
    },
    async pullChapterPages(_context, snapshot) {
        const items: IngestChapterPagesItem[] = []
        for (const manga of snapshot) {
            for (const chapter of manga.chapters.slice(0, 5)) {
                items.push({
                    sourceName: chapter.sourceName,
                    sourceChapterUrl: chapter.sourceChapterUrl,
                    chapterId: chapter.id,
                    mangaId: manga.manga.id,
                    items: buildPages(chapter)
                })
            }
        }
        return items
    }
}
