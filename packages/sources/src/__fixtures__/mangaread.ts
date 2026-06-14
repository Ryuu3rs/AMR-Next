export const MANGA_SLUG = "entomologist-in-sichuan-tang-clan"
export const CHAPTER_SLUG = "chapter-79"
export const CHAPTER_PATH = `/manga/${MANGA_SLUG}/${CHAPTER_SLUG}/`
export const CHAPTER_URL = `https://www.mangaread.org${CHAPTER_PATH}`
export const AJAX_PATH = "/wp-admin/admin-ajax.php"

// Real page URLs live in src=; the anti-scraping junk lives in data-src= and in
// sidebar/footer regions outside reading-content. Page images also carry the
// canonical Madara id="image-N".
export const REAL_PAGE_URLS = [
    "https://cdn.mangaread.org/uploads/entomologist/79/page-01.jpg",
    "https://cdn.mangaread.org/uploads/entomologist/79/page-02.jpg"
]

export const COVER_URL = "https://www.mangaread.org/wp-content/uploads/cover-entomologist.jpg"

export const chapterHtml = `<!DOCTYPE html>
<html class="page-template postid-250726 wp-manga">
<head>
<title>Entomologist In Sichuan Tang Clan - Chapter 79 - MangaRead</title>
<meta property="og:image" content="${COVER_URL}" />
<link rel="canonical" href="https://www.mangaread.org/?p=250726" />
</head>
<body>
<div class="c-sidebar">
  <img class="wp-manga-chapter-img" src="https://www.mangaread.org/wp-content/uploads/2026/03/sticker1.webp" />
</div>
<div class="reading-content">
  <div class="page-break no-gaps">
    <img id="image-0" class="wp-manga-chapter-img"
      src="${REAL_PAGE_URLS[0]}"
      data-src="https://www.mangaread.org/wp-content/uploads/2024/09/758887120290578432.webp" />
  </div>
  <div class="page-break no-gaps">
    <img id="image-1" class="wp-manga-chapter-img"
      src="${REAL_PAGE_URLS[1]}"
      data-src="https://www.mangaread.org/wp-content/uploads/2023/12/Profile-150x150.jpg" />
  </div>
</div>
<div class="entry-header">
  <img class="wp-manga-chapter-img" src="https://www.mangaread.org/wp-content/uploads/2023/12/footer-150x150.jpg" />
</div>
</body>
</html>`

// admin-ajax.php response shape when the POST succeeds.
export const AJAX_PAGE_URLS = [
    "https://cdn.mangaread.org/ajax/entomologist/79/aj-01.jpg",
    "https://cdn.mangaread.org/ajax/entomologist/79/aj-02.jpg"
]
export const ajaxJson = JSON.stringify({ images: AJAX_PAGE_URLS })
