export const FIXTURE_META = {
    capturedAt: "2026-07-18",
    sourceUrl: "https://www.mgeko.cc/manga/barbarians-adventure-in-a-fantasy-world/",
    note: "Date inferred from git history, re-capture on next change."
}

export const MANGA_SLUG = "barbarians-adventure-in-a-fantasy-world"
export const MANGA_PATH = `/manga/${MANGA_SLUG}/`
export const MANGA_URL = `https://www.mgeko.cc${MANGA_PATH}`

export const CHAPTER_SLUG = "barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li"
export const CHAPTER_PATH = `/reader/en/${CHAPTER_SLUG}/`
export const CHAPTER_URL = `https://www.mgeko.cc${CHAPTER_PATH}`

export const PAGE_URLS = [
    "https://i.imgsrv4.com/c/barbarians/52/01.jpg",
    "https://i.imgsrv4.com/c/barbarians/52/02.jpg"
]

export const COVER_URL = "https://www.mgeko.cc/uploads/cover-barbarians.jpg"

export const mangaHtml = `<!DOCTYPE html>
<html>
<head><title>Barbarian's Adventure in a Fantasy World</title>
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<ul class="chapter-list">
  <li><a href="/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li/">Chapter 52</a></li>
  <li><a href="/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-51-eng-li/">Chapter 51</a></li>
  <li><a href="/reader/en/barbarians-adventure-in-a-fantasy-world-chapter-1-eng-li/">Chapter 1</a></li>
</ul>
</body>
</html>`

export const SEARCH_PATH = "/search/"
export const SEARCH_QUERY = "barbarian"

// Live markup shape (verified against https://www.mgeko.cc/search/?search=barbarian):
// <li class="novel-item"> cards, clean title on the anchor's title attribute (its
// inner text mixes in author/chapter/summary text), lazy-loaded cover with a shared
// loading.gif placeholder in src and the real relative path in data-src.
export const searchHtml = `<!DOCTYPE html>
<html>
<head><title>Search Manga</title></head>
<body>
<ul class="novel-list grid col col2">
<li class="novel-item">
<a href="/manga/barbarians-adventure-in-a-fantasy-world/" title="Barbarian's Adventure in a Fantasy World">
<div class="cover-wrap"><figure class="novel-cover">
<img class="lazy" src="/static/img/loading.gif" data-src="/media/manga_covers/qYZJ01-m.jpg" alt="Barbarian's Adventure in a Fantasy World">
</figure></div>
<h4 class="novel-title text2row">Barbarian's Adventure in a Fantasy World</h4>
<h6 class="text1row">Author(S): Updating</h6>
<div class="novel-stats"><strong> Chapters 64-eng-li</strong></div>
</a>
</li>
<li class="novel-item">
<a href="/manga/barbarian-quest/" title="Barbarian Quest">
<div class="cover-wrap"><figure class="novel-cover">
<img class="lazy" src="/static/img/loading.gif" data-src="/media/manga_covers/bq-cover.jpg" alt="Barbarian Quest">
</figure></div>
<h4 class="novel-title text2row">Barbarian Quest</h4>
<h6 class="text1row">Author(S): Updating</h6>
<div class="novel-stats"><strong> Chapters 100-eng-li</strong></div>
</a>
</li>
</ul>
</body>
</html>`

// Mgeko ships page URLs in a single-quoted JS array (chapImages).
export const chapterHtml = `<!DOCTYPE html>
<html>
<head>
<title>Barbarian's Adventure - Chapter 52</title>
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<div id="chapter-content">
<script>
  var chapImages = ['${PAGE_URLS[0]}', '${PAGE_URLS[1]}'];
</script>
</div>
</body>
</html>`
