export const MANGA_ID = "11111111-1111-4111-8111-111111111111"
export const CHAPTER_ID = "22222222-2222-4222-8222-222222222222"
export const SECOND_CHAPTER_ID = "33333333-3333-4333-8333-333333333333"

export const mangaFixture = {
    result: "ok",
    data: {
        id: MANGA_ID,
        type: "manga",
        attributes: {
            title: { ja: "Test Manga JP", en: "Test Manga" },
            altTitles: [],
            status: "ongoing",
            createdAt: "2024-01-02T03:04:05+00:00",
            updatedAt: "2025-02-03T04:05:06+00:00"
        },
        relationships: [
            {
                id: "44444444-4444-4444-8444-444444444444",
                type: "cover_art",
                attributes: { fileName: "cover.jpg" }
            }
        ]
    }
}

export const chapterFixture = {
    result: "ok",
    data: {
        id: CHAPTER_ID,
        type: "chapter",
        attributes: {
            chapter: "1",
            title: "Arrival",
            translatedLanguage: "en",
            publishAt: "2025-01-01T00:00:00+00:00",
            readableAt: "2025-01-01T00:00:00+00:00"
        },
        relationships: [{ id: MANGA_ID, type: "manga" }]
    }
}

export const chapterFeedFixture = {
    result: "ok",
    data: [
        chapterFixture.data,
        {
            id: SECOND_CHAPTER_ID,
            type: "chapter",
            attributes: {
                chapter: "2.5",
                title: null,
                translatedLanguage: "en",
                publishAt: "2025-01-02T00:00:00+00:00"
            },
            relationships: [{ id: MANGA_ID, type: "manga" }]
        }
    ],
    limit: 100,
    offset: 0,
    total: 2
}

export const atHomeFixture = {
    result: "ok",
    baseUrl: "https://uploads.example.test",
    chapter: {
        hash: "chapter-hash",
        data: ["001.jpg", "002 image.jpg"]
    }
}
