# Changelog

## [0.12.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.11.0...v0.12.0) (2026-07-17)


### Features

* cross-surface live-update bus, silent dashboard refresh ([2531ff1](https://github.com/Ryuu3rs/AMR-Next/commit/2531ff1de2dbf444e4bbf60ef0994cf49b61aa05))
* reconcile debug-log export (copy + JSON download) ([89c4a97](https://github.com/Ryuu3rs/AMR-Next/commit/89c4a97adbec870b56c8faa3cdfc4ec4c68ed9a6))


### Bug Fixes

* atomic library:merge handler, closes historyEvents data loss on duplicate merge ([df2213e](https://github.com/Ryuu3rs/AMR-Next/commit/df2213e28c61983527bacbac353d3b833bee7456))
* audit-driven correctness fixes across UI, background, and adapters ([d359f7d](https://github.com/Ryuu3rs/AMR-Next/commit/d359f7dce7337a9fe9fe7326d48e42f9d91ec70b))
* auto-link retries next candidate instead of giving up, cleans (Official) markers ([58550d4](https://github.com/Ryuu3rs/AMR-Next/commit/58550d435af639b17b5b5fe3cc8a19d83508913f))
* cooldown-gate background chapter-list refreshes ([f1ebdfe](https://github.com/Ryuu3rs/AMR-Next/commit/f1ebdfe0c7a372cfadc858a1c7f10c4fe795117f))
* CORS/source-registry hardening — durable image-CDN grant pattern, templescan/manhuaplus retired, mangahub search-result chapter number ([d75c86a](https://github.com/Ryuu3rs/AMR-Next/commit/d75c86ab098a6bad71b75c7283333a67e1872176))
* cover object URL doesn't refresh when the cached blob changes ([2d66ed6](https://github.com/Ryuu3rs/AMR-Next/commit/2d66ed6eb051ed58316236767451b5d64c26336c))
* cross-source chapter numbers no longer max in merge, update-check no longer false-reports on repoint ([416ca1e](https://github.com/Ryuu3rs/AMR-Next/commit/416ca1e4b515fbb0eaf8617b3249d0ccfb3e1f8c))
* import/export data-safety hardening — chapters schema gap, missing bookmarks, partial-success import, pre-import backups ([168c538](https://github.com/Ryuu3rs/AMR-Next/commit/168c538362178bfa635073b90b4737d2ee6fcb54))
* mangaread and mangafreak sources completely dead behind origin filter ([82a5eb8](https://github.com/Ryuu3rs/AMR-Next/commit/82a5eb8d0a0ce123b42da6e7edf3ba05133cd126))
* progress-completion ratchet, merge chapter-id carry, orphaned covers ([55b2722](https://github.com/Ryuu3rs/AMR-Next/commit/55b2722a5e94b67891cdbff074d2d90ae1abb3c4))
* reader missing next-chapter controls, slow back-to-dashboard navigation ([47c7932](https://github.com/Ryuu3rs/AMR-Next/commit/47c79326da60b588e18eda6a54336a39a9e82128))
* reconcile UI leaking raw network errors, near-duplicate candidate rows ([ad38bc4](https://github.com/Ryuu3rs/AMR-Next/commit/ad38bc4111ddc67124d8c006d6c277e48580367d))
* rename release-please concurrency group to clear a stuck lock ([b0fbe83](https://github.com/Ryuu3rs/AMR-Next/commit/b0fbe83afa1e6279fd7171816dadcaffcd9df61b))
* source-registry retirements, madara AJAX modernization, reader nav race, chapter-count pagination, shared entity decoder ([3445c50](https://github.com/Ryuu3rs/AMR-Next/commit/3445c504aeac165d1029f2ab1845b9b19de4e3bb))
* update-check can get stuck at 'running' forever if the browser closes mid-check ([be58235](https://github.com/Ryuu3rs/AMR-Next/commit/be582356609e07d929582c6d738a170b220363eb))
* update-check messaging bug + progress bar, reconcile UX, lossless duplicate merge ([3612d29](https://github.com/Ryuu3rs/AMR-Next/commit/3612d29a9b9be7f7bf59fdf31610591963a5521f))
* use PAT for release-please so its pushes trigger CI ([0fa91cb](https://github.com/Ryuu3rs/AMR-Next/commit/0fa91cb567eb52739fd851167f3f179f52075b08))


### Performance Improvements

* chapter:adjacent cache-first, network only when stale ([2e41a27](https://github.com/Ryuu3rs/AMR-Next/commit/2e41a270ac64843969db821a800931a44bd39018))
* cover backfill runs cross-source concurrently, adds targeted single-title path ([3a7b33f](https://github.com/Ryuu3rs/AMR-Next/commit/3a7b33fb63a82c7cce94a8b1cdb24b33251f7117))
* index-scoped lookup in trackExternalChapter capture-error fallback ([a5aef12](https://github.com/Ryuu3rs/AMR-Next/commit/a5aef1210b3d547c78f983e3f26f73c26335e861))
* reconcile Search-all sweep ~4-5x faster ([cf088c6](https://github.com/Ryuu3rs/AMR-Next/commit/cf088c6902770ae7b79bfd6fe5c4d338d292ed55))
* share source-sdk response cache across per-operation clients ([8a66fe0](https://github.com/Ryuu3rs/AMR-Next/commit/8a66fe0c1df4a42f9c0c6fac4e0ad6731114b937))
* single-pass sourceTitleCounts, indexed library search ([01a6eab](https://github.com/Ryuu3rs/AMR-Next/commit/01a6eabc6908076e3289fdae786c7ab063dd8722))
* stop inlining covers as base64 data URIs, index chapters.url ([9ef414b](https://github.com/Ryuu3rs/AMR-Next/commit/9ef414bdb3707e9c7e00bd21ece1799ffe8a6515))
* throttle reader progress reports to 1s trailing ([908c5ac](https://github.com/Ryuu3rs/AMR-Next/commit/908c5acd5da8be7e2e1265197d52b081f427d29b))

## [0.11.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.10.1...v0.11.0) (2026-07-14)


### Features

* add kagane.to source adaptor ([62616aa](https://github.com/Ryuu3rs/AMR-Next/commit/62616aa7205b74c2893f2123b1d6a1751213991e))


### Bug Fixes

* add missing playwright devDependency to browser-tests/runner ([3627645](https://github.com/Ryuu3rs/AMR-Next/commit/362764555c650705745252515ffcb984339ac799))
* strip Svelte 5 $state proxies before sending import envelope over runtime messaging ([90c35b4](https://github.com/Ryuu3rs/AMR-Next/commit/90c35b42510b309ed64b683d9108d99334f9aeae))
* tab-injection bot-block fallback captured the Cloudflare challenge page, not the real content ([ebc1c3a](https://github.com/Ryuu3rs/AMR-Next/commit/ebc1c3a2888833b5893186cdfdf3f47496136b72))

## [0.10.1](https://github.com/Ryuu3rs/AMR-Next/compare/v0.10.0...v0.10.1) (2026-07-12)


### Bug Fixes

* manifest-policy test didn't detect VITE_COMMUNITY_API_ORIGIN when set as a build env var ([5cf44a8](https://github.com/Ryuu3rs/AMR-Next/commit/5cf44a8622b9d289618015e22c7f2660c232853c))

## [0.10.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.9.10...v0.10.0) (2026-07-12)


### Features

* per-series webtoon view toggle, saved indicators, fix update-schedule dropdown ([8f1c77c](https://github.com/Ryuu3rs/AMR-Next/commit/8f1c77c84a6b7897dc2523ac0d8872c544a5a055))


### Bug Fixes

* App.svelte UX polish — NSFW blur in Library, search grouping, filters, discoverability ([253391f](https://github.com/Ryuu3rs/AMR-Next/commit/253391f9aa8a495ff7575522210269ad8c32ce58))
* audit-driven correctness fixes across UI, background, and adapters ([ea6551b](https://github.com/Ryuu3rs/AMR-Next/commit/ea6551b420ab3f8784b2fe6a2fc81d64b6b248fa))
* cover-loading reliability — mangafreak real extraction, madara lazy-load attribute order, mangahub resolveCover ([4a607a6](https://github.com/Ryuu3rs/AMR-Next/commit/4a607a6ef058e349036328469053bf359c2ed9cd))
* export/import schema missing onHold, readingDirection, pageFit ([1793d54](https://github.com/Ryuu3rs/AMR-Next/commit/1793d54c2e046f9a675ee5d79e25a9cb5ccc0dec))
* flaky checkUpdates concurrency test — poll for mock call instead of fixed tick ([0b0738b](https://github.com/Ryuu3rs/AMR-Next/commit/0b0738bf01aa3f9cac97a74104881372afaf71f7))
* prefer-const lint error in community sync test, drop dead eslint-disable directives ([1eaf052](https://github.com/Ryuu3rs/AMR-Next/commit/1eaf05225e5fbd28094867f4d9cf9015f9da68b6))
* reader bookmark reactivity, chapter counter, CBZ export, community auto-register, tighter search, source health accuracy ([57225fe](https://github.com/Ryuu3rs/AMR-Next/commit/57225fe59986d091891bf93de838563490e61102))
* repair release-please state and harden the release pipeline ([ed18793](https://github.com/Ryuu3rs/AMR-Next/commit/ed18793f6bffafa650e0f813c37e18191bbf26ab))
* retire arvenscans, arvencomics, suryatoon — all confirmed dead ([3a6a2d6](https://github.com/Ryuu3rs/AMR-Next/commit/3a6a2d65a875733d59700ffc288fd8cdea8dbc85))
* suppress zod eval-probe CSP violation in MV3 background context ([43770aa](https://github.com/Ryuu3rs/AMR-Next/commit/43770aa03652c5ee9863413ebd0d134d87575ae8))
* unblock CI — 6 pre-existing typecheck errors + 2 stale test assertions ([58131a6](https://github.com/Ryuu3rs/AMR-Next/commit/58131a69e3f8c8ee7a3034ca2f176a0b8b0946cd))
* Webtoons covers + tracking, reader header collapse, mangahub search, alt-title search, UX polish ([d551d0a](https://github.com/Ryuu3rs/AMR-Next/commit/d551d0afd183af34c8a90c1c8789d3c4e4109d80))

## [0.9.1](https://github.com/Ryuu3rs/AMR-Next/compare/v0.9.0...v0.9.1) (2026-07-04)


### Bug Fixes

* 3 migration bugs — mangadex alias, manual URL form, import read progress ([6dea208](https://github.com/Ryuu3rs/AMR-Next/commit/6dea208f0d022e42ea747c7d85930b3e48b666b4))
* sync package-lock.json with community-server workspace ([9a18425](https://github.com/Ryuu3rs/AMR-Next/commit/9a18425c6d723ad76951589654952bc4505446f1))

## [0.9.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.8.3...v0.9.0) (2026-07-03)


### Features

* add 5 Madara sources, fix legacy import aliases, cap search timeout at 6s ([28c66d6](https://github.com/Ryuu3rs/AMR-Next/commit/28c66d6338df0dcefe13544b59e0a43adce9dd86))
* add capabilities override to MadaraConfig, re-enable ManhuaTop as sidebar-only ([1d29e17](https://github.com/Ryuu3rs/AMR-Next/commit/1d29e1743ca23d0149cb49cfe1737bff8e767f91))
* add MangaFreak (full reader) and Comix.to (sidebar/tracking) source adapters ([4ddb28c](https://github.com/Ryuu3rs/AMR-Next/commit/4ddb28cab529954d631f3683bb277b1d88f5d67e))
* add MgRead (mgread.io) as Madara source ([62bfa95](https://github.com/Ryuu3rs/AMR-Next/commit/62bfa9532e57af0058a2e0134ce4e1e435dd7410))
* stream search results per-source as each adapter settles ([5053277](https://github.com/Ryuu3rs/AMR-Next/commit/5053277ff3be8bd8d927c889fb57928e0668eb5a))


### Bug Fixes

* 3 bugs — delay on failed updates, mangafreak CDN fallback, madara capability guard ([751228e](https://github.com/Ryuu3rs/AMR-Next/commit/751228edd565929a2822a7a41785a78933adef30))
* 6 bugs + retire 12 dead sources + add retirement workflow doc ([a77f45d](https://github.com/Ryuu3rs/AMR-Next/commit/a77f45db0b076d98ccea7cdf37dd8bc6e3cd3d6c))
* allow library:switch with 0 chapters for sidebar-only sources ([30cef60](https://github.com/Ryuu3rs/AMR-Next/commit/30cef6004e13aecef70302757db2379a33825aef))
* bump Firefox strict_min_version to 142 for data_collection_permissions support, add sign:firefox script ([19543d1](https://github.com/Ryuu3rs/AMR-Next/commit/19543d1c7cfbbd0cf990be52f65b49d942493312))
* change gecko ID to all-mangas-reader-2@ryuu3rs.dev (original ID taken on AMO) ([7d86794](https://github.com/Ryuu3rs/AMR-Next/commit/7d86794a1f9cef586e0193f32cf84927474e4eb3))
* clear import banner on resolve, add Find Better Sources bulk scan, fix update rate limiting ([0393f58](https://github.com/Ryuu3rs/AMR-Next/commit/0393f58cbd19edd8ab759319ccc1cebdfa93488a))
* community stats not showing after registration — fetch leaderboard even with no new chapters, add Sync Now button, refresh profile post-register ([a78cf68](https://github.com/Ryuu3rs/AMR-Next/commit/a78cf687a8082b2372b66197a5de6b69542a2870))
* eliminate Function() and innerHTML from AMO-submitted bundle ([bfae940](https://github.com/Ryuu3rs/AMR-Next/commit/bfae9408dd3c26c214076b2f44e65f4d9b694782))
* set mangaPath=series for VortexScans (uses /series/ not /manga/) ([a9d5f7d](https://github.com/Ryuu3rs/AMR-Next/commit/a9d5f7d3378872139657fa62655ca2d99d28869e))
* update gecko ID to amr-next@ryuu3rs.dev ([9b5e35b](https://github.com/Ryuu3rs/AMR-Next/commit/9b5e35b08fa62ae2f98c519a4f7023eb0dd500be))

## [0.8.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.7.1...v0.8.0) (2026-06-28)


### Features

* add clear library and clear history options to Settings ([385da24](https://github.com/Ryuu3rs/AMR-Next/commit/385da2447543a76b77be8bdeec1a70602c17c6b1))
* add MangaHub adapter with on-page panel support ([be29ead](https://github.com/Ryuu3rs/AMR-Next/commit/be29ead4a5a90efd2742dca8e7bb40d01ba46611))
* add Tritinia Scans, fix reconcile SW timeout, add search-all ([d7b062e](https://github.com/Ryuu3rs/AMR-Next/commit/d7b062e3a3cb43ddad68c17038cc2e8641f4c2ba))
* add WEBTOON adapter and fix legacy import for 92 webtoon titles ([13ca75c](https://github.com/Ryuu3rs/AMR-Next/commit/13ca75c47bcaecafc63e9ac0a9ca95062043c253))
* history clickable rows, reader chapter dropdown, bug fixes ([88477b6](https://github.com/Ryuu3rs/AMR-Next/commit/88477b609cd3b837e755f7b321d6b3f5c19d1833))
* import reconcile progress bar, 3x concurrency, auto-link, stop button ([53add21](https://github.com/Ryuu3rs/AMR-Next/commit/53add219c292d23f244d20ae201a04da3e8cea58))
* updates page grouped accordion with nested chapters ([1801477](https://github.com/Ryuu3rs/AMR-Next/commit/180147758c60edee927fee850ce0acaaebd40cb1))


### Bug Fixes

* add root route to community API ([3f99b14](https://github.com/Ryuu3rs/AMR-Next/commit/3f99b148db647d8d309bfc69217fea7074baa621))
* import conflict dialog shows error inline and stays visible during processing; add genres to export schema ([605ceae](https://github.com/Ryuu3rs/AMR-Next/commit/605ceae505b7e734c9f8b639df707aa740d6f13d))
* map legacy AMR domain aliases in import so old library entries resolve correctly ([14729c8](https://github.com/Ryuu3rs/AMR-Next/commit/14729c85e853a634f9b323a0e0ca13659b23db27))
* reconcile title matching uses word-overlap for alternate translations ([a54d14d](https://github.com/Ryuu3rs/AMR-Next/commit/a54d14de4cf20dc6957d5202ea46cb24a27425a6))
* tabs.onUpdated URL filter Chrome-only (Firefox supports it, Chrome does not) ([749aecb](https://github.com/Ryuu3rs/AMR-Next/commit/749aecbd99b3cda8a7714debda5ca1632c085763))
* webtoons chapter images via tab render and pstatic.net referer rule ([db4dc10](https://github.com/Ryuu3rs/AMR-Next/commit/db4dc1002a4c3510b9239ddfd90d6e024333b63f))

## [0.6.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.5.0...v0.6.0) (2026-06-18)


### Features

* add Dynasty Scans adapter and fix reader image fallback ([72a960c](https://github.com/Ryuu3rs/AMR-Next/commit/72a960c029eaf7d28ca20611c41a6953bdd98a85))
* add ephemeral New/Updated badges to library cards (24h auto-expire) ([69ecffb](https://github.com/Ryuu3rs/AMR-Next/commit/69ecffb67678a027db5b3510b0bede67dcffa3f5))
* add mangabuddy.com to buddy source adapter registry ([46bb805](https://github.com/Ryuu3rs/AMR-Next/commit/46bb805281f492befef397f1a9869bb039c63aba))
* add MangaNato adapter and Madara config rows for user import sources ([b82d546](https://github.com/Ryuu3rs/AMR-Next/commit/b82d54691334fcbc3a593b079b4a617a91bb066e))
* add MangaPark source adapter (mangapark.net) ([2a4ec7e](https://github.com/Ryuu3rs/AMR-Next/commit/2a4ec7e5a73b2ad60af1b644771f9965d078e9b8))
* add Weeb Central adapter with ULID-based series/chapter routing ([48ce7c7](https://github.com/Ryuu3rs/AMR-Next/commit/48ce7c701f3a4b581a9ed0fef9d19d42aca285c2))
* cache cover images in IndexedDB to avoid repeated network fetches ([2b9bfc2](https://github.com/Ryuu3rs/AMR-Next/commit/2b9bfc296a044526b4256e58647ff80a5115732f))
* in-extension update check banner and fix raw fetch in getMangaChapters ([2e5f7d2](https://github.com/Ryuu3rs/AMR-Next/commit/2e5f7d2ffb9dec7f602317f086c2320b4ca6b9c3))
* migrate old AMR export format on import ([2452e2b](https://github.com/Ryuu3rs/AMR-Next/commit/2452e2b30cf5dd6f78e54138bfbc12790eace9dc))
* move all source origins to required host_permissions — no manual grant needed ([759fdcd](https://github.com/Ryuu3rs/AMR-Next/commit/759fdcd4688b126d6af54b12fccc039b13a9074b))
* post-import reconciliation for dead sources ([d2b0a2a](https://github.com/Ryuu3rs/AMR-Next/commit/d2b0a2a879041cce20eebb1e488aa419b5bca1e5))
* support legacy imports with optional tables ([041d5f3](https://github.com/Ryuu3rs/AMR-Next/commit/041d5f34b0d9baf50f7e06dd1d9f37262d7b1d27))
* tab injection fallback for bot-blocked chapter fetches (403/502/503) ([be80456](https://github.com/Ryuu3rs/AMR-Next/commit/be80456ed2e33042dd2dd42da242c054089b9820))
* unify poster menu to detail modal and add manual tracking controls ([62b15e8](https://github.com/Ryuu3rs/AMR-Next/commit/62b15e846783890243517152659903b9f1bfd30a))


### Bug Fixes

* dynasty-scans image key is 'image' not 'url', decode &raquo; and other named entities ([742f0e0](https://github.com/Ryuu3rs/AMR-Next/commit/742f0e0cca7cc4019e4512668040fadf10634b76))
* include URL in unsupported-chapter error and relax madara trailing-slash ([02c1a6e](https://github.com/Ryuu3rs/AMR-Next/commit/02c1a6e73f9dacecf5896a7902d7848b91abb8e6))
* loop cover backfill until all missing covers are processed ([b7ad0c2](https://github.com/Ryuu3rs/AMR-Next/commit/b7ad0c2c15c1e2271bc49f2c57e640e358636c1d))
* mangaread.org chapter images missing — ?style=list and src-first attr priority ([782391f](https://github.com/Ryuu3rs/AMR-Next/commit/782391f18f050394eab096762e836cd5f37f8173))
* move poster menu panel outside overflow:hidden wrap so it renders over the card ([a36260d](https://github.com/Ryuu3rs/AMR-Next/commit/a36260df2fdaa39360caa9ce4cf97db945fb2bef))
* paginate reconcile panel and auto-backfill covers after import ([cd5d9fd](https://github.com/Ryuu3rs/AMR-Next/commit/cd5d9fdd3770d97a619f95a0f12d3a6005bce28a))
* remove leftover poster-confirm dead block after menu unification ([4d105c6](https://github.com/Ryuu3rs/AMR-Next/commit/4d105c6222857115da5f72ad0bfec366e908ca28))
* rework detail modal layout — fix cover stretch, compact options, section dividers ([f550853](https://github.com/Ryuu3rs/AMR-Next/commit/f5508535caefbf82a20a0c26f67d20b400eafaf8))
* **sources:** use centralized SOURCE_ORIGINS instead of hardcoding ([2e4eb04](https://github.com/Ryuu3rs/AMR-Next/commit/2e4eb04ceaa67d93c684c27a0c4f2e476a0b3063))
* state_unsafe_mutation in ImportReconcile and CSP eval from modulepreload polyfill ([f1cd771](https://github.com/Ryuu3rs/AMR-Next/commit/f1cd7717808dedafe3828577d2cc5b92fa6dd974))
* trim whitespace from img attribute values in madara extractor ([26cfc4a](https://github.com/Ryuu3rs/AMR-Next/commit/26cfc4ae6e95dec1ff798b1e70c79b1f0f89bc78))
* use credentials omit for cross-origin fetches to avoid Firefox CORS enforcement ([b0b76a0](https://github.com/Ryuu3rs/AMR-Next/commit/b0b76a0f97dedf165546ce3ba272da224a4b4a5d))
* use https:// prefix for dynasty-scans origins so bounded request client allows fetches ([76ff50b](https://github.com/Ryuu3rs/AMR-Next/commit/76ff50bb312e6a5c4be3578633ada064193b1925))
* wildcard origins crash request client and cover backfill loops forever ([b2fe4cf](https://github.com/Ryuu3rs/AMR-Next/commit/b2fe4cfc58447884eec980fccbdff8c9cf6e7e0f))

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
