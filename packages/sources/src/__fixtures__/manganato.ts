export const MANGA_ID = "manga-ae977661"
export const CHAPTER_SLUG = "chapter-68"

export const MANGA_PATH = `/${MANGA_ID}`
export const CHAPTER_PATH = `/${MANGA_ID}/${CHAPTER_SLUG}`
export const SEARCH_PATH = "/search/story/solo_leveling"

export const ORIGIN = "https://chapmanganato.to"
export const SEARCH_ORIGIN = "https://manganato.com"

export const CHAPTER_URL = `${ORIGIN}${CHAPTER_PATH}`
export const CHAPTER_URL_COM = `https://chapmanganato.com${CHAPTER_PATH}`
export const MANGA_URL = `${ORIGIN}${MANGA_PATH}`

export const PAGE_URLS = [
    "https://v3.mkklcdnv6tempv3.com/img/tab_17/03/06/12/ae/68/1.jpg",
    "https://v3.mkklcdnv6tempv3.com/img/tab_17/03/06/12/ae/68/2.jpg"
]

export const COVER_URL = "https://avt.mkklcdnv6temp.com/fld/17/solo-leveling.jpg"

export const chapterHtml = `<!DOCTYPE html>
<html>
<head>
<title>Solo Leveling Chapter 68 - MangaNato</title>
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<h1>Solo Leveling</h1>
<div class="container-chapter-reader">
  <img src="${PAGE_URLS[0]}" alt="page 1" />
  <img src="${PAGE_URLS[1]}" alt="page 2" />
</div>
</body>
</html>`

export const mangaHtml = `<!DOCTYPE html>
<html>
<head>
<title>Solo Leveling - MangaNato</title>
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<div class="story-info-right">
  <h1>Solo Leveling</h1>
  <a href="${ORIGIN}/genre-23">Action</a>
  <a href="${ORIGIN}/genre-12">Fantasy</a>
</div>
<ul class="row-content-chapter">
  <li><a href="${ORIGIN}/${MANGA_ID}/chapter-68" title="Chapter 68">Chapter 68</a></li>
  <li><a href="${ORIGIN}/${MANGA_ID}/chapter-67" title="Chapter 67">Chapter 67</a></li>
</ul>
</body>
</html>`

export const searchHtml = `<!DOCTYPE html>
<html><body>
<div class="panel-search-story">
  <div class="search-story-item">
    <a class="item-img" href="${SEARCH_ORIGIN}/${MANGA_ID}" title="Solo Leveling">
      <img src="${COVER_URL}" />
    </a>
  </div>
  <a class="navbar-link" href="${SEARCH_ORIGIN}/genre-23" title="Action">Action</a>
</div>
</body></html>`
