# Changelog

## [0.5.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.4.0...v0.5.0) (2026-06-16)


### Features

* auto-add/track any opened chapter + cache covers as data URLs ([#54](https://github.com/Ryuu3rs/AMR-Next/issues/54)) ([79d7e19](https://github.com/Ryuu3rs/AMR-Next/commit/79d7e19a91dd03e58d0a6cbdb94c1e4992cccc7f))
* library list view, grouped history + 6 features ([#55](https://github.com/Ryuu3rs/AMR-Next/issues/55)) ([89492ba](https://github.com/Ryuu3rs/AMR-Next/commit/89492ba1c8700c897b2122337a2f66f79f61c2ff))
* **library:** NSFW flag with cover blur (F4) ([#38](https://github.com/Ryuu3rs/AMR-Next/issues/38)) ([0d2ab31](https://github.com/Ryuu3rs/AMR-Next/commit/0d2ab317e273217880489e3829d08031273c2c84))
* manga tags with source suggestions, tag manager, palette + more ([#56](https://github.com/Ryuu3rs/AMR-Next/issues/56)) ([c67ba51](https://github.com/Ryuu3rs/AMR-Next/commit/c67ba5171a642948327bd5304e0ed6377fc149f7))
* **mobile:** responsive layout for phones + Android docs (G14) ([#43](https://github.com/Ryuu3rs/AMR-Next/issues/43)) ([9671bbb](https://github.com/Ryuu3rs/AMR-Next/commit/9671bbb5411d09099a519996e8982b8a3063c46d))
* **reader:** keyboard-shortcut help overlay (E2) ([#47](https://github.com/Ryuu3rs/AMR-Next/issues/47)) ([06b5679](https://github.com/Ryuu3rs/AMR-Next/commit/06b5679a86045ba7a1b55fb00b64de9ab69cc9a0))
* **reader:** offline chapter downloads (A9) ([#44](https://github.com/Ryuu3rs/AMR-Next/issues/44)) ([e14d59a](https://github.com/Ryuu3rs/AMR-Next/commit/e14d59a9b2719f9973466fe7b75facfe4f5cd6f9))
* **reader:** prev/next chapter navigation + mark-read-and-next (A7, A8) ([#36](https://github.com/Ryuu3rs/AMR-Next/issues/36)) ([a9013ae](https://github.com/Ryuu3rs/AMR-Next/commit/a9013aeb3c31e75ae0bca8f5eb4d92c3584efdb2))
* **reader:** read-on-site fallback that still tracks progress ([#53](https://github.com/Ryuu3rs/AMR-Next/issues/53)) ([74b3a6b](https://github.com/Ryuu3rs/AMR-Next/commit/74b3a6b43f4d5739f9a38348b9d450fa9b130033))
* **reader:** remember reading mode per title (A10) ([#41](https://github.com/Ryuu3rs/AMR-Next/issues/41)) ([eba2f25](https://github.com/Ryuu3rs/AMR-Next/commit/eba2f255ae911e199965abd5fe1477719afeecb0))
* **reader:** zoom + fullscreen + immersive mode (A5, A6) ([#40](https://github.com/Ryuu3rs/AMR-Next/issues/40)) ([7e58430](https://github.com/Ryuu3rs/AMR-Next/commit/7e5843099257c5306df00e53878d6f302737d7b9))
* **sources:** 5 more probe-green sites as config rows ([#48](https://github.com/Ryuu3rs/AMR-Next/issues/48)) ([744104f](https://github.com/Ryuu3rs/AMR-Next/commit/744104f93941cb646338558ba79a01b8eda3d0a0))
* **sources:** MangaBuddy adapter (2 sites) + multi-language preference (C3, C6) ([#42](https://github.com/Ryuu3rs/AMR-Next/issues/42)) ([c67711e](https://github.com/Ryuu3rs/AMR-Next/commit/c67711efc6c2833c8669e693a5ecf81eb24e26da))
* **stats:** data-driven achievements (B7) ([#49](https://github.com/Ryuu3rs/AMR-Next/issues/49)) ([f13285d](https://github.com/Ryuu3rs/AMR-Next/commit/f13285dc3bfbb1f14673671947d097455e3668c8))
* **ux:** covers, global search, mirror fallback, download resiliency + UI polish ([#50](https://github.com/Ryuu3rs/AMR-Next/issues/50)) ([3bf786d](https://github.com/Ryuu3rs/AMR-Next/commit/3bf786dc0522ffdd97a5feb0189278842604a721))


### Bug Fixes

* **popup:** detect all supported sources, drop stale copy ([#39](https://github.com/Ryuu3rs/AMR-Next/issues/39)) ([767ad72](https://github.com/Ryuu3rs/AMR-Next/commit/767ad725504586569aa0ef92c6d379b3b718ed7f))
* **sources:** reject nav-junk in search + give sample data real covers ([#51](https://github.com/Ryuu3rs/AMR-Next/issues/51)) ([d92d8ae](https://github.com/Ryuu3rs/AMR-Next/commit/d92d8aef0908fc05c518e479fb90e49c0a3e4e21))
* **ux:** bundle sample covers, move search to Home, source ping dots, drop Cypher Scans ([#52](https://github.com/Ryuu3rs/AMR-Next/issues/52)) ([7f31906](https://github.com/Ryuu3rs/AMR-Next/commit/7f3190687b801cff624968ac94d9ad3448d0d0f6))


### Performance Improvements

* **source-sdk:** coalesce concurrent identical GET requests (D3) ([#45](https://github.com/Ryuu3rs/AMR-Next/issues/45)) ([7de331e](https://github.com/Ryuu3rs/AMR-Next/commit/7de331e44cc2a0fbac306cee508099279d50200b))

## [0.4.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.3.0...v0.4.0) (2026-06-15)


### Features

* **app:** add Ko-fi support section + Discord mention ([#30](https://github.com/Ryuu3rs/AMR-Next/issues/30)) ([32e38f0](https://github.com/Ryuu3rs/AMR-Next/commit/32e38f05916c97e7d762e2a2310c39e41953cd55))
* **app:** dark/light/system theme (E1) ([#29](https://github.com/Ryuu3rs/AMR-Next/issues/29)) ([e955bbe](https://github.com/Ryuu3rs/AMR-Next/commit/e955bbec0f8c966538ec10b05d2dc35e776bcfdb))
* **app:** first-run onboarding card (E3) ([#31](https://github.com/Ryuu3rs/AMR-Next/issues/31)) ([6b0daa2](https://github.com/Ryuu3rs/AMR-Next/commit/6b0daa239a5f254b03200a92f7c82a2f08f52035))
* **library:** bulk actions via select mode (F5) ([#22](https://github.com/Ryuu3rs/AMR-Next/issues/22)) ([4ba7ee0](https://github.com/Ryuu3rs/AMR-Next/commit/4ba7ee0c8382e5ac60010f1e7eedd1477ad99dca))
* **library:** categories + filtering (B2 / G10) ([#20](https://github.com/Ryuu3rs/AMR-Next/issues/20)) ([e6b8707](https://github.com/Ryuu3rs/AMR-Next/commit/e6b870777d804c451f4f9d2255d4ccf5a65d7f49))
* **library:** check a title across all supported mirrors (G17) ([#24](https://github.com/Ryuu3rs/AMR-Next/issues/24)) ([b498a3e](https://github.com/Ryuu3rs/AMR-Next/commit/b498a3e84879d75ed2bd2fb909bdecd1344ed702))
* **library:** duplicate detection + merge (F3) ([#23](https://github.com/Ryuu3rs/AMR-Next/issues/23)) ([3893c53](https://github.com/Ryuu3rs/AMR-Next/commit/3893c53d245ba9fef238627b5a66cf57e5a02c93))
* **library:** one-click switch to another mirror (G8) ([#27](https://github.com/Ryuu3rs/AMR-Next/issues/27)) ([7a4ad21](https://github.com/Ryuu3rs/AMR-Next/commit/7a4ad2182ac46346d30869f1586b0c202aba4fba))
* **library:** re-link a title to a new source/mirror (G3) ([#21](https://github.com/Ryuu3rs/AMR-Next/issues/21)) ([a38270f](https://github.com/Ryuu3rs/AMR-Next/commit/a38270f6235f7cb1b751226adb70a808a5127c89))
* **sources:** generic MangaStream/ts-theme adapter + 6 sites ([#25](https://github.com/Ryuu3rs/AMR-Next/issues/25)) ([bb42d64](https://github.com/Ryuu3rs/AMR-Next/commit/bb42d64989b538fad9c49bd8dffc64986a56f8ce))
* **stats:** daily reading goal (B6) ([#35](https://github.com/Ryuu3rs/AMR-Next/issues/35)) ([2b9c9fe](https://github.com/Ryuu3rs/AMR-Next/commit/2b9c9fe39f59fae7ca25d74ab12a6cb43251afac))
* **stats:** reading streaks + this-week stats (B5) ([#32](https://github.com/Ryuu3rs/AMR-Next/issues/32)) ([2ac9454](https://github.com/Ryuu3rs/AMR-Next/commit/2ac94545b817f56e2357e7b48a409d39fdd0ca73))


### Bug Fixes

* **ci:** build before test in check script so manifest test finds .output ([1d3d6b9](https://github.com/Ryuu3rs/AMR-Next/commit/1d3d6b9827085bb5831e6fa4a376d29a8c3df90f))

## [0.3.0](https://github.com/Ryuu3rs/all-mangas-reader-3/compare/v0.2.0...v0.3.0) (2026-06-15)


### Features

* **library:** add star rating for manga ([#5](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/5)) ([bcc3f99](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/bcc3f9947d86f60080dfa9bfdf0f556af2e64bc9))
* **library:** domain-independent chapter-number tracking ([#7](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/7)) ([78907a2](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/78907a2cb5d6b687d8d009608bfb01f3af3e7316))
* **library:** manga detail view (B1) ([#18](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/18)) ([0e8f7c0](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/0e8f7c08d5d1d8cba443a3cffa630ec722f96dba))
* **library:** manual / "Do Not Scan" titles with hand-set chapter numbers ([#11](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/11)) ([df1999d](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/df1999db54047d4ef399cc578845311e7a44e347))
* **library:** open-in-browser + ctrl-click + recently-added/read sort ([#8](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/8)) ([a59ed5a](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/a59ed5a458ed543db6330d11fd1b6db40e2e1d81))
* **library:** reading history view (B4) ([#17](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/17)) ([d87fbd6](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/d87fbd66c35e8f86190bbb21e03982c59054817b))
* **library:** reliable cover system with backfill and fallback ([#10](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/10)) ([9c288af](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/9c288afe2fb2e951b0b90ea5ea688c5d4451aad1))
* **reader:** add reading direction, page fit, page number, and preload settings ([#4](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/4)) ([8d3f2a9](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/8d3f2a94ce2e00fc0f4503e9c909517dde58081f))
* **sources:** chapter listing for the Madara family (C2) ([#14](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/14)) ([f1e1531](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/f1e15312ed510f3efde9393d45132b8e6735c15f))
* **sources:** config-driven generic Madara adapter (C3) ([#9](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/9)) ([1d94e76](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/1d94e7670141f54216b0b0d103a73fd36f127254))
* **sources:** multi-source search with latest-chapter (C1 + G7) ([#13](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/13)) ([76ae784](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/76ae78442a96e205c24f878187c7526012fe3050))
* **sync:** GitHub Gist sync for the library backup ([#12](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/12)) ([6634d9b](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/6634d9b5d707ec391d223645e4a4560a3f061558))
* **tooling:** mirror anti-scrape probe + tracking-integrity backlog ([#6](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/6)) ([d429f37](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/d429f373cbe6105ef51111b1acfda765c6f8e44d))
* **updates:** per-source refresh (G4) ([#15](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/15)) ([40b5898](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/40b58988c4733bf988f3d2d553e84bed3393c78d))
* **updates:** surface update failures + adapter diagnostics (I7, D5, D6) ([#16](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/16)) ([3a01682](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/3a01682a32abb1f4b2a9d26744d5fbda8a081976))


### Bug Fixes

* **ci:** exclude release-please CHANGELOG from prettier check ([f4090e0](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/f4090e028465844513af33d5859d416b0e15c740))
* **ci:** sync extension manifest version with release-please bumps ([0a6e637](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/0a6e6376614355f705f7540a88bdf82501965ff0))

## [0.2.0](https://github.com/Ryuu3rs/all-mangas-reader-3/compare/v0.1.0...v0.2.0) (2026-06-14)


### Features

* cross-browser extension rewrite (WXT + Svelte) with source adapters, reliability, and release automation ([#1](https://github.com/Ryuu3rs/all-mangas-reader-3/issues/1)) ([d0deb7e](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/d0deb7ecd1944717a26d1682ad66218a37dba726))
* **lab:** add BatchTester and MirrorDiagnostics for mirror testing ([d583dff](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/d583dff90849c72d319133de74fcc9bc0be5e7ce))
* **mirrors:** add disabledForSearch flag to disable search-only ([8c22b08](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/8c22b0829cf45d5ee5ec00cb3cf86fb4b76926d2))
* **ui:** add MangaHealth component for site status checking ([cb62d66](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/cb62d66d6eb7fb91fc9cab135d53affa017e7a3e))
* **v4.0.1:** Quick category button & notification click fix ([11d7f3d](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/11d7f3ded6e68305375a58a287e18a1ab83f3296))
* **v4.0.3:** Add manga by URL feature for Cloudflare-protected sites ([16df335](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/16df3351d04844cb12c505c4a5973cbb2fe22f96))
* **v4.0.4:** Add Weeb Central mirror ([9148a5d](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/9148a5dda16ca78cd9c983a5eefba16ba8a43e44))


### Bug Fixes

* app isn't fully initialized using firefox ([231a636](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/231a636a73af317997284043ecf680909bd92ed7))
* calling map to undefined variable ([a30504c](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/a30504c1a0c3e0f0c6f0f15852bb2dc73d5a0c73))
* can't enable gist without restarting browser ([a8ea6cc](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/a8ea6cc7c5ef26b40f5c2599fba3c12dd27a7f9b))
* chapter list loading in reader and popup views ([886c223](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/886c223dca71a4d18307cd4d142190fc25f22c03))
* database persistence and Vue 3 Proxy serialization issues ([f0c7519](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/f0c751924c3bba6f086edad0ae47f779075c2733))
* database persistence, dashboard components, and infrastructure updates ([d90de4e](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/d90de4e3f97715ccfc051fda41f11791bea1c57c))
* image loading for MangaHere and protocol-relative URLs ([790c630](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/790c6300168d83ab7db3ce55079d8b36db903d8d))
* **mirrors:** add null checks to base classes to prevent crashes ([ef0e19c](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/ef0e19ce6b48646defe95d2089d7e482b9a9b0ba))
* **mirrors:** fix MangaBuddy variable name typo ([7444690](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/74446903105726f39573f4eba124fe0ddbe454f4))
* UI components and debug logging improvements ([d421d04](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/d421d043415203b3016f2f54c5622430c3673010))


### Performance Improvements

* **reader:** centralize scroll handling with throttled event broadcasting ([c0aaaf7](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/c0aaaf74626458d3712c75807dced85049f11bbb))
* **reader:** implement quick performance wins for scan lookup and state saves ([ae04398](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/ae0439845adb908d49f5aa5cb39c48e9683f46c2))
* **reader:** memoize thumbnails and gate debug logs ([e54154a](https://github.com/Ryuu3rs/all-mangas-reader-3/commit/e54154a9cbb50332f93074f8800ddbe43cd71030))

## Changelog

## Unreleased

- Preserved the pre-clean rewrite workspace.
- Reorganized previous implementations under `archive/`.
- Added the WXT and Svelte extension workspace.
- Added shared contracts, source SDK, source registry, and fixture packages.
- Changed distribution planning to GitHub Releases.
