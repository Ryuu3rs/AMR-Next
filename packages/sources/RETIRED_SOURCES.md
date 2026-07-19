# Retired Sources

Sources are commented out (not deleted) so they can be re-enabled with a one-line uncomment.

## Re-enabling a retired source

1. Uncomment the config line in its `*-sites.ts` file (or `index.ts` for standalone adapters)
2. Uncomment the permission origins in `apps/extension/src/permissions.ts`
3. Run `npm run build && npm run build:firefox` from `apps/extension/`
4. Test a live chapter and a search before shipping

---

## Currently Retired

The authoritative list of retired sources is the commented-out config rows themselves,
each carrying a dated reason:

- `packages/sources/src/madara-sites.ts`, `mangastream-sites.ts`, `mangabuddy-sites.ts`,
  `fanfox-sites.ts` (family config rows)
- `packages/sources/src/index.ts` (standalone adapters)

A hand-maintained table here drifted out of sync, so it was removed rather than kept as a
second source of truth. To see what is retired and why, grep those files for `retired`.

To find sources that have newly gone dead/hijacked/migrated, run `npm run health:sources`
(see below).

---

## Source file locations

| Family        | Config file                                 | Standalone adapter               |
| ------------- | ------------------------------------------- | -------------------------------- |
| Madara        | `packages/sources/src/madara-sites.ts`      | -                                |
| MangaStream   | `packages/sources/src/mangastream-sites.ts` | -                                |
| MangaBuddy    | `packages/sources/src/mangabuddy-sites.ts`  | -                                |
| FanFox family | `packages/sources/src/fanfox-sites.ts`      | -                                |
| Standalone    | `packages/sources/src/index.ts`             | `packages/sources/src/<name>.ts` |

Permissions: `apps/extension/src/permissions.ts`

---

## Detecting broken sources

Run `npm run health:sources` (tooling/source-health). It probes every registered adapter's
real endpoints and classifies each as healthy / unreachable / redirected-away / hijacked /
engine-migrated / bot-blocked / parse-broken, writing a report with an action hint per source.
A verdict of redirected-away / hijacked / unreachable on two consecutive runs means retire;
engine-migrated means the site changed CMS (retire, optionally rewrite); parse-broken usually
means the fixture drifted (re-capture and fix the adapter together).

To spot-check by hand:

1. Does the homepage load? `curl -L https://site.com/`
2. Does a manga page return HTML? `curl -L https://site.com/manga/example/`
3. Does a chapter page return images in the HTML?

If step 1 fails, the site is down (retire).
If step 3 fails but 1-2 work, the adapter needs tuning (don't retire, open an issue).
