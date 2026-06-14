export const CHAPTER_SLUG = "barbarians-adventure-in-a-fantasy-world-chapter-52-eng-li"
export const CHAPTER_PATH = `/reader/en/${CHAPTER_SLUG}/`
export const CHAPTER_URL = `https://www.mgeko.cc${CHAPTER_PATH}`

export const PAGE_URLS = [
    "https://i.imgsrv4.com/c/barbarians/52/01.jpg",
    "https://i.imgsrv4.com/c/barbarians/52/02.jpg"
]

export const COVER_URL = "https://www.mgeko.cc/uploads/cover-barbarians.jpg"

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
