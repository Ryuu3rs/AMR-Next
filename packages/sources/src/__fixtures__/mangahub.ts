export const SEARCH_QUERY = "solo"
export const SEARCH_PATH_PAGE_1 = "/search/page/1"
export const SEARCH_PATH_PAGE_2 = "/search/page/2"
export const SEARCH_PATH_PAGE_3 = "/search/page/3"

// Page 1: two distinct results. The second exercises hex-entity decoding
// (&#x27;) in both the <img alt> and the visible heading text, and omits the
// "hot" label span that the first card has.
export const searchPage1Html = `<!doctype html><html><body><div id="app"><div class="row">
<div class="_1KYcM col-sm-6 col-xs-12"><div class="media-manga media"><div class="media-left"><a href="https://mangahub.io/manga/solo-leveling_105"><img loading="lazy" width="80" src="https://thumb.mghcdn.com/mh/solo-leveling.jpg" alt="Solo Leveling" class="manga-thumb list-item-thumb"/></a></div><div class="media-body"><h4 class="media-heading"><span class="label label-hot manga-label-small">H</span><a href="https://mangahub.io/manga/solo-leveling_105">Solo Leveling</a><small>by h-goon</small></h4><span><a href="https://mangahub.io/chapter/solo-leveling_105/chapter-200.5" rel="noindex nofollow">#<!-- -->200.5</a> <!-- -->chapters published <!-- -->(Completed)</span><p class="_12-Zw"><a href="https://mangahub.io/genre/action" class="label genre-label">Action</a></p></div></div></div>
<div class="_1KYcM col-sm-6 col-xs-12"><div class="media-manga media"><div class="media-left"><a href="https://mangahub.io/manga/solo-slime-s-ascension"><img loading="lazy" width="80" src="https://thumb.mghcdn.com/comix/solo-slime-s-ascension.jpg" alt="Solo Slime&#x27;s Ascension" class="manga-thumb list-item-thumb"/></a></div><div class="media-body"><h4 class="media-heading"><a href="https://mangahub.io/manga/solo-slime-s-ascension">Solo Slime&#x27;s Ascension</a></h4><span><a href="https://mangahub.io/chapter/solo-slime-s-ascension/chapter-39">#<!-- -->39</a> <!-- -->chapters published <!-- -->(Ongoing)</span><p class="_12-Zw"><a href="https://mangahub.io/genre/action" class="label genre-label">Action</a></p></div></div></div>
</div></div>
<div class="container"><div class="title-header h2-header"><h2>Popular Manga Updates</h2></div><div class="manga-slider"><div class="manga-slide"><a href="https://mangahub.io/manga/unrelated-slider-item">Unrelated slider item, chapter-999 mentioned here too</a></div></div></div>
</body></html>`

// Page 2: one new result plus a repeat of solo-leveling_105 from page 1 to
// exercise cross-page dedupe.
export const searchPage2Html = `<!doctype html><html><body><div id="app"><div class="row">
<div class="_1KYcM col-sm-6 col-xs-12"><div class="media-manga media"><div class="media-left"><a href="https://mangahub.io/manga/solo-max-level-newbie"><img loading="lazy" width="80" src="https://thumb.mghcdn.com/mrc/solo-max-level-newbie.jpg" alt="Solo Max-Level Newbie" class="manga-thumb list-item-thumb"/></a></div><div class="media-body"><h4 class="media-heading"><a href="https://mangahub.io/manga/solo-max-level-newbie">Solo Max-Level Newbie</a></h4><span><a href="https://mangahub.io/chapter/solo-max-level-newbie/chapter-267" rel="noindex nofollow">#<!-- -->267</a> <!-- -->chapters published <!-- -->(Ongoing)</span></div></div></div>
<div class="_1KYcM col-sm-6 col-xs-12"><div class="media-manga media"><div class="media-left"><a href="https://mangahub.io/manga/solo-leveling_105"><img loading="lazy" width="80" src="https://thumb.mghcdn.com/mh/solo-leveling.jpg" alt="Solo Leveling" class="manga-thumb list-item-thumb"/></a></div><div class="media-body"><h4 class="media-heading"><a href="https://mangahub.io/manga/solo-leveling_105">Solo Leveling</a></h4><span><a href="https://mangahub.io/chapter/solo-leveling_105/chapter-200.5" rel="noindex nofollow">#<!-- -->200.5</a> <!-- -->chapters published <!-- -->(Completed)</span></div></div></div>
</div></div>
</body></html>`

