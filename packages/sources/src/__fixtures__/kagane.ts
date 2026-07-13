// Fixture data modeled on kagane.to's real (verified live, 2026-07) response
// shapes: field names, the RSC "flight" double-escaping depth, and the DRM
// integrity/manifest handshake below were all captured from the actual site
// ("The Glutton: Devourer of Kings") rather than invented.

export const ORIGIN = "https://kagane.to"
export const API_ORIGIN = "https://yuzuki.kagane.to"

export const SERIES_ID = "019d151f-94bc-7b93-bd74-1d8670ebd313"
export const CHAPTER_ID = "019d6437-aa3f-7dd3-aebb-d131dd9633ff"
export const OTHER_CHAPTER_ID = "019d1555-b733-73b1-9dd2-30734f7fdd80"
export const COVER_IMAGE_ID = "019d151f-922f-7789-81c2-e2e92bbab487"

export const SERIES_URL = `${ORIGIN}/series/${SERIES_ID}`
export const CHAPTER_URL = `${ORIGIN}/series/${SERIES_ID}/reader/${CHAPTER_ID}`
export const SERIES_API_PATH = `/api/v2/series/${SERIES_ID}`
export const SEARCH_API_PATH = "/api/v2/search/series"
export const INTEGRITY_PATH = "/api/integrity"
export const MANIFEST_API_PATH = `/api/v2/books/${CHAPTER_ID}`

export const COVER_URL = `${API_ORIGIN}/api/v2/image/${COVER_IMAGE_ID}/compressed`

// GET /api/v2/series/{id} — not Cloudflare-gated.
export const seriesDetailJson = JSON.stringify({
    series_id: SERIES_ID,
    source_id: "019c00d0-5024-7205-a84f-fca567470b7e",
    title: "The Glutton: Devourer of Kings",
    content_rating: "Safe",
    description: "Humanity's world was destroyed by the Demon Kings.",
    publication_status: "Ongoing",
    upload_status: "Ongoing",
    format: "Manhua",
    created_at: "2026-03-22T10:38:04.475159Z",
    updated_at: "2026-03-22T10:38:04.475159Z",
    current_books: 36,
    series_alternate_titles: [
        { title: "Baoshi Zhe", label: "ja-Latn" },
        { title: "The Glutton", label: "unk" }
    ],
    series_covers: [
        {
            cover_id: "019d151f-9231-7316-9c0c-f30dd3998adb",
            language: "en",
            volume_number: null,
            chapter_number: "1",
            image_id: COVER_IMAGE_ID
        }
    ],
    genres: [
        { genre_id: "019c1b6f-3d3b-7528-a3e2-a791cfdcc4f7", genre_name: "Drama", is_spoiler: false },
        { genre_id: "019c1b6f-51ed-7991-a796-a8ca26e86666", genre_name: "Fantasy", is_spoiler: false }
    ]
})

// POST /api/v2/search/series?page=0&size=20 — not Cloudflare-gated.
export const searchResponseJson = JSON.stringify({
    content: [
        {
            series_id: SERIES_ID,
            source_id: "019c00d0-5024-7205-a84f-fca567470b7e",
            title: "The Glutton: Devourer of Kings",
            alternate_titles: ["Baoshi Zhe", "The Glutton"],
            cover_image_id: COVER_IMAGE_ID,
            content_rating: "Safe",
            publication_status: "Ongoing",
            format: "Manhua",
            latest_chapters: [{ book_id: CHAPTER_ID, title: "", chapter_no: "21" }]
        }
    ],
    pagination: { page: 0, size: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false }
})

// POST /api/integrity — behind kagane.to's Cloudflare challenge.
export const integrityResponseJson = JSON.stringify({
    token: "fixture-integrity-token",
    exp: 1783910212
})

