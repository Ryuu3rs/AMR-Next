const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

async function get(url) {
    try {
        const r = await fetch(url, {
            redirect: "follow",
            headers: { "User-Agent": UA, Accept: "text/html,*/*" },
            signal: AbortSignal.timeout(12000)
        })
        return { status: r.status, body: (await r.text()).slice(0, 200000) }
    } catch (e) {
        return { status: null, body: "", error: e.message }
    }
}

// AsuraScans: find the chapter reader container class/id and img context
const r = await get("https://asurascans.com/comics/reformation-of-the-deadbeat-noble-19cdf401/chapter/1")
if (!r.body) {
    console.log("ERROR:", r.error)
    process.exit(1)
}

// Show the 500 chars surrounding each chapter img
const chapterImgRe = /https?:\/\/cdn\.asurascans\.com\/asura-images\/chapters\/[^"'\s]+/g
const matches = [...r.body.matchAll(chapterImgRe)]
console.log(`Found ${matches.length} chapter img URLs`)
if (matches[0]) {
    // Show context around first chapter image
    const idx = matches[0].index
    const ctx = r.body.slice(Math.max(0, idx - 300), idx + 200)
    console.log("\nContext around first chapter img:")
    console.log(ctx.replace(/\s+/g, " "))
}

// Also show all img tags (just the tag, not full body) to see data-src vs src pattern
const imgTags = [...r.body.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
const chapterImgTags = imgTags.filter(t => /asura-images\/chapters/.test(t))
const coverImgTags = imgTags.filter(t => /asura-images\/covers/.test(t))
console.log(`\nCover img tags (${coverImgTags.length}):`)
coverImgTags.slice(0, 2).forEach(t => console.log(" ", t.slice(0, 200)))
console.log(`\nChapter img tags (${chapterImgTags.length}):`)
chapterImgTags.slice(0, 3).forEach(t => console.log(" ", t.slice(0, 200)))

// NatoManga: try to find chapter links via sitemap
console.log("\n=== NatoManga sitemap ===")
for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/wp-sitemap-posts-manga-1.xml"]) {
    const s = await get("https://www.natomanga.com" + path)
    if (s.status === 200 && s.body.includes("<loc>")) {
        const locs = [...s.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
            .map(m => m[1])
            .filter(u => !/sitemap/.test(u))
            .slice(0, 5)
        console.log(`  ${path}:`)
        locs.forEach(l => console.log("   ", l))
        break
    } else {
        console.log(`  ${path}: ${s.status ?? s.error?.slice(0, 40)}`)
    }
}