// Empty result page - matches MangaHub's real "No Manga found!" markup.
export const searchEmptyHtml = `<!doctype html><html><body><div id="app"><div class="row"><div class="col-xs-12"><strong>No Manga found!</strong></div></div></body></html>`

// A single card whose cover CDN URL contains a "chapter-N"-shaped substring
// (thumb.mghcdn.com/.../chapter-1-cover.jpg) BEFORE the real chapter-link
// anchor (chapter-52) in card source order. Exercises the fix scoping the
// latestChapter match to the chapter-link anchor's own href instead of a bare
// scan over the whole card block, which would otherwise grab "1" from the
// cover URL instead of the real "52".
export const SEARCH_DECOY_SLUG = "decoy-chapter-number"
export const searchDecoyChapterNumberHtml = `<!doctype html><html><body><div id="app"><div class="row">
<div class="_1KYcM col-sm-6 col-xs-12"><div class="media-manga media"><div class="media-left"><a href="https://mangahub.io/manga/decoy-chapter-number"><img loading="lazy" width="80" src="https://thumb.mghcdn.com/decoy/chapter-1-cover.jpg" alt="Decoy Chapter Number" class="manga-thumb list-item-thumb"/></a></div><div class="media-body"><h4 class="media-heading"><a href="https://mangahub.io/manga/decoy-chapter-number">Decoy Chapter Number</a></h4><span><a href="https://mangahub.io/chapter/decoy-chapter-number/chapter-52" rel="noindex nofollow">#<!-- -->52</a> <!-- -->chapters published <!-- -->(Ongoing)</span></div></div></div>
</div></div>
</body></html>`

// Manga detail page - used for resolveCover, mirrors the og:image markup
// extractCover looks for.
export const COVER_SLUG = "solo-leveling_105"
export const COVER_PATH = "/manga/solo-leveling_105"
export const COVER_URL = "https://thumb.mghcdn.com/mh/solo-leveling.jpg"
export const mangaDetailHtml = `<!doctype html><html><head><title>Read Solo Leveling Manga Online for Free</title><meta property="og:title" content="Solo Leveling"/><meta property="og:image" content="${COVER_URL}"/></head><body></body></html>`

// Chapter-list page fixtures - exercise extractChapters' dominant-slug filter and
// canonical-vs-id-slug dedupe (see mangahub.ts).
//
// mangahub.io mixes two anchor styles per real chapter:
//   - canonical (`_3pfyN`, href .../chapter-{N} where N IS the real chapter number)
//   - "alternate version" id-slug (`_1AxFv` title="Chapter", href .../chapter-{internalId}
//     where internalId is a SITE-WIDE sequential counter unrelated to this manga's
//     chapter count - observed up to ~2.65 million)
// Both carry the true chapter number as visible text in a
// `<span class="text-secondary _3D1SJ">#<!-- -->{N}</span>` element nested in the anchor
// (the HTML comment is a React hydration artifact).
//
// This fixture models four real chapters for CHAPTER_LIST_SLUG:
//   ch1 - canonical only
//   ch2 - canonical anchor FIRST, id-slug duplicate SECOND (canonical-then-id-slug order)
//   ch3 - id-slug duplicate FIRST, canonical anchor SECOND (id-slug-then-canonical order)
//   ch4 - id-slug only (no canonical duplicate exists for this one)
// plus one id-slug anchor with NO visible number and an internalId over
// INTERNAL_ID_MIN (discarded entirely - unusable), and a "you might also like" slider
// near the end of the document with real-number chapter anchors for a DIFFERENT manga
// (FOREIGN_SLUG) - real mangahub.io markup, no special class - that must be excluded by
// the dominant-slug filter.
export const CHAPTER_LIST_SLUG = "hero-returns"
export const CHAPTER_LIST_PATH = "/manga/hero-returns"
export const CHAPTER_LIST_URL = `https://mangahub.io${CHAPTER_LIST_PATH}`
export const FOREIGN_SLUG = "unrelated-other-manga"

