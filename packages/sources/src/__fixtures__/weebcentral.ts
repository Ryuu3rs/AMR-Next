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
    <li><a href="/chapters/${CHAPTER_ID}/">Chapter 1</a></li>
    <li><a href="/chapters/${CHAPTER_ID_2}/">Chapter 2</a></li>
    <li><a href="/chapters/${CHAPTER_ID_3}/">Chapter 1.5</a></li>
  </ul>
</div>
</body>
</html>`

export const chapterPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta property="og:title" content="Chapter 1 - Solo Leveling | WeebCentral">
<title>Chapter 1 - Solo Leveling | WeebCentral</title>
</head>
<body>
<nav>
  <a href="/series/${SERIES_ID}/solo-leveling">Solo Leveling</a>
  &gt; Chapter 1
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

export const searchHtml = `<!DOCTYPE html>
<html lang="en">
<head><title>Search Results | WeebCentral</title></head>
<body>
<div class="results">
  <a href="/series/${SERIES_ID}/solo-leveling">Solo Leveling</a>
  <a href="/series/${SERIES_ID_2}/solo-leveling-2">Solo Leveling 2</a>
</div>
</body>
</html>`