// POST /api/v2/books/{chapterId}?is_datasaver=false — needs the integrity token
// from the (gated) endpoint above; the manifest endpoint itself isn't gated.
export const manifestResponseJson = JSON.stringify({
    access_token: "fixture-access-token",
    cache_url: "https://kstatic.to",
    manifest: {
        pages: [
            { ext: "webp", height: 900, page_id: "adcb1c7b-0db6-52d3-8a9d-da31731f6f8e", page_no: 1, width: 1080 },
            { ext: "webp", height: 900, page_id: "c6de1334-01fd-52c4-b747-f6e7574a722d", page_no: 2, width: 1080 },
            { ext: "webp", height: 900, page_id: "36c1c0f1-8ae8-56f3-9a51-0e2abc36879f", page_no: 3, width: 1080 }
        ]
    }
})

export const PAGE_URLS = [
    "https://kstatic.to/api/v2/books/page/019d6437-aa3f-7dd3-aebb-d131dd9633ff/adcb1c7b-0db6-52d3-8a9d-da31731f6f8e.webp",
    "https://kstatic.to/api/v2/books/page/019d6437-aa3f-7dd3-aebb-d131dd9633ff/c6de1334-01fd-52c4-b747-f6e7574a722d.webp",
    "https://kstatic.to/api/v2/books/page/019d6437-aa3f-7dd3-aebb-d131dd9633ff/36c1c0f1-8ae8-56f3-9a51-0e2abc36879f.webp"
]

// Wrap a JSON-encodable value the way kagane.to's own series page does: the
// chapter list ships inside a Next.js React Flight payload
// (`self.__next_f.push([1, "...escaped JSON..."])`), which is a JSON string
// embedded inside a JS string literal inside the HTML — so every quote in the
// real chapter data is backslash-escaped *twice* over. JSON.stringify-ing the
// already-stringified JSON twice (and stripping the outer quotes each time)
// reproduces exactly that depth, verified against the live site's HTML.
function toFlightEscapedJson(value: unknown): string {
    const onceEscaped = JSON.stringify(value)
    const twiceEscaped = JSON.stringify(onceEscaped).slice(1, -1)
    return JSON.stringify(twiceEscaped).slice(1, -1)
}

const chapter21 = {
    book_id: CHAPTER_ID,
    title: "Ch. 21",
    volume_no: null,
    chapter_no: "21",
    sort_no: 21,
    internal_release: true,
    uploader: { user_id: "019c1b13-2e5e-7b4a-93ab-f290e3838cdb", username: "Rinze", class: "Administrator" },
    groups: [{ group_id: "019c1b4e-9310-71b5-8717-94d900f45f92", title: "The Hours Between" }],
    page_count: 175,
    published_on: "2026-03-26T00:00:00Z",
    views: 2993
}

const chapter1 = {
    book_id: OTHER_CHAPTER_ID,
    title: "Ch. 1",
    volume_no: null,
    chapter_no: "1",
    sort_no: 1,
    internal_release: true,
    uploader: { user_id: "019c1b13-2e5e-7b4a-93ab-f290e3838cdb", username: "Rinze", class: "Administrator" },
    groups: [{ group_id: "019c1b4e-9310-71b5-8717-94d900f45f92", title: "The Hours Between" }],
    page_count: 287,
    published_on: "2026-03-18T00:00:00Z",
    views: 4226
}

// GET /series/{id} — behind kagane.to's Cloudflare challenge. Real page is ~400KB;
// this keeps only the `self.__next_f.push` chunk that carries `series_books`,
// which is all extractChapterList reads.
export const seriesPageHtml = `<!DOCTYPE html>
<html><head><title>The Glutton: Devourer of Kings</title></head>
<body>
<script>self.__next_f.push([1,"14:[\\"$\\",\\"div\\",null,{\\"data\\":{\\"series_id\\":\\"${SERIES_ID}\\",\\"title\\":\\"The Glutton: Devourer of Kings\\",\\"series_books\\":[${toFlightEscapedJson(chapter1)},${toFlightEscapedJson(chapter21)}]}}]\\n"])</script>
</body></html>`

// GET /series/{id} that returns Cloudflare's challenge page instead of real
// content (what a plain background-context fetch gets when kagane.to's managed
// challenge hasn't been solved) — listChapters should come back empty, not throw.
export const cloudflareChallengeHtml = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>
<div id="challenge-running"></div>
<script>window._cf_chl_opt = {};</script>
</body></html>`