export const chapterListHtml = `<!doctype html><html><body><div id="app">
<div class="list-of-chapters">
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-1" class="_3pfyN">Chapter 1<span class="text-secondary _3D1SJ">#<!-- -->1</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2" class="_3pfyN">Chapter 2<span class="text-secondary _3D1SJ">#<!-- -->2</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650002" class="_1AxFv" title="Chapter"><span class="text-secondary _3D1SJ">#<!-- -->2</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650003" class="_1AxFv" title="Chapter"><span class="text-secondary _3D1SJ">#<!-- -->3</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-3" class="_3pfyN">Chapter 3<span class="text-secondary _3D1SJ">#<!-- -->3</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650004" class="_1AxFv" title="Chapter"><span class="text-secondary _3D1SJ">#<!-- -->4</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650099" class="_1AxFv" title="Chapter">View</a>
</div>
<div class="container"><div class="title-header h2-header"><h2>You might also like</h2></div><div class="manga-slider">
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-15">Chapter 15</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-16">Chapter 16</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-17">Chapter 17</a>
</div></div>
</div></body></html>`

// Identical chapter set to chapterListHtml, but ch2/ch3's canonical vs id-slug anchor
// order is swapped relative to the fixture above (ch2 becomes id-slug-first, ch3
// becomes canonical-first) - proves the canonical-always-wins rule is genuinely
// order-independent rather than "whichever anchor happens to come first in the
// document wins".
export const chapterListHtmlSwappedOrder = `<!doctype html><html><body><div id="app">
<div class="list-of-chapters">
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-1" class="_3pfyN">Chapter 1<span class="text-secondary _3D1SJ">#<!-- -->1</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650002" class="_1AxFv" title="Chapter"><span class="text-secondary _3D1SJ">#<!-- -->2</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2" class="_3pfyN">Chapter 2<span class="text-secondary _3D1SJ">#<!-- -->2</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-3" class="_3pfyN">Chapter 3<span class="text-secondary _3D1SJ">#<!-- -->3</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650003" class="_1AxFv" title="Chapter"><span class="text-secondary _3D1SJ">#<!-- -->3</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650004" class="_1AxFv" title="Chapter"><span class="text-secondary _3D1SJ">#<!-- -->4</span></a>
<a href="https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650099" class="_1AxFv" title="Chapter">View</a>
</div>
<div class="container"><div class="title-header h2-header"><h2>You might also like</h2></div><div class="manga-slider">
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-15">Chapter 15</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-16">Chapter 16</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-17">Chapter 17</a>
</div></div>
</div></body></html>`

// Regression fixture for the dominant-slug cross-check fix: a brand-new manga with
// only 2 real chapters, where the "you might also like" slider (FOREIGN_SLUG) has
// MORE anchors (5) than the real chapter list (2) and appears FIRST in document
// order. A raw frequency vote (or a first-encountered tiebreak) would wrongly pick
// FOREIGN_SLUG as the dominant slug here - extractChapters must cross-check the vote
// winner against the manga's own known slug (manga.sourceMangaId) and prefer the real
// slug's own anchors regardless of which has more matches.
export const SHORT_REAL_CHAPTER_LIST_SLUG = "brand-new-manga"
export const SHORT_REAL_CHAPTER_LIST_PATH = "/manga/brand-new-manga"
export const SHORT_REAL_CHAPTER_LIST_URL = `https://mangahub.io${SHORT_REAL_CHAPTER_LIST_PATH}`

