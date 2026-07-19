export const FIXTURE_META = {
    capturedAt: "2026-07-18",
    sourceUrl: "https://ww2.mangafreak.me/Manga/One_Piece",
    note: "Date inferred from git history, re-capture on next change."
}

export const ORIGIN = "https://ww2.mangafreak.me"
export const CDN = "https://images.mangafreak.me"

export const MANGA_SLUG = "One_Piece"
export const MANGA_PATH = `/Manga/${MANGA_SLUG}`
export const MANGA_URL = `${ORIGIN}${MANGA_PATH}`

export const CHAPTER_NUM = "1092"
export const CHAPTER_PATH = `/Read1_${MANGA_SLUG}_${CHAPTER_NUM}`
export const CHAPTER_URL = `${ORIGIN}${CHAPTER_PATH}`

// The real cover MangaFreak actually serves, as found in the manga page's og:image tag.
// Deliberately different from the blind CDN-path guess below so tests can tell them apart.
export const REAL_COVER_URL = "https://images.mangafreak.me/012/manga_images/onepiece_cover_real.jpg"

// What resolveCover/resolveManga/resolveChapter fall back to when real extraction fails -
// mirrors the adaptor's `${CDN}/manga_images/${slug.toLowerCase()}.jpg` pattern.
export const BLIND_GUESS_COVER_URL = `${CDN}/manga_images/${MANGA_SLUG.toLowerCase()}.jpg`

export const PAGE_URLS = [
    "https://images.mangafreak.me/mangas/One_Piece/1092/one_piece_1092_01.jpg",
    "https://images.mangafreak.me/mangas/One_Piece/1092/one_piece_1092_02.jpg"
]

export const mangaHtml = `<!DOCTYPE html>
<html>
<head>
<title>One Piece Manga</title>
<meta property="og:title" content="One Piece" />
<meta property="og:image" content="${REAL_COVER_URL}" />
</head>
<body>
<h1>One Piece</h1>
<div class="manga_series_list">
  <a href="/Read1_${MANGA_SLUG}_1092">Read One Piece Chapter 1092</a>
  <a href="/Read1_${MANGA_SLUG}_1091">Read One Piece Chapter 1091</a>
  <a href="/Read1_${MANGA_SLUG}_1">Read One Piece Chapter 1</a>
</div>
</body>
</html>`

// Same manga page, but with no og:image/twitter:image meta tag at all - extraction should
// fail here and callers must fall back to the blind CDN-path guess.
export const mangaHtmlNoCoverMeta = `<!DOCTYPE html>
<html>
<head>
<title>One Piece Manga</title>
<meta property="og:title" content="One Piece" />
</head>
<body>
<h1>One Piece</h1>
<div class="manga_series_list">
  <a href="/Read1_${MANGA_SLUG}_1092">Read One Piece Chapter 1092</a>
</div>
</body>
</html>`

export const chapterHtml = `<!DOCTYPE html>
<html>
<head><title>One Piece Chapter 1092</title></head>
<body>
<div id="pages">
  <img src="${PAGE_URLS[0]}" />
  <img src="${PAGE_URLS[1]}" />
</div>
</body>
</html>`

// Deliberately mixed-case with surrounding whitespace, matching the adapter's
// trim + lowercase transformation before the query is placed on the path.
export const SEARCH_QUERY = "  One Piece  "
export const SEARCH_PATH = `/Find/${encodeURIComponent(SEARCH_QUERY.trim().toLowerCase())}`

// Mirrors the real /Find/{query} response: each result row links the same slug twice,
// an image-only thumbnail anchor first, then a separate text-only title anchor. There is
// no <img> inside the title anchor itself, so cover extraction always falls back to the
// blind CDN-path guess for search results (verified against the live site).
export const searchHtml = `<!DOCTYPE html>
<html>
<body>
<div class="manga_search_item">
  <a href="/Manga/${MANGA_SLUG}"><img src="${CDN}/manga_images/${MANGA_SLUG.toLowerCase()}.jpg" alt="cover" /></a>
  <a href="/Manga/${MANGA_SLUG}">One Piece</a>
</div>
<div class="manga_search_item">
  <a href="/Manga/One_Punch_Man"><img src="${CDN}/manga_images/one_punch_man.jpg" alt="cover" /></a>
  <a href="/Manga/One_Punch_Man">One Punch Man</a>
</div>
</body>
</html>`
