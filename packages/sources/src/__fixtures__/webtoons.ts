export const ORIGIN = "https://www.webtoons.com"

export const TITLE_NO = "8579"
export const SLUG = "daisy-how-to-become-the-dukes-fiancee"

export const SERIES_PREFIX_URL = `${ORIGIN}/en/romance/${SLUG}/`
export const LEGACY_LIST_URL = `${ORIGIN}/en/romance/${SLUG}/list?title_no=${TITLE_NO}`
export const SERIES_LIST_PATH = `/en/romance/${SLUG}/list`
export const UNKNOWN_LIST_PATH = "/en/fantasy/unknown/list"

export const COVER_URL = "https://webtoon-phinf.pstatic.net/fixtures/8579/thumbnail.jpg"
export const FRESH_COVER_URL = "https://webtoon-phinf.pstatic.net/fixtures/8579/thumbnail-rotated.jpg"

export const listHtml = `<!DOCTYPE html>
<html>
<head>
<title>Daisy: How to Become the Duke's Fiancée - WEBTOON</title>
<meta property="og:title" content="Daisy: How to Become the Duke's Fiancée - WEBTOON" />
<meta property="og:image" content="${COVER_URL}" />
</head>
<body>
<h1>Daisy: How to Become the Duke's Fiancée</h1>
<ul id="_episodeList">
  <li><a href="/en/romance/${SLUG}/ep-2/viewer?title_no=${TITLE_NO}&amp;episode_no=2">Episode 2</a></li>
  <li><a href="/en/romance/${SLUG}/ep-1/viewer?title_no=${TITLE_NO}&amp;episode_no=1">Episode 1</a></li>
</ul>
</body>
</html>`

export const freshListHtml = `<!DOCTYPE html>
<html>
<head>
<title>Daisy: How to Become the Duke's Fiancée - WEBTOON</title>
<meta property="og:image" content="${FRESH_COVER_URL}" />
</head>
<body>
<h1>Daisy: How to Become the Duke's Fiancée</h1>
</body>
</html>`

export const noCoverHtml = `<!DOCTYPE html>
<html>
<head>
<title>Daisy: How to Become the Duke's Fiancée - WEBTOON</title>
</head>
<body>
<h1>Daisy: How to Become the Duke's Fiancée</h1>
</body>
</html>`
