# Retired Sources

Sources are commented out (not deleted) so they can be re-enabled with a one-line uncomment.

## Re-enabling a retired source

1. Uncomment the config line in its `*-sites.ts` file (or `index.ts` for standalone adapters)
2. Uncomment the permission origins in `apps/extension/src/permissions.ts`
3. Run `npm run build && npm run build:firefox` from `apps/extension/`
4. Test a live chapter and a search before shipping

---

## Currently Retired

| ID            | Name        | Family      | Retired | Reason                                                                     |
| ------------- | ----------- | ----------- | ------- | -------------------------------------------------------------------------- |
| `mangabuddy`  | MangaBuddy  | MangaBuddy  | 2026-06 | Site down                                                                  |
| `mangapuma`   | MangaPuma   | MangaBuddy  | 2026-06 | Site down                                                                  |
| `mangamirror` | MangaMirror | MangaBuddy  | 2026-06 | Site down                                                                  |
| `drakecomic`  | Drake Comic | MangaStream | 2026-06 | Site down                                                                  |
| `kunmanga`    | KunManga    | Madara      | 2026-06 | Site down                                                                  |
| `casacomic`   | Casa Comic  | Madara      | 2026-06 | Site down                                                                  |
| `saucemanhwa` | SauceManhwa | Madara      | 2026-06 | Site down                                                                  |
| `harimanga`   | HariManga   | Madara      | 2026-06 | Site down                                                                  |
| `agrcomics`   | AGR Comics  | Madara      | 2026-06 | Site down                                                                  |
| `manhuatop`   | ManhuaTop   | Madara      | 2026-06 | Returns 403 on fetch + ad-redirect gate in browser; chapter loading broken |
| `mangapark`   | MangaPark   | Standalone  | 2026-06 | Site down                                                                  |
| `manganato`   | MangaNato   | Standalone  | 2026-06 | `chapmanganato.to` down; `manganato.com` hijacked by SpinzyWheel           |

---

## Source file locations

| Family        | Config file                                 | Standalone adapter               |
| ------------- | ------------------------------------------- | -------------------------------- |
| Madara        | `packages/sources/src/madara-sites.ts`      | —                                |
| MangaStream   | `packages/sources/src/mangastream-sites.ts` | —                                |
| MangaBuddy    | `packages/sources/src/mangabuddy-sites.ts`  | —                                |
| FanFox family | `packages/sources/src/fanfox-sites.ts`      | —                                |
| Standalone    | `packages/sources/src/index.ts`             | `packages/sources/src/<name>.ts` |

Permissions: `apps/extension/src/permissions.ts`

---

## Detecting broken sources

Run the source probe (or manually test) by checking:

1. Does the homepage load? `curl -L https://site.com/`
2. Does a manga page return HTML? `curl -L https://site.com/manga/example/`
3. Does a chapter page return images in the HTML?

If step 1 fails → site is down (retire).
If step 3 fails but 1-2 work → adapter needs tuning (don't retire, open an issue).
