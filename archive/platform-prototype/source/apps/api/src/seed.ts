import type { MangaChapter, MangaDetail } from "@amr-next/contracts"
import type { PersistedState } from "./store.js"

const nowIso = (): string => new Date().toISOString()

const seedCatalog = (createdAt: string): MangaDetail[] => [
    {
        id: "solo-leveling",
        title: "Solo Leveling",
        coverUrl: "https://picsum.photos/seed/solo-leveling/400/600",
        synopsis: "A weak hunter levels up through a hidden system and becomes a top-ranked fighter.",
        genres: ["Action", "Fantasy"],
        themes: ["Dungeon", "Power Fantasy"],
        status: "completed",
        sourceCount: 6,
        lastChapterNumber: "200",
        updatedAt: createdAt,
        altTitles: ["Only I Level Up"],
        authors: ["Chugong"],
        artists: ["Dubu"]
    },
    {
        id: "one-piece",
        title: "One Piece",
        coverUrl: "https://picsum.photos/seed/one-piece/400/600",
        synopsis: "Pirates pursue the ultimate treasure while crossing dangerous seas and world powers.",
        genres: ["Adventure", "Action", "Comedy"],
        themes: ["Pirates", "Found Family"],
        status: "ongoing",
        sourceCount: 7,
        lastChapterNumber: "1130",
        updatedAt: createdAt,
        altTitles: ["OP"],
        authors: ["Eiichiro Oda"],
        artists: ["Eiichiro Oda"]
    },
    {
        id: "blue-lock",
        title: "Blue Lock",
        coverUrl: "https://picsum.photos/seed/blue-lock/400/600",
        synopsis: "An extreme striker training program forces players to compete for a single top position.",
        genres: ["Sports", "Drama"],
        themes: ["Competition", "Psychological"],
        status: "ongoing",
        sourceCount: 5,
        lastChapterNumber: "300",
        updatedAt: createdAt,
        altTitles: ["Buruu Rokku"],
        authors: ["Muneyuki Kaneshiro"],
        artists: ["Yusuke Nomura"]
    },
    {
        id: "frieren",
        title: "Frieren: Beyond Journey's End",
        coverUrl: "https://picsum.photos/seed/frieren/400/600",
        synopsis: "An elf mage reflects on time and memory after defeating the demon king.",
        genres: ["Fantasy", "Drama"],
        themes: ["Post-Adventure", "Character Study"],
        status: "ongoing",
        sourceCount: 4,
        lastChapterNumber: "140",
        updatedAt: createdAt,
        altTitles: ["Sousou no Frieren"],
        authors: ["Kanehito Yamada"],
        artists: ["Tsukasa Abe"]
    }
]

const seedChapters = (catalog: MangaDetail[], createdAt: string): MangaChapter[] => {
    const chapters: MangaChapter[] = []
    for (const manga of catalog) {
        const chapterCount = Math.min(Number(manga.lastChapterNumber) || 20, 40)
        for (let index = 0; index < chapterCount; index += 1) {
            const number = chapterCount - index
            chapters.push({
                id: `${manga.id}-ch-${number}`,
                mangaId: manga.id,
                title: `Chapter ${number}`,
                number: String(number),
                sourceName: "mirror-sample",
                sourceChapterUrl: `https://example.com/${manga.id}/chapter-${number}`,
                releasedAt: createdAt
            })
        }
    }
    return chapters
}

export function createSeedState(): PersistedState {
    const createdAt = nowIso()
    const catalog = seedCatalog(createdAt)
    const chapters = seedChapters(catalog, createdAt)
    return {
        version: 1,
        catalog,
        chapters,
        chapterPages: [],
        library: [],
        events: [],
        ingestErrors: [],
        ingestRuns: [],
        sourceLinks: [],
        aliases: []
    }
}