export const shortRealChapterListHtml = `<!doctype html><html><body><div id="app">
<div class="container"><div class="title-header h2-header"><h2>You might also like</h2></div><div class="manga-slider">
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-15">Chapter 15</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-16">Chapter 16</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-17">Chapter 17</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-18">Chapter 18</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-19">Chapter 19</a>
</div></div>
<div class="list-of-chapters">
<a href="https://mangahub.io/chapter/${SHORT_REAL_CHAPTER_LIST_SLUG}/chapter-1" class="_3pfyN">Chapter 1<span class="text-secondary _3D1SJ">#<!-- -->1</span></a>
<a href="https://mangahub.io/chapter/${SHORT_REAL_CHAPTER_LIST_SLUG}/chapter-2" class="_3pfyN">Chapter 2<span class="text-secondary _3D1SJ">#<!-- -->2</span></a>
</div>
</div></body></html>`

// Companion fixture for the "genuinely no real chapters" failure mode: only the
// slider's foreign anchors are present, so the manga's own slug (EMPTY_REAL_CHAPTER_LIST_SLUG)
// has zero matched anchors. extractChapters must return an empty list here (the
// existing safe "no chapters found" behavior) rather than falling back to the
// foreign slug's anchors just because some anchors exist on the page.
export const EMPTY_REAL_CHAPTER_LIST_SLUG = "totally-empty-manga"
export const EMPTY_REAL_CHAPTER_LIST_PATH = "/manga/totally-empty-manga"
export const EMPTY_REAL_CHAPTER_LIST_URL = `https://mangahub.io${EMPTY_REAL_CHAPTER_LIST_PATH}`

export const chapterListNoRealAnchorsHtml = `<!doctype html><html><body><div id="app">
<div class="container"><div class="title-header h2-header"><h2>You might also like</h2></div><div class="manga-slider">
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-15">Chapter 15</a>
<a href="https://mangahub.io/chapter/${FOREIGN_SLUG}/chapter-16">Chapter 16</a>
</div></div>
</div></body></html>`

// resolveChapter fixtures.
//
// Normal case: a real canonical chapter page whose title carries the chapter number.
export const CHAPTER_URL = `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-52`
export const CHAPTER_PATH = `/chapter/${CHAPTER_LIST_SLUG}/chapter-52`
export const chapterPageHtml = `<!doctype html><html><head><title>Hero Returns Chapter 52</title><meta property="og:title" content="Hero Returns Chapter 52"/></head><body><img src="https://cdn.mghcdn.com/mh/hero-returns/52/1.webp"/><img src="https://cdn.mghcdn.com/mh/hero-returns/52/2.webp"/></body></html>`

// Slug-number fallback case: title has no parseable chapter number, but the href
// number is a real (low) chapter number rather than a site-wide internal id.
export const CHAPTER_LOW_SLUGNUM_URL = `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-42`
export const CHAPTER_LOW_SLUGNUM_PATH = `/chapter/${CHAPTER_LIST_SLUG}/chapter-42`
export const chapterPageNoTitleNumberHtml = `<!doctype html><html><head><title>MangaHub</title></head><body><img src="https://cdn.mghcdn.com/mh/hero-returns/42/1.webp"/></body></html>`

// The 302-redirect-to-manga-page case: an id-slug URL whose href number is a
// site-wide internal id (well over INTERNAL_ID_MIN, using the exact value from the
// real user report) and whose page has no parseable chapter number anywhere (as if the
// request landed on the plain manga page after a redirect). Still carries a real CDN
// image so it clears the "blocked" check and actually reaches chapter-number
// resolution - isolates the chNum-determination failure being tested.
export const CHAPTER_HIGH_SLUGNUM_URL = `https://mangahub.io/chapter/${CHAPTER_LIST_SLUG}/chapter-2650711`
export const CHAPTER_HIGH_SLUGNUM_PATH = `/chapter/${CHAPTER_LIST_SLUG}/chapter-2650711`
export const chapterPageRedirectedHtml = `<!doctype html><html><head><title>MangaHub - Read Manga Online</title></head><body><img src="https://cdn.mghcdn.com/mh/hero-returns/1.webp"/></body></html>`
