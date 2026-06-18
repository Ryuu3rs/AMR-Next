export const MANGA_SLUG = "barbarians-adventure-in-a-fantasy-world"
export const MANGA_PATH = `/comic/${MANGA_SLUG}/`
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
