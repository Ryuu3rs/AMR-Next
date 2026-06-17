# Image Extraction Techniques & Anti-Scraping Reference

Reference for diagnosing why a manga source's chapter images aren't loading in the AMR reader.
Check this before writing new extraction code or opening a bug.

---

## 1. URL Obfuscation

**Signs:** URL contains `token=`, `expires=`, random hashes that change per request, base64 blobs.

| Variant               | Example                            | AMR approach                                                                                                                   |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Signed/tokenized URLs | `?token=abc123&expires=1630000000` | Tokens tied to session — must fetch from background SW with correct cookies/headers; check `Referer` and `Cookie` requirements |
| Dynamic paths         | URL changes per request            | Can't cache; must resolve fresh each time                                                                                      |
| Base64 `data:` URLs   | `data:image/jpeg;base64,...`       | Already inline — no fetch needed; skip `startsWith("http")` guard                                                              |

---

## 2. JavaScript Lazy Loading

**Signs:** `data-src`, `data-lazy-src`, `data-original`, `loading="lazy"`, empty `src`, placeholder GIF in `src`.

The background service worker fetches static HTML only — JS does not execute.
`?style=list` on Madara sites forces server-side rendering of all pages as `page-break` divs,
bypassing the need for JS execution. If a site ignores `?style=list`, images won't be in the HTML.

| Attribute order    | When to use                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `data-src` → `src` | Standard Madara lazy-load (placeholder GIF in `src`)                                          |
| `src` → `data-src` | Anti-scraping sites (real URL in `src`, decoy in `data-src`) — use `preferSrcAttribute: true` |

**Known quirk (mangaread.org):** `src` attribute value has leading tabs/newlines before the URL.
`getImgAttr` trims the value — do not remove `.trim()` from captured attribute values.

---

## 3. CSS Background Images

**Signs:** No `<img>` tags; images visible on page but absent from HTML; `background-image` in computed styles.

Background SW cannot read computed CSS. Would require a content script to call
`getComputedStyle(el).backgroundImage`. Not currently supported — log as a limitation.

---

## 4. Server-Side Protection

### Hotlinking (Referer check)

**Signs:** 403 on direct fetch; works in browser but not from SW.

Fix: set `Referer: https://site.com/` in request headers. Already done in Madara `browserHeaders`.

### User-Agent checks

**Signs:** 403 or empty response without a browser UA.

Fix: send realistic Chrome UA. Already in `browserHeaders`.

### Session/login requirements

**Signs:** 302 redirect to login page; response contains login form HTML.

Not fixable from background SW without stored credentials. Mark source as `requiresLogin`.

### Rate limiting / Cloudflare

**Signs:** Response HTML contains `cf-browser-verification`, `__cf_chl_captcha`, `Just a moment...`.
AMR checks for this: `cf=true` in the "No images found" error string.

Cannot bypass CF JS challenge from SW. Options: increase request intervals (`rateLimit`),
or add a content-script mode that reads from the already-rendered tab.

---

## 5. Image Fragmentation / Tiling

**Signs:** Many small `<img>` tags for a single page; CSS `background-position` used to show a crop.

Not currently handled. Would require reconstructing tiles on a canvas — not possible from SW.
Would need a content script or a server-side compositor.

---

## 6. Encrypted / DRM URLs

**Signs:** URLs look like gibberish (`/a1b2c3d4e5f6`); JavaScript decrypts URL at runtime.

Common on paid/premium sites. Decryption key is in obfuscated JS.
Reverse-engineer the JS to find the decryption routine, then replicate in the adapter.
Example pattern: `atob()`, `CryptoJS.AES.decrypt()`.

---

## 7. DOM Obfuscation

### Non-standard attribute names

**Signs:** No `src`, `data-src` on `<img>`; attribute named `data-xyz`, `x-src`, `original`, etc.

Add the attribute name to `getImgAttr` call site for the affected strategy.

### Shadow DOM

**Signs:** `#shadow-root` in devtools; images invisible to `document.querySelectorAll`.

Not accessible from a static HTML fetch. Requires content script with `mode: "open"` shadow access.

### iframe embedding

**Signs:** Chapter images inside an `<iframe src="other-domain.com/...">`.

Cannot access cross-origin iframe content from SW. Would require navigating to the iframe URL separately.

---

## 8. Canvas / SVG Rendering

**Signs:** `<canvas>` element where images should be; no `<img>` tags; right-click → "Save as" is disabled.

Cannot extract from SW. Requires content script using `canvas.toDataURL()` or `canvas.transferToImageBitmap()`.
Some sites use this specifically to prevent downloading. Low priority to support.

---

## 9. Obfuscated JavaScript

**Signs:** Minified/packed JS; `eval()`-based loaders; WebAssembly image decoder.

Check: is there a `chapter_preloaded_images` or similar JSON variable in a `<script>` tag?
AMR's Strategy 2 already checks for `chapter_preloaded_images`. Extend regex if the variable name differs.

For WASM-based decoders: images are decoded in-browser only. Cannot replicate in SW.
Use content script to intercept the decoded blob URLs from the network tab.

---

## 10. CDN / WAF Protection

| Provider       | Detection                                              | Notes                                                  |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Cloudflare     | `cf-ray` response header; challenge page HTML          | See §4 above                                           |
| AWS CloudFront | Signed URL params (`X-Amz-Signature`, `X-Amz-Expires`) | Token tied to session; must fetch from browser context |
| Akamai         | `AkamaiGHost` header; bot detection JS                 | Behavioral fingerprinting; hard to bypass from SW      |

---

## 11. Time-Limited / Session-Based Access

**Signs:** Images load once then 403; URL has an `expires=` param.

The SW fetch is independent of the browser session. If images require the user's active session
cookie, the fetch will fail unless the extension has host permission and cookies are forwarded.
MV3 service workers do send cookies for same-origin requests when the host permission is granted.

---

## Extraction Strategy Decision Tree

```
Does HTML fetch return < 1 KB?
  → Cloudflare/bot block. Check for cf= in response. Try adding Referer + UA.

Does HTML contain reading-content / page-break divs?
  → Yes: check img attributes. Run getImgAttr with src, data-src, data-lazy-src, data-original.
         If value found but URL wrong: check for whitespace prefix (trim), base64, or decoy URL.
  → No:  Site may not respect ?style=list. Check for chapter_preloaded_images in <script>.
         Check for canvas/SVG. Check for iframe.

Are img tags present but getImgAttr returns undefined?
  → src value has leading whitespace (mangaread.org pattern) — ensure .trim() is applied.
  → URL is in a non-standard attribute — inspect raw HTML, add attribute name to strategy.
  → URL starts with "/" (relative) — prepend origin before returning.

AJAX (admin-ajax) returns 400?
  → Action name wrong, nonce field name wrong, or endpoint disabled on this site.
  → Fall through to HTML extraction (already the behavior).

AJAX returns valid JSON but images array is empty?
  → Chapter ID extraction failed (postid-N regex missed the site's ID pattern).
  → Add a new pattern to extractChapterId().
```

---

## Adding a New Image Attribute Strategy

In `packages/sources/src/madara.ts` → `extractImagesFromHtml`:

1. Add the attribute name to `lazyAttrs` if it belongs in the preference-order group (Strategies 1 & 3).
2. Or add a new numbered Strategy block after Strategy 3 for a completely different structure.
3. Always use `getImgAttr(tag, ...attrs)` — it handles both quote styles, trims whitespace, rejects `data:` and non-http values, and filters thumbnail suffixes via `isLikelyPageImage`.
4. Add a fixture HTML and a test in `madara.test.ts` before shipping.
