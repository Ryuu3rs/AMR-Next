# Changelog

## [0.21.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.20.0...v0.21.0) (2026-08-31)


### Features

* **community:** consent-gated data collection, GDPR controls, and install counts ([25d89e3](https://github.com/Ryuu3rs/AMR-Next/commit/25d89e37f587a3b715e7fe79d73ae9400f386e3c))
* **community:** owner announcements + admin dashboard API ([216e036](https://github.com/Ryuu3rs/AMR-Next/commit/216e036897c79589c13125401a0271b89fd5fa41))
* **data:** optional passphrase-encrypted backups (AES-GCM) ([e2888b0](https://github.com/Ryuu3rs/AMR-Next/commit/e2888b05aa23cf2e982ffd40874fbd9fe423b045))
* **discover:** confirmation toast on quick-add (mark read / plan-to-read) ([801229c](https://github.com/Ryuu3rs/AMR-Next/commit/801229c503c499e4956748363bd135a48f05ee5f))
* **discover:** Find + More menu to log a suggestion as read or plan-to-read ([c4f03be](https://github.com/Ryuu3rs/AMR-Next/commit/c4f03be58d5481080317add66b8b6d1432a22a97))
* **sources:** add Nyanu Kafe (nyanukafe.com) ([fc6bd9f](https://github.com/Ryuu3rs/AMR-Next/commit/fc6bd9f721161df55ec3734ebd5ce562c5a72874))


### Bug Fixes

* **deps:** bump hono 4.13.5 + @hono/node-server 1.19.17 (moderate CVEs) ([84285ce](https://github.com/Ryuu3rs/AMR-Next/commit/84285cea613e1947ea8e5f0e5bcc49046ecedb6c))
* **discover,library,updates:** podium sizing, select-mode checkbox + bulk caught-up, de-conflate bot-block skips ([6c57f10](https://github.com/Ryuu3rs/AMR-Next/commit/6c57f105f992fdc0426b474e5418e25cefcc798b))
* **discover:** don't blank the page when a refresh can't reach AniList ([2809977](https://github.com/Ryuu3rs/AMR-Next/commit/2809977197f8bbc7640289faade3e56282f32ae8))
* **discover:** fixed-size centered podium, full-width layout, centered top controls ([ad25b22](https://github.com/Ryuu3rs/AMR-Next/commit/ad25b22b8beba4e7b014a95660b453cc9d4c2857))
* **discover:** keep quick-added titles out of suggestions (no stale-cache flash-back) ([9eb7f27](https://github.com/Ryuu3rs/AMR-Next/commit/9eb7f27e50214df42100f56f43c910bd638d02aa))
* **discover:** quick-add sent a Svelte $state proxy array (unclonable) - spread genres to a plain array ([28cb848](https://github.com/Ryuu3rs/AMR-Next/commit/28cb8489a8a2220a183f9ffde26d681ed9aed427))
* **discover:** stop full-width main overflowing the shell horizontally ([1a53446](https://github.com/Ryuu3rs/AMR-Next/commit/1a534461a1300379c277049b72b20a830f1dc2cc))
* **nyanukafe:** parse the full chapter anchor (real inners are ~1.4KB, not &lt;400) ([7b3a677](https://github.com/Ryuu3rs/AMR-Next/commit/7b3a6773d1b852d0baad9311e47b7446ece0b7df))
* **privacy:** point policy URL at the live host privacy.weeb.ltd ([00db1cb](https://github.com/Ryuu3rs/AMR-Next/commit/00db1cbd3ddc64a16abfae4e8c6e103571da3c3a))


### Performance Improvements

* **suggestions:** cache AniList recommendations per seed to stop hammering AniList ([7549850](https://github.com/Ryuu3rs/AMR-Next/commit/754985015289201c190ae6e68f271ec84c94224f))

## [0.20.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.19.0...v0.20.0) (2026-08-23)


### Features

* **anilist:** bidirectional reading-status sync (push/pull, last-writer) ([4407745](https://github.com/Ryuu3rs/AMR-Next/commit/440774514a5b0ce164911653fbf7ecf883b52163))
* **anilist:** import completed titles as completed + planning opt-out ([8a68617](https://github.com/Ryuu3rs/AMR-Next/commit/8a686177df33795781ed66be2d37ac3cff30ce02))
* **discover:** lead with top picks + genre filter; align card buttons; show build marker ([027e864](https://github.com/Ryuu3rs/AMR-Next/commit/027e864eabc9c6a5e1e323db3028aac0d4b72537))
* **discover:** rename Suggestions to Discover with because-you-read + genre rails and find-similar ([7bb3e34](https://github.com/Ryuu3rs/AMR-Next/commit/7bb3e34d768c23a4833bc80f76db908981198df0))
* **library:** add 'Updates' filter for titles with new chapters; scope Find better sources ([ae39f65](https://github.com/Ryuu3rs/AMR-Next/commit/ae39f65ea3d12d618f5310f3ecef40be006b1179))
* **library:** detect rotated-slug duplicates so the merge tool catches Asura forks ([d193f8c](https://github.com/Ryuu3rs/AMR-Next/commit/d193f8ca1ef4830438f86676dd6df0744fdc4db6))
* **reader:** Actual-size fit (native resolution), configurable double-page gap, fix stray x-overflow ([f1da24b](https://github.com/Ryuu3rs/AMR-Next/commit/f1da24bea885d50562aef033e134220e6b1da055))
* **reader:** add Fill width page-fit so pages fill the screen (no lateral borders) ([f5cf818](https://github.com/Ryuu3rs/AMR-Next/commit/f5cf8182f72cdd5d5601cf0c0c70d190dbd27bdd))
* **reader:** filter chapter list and prev/next by preferred language ([925b06e](https://github.com/Ryuu3rs/AMR-Next/commit/925b06e077cc7e23ccb50d78b55645a0a935d98d))
* **reader:** make Double-page a paged flip view (arrows + wheel), not a scroll ([58cc8f9](https://github.com/Ryuu3rs/AMR-Next/commit/58cc8f995b4eff26e8175fdde6659c3660af0eed))
* **reader:** make Fit width actually fill; add a Page width slider ([263587b](https://github.com/Ryuu3rs/AMR-Next/commit/263587bc308cf35f896972ba63b0d06a06562ff7))
* **seed:** give recognizable sample titles real AniList ids so Discover demonstrates ([952823b](https://github.com/Ryuu3rs/AMR-Next/commit/952823bf1a5ada9fa9a292a92b6970199d35c116))
* **suggestions:** filter the Suggested tab by genre, title, community, and sort ([8e3373b](https://github.com/Ryuu3rs/AMR-Next/commit/8e3373b2bab18b4dc04f34e7276f3de21e6d1df5))
* **updates:** in-app download button for the matching browser build ([027a663](https://github.com/Ryuu3rs/AMR-Next/commit/027a6633e066d5a985d7a176cb3cf715bf002864))


### Bug Fixes

* **anilist/webtoons:** dedup custom-list import entries; scope webtoons next-page + guard episode_no ([5963108](https://github.com/Ryuu3rs/AMR-Next/commit/596310883831554736edab686113005824f9482a))
* **anilist:** base status-sync explicit flag on the resolved kind, not raw readingStatus ([ce15cc6](https://github.com/Ryuu3rs/AMR-Next/commit/ce15cc6ccbbc8b6f222b7e635828debc8c26880c))
* **anilist:** gate completed on real publication status; skip light novels; import nsfw + authors ([26eb634](https://github.com/Ryuu3rs/AMR-Next/commit/26eb63429f0db67989c9bd8fbf90c535033552c9))
* **asura:** stop duplicate library entries on slug rotation; dedupe chapter-count stats ([b1cfca9](https://github.com/Ryuu3rs/AMR-Next/commit/b1cfca985a7d980acfa5659a81a5d668d50d6d87))
* **asura:** track reader progress + stop duplicate/renamed entries under slug rotation ([caf24e7](https://github.com/Ryuu3rs/AMR-Next/commit/caf24e76be2b84635b37148616178daf0fa79e58))
* **bookmarks:** star the right page/chapter, guard orphans, make toggle atomic ([2f972b2](https://github.com/Ryuu3rs/AMR-Next/commit/2f972b21c4237d40a9b4afd260b238aa4f18d0cb))
* bughunt sweep of the 0.20.0 diff (AniList sync, backfill, reader capture) ([d0deb86](https://github.com/Ryuu3rs/AMR-Next/commit/d0deb86d0bc9e43387f0c41951210a716bfcd962))
* **capture:** clear internal-tab markers after tab removal; retry slug-title recovery on later visits ([8ac2e3d](https://github.com/Ryuu3rs/AMR-Next/commit/8ac2e3d6e56df6de42eaade82ad418d46619444d))
* **comix:** canonicalise resolveChapter id to match listChapters (no duplicate rows) ([e0183af](https://github.com/Ryuu3rs/AMR-Next/commit/e0183afec41ca3895144e270e6da3414bd12777d))
* **comix:** populate the chapter list via a manga-page tab render so on-page prev/next works ([ba51275](https://github.com/Ryuu3rs/AMR-Next/commit/ba512754f14668f2582931441b4109b1ee2c0590))
* **comix:** seed on-page prev/next from the page's own SSR data ([e57bbf3](https://github.com/Ryuu3rs/AMR-Next/commit/e57bbf38d4b81927614d48f4991fc799059c8cfa))
* **diagnostics:** log update-check runs and embed a library/unread snapshot ([7322182](https://github.com/Ryuu3rs/AMR-Next/commit/7322182ff18193bad926921b6e73cd5cf27a2260))
* **diagnostics:** stop redacting the public community username in the log ([b738bd0](https://github.com/Ryuu3rs/AMR-Next/commit/b738bd07897dc82b01937c8d0e65ec0cf5efd4e2))
* **library:** back up before merge; stop four paths orphaning rows after a concurrent remove ([f4ec131](https://github.com/Ryuu3rs/AMR-Next/commit/f4ec1310fe312b50fd3940da06be6129f2dbfcba))
* **library:** refresh stale ongoing status so finished series reach Completed; scope siblings to one language ([56863c3](https://github.com/Ryuu3rs/AMR-Next/commit/56863c30ac2a9af582408d72e6e2966ca4baebb7))
* **library:** stop the 'lost progress' mislabels - New-ch badge + real chapter number in reader ([dda9b36](https://github.com/Ryuu3rs/AMR-Next/commit/dda9b36fccb0d2c75be9c1d7e604d0876663cd9f))
* **mangadex:** dedupe chapters to one row per number; thread reading language ([c51dce0](https://github.com/Ryuu3rs/AMR-Next/commit/c51dce02a13c547e3eb3a8276f71a047c643a7ec))
* **mangahub:** heal poisoned chapter numbers locally + drop phantom next chapter ([8c0c17d](https://github.com/Ryuu3rs/AMR-Next/commit/8c0c17d6ec23276030ab93fa357f9952ccd989f2))
* **mangahub:** resolve all chapter pages, not just the lazy-load preload window ([f6a81c7](https://github.com/Ryuu3rs/AMR-Next/commit/f6a81c772aeed67c6a1c838566daa2576bf48d13))
* **metadata:** treat AniList's 404 no-match as null; reject combining-mark-only usernames ([920319e](https://github.com/Ryuu3rs/AMR-Next/commit/920319e933864d714c5cf29131fd1cd2f5fc33ca))
* **reader/stats:** double-page completion, page-index clamp, single-page broken banner, merge history dedup ([2ade2d3](https://github.com/Ryuu3rs/AMR-Next/commit/2ade2d34cba9c9ecf76ab6d1d9e20d0b2ec95b61))
* **reader:** capture chapter identity before offline export/remove awaits ([528b787](https://github.com/Ryuu3rs/AMR-Next/commit/528b7878e208a35bc91fbd762dd8c1d4001d0d9a))
* **reader:** guard offline download against orphaning, fix stale-chapter races, wrap alarm dispatches ([358bf7d](https://github.com/Ryuu3rs/AMR-Next/commit/358bf7dd9d3980fcc81ac153219e5e3c383199e7))
* restore anchor-fallback specials, stop backup restore dropping titles, chunk community sync ([1bd9707](https://github.com/Ryuu3rs/AMR-Next/commit/1bd97072797495b7242a4efdb571b24f4ba115a0))
* **search:** count source settlements, not matches, in the progress indicator ([00496db](https://github.com/Ryuu3rs/AMR-Next/commit/00496dbbdd414e1ebc87e8ad7ebc3162bc173469))
* **search:** guard chapter-list load against stale responses; pin the auto-expanded group ([5ebd825](https://github.com/Ryuu3rs/AMR-Next/commit/5ebd8250e4b660804e46912abc20d899e71b26ab))
* **security:** scope anchor-fallback to the series, redact the log snapshot, guard comix Next, clear Discover focus ([cdba9f4](https://github.com/Ryuu3rs/AMR-Next/commit/cdba9f4533a3fa1f62e719c6c35de3596af2bb56))
* **server:** rate-limit metadata + community read endpoints and cap free-text input ([a480a07](https://github.com/Ryuu3rs/AMR-Next/commit/a480a07ec17b9ec1a2499ac1312ff3b7840dc275))
* **sources:** recover ts-variant chapter lists via anchor fallback; retire 4 dead adapters ([1576744](https://github.com/Ryuu3rs/AMR-Next/commit/1576744afb6b7672bcb3f4c1f0d3ba8cdcfd609d))
* **stats:** label the all-time Active-days stat so it doesn't contradict the recent heatmap ([8a34be3](https://github.com/Ryuu3rs/AMR-Next/commit/8a34be3454f001fd79ccaaaae2606bba4a32e9b3))
* **stats:** stop in-place sort of a reactive array in the template (Stats tab dead on return) ([653adc5](https://github.com/Ryuu3rs/AMR-Next/commit/653adc54ac5eebdc092cd16bd0583ad9a0155ad6))
* **thunderscans:** follow series path move /manga -&gt; /comics; refresh stale health-targets ([6051769](https://github.com/Ryuu3rs/AMR-Next/commit/6051769f7f662eba81933765400392bd2bce287e))

## [0.19.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.18.0...v0.19.0) (2026-08-08)


### Features

* **anilist:** import titles by romaji first so mirror search matches more sources ([91396fa](https://github.com/Ryuu3rs/AMR-Next/commit/91396fa4a1c241c77940df2f262445dd6e5862e4))
* **backup:** daily automatic restore point with partitioned retention ([0b6f6a0](https://github.com/Ryuu3rs/AMR-Next/commit/0b6f6a01f6516acad7fca2e270d80691cd6b3b7c))
* **community:** reserved-name blocklist + emoji-safe username validation ([1c384f6](https://github.com/Ryuu3rs/AMR-Next/commit/1c384f638a448c76d11d192bf1633928b82ee2ef))
* **insights:** Stats genre breakdown + Suggestions top-3 podium from the library genre profile ([3492eec](https://github.com/Ryuu3rs/AMR-Next/commit/3492eeca73426463f6c29749c82aafa3e27267f0))
* **library:** persist sort, cap suggestions, auto-backup on update ([ed6f063](https://github.com/Ryuu3rs/AMR-Next/commit/ed6f063952d8db90b0d9871bcef96966c177c90c))
* **library:** reading-status filters, per-title status control, auto-pause + import settings ([46aef94](https://github.com/Ryuu3rs/AMR-Next/commit/46aef9438ebda243e87f3a2375a72c91e7439fd3))
* **library:** reading-status model (paused/dropped/planning), AniList status mapping, auto-pause, sync reconcile ([70a9c92](https://github.com/Ryuu3rs/AMR-Next/commit/70a9c9246b67282e01ed0149139c45d81790e956))
* **reader:** seamless 0-gap spread toggle, fit-height clip, top-bar autohide hotkey ([7430af5](https://github.com/Ryuu3rs/AMR-Next/commit/7430af552e741d14c86e8302c65fe6cb3f6c6de3))
* **reader:** Strip/Single/Double view control, scrollable double spreads, page nav ([f2b8d5d](https://github.com/Ryuu3rs/AMR-Next/commit/f2b8d5dfb90067ca4b738967b712e39ae2c7b105))
* **reader:** tighten the double-page spread and add a first-page offset ([84cbbda](https://github.com/Ryuu3rs/AMR-Next/commit/84cbbda5d9d613ee636a45ec839947e99580756a))
* **search:** add library:add so primary click adds any source unread ([0db5688](https://github.com/Ryuu3rs/AMR-Next/commit/0db56888c87bc24bb28b58d2f8519b02773209c1))
* **search:** per-source search toggle on Sources tab (preferred mirrors) ([0357774](https://github.com/Ryuu3rs/AMR-Next/commit/03577743694d8e76bbaa5ff0fe9ace7f99720183))
* **search:** primary click adds result to library, modifier-click opens site ([7cecd8b](https://github.com/Ryuu3rs/AMR-Next/commit/7cecd8b459a34cddbce2283308b3c5f09ea4d951))
* **sources:** add GD Scans (Madara) with optional volume-path chapter URLs ([2efeab6](https://github.com/Ryuu3rs/AMR-Next/commit/2efeab61084607bf469f2a3c639c3921a88b7c97))
* **sources:** add mangak.io adapter (Next.js SSR: search + chapter list + reader scrape) ([86c3404](https://github.com/Ryuu3rs/AMR-Next/commit/86c3404a5b97a7849011c4c9eaf08a3139c2b57f))
* **sources:** alias tritinia.com to recover old-domain imports ([83dc229](https://github.com/Ryuu3rs/AMR-Next/commit/83dc22956948bb6759dc4d557fe0454523989505))


### Bug Fixes

* **anilist:** make sync reconcile safe (up-front fetch, empty-guard, pre-existing-id snapshot) so it never mass-drops the library ([8d4e8b6](https://github.com/Ryuu3rs/AMR-Next/commit/8d4e8b6cca10ccaf6f357e61a0d544d52105c335))
* **anilist:** track known-membership across syncs so reconcile only drops genuine removals, never enrichment-stamped titles ([47d6726](https://github.com/Ryuu3rs/AMR-Next/commit/47d6726e0cb94163c27252b2c601dce247a79fe0))
* **asura:** strip 'Chapter N' suffix from resolved series title ([568e9e8](https://github.com/Ryuu3rs/AMR-Next/commit/568e9e85ac709e1f9d243b85bacd608e99f6fed5))
* **background:** reset stuck update-progress on throw; update-pending latch; ensureAlarm no period-reset; focus existing dashboard tab ([1cb21aa](https://github.com/Ryuu3rs/AMR-Next/commit/1cb21aaf1c121f0e866e4ca585a83f063ca60749))
* **capture:** mark-read adds a distinct library entry per title ([7f7fd05](https://github.com/Ryuu3rs/AMR-Next/commit/7f7fd05f79f3ad2d4bb775d3419fa33523e73542))
* **community-server:** vendor username rules so the isolated Docker build resolves ([5d3162f](https://github.com/Ryuu3rs/AMR-Next/commit/5d3162fad5feaa484b59ff5306c62ef6c7f08cec))
* **db:** preserve anilistId/genres/metadataUpdatedAt/latestChapterAt on chapter recapture ([7c74241](https://github.com/Ryuu3rs/AMR-Next/commit/7c742418acfb6dbc867a39e6e007439ddb4150ff))
* **db:** v11 heals Infinity lastReadChapterNumber; guard latest-chapter pick; clear dangling read id on switch; backup signature covers metadata ([755c872](https://github.com/Ryuu3rs/AMR-Next/commit/755c872652c0d27bdfc60d62ba81fa423fd484a0))
* **insights:** emphasize 1st podium pick with an accent ring instead of scale (no overlap) ([a403e6c](https://github.com/Ryuu3rs/AMR-Next/commit/a403e6c5a5a05159b5b5f235d924b0d597d917c9))
* **library:** Completed requires a finished series (caught-up ongoing stays reading) so mark-read titles stay visible in Ongoing ([a5393c5](https://github.com/Ryuu3rs/AMR-Next/commit/a5393c5a1ecb203d31bb15c9aece039ea5bce479))
* **library:** don't mark read titles Completed when latest is unknown; status-aware Surprise Me + updates badge ([1d11914](https://github.com/Ryuu3rs/AMR-Next/commit/1d11914343cfa70999ddb8e65f00c0a10d6f45e8))
* **mangahub:** reject internal-id chapter numbers in external-track + heal poisoned lastReadChapterNumber so Updates shows real numbers ([827958b](https://github.com/Ryuu3rs/AMR-Next/commit/827958b728a2e48b3d448c8fb39f5cfb03455dd1))
* **reader:** center image at original page-fit (center + margin-auto, not safe-center) ([d543202](https://github.com/Ryuu3rs/AMR-Next/commit/d543202602748a1c3ed58354fc79e0a66b64d71f))
* **reader:** retry a failed page image (backoff) before stranding it on alt text ([6bceff7](https://github.com/Ryuu3rs/AMR-Next/commit/6bceff755b5dbfd6f18ef75298b025b3864d203d))
* **search:** honor per-source race timeout in streaming; force refreshes suggestions; validate library:add input ([1f31380](https://github.com/Ryuu3rs/AMR-Next/commit/1f3138006c8c686ea3a79c0ca581c91c214101fc))
* **search:** raise bulk-search race timeout to 10s so it stops missing sources a manual search finds ([b0c3593](https://github.com/Ryuu3rs/AMR-Next/commit/b0c3593444e37dd4970e208c5b45668c4b9ed4ff))
* **search:** unicode-aware matchesQuery + normalizeTitle (NFC/strip); chapterIdToken uses query key for webtoons ([5c26458](https://github.com/Ryuu3rs/AMR-Next/commit/5c264581b67422a1499dc1d2f71065546c361c07))
* **security:** redact encoded secrets + JWTs in diag log; http(s)-only url guard; strip control chars from cbz filename ([1b10c70](https://github.com/Ryuu3rs/AMR-Next/commit/1b10c700fe289ef164892d8b7c301bb803b20ce8))
* **sources:** dash-decimal chapters, weebcentral year misparse, asura bare-chapter title, sortkey edge cases ([1d64bb0](https://github.com/Ryuu3rs/AMR-Next/commit/1d64bb0f3035cfbdbd5e2c8b00b62b971ecc875a))
* **sources:** mangadex newest-500, comix chapter-0, fanfox search dupe-slug, manganato genre scoping, mgeko unnumbered ([b6e0d48](https://github.com/Ryuu3rs/AMR-Next/commit/b6e0d48824d919c441a267d6e3cf00f907671339))
* **tritinia:** use ch- chapter prefix so reader resolves chapter URLs ([115768b](https://github.com/Ryuu3rs/AMR-Next/commit/115768b59cc4460966bd0c4458e1a786c849c2e6))
* **weebcentral:** parse Episode-labeled chapters so numbers stop collapsing to 0.NNN ([2b59073](https://github.com/Ryuu3rs/AMR-Next/commit/2b590738757bfc3f61ed9df0806ad436bb7fe06d))


### Performance Improvements

* **suggestions:** paginated infinite-scroll render + lazy cover images ([aa6a505](https://github.com/Ryuu3rs/AMR-Next/commit/aa6a5052ea5e153aa8d8d9fec89606aabb2e6f7b))
* **suggestions:** serve cached list instantly and revalidate in the background ([82720ec](https://github.com/Ryuu3rs/AMR-Next/commit/82720ec4c46575ebeedd5b443d26a1792dc4149c))

## [0.18.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.17.0...v0.18.0) (2026-08-04)


### Features

* **anilist:** import your AniList list into the library ([ca4dbbb](https://github.com/Ryuu3rs/AMR-Next/commit/ca4dbbb61c48b6b3ad5c5179d97276de43b7df29))
* **app:** AniList import button and inline tag management ([b9cbf69](https://github.com/Ryuu3rs/AMR-Next/commit/b9cbf690455c7ea4c1683b1270c138d900daef47))


### Bug Fixes

* **background:** stop crawl churn, tab races and uncancellable search ([e1a8a65](https://github.com/Ryuu3rs/AMR-Next/commit/e1a8a65290824a84b217f0f9f04c9da428efc872))
* **covers:** metadata-fallback robustness + AniList import/open guards ([36c2ebe](https://github.com/Ryuu3rs/AMR-Next/commit/36c2ebe34ea666e42c0edff1f5fbf860a8e9415d))
* **covers:** recover missing covers from the metadata catalog ([7c2daff](https://github.com/Ryuu3rs/AMR-Next/commit/7c2dafff4e4041c79c536c07d8ecbba5ad1cc52a))
* **db:** close import-dedup, progress-ratchet and merge/restore integrity holes ([cf893b1](https://github.com/Ryuu3rs/AMR-Next/commit/cf893b1d52fdae82668a84cef314105799090702))
* **reader:** paging, download-state race, progress regression, cleanup ([08b7490](https://github.com/Ryuu3rs/AMR-Next/commit/08b7490c45d0eb8c17b1d64bd7093720c6890ead))
* **reader:** resume at the last-read chapter, not the latest ([3afd7d2](https://github.com/Ryuu3rs/AMR-Next/commit/3afd7d27ae11adf2fe8e80adf56b407fb919a407))
* **server:** harden rate limiter and recommender/admin privacy ([9fd6b01](https://github.com/Ryuu3rs/AMR-Next/commit/9fd6b01318707ffba300c87e3e07d960cf49c27b))
* **settings:** keep the update-schedule selection after leaving the tab ([6a4dc2a](https://github.com/Ryuu3rs/AMR-Next/commit/6a4dc2a8462e25b695c650e3bdc1c06f4b079723))
* **sources:** correct chapter parsing in madara, comix and mangapark ([8321e44](https://github.com/Ryuu3rs/AMR-Next/commit/8321e4487d18309bbc48dbeff4f5a8f64e7b0b76))

## [0.17.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.16.0...v0.17.0) (2026-08-02)


### Features

* **anilist:** guide access-token setup in settings ([febf1c9](https://github.com/Ryuu3rs/AMR-Next/commit/febf1c9e6f790eb2bd058364295aed6f92fd32fe))
* **anilist:** make the setup authorize URL copyable ([ef0f484](https://github.com/Ryuu3rs/AMR-Next/commit/ef0f484c7dedcd76fe570468a3904b7af10064d0))
* **community:** rank readers-also-read recommendations by co-occurrence ([c355d0b](https://github.com/Ryuu3rs/AMR-Next/commit/c355d0b5295b6cd70c28ee83024f6f99ea471f89))
* **library:** add a "recently updated" sort ([72bd73b](https://github.com/Ryuu3rs/AMR-Next/commit/72bd73b146e8822a6458ec625c948d4c02d92dd5))
* **metadata:** add Jikan (MAL) fallback for covers and MAL ids ([f29ade8](https://github.com/Ryuu3rs/AMR-Next/commit/f29ade88f1e958f9bcf662539cb9044cbc60ae53))
* **reader:** add a double-page (2-up) spread in paged mode ([1c408ae](https://github.com/Ryuu3rs/AMR-Next/commit/1c408ae5fffb744dabec6d514e944214c0bd8433))
* **search:** collapse duplicate results across mirrors into work cards ([f89054b](https://github.com/Ryuu3rs/AMR-Next/commit/f89054b8d98dd7a2d3a295060644adaca51f4692))
* **suggestions:** add a content-based Suggestions tab ([d5c9346](https://github.com/Ryuu3rs/AMR-Next/commit/d5c93464ac404ba44dbdf7bd708fe66865fe3d84))
* **updates:** notify on new chapters after an update check ([b1c9e94](https://github.com/Ryuu3rs/AMR-Next/commit/b1c9e94535c70e7d6ccf09e0c27ff723d6229174))


### Bug Fixes

* **anilist:** put the token box below the setup steps ([17622b1](https://github.com/Ryuu3rs/AMR-Next/commit/17622b1314a88e36f69d42eff7ec58e44e8039ac))
* **community:** block the co-read intersection leak with a k-anonymity floor ([b7879ea](https://github.com/Ryuu3rs/AMR-Next/commit/b7879eaf12d125e1d68333a171d4791adc8dd557))
* **community:** reach the community server from the shipped build ([3b31ac1](https://github.com/Ryuu3rs/AMR-Next/commit/3b31ac1337d467b28c493498c1db5b7bff15fbae))
* **reader:** make the double-page spread lay out side by side ([20662b9](https://github.com/Ryuu3rs/AMR-Next/commit/20662b97f2a178489792514b1bd4799240fb648d))
* **sources:** restore AsuraScans and Flame Comics update checks ([92752d2](https://github.com/Ryuu3rs/AMR-Next/commit/92752d29f50d7abac09b9ce71306ce72263a3778))
* **suggestions:** harden grouping and the handler after a bug hunt ([9d300d2](https://github.com/Ryuu3rs/AMR-Next/commit/9d300d273144f7491036b8809e8c820268b2cc33))
* **updates:** make failure-log counts honest and add a per-source tally ([2178ea8](https://github.com/Ryuu3rs/AMR-Next/commit/2178ea85d7364427f5204d538ee4f9a90cc8d128))

## [0.16.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.15.0...v0.16.0) (2026-08-02)


### Features

* add exportable diagnostic log ([bb92fc2](https://github.com/Ryuu3rs/AMR-Next/commit/bb92fc2249c07aa0f6927d3407f2d1cc6e91cdea))
* add self-hosted metadata catalog service and vps provider ([43b608a](https://github.com/Ryuu3rs/AMR-Next/commit/43b608a9bb181e766c4a48486f6f8f90f0c22ca3))
* enrich manga status, cover and genres from AniList ([19f785b](https://github.com/Ryuu3rs/AMR-Next/commit/19f785ba425edbc9ee5404669a44c2d9b0dcf7a8))
* mirror library membership to AniList ([06cd6da](https://github.com/Ryuu3rs/AMR-Next/commit/06cd6da49d3bea48e2a8195bc869ea0d7badf069))
* sync read progress to AniList ([d6b3cf7](https://github.com/Ryuu3rs/AMR-Next/commit/d6b3cf7ef9edfa44b6ab5602c8c5439afcc75761))


### Bug Fixes

* adapter unnumbered-chapter sortKey and HTML entity-decoder crash ([433b3fe](https://github.com/Ryuu3rs/AMR-Next/commit/433b3fe47993d83ae6916e2ca66216800a8dd65b))
* bug-hunt findings across the AniList/import/log changes ([cd6fbae](https://github.com/Ryuu3rs/AMR-Next/commit/cd6fbae03f9cbac81d469f2f03c1e7b9b26f5f52))
* don't let a transient AniList outage poison the metadata cache ([2722195](https://github.com/Ryuu3rs/AMR-Next/commit/2722195817c571ae603c403a1884d41c26b9885f))
* fetch the full Weeb Central chapter list ([feea4f5](https://github.com/Ryuu3rs/AMR-Next/commit/feea4f52352450dc368cb6754fbbc1d1c7057be9))
* harden metadata + community servers ([d7e7518](https://github.com/Ryuu3rs/AMR-Next/commit/d7e751837a9d59671065d6e8fb3e13a6c04f1316))
* import legacy page bookmarks ([69cd6a5](https://github.com/Ryuu3rs/AMR-Next/commit/69cd6a5a44fa7c1b01c0f0081de063678da39948))
* import/merge/progress data-integrity holes ([0fd9f0f](https://github.com/Ryuu3rs/AMR-Next/commit/0fd9f0fa1d6e9396b04c21ec869607477cc656c7))
* make community reading-history sync opt-in ([7af5b9c](https://github.com/Ryuu3rs/AMR-Next/commit/7af5b9c4db0bdbee97affba3a3bc308cf82054c6))
* preserve and recover read position for numberless imports ([2df9a4e](https://github.com/Ryuu3rs/AMR-Next/commit/2df9a4e2c6d1e10f6c1909efa25c2c3f573ede6d))
* recover more read progress from legacy imports ([a4a8ebd](https://github.com/Ryuu3rs/AMR-Next/commit/a4a8ebda73705a0a479f960154a603074075e9d8))
* restore read progress when switching or reconciling a source ([3f416eb](https://github.com/Ryuu3rs/AMR-Next/commit/3f416ebc04ca451b52186b0cbc6ea0b60a9d455c))
* revert library/settings controls when their write fails ([933a211](https://github.com/Ryuu3rs/AMR-Next/commit/933a211a92067805ba9c843ff6b1b0be4736b1de))
* show read state for unnumbered titles like oneshots ([1ac8079](https://github.com/Ryuu3rs/AMR-Next/commit/1ac80793b78a540bd4b697bf92f1136780af03a1))

## [0.15.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.14.1...v0.15.0) (2026-07-31)


### Features

* add MangaKatana source ([d4958d7](https://github.com/Ryuu3rs/AMR-Next/commit/d4958d785460bab54f7d31aa72a5699f426c365f))


### Bug Fixes

* add parseMangaUrl to comix/asurascans/madara/mangastream ([eaffcb9](https://github.com/Ryuu3rs/AMR-Next/commit/eaffcb9918fc9d821476e03a2b58b5de66c32193))
* heal external-track metadata for URL-added titles ([702a03c](https://github.com/Ryuu3rs/AMR-Next/commit/702a03c7e747d517a3cfeccd1c53245e45c25ce6))

## [0.14.1](https://github.com/Ryuu3rs/AMR-Next/compare/v0.14.0...v0.14.1) (2026-07-31)


### Bug Fixes

* mangahub title added by URL no longer becomes "Chapter" ([eab4dec](https://github.com/Ryuu3rs/AMR-Next/commit/eab4dec941b473baecefbfa3f5c9ca30724aa9f5))

## [0.14.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.13.0...v0.14.0) (2026-07-24)


### Features

* confirm step before bulk-removing titles ([61632c2](https://github.com/Ryuu3rs/AMR-Next/commit/61632c2e2b5aec89ed63c953bb80a16184d95028))
* copy-paste failure log on the updates page ([936c5ee](https://github.com/Ryuu3rs/AMR-Next/commit/936c5ee104a8daca68979e6ec8cad738d768a4e5))
* select-all in bulk mode; harden the update failure log ([76aa8ec](https://github.com/Ryuu3rs/AMR-Next/commit/76aa8ec6b6335083c39af9a21dfe41a2eb466031))


### Bug Fixes

* address bug-hunt findings in the update/crawl/status code ([451de8b](https://github.com/Ryuu3rs/AMR-Next/commit/451de8b3055011fcdbcf39c1fd709bec0cfa7662))
* apply a waiting extension update instead of wedging on a long check ([fc717b1](https://github.com/Ryuu3rs/AMR-Next/commit/fc717b149b1c58cb18a9fec8b332043352eb4c00))
* bug-hunt findings - bulk-select data loss, first-track list, log input ([f2e738e](https://github.com/Ryuu3rs/AMR-Next/commit/f2e738e2689ecdfccfccd861e8b550982f5222e8))
* comix prev/next by addressing chapters via the number in the URL ([d973c4d](https://github.com/Ryuu3rs/AMR-Next/commit/d973c4dafe6facb44b45ccc7037a8eefac1e7bbe))
* converge-hunt findings - armed-remove snapshot, capture re-crawl, bulk tag ([dfd740f](https://github.com/Ryuu3rs/AMR-Next/commit/dfd740f72acf31542c0b42065a00ce9d728c6a56))
* drive unread indicators by chapter number, not chapter id ([5a1820e](https://github.com/Ryuu3rs/AMR-Next/commit/5a1820ef908fba799c0b6f245d3b0263266bebf9))
* harden the update-safety and unread-indicator fixes per red-team ([50a967e](https://github.com/Ryuu3rs/AMR-Next/commit/50a967efb15a7c452c7dbdefd33e69d3e38544bb))
* library toolbar wraps instead of running off the page ([619111e](https://github.com/Ryuu3rs/AMR-Next/commit/619111e182d302fab7f22157ed3efa95f4fe7b0a))
* marking a chapter read no longer opens a Webtoons tab crawl ([49d7a58](https://github.com/Ryuu3rs/AMR-Next/commit/49d7a58addb68fab003559698b3d63e786779bff))
* proactively clear stale update-progress on startup and install ([aaa7c06](https://github.com/Ryuu3rs/AMR-Next/commit/aaa7c06155958039c09dafd531f3a95f0e5c6ff9))
* round-3 bug-hunt - oneshot re-crawl, select-all delete scope, unicode ([024d866](https://github.com/Ryuu3rs/AMR-Next/commit/024d866f987a651b4726ff40b08dee4c707fd026))
* stop the Webtoons reader tab-crawl reopening on every live event ([e480209](https://github.com/Ryuu3rs/AMR-Next/commit/e480209aaa206839944e50d898cd99b78b075c7e))

## [0.13.0](https://github.com/Ryuu3rs/AMR-Next/compare/v0.12.0...v0.13.0) (2026-07-21)


### Features

* automated source-health tool (npm run health:sources) ([7a253d8](https://github.com/Ryuu3rs/AMR-Next/commit/7a253d81ca67738752879b401565a78436d5e4d9))
* repair fallback-tracked library entries, add backup-restore UI ([e7afcec](https://github.com/Ryuu3rs/AMR-Next/commit/e7afcec5b61ef5caaef52f59ae6b25cd570367cd))


### Bug Fixes

* 3 live-verified weebcentral bugs (chapters, series link, search) ([cd66dc3](https://github.com/Ryuu3rs/AMR-Next/commit/cd66dc34b60131fb847d16ad6d48136610662a90))
* 3 missing publishLive calls left open tabs silently stale ([8c7be92](https://github.com/Ryuu3rs/AMR-Next/commit/8c7be9283b106f6a76fae26729ebb4e40fb75ec0))
* 5 UI state bugs in the cleanup/backup Data-section tools ([4061883](https://github.com/Ryuu3rs/AMR-Next/commit/4061883711a0b3af4c5c0b3d2808b58d799aad32))
* align reading stats to local days and reconcile re-resolved downloads ([124c7ab](https://github.com/Ryuu3rs/AMR-Next/commit/124c7ab897c22531cd0ca8188c2d2f956ec53d9b))
* asurascans search endpoint dropped by /comics 301 to /browse ([255a345](https://github.com/Ryuu3rs/AMR-Next/commit/255a345e66f2827bbe1caf30ab9845525ec29b68))
* bulkRemove/bulkManual left stale UI state on partial failure ([8bb55b8](https://github.com/Ryuu3rs/AMR-Next/commit/8bb55b8edc1ee177693926ba5ce88ab95af55c76))
* chapter-cache latestChapterNumber gate missed genuine Chapter 0 ([3d09ea1](https://github.com/Ryuu3rs/AMR-Next/commit/3d09ea1866b55c0ba7d157dfa5920f8fcd79ebd1))
* correct mgeko search, mangafreak title, madara chapter order ([224e8eb](https://github.com/Ryuu3rs/AMR-Next/commit/224e8eb641c84d2687ab38f3b71f17755b7774be))
* kagane manual-switch tab fallback, admit unknown-count exact matches ([dc496d9](https://github.com/Ryuu3rs/AMR-Next/commit/dc496d9f0909362416d3ff7fbfc255243d6a373b))
* kagane stub-chapter sortKey no longer sorts before Chapter 1 ([62142a8](https://github.com/Ryuu3rs/AMR-Next/commit/62142a8faac5f17c6b79428c875670eef5540683))
* madara chapter list sortKey-0 fallback for unparseable titles ([e4cd399](https://github.com/Ryuu3rs/AMR-Next/commit/e4cd399e3b445cdbffa8a7a4d39806bc2322b471))
* madara title-split regex, dynasty-scans bonus-chapter sort order ([74d2a9a](https://github.com/Ryuu3rs/AMR-Next/commit/74d2a9a3e7140e42f52d3ff6a85c56d9910e71c9))
* make the v8 cover migration Firefox-safe against upgrade data loss ([6c662a9](https://github.com/Ryuu3rs/AMR-Next/commit/6c662a9f3795a8db92c57d1842f03f242371003d))
* malformed [--|] title-split regex in mangabuddy and mangastream ([5e6e466](https://github.com/Ryuu3rs/AMR-Next/commit/5e6e4664bab0c15945593b0d9f8595daa3342e59))
* mangafreak search endpoint and result-parsing bug ([568805b](https://github.com/Ryuu3rs/AMR-Next/commit/568805bdd41b29b0c2b16ed9a613f95fbce3a210))
* mangahub badge showing millions of unread chapters ([4f09c76](https://github.com/Ryuu3rs/AMR-Next/commit/4f09c7601559f8bc92afc7c604e2945a792e067a))
* mgeko.cc URL scheme migration from /comic/ to /manga/ ([3fba0e2](https://github.com/Ryuu3rs/AMR-Next/commit/3fba0e21d3f3c5ee03bb30ee1ee0e5f27b526002))
* olympustaff search dead due to relative-only href regex ([e17452b](https://github.com/Ryuu3rs/AMR-Next/commit/e17452b72365e78f73c386b50b469cfc0fa8077e))
* reader:resolve missing publishLive, last of the sibling handlers ([a6af691](https://github.com/Ryuu3rs/AMR-Next/commit/a6af69173bf4469528513e69d1f48d5261831957))
* retire 6 dead source domains; fix fanfox chapter list + age gate ([7c189a6](https://github.com/Ryuu3rs/AMR-Next/commit/7c189a60350d5f823fc7d7881c6c5f8b05ac2b7c))
* retire dead asuracomic adapter, harden mangahub slug matching ([3b71b20](https://github.com/Ryuu3rs/AMR-Next/commit/3b71b2079b789f5c84d31c7568a6d48fb272d468))
* retire dead likemanga adapter, duplicate of mgread ([abaddf6](https://github.com/Ryuu3rs/AMR-Next/commit/abaddf67fe9c107ffe78cda75ea2a48f13517e07))
* stale cleanup Undo banner surviving a manual backup restore ([639effe](https://github.com/Ryuu3rs/AMR-Next/commit/639effe24b3db670c23bc5787e9516c1d7f03a41))
* stop UNNUMBERED_SORT_KEY sentinel leaking into chapter selection ([8877b0d](https://github.com/Ryuu3rs/AMR-Next/commit/8877b0d3edc9b3a223cddd93b9b4aa34cf295a86))
* stop Webtoons reader Next reopening a background tab endlessly ([3d241ab](https://github.com/Ryuu3rs/AMR-Next/commit/3d241abc1d05dab207cecaa5e91a2aa3ade1a289))
* trackExternalChapter sortKey-0 fallback clobbered reading progress ([f5c9bf3](https://github.com/Ryuu3rs/AMR-Next/commit/f5c9bf3b2a05685d79b0c61182314982619dcee5))
* weebcentral chapter title leaking style/time markup ([2101ee9](https://github.com/Ryuu3rs/AMR-Next/commit/2101ee96bb239080403ad9f6d22065bae3b79830))
* weebcentral search titles contaminated with "Official" ribbon text ([a663f06](https://github.com/Ryuu3rs/AMR-Next/commit/a663f062347a54c081e689d532b39ed630d0b43d))
* wrap 5 multi-step Dexie writes in transactions, close 2 resurrection races ([0e690c2](https://github.com/Ryuu3rs/AMR-Next/commit/0e690c208128395faddd9fb12d8cbc481e6ff7d5))
* wrap chapter-cache.ts multi-step writes in transactions ([ab23fb1](https://github.com/Ryuu3rs/AMR-Next/commit/ab23fb1640079a8826c30e58e387bf4060869659))

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
