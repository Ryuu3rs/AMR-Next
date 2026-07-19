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
//
// The Chapter 2 anchor below reproduces the real per-row markup verbatim (live-verified against
// weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE): a hidden "Last Read" indicator span, an
// inline SVG with an embedded <style> block, and a trailing <time> element whose text content is
// a raw ISO timestamp - all inside the single <a>...</a> the chapter-anchor regex captures. This
// verifies extractChapterList's title comes out as the plain "Chapter 2" label, not
// "Chapter 2 Last Read .st0 { fill: #d3d629; } 2024-09-07T17:04:15.717343Z".
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
    <li><a href="https://weebcentral.com/chapters/${CHAPTER_ID_2}" class="hover:bg-base-300 flex-1 flex items-center p-2">
        <span class="me-2"><svg class="w-4 h-4" viewBox="0 0 24 24"><path d="M8.5 12.5"></path></svg></span>
        <span class="grow flex items-center gap-2">
            <span class="">Chapter 2</span>
            <span class="flex gap-1 items-center link-info" x-show="last_read_chapter === '${CHAPTER_ID_2}'">
                <svg class="w-4 h-4" viewBox="0 0 384 512"><path d="M215.7 499.2"></path></svg>
                <span class="hidden md:inline">Last Read</span>
            </span>
            <span x-show="new_chapter">
                <svg class="w-5 h-5" viewBox="0 0 512 512">
                    <style type="text/css">
                        .st0 {
                            fill: #d3d629;
                        }
                    </style>
                    <path class="st0" d="M13.175,203.061"></path>
                </svg>
            </span>
        </span>
        <time class="text-datetime opacity-50" datetime="2024-09-07T17:04:15.717Z">2024-09-07T17:04:15.717343Z</time>
    </a></li>
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

// Live-verified shape of the htmx /search/data response fragment (no surrounding <html> doc):
// each result renders TWO anchors to the same series, both using ABSOLUTE hrefs.
//
// The first anchor has no class attribute and wraps both a desktop cover image (hidden on
// mobile) and a mobile-only card. The mobile card can carry an "Official" ribbon badge div ahead
// of a truncated title div - when tag-stripped, that anchor's text reads "Official Solo Leveling"
// instead of the clean title. The second anchor - later in the document, inside the desktop-only
// details section - carries class="line-clamp-1 link link-hover" and has just the clean title
// text. This is the reverse of what the old fixture modeled (clean anchor first, empty-text
// image-wrapper anchor second), which is why the old test suite didn't catch the real bug: the
// old buggy dedup kept whichever anchor for a seriesId was seen FIRST, so on the real site it
// kept the badge-prefixed "Official Solo Leveling" title.
//
// The first result below includes the "Official" ribbon (an officially-licensed title); the
// second does not (live-verified: only some results carry the ribbon - only the link-hover class
// is present on every result, so that's the structural marker extractSearchResults must key on).
export const searchHtml = `<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/${SERIES_ID}/solo-leveling">
    <article class="hidden lg:block w-full aspect-4/6 overflow-hidden">
      <img src="https://cdn.weebcentral.com/series/${SERIES_ID}/cover.jpg" alt="Solo Leveling cover">
    </article>
    <article class="lg:hidden relative overflow-hidden">
      <div class="absolute right-0 top-0 h-16 w-16">
        <div class="absolute transform rotate-45 bg-orange-600 text-center text-white font-semibold py-1 right-[-55px] top-[12px] w-[170px]">Official</div>
      </div>
      <div class="w-full h-16 absolute bottom-0 flex flex-col items-center justify-center">
        <div class="text-ellipsis truncate text-white text-center text-lg z-20 w-[90%]">Solo Leveling</div>
      </div>
    </article>
  </a>
  <section class="hidden lg:block">
    <span class="tooltip tooltip-bottom" data-tip="Solo Leveling">
      <a href="https://weebcentral.com/series/${SERIES_ID}/solo-leveling" class="line-clamp-1 link link-hover">Solo Leveling</a>
    </span>
  </section>
</article>
<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/${SERIES_ID_2}/solo-leveling-2">
    <article class="hidden lg:block w-full aspect-4/6 overflow-hidden">
      <img src="https://cdn.weebcentral.com/series/${SERIES_ID_2}/cover.jpg" alt="Solo Leveling 2 cover">
    </article>
    <article class="lg:hidden relative overflow-hidden">
      <div class="w-full h-16 absolute bottom-0 flex flex-col items-center justify-center">
        <div class="text-ellipsis truncate text-white text-center text-lg z-20 w-[90%]">Solo Leveling 2</div>
      </div>
    </article>
  </a>
  <section class="hidden lg:block">
    <span class="tooltip tooltip-bottom" data-tip="Solo Leveling 2">
      <a href="https://weebcentral.com/series/${SERIES_ID_2}/solo-leveling-2" class="line-clamp-1 link link-hover">Solo Leveling 2</a>
    </span>
  </section>
</article>`
