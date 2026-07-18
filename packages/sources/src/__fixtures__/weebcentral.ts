// Fixture data for Weeb Central adapter tests.
// ULIDs must be exactly 26 chars from Crockford base32: [0-9A-HJKMNP-TV-Z].
export const SERIES_ID = "01HV3K9MXNP2Q4R6S8T0V2W4Y6"
export const CHAPTER_ID = "01HV3K9MXNP2Q4R6S8T0V2W4Z9"
const CHAPTER_ID_2 = "01HV3K9MXNP2Q4R6S8T1V2W4Y6"
const CHAPTER_ID_3 = "01HV3K9MXNP2Q4R6S8T2V2W4Y6"
const SERIES_ID_2 = "01HV3K9MXNP2Q4R6S8T0V3W4Y6"

export const ORIGIN = "https://weebcentral.com"

export const SERIES_URL = `${ORIGIN}/series/${SERIES_ID}/solo-leveling`
export const CHAPTER_URL = `${ORIGIN}/chapters/${CHAPTER_ID}/`

// Live-verified shape from weebcentral.com/series/<id>: chapter anchors use ABSOLUTE hrefs
// (https://weebcentral.com/chapters/<ULID>), and the list is newest-first (descending chapter
// number) - Chapter 2 appears before Chapter 1.5 before Chapter 1 here, mirroring the real
// site's Chapter 200 ... Chapter 0 ordering.
export const seriesHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta property="og:title" content="Solo Leveling | WeebCentral">
<meta property="og:image" content="https://cdn.weebcentral.com/series/${SERIES_ID}/cover.jpg">
<title>Solo Leveling | WeebCentral</title>
</head>
<body>
<h1>Solo Leveling</h1>
<div class="chapter-list">
  <ul>
    <li><a href="https://weebcentral.com/chapters/${CHAPTER_ID_2}">Chapter 2</a></li>
    <li><a href="https://weebcentral.com/chapters/${CHAPTER_ID_3}">Chapter 1.5</a></li>
    <li><a href="https://weebcentral.com/chapters/${CHAPTER_ID}">Chapter 1</a></li>
  </ul>
</div>
</body>
</html>`

// Same shape as seriesHtml but with a non-numeric bonus entry ("Extra") interleaved between two
// real chapters, listed newest-first like the live site. Used to verify that an unparseable
// title never collapses to sortKey 0 and sorts before every real chapter.
const BONUS_SERIES_ID = "01HV3K9MXNP2Q4R6S8T3V2W4Y6"
const BONUS_CHAPTER_4 = "01HV3K9MXNP2Q4R6S8T8V2W4Y6"
const BONUS_CHAPTER_EXTRA = "01HV3K9MXNP2Q4R6S8T7V2W4Y6"
const BONUS_CHAPTER_3 = "01HV3K9MXNP2Q4R6S8T6V2W4Y6"
const BONUS_CHAPTER_2 = "01HV3K9MXNP2Q4R6S8T5V2W4Y6"
const BONUS_CHAPTER_1 = "01HV3K9MXNP2Q4R6S8T4V2W4Y6"

export const bonusSeriesId = BONUS_SERIES_ID
export const bonusSeriesHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta property="og:title" content="Bonus Test Manga | WeebCentral">
<title>Bonus Test Manga | WeebCentral</title>
</head>
<body>
<h1>Bonus Test Manga</h1>
<div class="chapter-list">
  <ul>
    <li><a href="https://weebcentral.com/chapters/${BONUS_CHAPTER_4}">Chapter 4</a></li>
    <li><a href="https://weebcentral.com/chapters/${BONUS_CHAPTER_EXTRA}">Extra</a></li>
    <li><a href="https://weebcentral.com/chapters/${BONUS_CHAPTER_3}">Chapter 3</a></li>
    <li><a href="https://weebcentral.com/chapters/${BONUS_CHAPTER_2}">Chapter 2</a></li>
    <li><a href="https://weebcentral.com/chapters/${BONUS_CHAPTER_1}">Chapter 1</a></li>
  </ul>
</div>
</body>
</html>`
export const bonusChapterTitlesById: Record<string, string> = {
    [BONUS_CHAPTER_1]: "Chapter 1",
    [BONUS_CHAPTER_2]: "Chapter 2",
    [BONUS_CHAPTER_3]: "Chapter 3",
    [BONUS_CHAPTER_EXTRA]: "Extra",
    [BONUS_CHAPTER_4]: "Chapter 4"
}

// Chapter page also links the series with an ABSOLUTE href, live-verified.
export const chapterPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta property="og:title" content="Chapter 1 - Solo Leveling | WeebCentral">
<title>Chapter 1 - Solo Leveling | WeebCentral</title>
</head>
<body>
<nav>
  <a href="https://weebcentral.com/series/${SERIES_ID}/solo-leveling">Solo Leveling</a>
  &gt; Chapter 1
</nav>
<div id="reader"
     hx-get="/chapters/${CHAPTER_ID}/images?is_prev=False&amp;current_page=1"
     hx-trigger="load">
  Loading...
</div>
</body>
</html>`

// A chapter page whose title has no parseable chapter number - used to verify
// extractChapterPageMeta falls back to +Infinity rather than 0.
export const chapterPageHtmlUnparseableTitle = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta property="og:title" content="Extra - Solo Leveling | WeebCentral">
<title>Extra - Solo Leveling | WeebCentral</title>
</head>
<body>
<nav>
  <a href="https://weebcentral.com/series/${SERIES_ID}/solo-leveling">Solo Leveling</a>
  &gt; Extra
</nav>
<div id="reader"
     hx-get="/chapters/${CHAPTER_ID}/images?is_prev=False&amp;current_page=1"
     hx-trigger="load">
  Loading...
</div>
</body>
</html>`

export const imagesHtml = `<img src="https://cdn.weebcentral.com/chapters/${CHAPTER_ID}/001.jpg" alt="Page 1">
<img src="https://cdn.weebcentral.com/chapters/${CHAPTER_ID}/002.jpg" alt="Page 2">
<img src="https://cdn.weebcentral.com/chapters/${CHAPTER_ID}/003.jpg" alt="Page 3">`

// Live-verified shape of the htmx /search/data response fragment: no surrounding <html> doc,
// each result rendered as two anchors to the same series - an image-wrapper anchor with no text
// content (which extractSearchResults must skip), followed by the real title anchor - both using
// ABSOLUTE hrefs.
export const searchHtml = `<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/${SERIES_ID}/solo-leveling">
    <article><img src="https://cdn.weebcentral.com/series/${SERIES_ID}/cover.jpg" alt="Solo Leveling cover"></article>
  </a>
  <section>
    <a href="https://weebcentral.com/series/${SERIES_ID}/solo-leveling" class="line-clamp-1 link link-hover">Solo Leveling</a>
  </section>
</article>
<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/${SERIES_ID_2}/solo-leveling-2">
    <article><img src="https://cdn.weebcentral.com/series/${SERIES_ID_2}/cover.jpg" alt="Solo Leveling 2 cover"></article>
  </a>
  <section>
    <a href="https://weebcentral.com/series/${SERIES_ID_2}/solo-leveling-2" class="line-clamp-1 link link-hover">Solo Leveling 2</a>
  </section>
</article>`
