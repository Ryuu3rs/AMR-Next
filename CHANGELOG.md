# Changelog

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
