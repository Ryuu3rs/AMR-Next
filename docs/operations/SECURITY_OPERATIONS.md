# AMR Security, Testing, And Releases

Last updated: 2026-06-09

## Security Model

Threats include:

- hostile source pages
- changed or compromised source sites
- malicious HTML and script data
- excessive extension permissions
- unsafe generic source templates
- dependency compromise
- leaked diagnostics

## Extension Security

- Manifest V3
- no remote executable code
- no `eval`, `new Function`, or injected remote scripts
- strict Content Security Policy
- host permissions requested per source
- no global host permission at installation
- minimal content scripts
- sender and payload validation for runtime messages
- HTML parsed as data
- no unsanitized HTML rendering
- tokens and secrets never sent to content scripts
- response size, redirect, retry, and timeout limits
- generic templates are declarative and validated

## Privacy

Default:

- no account
- no telemetry
- no remote reading history
- no title-level diagnostics

Optional future diagnostics require separate consent.

Local diagnostic exports remove:

- cookies
- authorization headers
- tokens
- sensitive query parameters
- raw HTML
- manga titles when privacy mode is enabled

## Autonomous Testing

The extension must be installable and testable without manual user action.

### Pull Request Checks

1. formatting
2. lint
3. TypeScript
4. unit tests
5. adapter fixtures
6. Chromium build
7. Firefox build
8. manifest policy checks
9. Chromium browser smoke test
10. Firefox browser smoke test
11. dependency and secret scans

### Nightly Checks

- full browser suite
- long-chapter memory test
- large-library performance test
- live source canaries
- accessibility scan
- previous-release upgrade test

### Chromium Harness

- Playwright persistent Chromium context
- unpacked extension loaded from build output
- extension ID discovered automatically
- popup and application pages controlled directly
- fixture source server
- trace, screenshots, video, console, worker logs, and HAR

### Firefox Harness

- Firefox package built first
- temporary profile
- extension installed through `web-ext`
- browser controlled through geckodriver and WebDriver
- test-only diagnostics page in development builds
- browser console, extension logs, screenshots, and profile logs

Playwright is not used as a substitute for Firefox extension installation.

## Fixture Source Server

Deterministic cases:

- manga page
- chapter list
- direct images
- page-per-image flow
- delayed response
- HTTP errors
- malformed HTML
- login wall
- challenge interstitial
- changed selector
- hotlink header requirement

Critical behavior must be testable without live third-party sites.

## Logging

Structured fields:

- timestamp
- level
- area
- operation
- source ID
- request ID
- duration
- error code
- extension version
- browser

Storage:

- in-memory ring buffer
- bounded local error buffer
- CI artifacts

Production logs exclude raw HTML, cookies, tokens, and sensitive URLs.

## Failed Test Artifacts

- test report
- trace
- screenshots
- video where supported
- console logs
- background logs
- fixture server logs
- redacted storage snapshot
- generated manifest
- extension package

## Source Health

Each source has:

- fixture tests
- one or more live canary URLs
- expected timing
- parser version

Nightly status:

- healthy
- slow
- blocked
- permission changed
- parser changed
- offline

Repeated failures create or update one GitHub issue per source.

## Distribution

GitHub Releases is the active distribution mechanism.

### Chromium

- build unpacked extension
- create ZIP
- attach ZIP and checksum to GitHub Release
- user extracts and loads it through developer mode
- updates are manual

### Firefox

- build XPI
- sign through Mozilla's unlisted signing process when required
- attach signed XPI and checksum to GitHub Release
- updates are manual unless a later approved signing and update mechanism is added

### Release Check

The extension may check GitHub Release metadata and show:

- current version
- available version
- release date
- `Open download page`
- `Remind me later`

It never performs an executable update.

## Release Channels

- nightly: GitHub Actions artifacts
- beta: GitHub prerelease
- stable: GitHub Release

## Release Workflow

1. merge to active branch
2. CI passes
3. version and changelog updated
4. tag created
5. Chromium and Firefox packages built
6. Firefox package signed when configured
7. SHA-256 checksums generated
8. GitHub Release created
9. smoke installation checks run against release artifacts

## Supply Chain

- lockfile required
- dependency updates reviewed
- secret scanning
- dependency review
- static analysis
- pinned GitHub Actions
- production license review

Current exception:

- WXT 0.20.26 uses `web-ext-run` development dependencies with published npm
  advisories.
- They are not included in extension bundles.
- Incompatible overrides are not permitted.
- Recheck and remove this exception when WXT updates its runner dependency tree.

## Recovery

- preserve the previous release artifacts
- retain migration tests for every schema
- keep data export compatible
- publish a fixed release rather than remotely changing code
- direct users to the previous GitHub Release when a release is withdrawn
