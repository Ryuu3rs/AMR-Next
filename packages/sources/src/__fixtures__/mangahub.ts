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

// Empty result page — matches MangaHub's real "No Manga found!" markup.
export const searchEmptyHtml = `<!doctype html><html><body><div id="app"><div class="row"><div class="col-xs-12"><strong>No Manga found!</strong></div></div></body></html>`
