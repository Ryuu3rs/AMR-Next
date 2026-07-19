export const FIXTURE_META = {
    capturedAt: "2026-07-19",
    sourceUrl: "https://olympustaff.com/series",
    note: 'Search-results grid for query "demon"; date from the captured-2026-07-19 fixture comment.'
}

export const SEARCH_QUERY = "demon"
export const SEARCH_PATH = "/series"

// Real olympustaff.com search-result markup (captured 2026-07-19) links each card with an
// ABSOLUTE href (`https://olympustaff.com/series/<slug>`), never a bare `/series/<slug>` -
// see extractChapterLinks() a few lines up in olympustaff.ts, which already anchors against
// `(?:${ORIGIN})?/series/...` for the same reason.
export const ABSOLUTE_SLUG = "the-demon-kings-champion"
export const ABSOLUTE_TITLE = "The demon king's champion"
export const ABSOLUTE_COVER = "https://olympustaff.com/images/manga/demon-king-cover.png"
export const absoluteHrefSearchHtml = `<!doctype html><html><body><div class="listupd">
<div class="bs"><div class="bsx">
<a href="https://olympustaff.com/series/${ABSOLUTE_SLUG}" title="${ABSOLUTE_TITLE}">
<div class="limit"><img src="${ABSOLUTE_COVER}" alt="${ABSOLUTE_TITLE}"></div>
<div class="bigor"><div class="tt float-right">${ABSOLUTE_TITLE}</div></div>
</a>
</div></div>
</div></body></html>`

// A second card, still absolute, sharing a slug prefix with ABSOLUTE_SLUG so a naive
// substring check couldn't accidentally satisfy both a relative- and absolute-href test
// with the same fixture.
export const ABSOLUTE_SLUG_2 = "eternal-club"
export const ABSOLUTE_TITLE_2 = "Eternal Club"
export const ABSOLUTE_COVER_2 = "https://olympustaff.com/images/manga/eternal-club-cover.png"
export const twoAbsoluteHrefResultsSearchHtml = `<!doctype html><html><body><div class="listupd">
<div class="bs"><div class="bsx">
<a href="https://olympustaff.com/series/${ABSOLUTE_SLUG}" title="${ABSOLUTE_TITLE}">
<div class="bigor"><div class="tt float-right">${ABSOLUTE_TITLE}</div></div>
<img src="${ABSOLUTE_COVER}" alt="${ABSOLUTE_TITLE}">
</a>
</div></div>
<div class="bs"><div class="bsx">
<a href="https://olympustaff.com/series/${ABSOLUTE_SLUG_2}" title="${ABSOLUTE_TITLE_2}">
<div class="bigor"><div class="tt float-right">${ABSOLUTE_TITLE_2}</div></div>
<img src="${ABSOLUTE_COVER_2}" alt="${ABSOLUTE_TITLE_2}">
</a>
</div></div>
</div></body></html>`

// Legacy/alternate markup with a bare relative href - kept supported alongside the
// absolute form (mirrors extractChapterLinks' own `(?:${ORIGIN})?` optionality).
export const RELATIVE_SLUG = "monster-paradise"
export const RELATIVE_TITLE = "Monster Paradise"
export const RELATIVE_COVER = "https://olympustaff.com/images/manga/monster-paradise-cover.png"
export const relativeHrefSearchHtml = `<!doctype html><html><body><div class="listupd">
<div class="bs"><div class="bsx">
<a href="/series/${RELATIVE_SLUG}" title="${RELATIVE_TITLE}">
<div class="bigor"><div class="tt float-right">${RELATIVE_TITLE}</div></div>
<img src="${RELATIVE_COVER}" alt="${RELATIVE_TITLE}">
</a>
</div></div>
</div></body></html>`

// Matches the real "no results" render - no /series/<slug> anchors in the listupd grid at all.
export const noResultsSearchHtml = `<!doctype html><html><body><div class="listupd"></div></body></html>`
