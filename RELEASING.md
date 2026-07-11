# Releasing

Releases are fully automated via [release-please](https://github.com/googleapis/release-please) and
`.github/workflows/release-please.yml`. There is exactly one way to ship a release:

1. Merge the open "chore(main): release X.Y.Z" PR that release-please keeps up to date on `main`
   (title/version/changelog are generated from conventional commit messages since the last release).
2. That merge triggers the `release-please` job: it tags, creates the GitHub release, builds both
   extensions fresh from the tagged commit, runs the full `npm run check` gate, zips, checksums, and
   uploads the Chrome + Firefox zips + `SHA256SUMS.txt` to the release.
3. A separate `amo-submit` job then runs, gated behind the `amo` GitHub Environment — this requires a
   manual approval click in the Actions run before it submits the Firefox build to AMO. Approve it once
   the release assets look right.
4. AMO submission goes to Mozilla's review queue (`--channel=listed`). It is usually auto-approved
   within minutes but can take longer for a human review — the job's job is "submit successfully," not
   "get published instantly." Once approved on Mozilla's side, the signed `.xpi` is also attached to the
   GitHub release automatically.

## Do NOT do these things

- **Never run `gh release create` by hand.** It desyncs `.release-please-manifest.json` from reality —
  this is exactly what happened for v0.9.2 through v0.9.10 this repo shipped, and required a manual
  repair commit to fix before release-please's PR could compute correct version numbers again.
- **Never bump `package.json` version by hand.** release-please owns both root `package.json` and
  `apps/extension/package.json` (via `extra-files` in `release-please-config.json`) — manual edits will
  be overwritten or cause a version mismatch that fails the workflow's "Version/tag check" step.
- **Never run `npx web-ext sign` from a local terminal with pasted credentials.** The `amo-submit` job
  does this from repo secrets (`AMO_JWT_ISSUER` / `AMO_JWT_SECRET`) behind the `amo` environment's
  approval gate — that's the only place AMO credentials should ever be used.

## Why it's split into two jobs

If AMO submission fails or times out, the GitHub release (with its build assets) has already been
created and uploaded by the `release-please` job — Chrome users are never blocked by an AMO hiccup.
The `amo` environment approval is a genuine human checkpoint before anything is pushed to Mozilla's
review queue (submissions can't reuse a version number, so a bad submission isn't cheaply retriable).

## Local dev builds

`npm run build` / `npm run build:firefox` / `npm run zip` / `npm run zip:firefox` still work locally for
testing — they're just no longer how a real release gets shipped. `apps/extension/.env` needs
`VITE_COMMUNITY_API_ORIGIN` set locally (see `.env.example`); CI gets the same value from the
`VITE_COMMUNITY_API_ORIGIN` repository variable.
