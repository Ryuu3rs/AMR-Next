export const FIXTURE_META = {
    capturedAt: "2026-08-02",
    sourceUrl: "https://flamecomics.xyz/series/112",
    note: "Trimmed __NEXT_DATA__ from the Next.js redesign: series 112 (Wild West Murim) page (4 real chapters incl. decimal 62.50 and chapter 0), the chapter-62.50 reader page (3 real image entries), and a 2-entry /browse catalogue for search."
}

export const SERIES_ID = "112"
export const SERIES_TITLE = "Wild West Murim"
export const CHAPTER_TOKEN = "b0e7243a0385f6f6"

// Real numeric-id series page. pageProps = { series, chapters }; chapters are
// served newest-first with the number as a ".00"-padded string.
const seriesPageProps = {
    series: {
        series_id: 112,
        title: "Wild West Murim",
        altTitles: ["Wild West Murim"],
        description: "<p>A martial artist reborn in the old west.</p>",
        language: "English",
        type: "Manhwa",
        status: "Ongoing",
        author: ["Cup Ramen", "West"],
        tags: ["Action", "Adventure", "Fantasy", "Shounen", "Martial Arts", "Reincarnation"],
        cover: "thumbnail.jpg"
    },
    chapters: [
        {
            chapter_id: 9283,
            series_id: 112,
            chapter: "63.00",
            title: "",
            token: "a7ff0fb655fc81e2",
            release_date: 1741312245
        },
        {
            chapter_id: 9243,
            series_id: 112,
            chapter: "62.50",
            title: ' "Season 2 Prologue"',
            token: "b0e7243a0385f6f6",
            release_date: 1740520330
        },
        {
            chapter_id: 4915,
            series_id: 112,
            chapter: "62.00",
            title: null,
            token: "d06b686b43872c7d",
            release_date: 1714694400
        },
        {
            chapter_id: 7000,
            series_id: 112,
            chapter: "0.00",
            title: null,
            token: "57f72548744332f9",
            release_date: 1664236800
        }
    ]
}

// Real chapter reader page. pageProps.chapter.images is an object keyed "0".."N",
// each entry carrying only metadata (name/size/dims) - the URL is built from the
// name against the cdn host.
const chapterPageProps = {
    chapter: {
        series_id: 112,
        chapter_id: 9243,
        chapter: "62.50",
        chapter_title: null,
        language: "English",
        token: "b0e7243a0385f6f6",
        release_date: 1740520330,
        images: {
            "0": { size: 660991, type: "image/jpeg", name: "WWM_62.5_00.jpg", width: 1778, height: 1000 },
            "1": { size: 512345, type: "image/jpeg", name: "WWM_62.5_01.jpg", width: 1778, height: 1000 },
            "2": { size: 498877, type: "image/jpeg", name: "WWM_62.5_02.jpg", width: 1778, height: 1000 }
        },
        title: "Wild West Murim",
        cover: "thumbnail.jpg"
    }
}

const browsePageProps = {
    series: [
        {
            series_id: 112,
            title: "Wild West Murim",
            altTitles: ["Wild West Murim"],
            language: "English",
            status: "Ongoing",
            cover: "thumbnail.jpg"
        },
        {
            series_id: 165,
            title: "30 Years Have Passed Since the Prologue",
            altTitles: [],
            language: "English",
            status: "Ongoing",
            cover: "thumbnail.webp"
        }
    ]
}

function nextDataHtml(pageProps: unknown): string {
    const payload = JSON.stringify({ props: { pageProps } })
    return `<!doctype html><html><head></head><body><script id="__NEXT_DATA__" type="application/json">${payload}</script></body></html>`
}

export const seriesPageHtml = nextDataHtml(seriesPageProps)
export const chapterPageHtml = nextDataHtml(chapterPageProps)
export const browsePageHtml = nextDataHtml(browsePageProps)

export const SERIES_PATH = `/series/${SERIES_ID}`
export const CHAPTER_PATH = `/series/${SERIES_ID}/${CHAPTER_TOKEN}`
export const BROWSE_PATH = "/browse"
