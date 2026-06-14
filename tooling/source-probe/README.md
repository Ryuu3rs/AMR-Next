# Source probe

Triage tool for manga mirror candidates. Answers: is the site reachable, does it
have anti-scrape protection (and how bad), what CMS/template is it, and is it
worth building an adapter for?

## Run

```bash
npm run probe -w @amr/source-probe
# or
node tooling/source-probe/probe.mjs
```

Writes `output/report.md` and `output/report.json` (gitignored). The CI workflow
`source-probe.yml` runs it on manual dispatch and uploads the report as an artifact.

## Adding sites

Append a row to `candidates.json`. No code changes needed:

```json
{ "url": "https://example.com/", "name": "Example", "priority": "community", "cmsGuess": "madara" }
```

## Verdict policy

- **green** (score ≥ 4): no/weak anti-scrape and a known template → add via the matching generic adapter.
- **yellow** (2–3): cookies/credentials or content-script extraction likely needed → revisit.
- **red** (≤ 1): hard Cloudflare / Turnstile / captcha, or unreachable → skip; prefer a Suwayomi route.

The score is a heuristic from the homepage only; confirm a real chapter page before committing to an adapter.
