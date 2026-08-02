export const FIXTURE_META = {
    capturedAt: "2026-08-02",
    sourceUrl: "https://asurascans.com/comics/dungeon-odyssey-1d35e5bd",
    note: "URL scheme + rotating slug hash verified live 2026-08-02 (asuracomic.net 301s to asurascans.com; Google index shows /comics/<title>-<8hex> series and /comics/<title>-<8hex>/chapter/<n> chapters, plus bare-slug serving). Page body is a trimmed shape; asurascans.com CF-blocks direct fetch."
}

// The live slug carries an 8-hex hash that Asura rotates. The stored library entry
// may hold an older hash (or the legacy asuracomic.net numeric prefix), so tests
// cover both the current slug and a stale one that must self-heal via the base slug.
export const BASE_SLUG = "dungeon-odyssey"
export const LIVE_SLUG = "dungeon-odyssey-1d35e5bd"
export const STALE_HEX_SLUG = "dungeon-odyssey-059befe1"
export const STALE_LEGACY_SLUG = "0223090894-dungeon-odyssey"

export const MANGA_PATH = `/comics/${LIVE_SLUG}/`
export const BASE_MANGA_PATH = `/comics/${BASE_SLUG}/`
export const MANGA_URL = `https://asurascans.com${MANGA_PATH}`

export const CHAPTER_NUM = "157"
export const CHAPTER_PATH = `/comics/${LIVE_SLUG}/chapter/${CHAPTER_NUM}`
export const CHAPTER_URL = `https://asurascans.com${CHAPTER_PATH}`

export const COVER_URL = "https://cdn.asurascans.com/asura-images/covers/dungeon-odyssey.jpg"

export const PAGE_URLS = [
    "https://cdn.asurascans.com/asura-images/chapters/157/01.webp",
    "https://cdn.asurascans.com/asura-images/chapters/157/02.webp"
]

// Series page: chapter anchors carry the current hashed slug even when the page is
// reached through the base slug, and one decimal chapter proves decimals survive.
export const mangaHtml = `<!DOCTYPE html>
<html>
<head><title>Dungeon Odyssey - Asura Scans</title>
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<div class="chapters">
  <a href="/comics/${LIVE_SLUG}/chapter/157">Chapter 157</a>
  <a href="/comics/${LIVE_SLUG}/chapter/156.5">Chapter 156.5</a>
  <a href="/comics/${LIVE_SLUG}/chapter/156">Chapter 156</a>
  <a href="/comics/${LIVE_SLUG}/chapter/1">Chapter 1</a>
</div>
</body>
</html>`

export const SEARCH_PATH = "/browse"
export const SEARCH_QUERY = "dungeon"

export const searchHtml = `<!DOCTYPE html>
<html>
<head><title>Browse - Asura Scans</title></head>
<body>
<div class="grid">
<a href="/comics/${LIVE_SLUG}"><span class="block">Dungeon Odyssey</span></a>
<a href="/comics/tower-of-god-3f9c1a2b"><span class="block">Tower of God</span></a>
</div>
</body>
</html>`

// Chapter reader: page images ship in the React Flight (RSC) payload as
// "url":[0,"<cdn-url>"] tokens.
export const chapterHtml = `<!DOCTYPE html>
<html>
<head>
<title>Dungeon Odyssey Chapter 157 - Read Online | Asura Scans</title>
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<script>[{"order":0,"url":[0,"${PAGE_URLS[0]}"]},{"order":1,"url":[0,"${PAGE_URLS[1]}"]}]</script>
</body>
</html>`
