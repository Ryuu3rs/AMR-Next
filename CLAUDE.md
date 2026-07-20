# AMR-Next

Browser extension (Chromium + Firefox), npm workspaces, wxt + Svelte, vitest.

## Before you commit

A husky pre-commit hook runs `lint-staged` -> `prettier --write` on staged
files. Never pass `--no-verify`. If the hook did not run, `npm run prepare`.

Before saying a change is done, run the same gate CI runs:

```
npm run check
```

That is `format:check && lint && typecheck && build && build:firefox && test`.
Both browser builds matter; a change can pass Chromium and break Firefox.

`format:check` is trustworthy locally. It used to report ~31 false failures on
Windows because `core.autocrlf=true` gave a CRLF working tree while Prettier
expects LF. `.gitattributes` pins the tree to LF, so local output now matches
CI exactly. Do not "fix" that file; without it the check goes back to being
noise and real breaks hide in it.

## Verifying a CI failure

Read the actual job log before theorising:

```
gh run list --limit 5 --branch main
gh api "repos/{owner}/{repo}/actions/jobs/<jobId>/logs"
```

Local reproductions of formatting failures are unreliable on Windows - both
`git archive | tar -x` and PowerShell's `Out-String` silently reintroduce CRLF
and will manufacture failures that do not exist in CI. The job log is the only
ground truth. A green run can still carry warnings; a warning is not a failure.

## Conventions

- Conventional Commits; release-please owns versions and CHANGELOG. Never hand-edit
  `.release-please-manifest.json` or bump versions manually.
- No AI attribution in commits or PRs (no `Co-Authored-By`, no "Generated with").
- No comments restating what the code says; no back-compat shims for deleted code.
- Dependabot keeps GitHub Actions current. Do not pin workflows back to older
  majors to dodge a bump - read the release notes and fix forward.

## Releasing

See `RELEASING.md`. Every GitHub release needs both the Chrome and Firefox zips
attached, and hand-written release notes - the generated ones are incomplete.
