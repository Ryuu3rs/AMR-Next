# Mirror probe report

Generated: 2026-06-14

Verdict policy: green (>=4) add via generic adapter · yellow (2–3) revisit with content-script/cookies · red (<=1) skip, prefer Suwayomi.

| verdict | score | site             | priority  | status | anti-scrape           | cms               | img hints | note                                         |
| ------- | ----- | ---------------- | --------- | ------ | --------------------- | ----------------- | --------- | -------------------------------------------- |
| green   | 5     | MangaRead        | core      | 200    | —                     | madara, wordpress | no        | supported adapter; src-over-data-src         |
| green   | 5     | Mgeko            | core      | 200    | —                     | —                 | no        | supported adapter                            |
| green   | 5     | Manga Demon      | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Demonic Scans    | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Freak Scans      | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Drake Comic      | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | ManhuaPlus       | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Rawkuma          | community | 200    | —                     | —                 | no        | raw, mixed JP/KR/CN                          |
| green   | 5     | NamiComi         | community | 200    | —                     | —                 | no        | flaky, react app                             |
| green   | 5     | Thunder Scans EN | community | 200    | —                     | wordpress         | no        |                                              |
| green   | 5     | NIFTeam          | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | MangaWorld (ITA) | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Juinjutsu Reader | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Phoenix Scans    | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Arya Scans       | community | 200    | —                     | madara, wordpress | no        |                                              |
| green   | 5     | Novelmic         | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Spider Scans     | community | 200    | —                     | wordpress         | no        |                                              |
| green   | 5     | AGR Comics       | community | 200    | —                     | —                 | no        |                                              |
| green   | 5     | Comikey          | community | 200    | —                     | —                 | no        | official, JSON api at /sapi/                 |
| green   | 4     | MangaPuma        | community | 502    | —                     | —                 | no        |                                              |
| green   | 4     | MangaMirror      | community | 502    | —                     | —                 | no        |                                              |
| yellow  | 2     | Weeb Central     | community | 200    | cloudflare            | —                 | no        |                                              |
| yellow  | 2     | Nyanu Kafe       | community | 200    | captcha               | —                 | no        |                                              |
| yellow  | 2     | MangaFire        | community | 200    | cloudflare, turnstile | —                 | no        |                                              |
| red     | 1     | MangaHub         | core      | 403    | cloudflare            | —                 | no        |                                              |
| red     | 1     | Mangaclash       | core      | 403    | cloudflare            | —                 | no        |                                              |
| red     | 1     | ToonGod          | community | 403    | cloudflare            | —                 | no        | cloudflare turnstile reported                |
| red     | 1     | Kappa Beast      | community | 403    | cloudflare            | —                 | no        |                                              |
| red     | 0     | Toonclash        | core      | —      | —                     | —                 | no        | AbortError: This operation was aborted       |
| red     | 0     | Arven Scans      | community | —      | —                     | —                 | no        | TypeError: fetch failed                      |
| red     | 0     | Arven Comics     | community | —      | —                     | —                 | no        | TypeError: fetch failed                      |
| red     | 0     | Cypher Scans     | community | —      | —                     | —                 | no        | TypeError: fetch failed                      |
| red     | 0     | Rizz Fables      | community | —      | —                     | —                 | no        | 403 on chromium scrape, cloudflare suspected |
| red     | 0     | WeebDex          | community | —      | —                     | —                 | no        | TypeError: fetch failed                      |
| red     | 0     | Bato.to          | community | —      | —                     | —                 | no        | mirrors: bato.ac/.bz/.cc/.cx/.day            |
