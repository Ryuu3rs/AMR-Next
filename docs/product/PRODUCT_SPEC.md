# AMR Product And Interface Specification

Last updated: 2026-06-09

## Active Scope

Reader, library, search, updates, local achievements, statistics, and local share cards
are active extension scope.

Profile, friends, and leaderboard sections are retained as future product notes only.
They are not scheduled and must not introduce server dependencies into current work.

## Navigation Model

The full extension page uses a left navigation rail on desktop and a bottom navigation
bar on narrow screens.

Primary items:

1. Home
2. Library
3. Search
4. Updates
5. Achievements
6. Profile

Secondary items:

1. Sources
2. Import and Export
3. Settings
4. Help and Diagnostics

Profile is hidden until online features are enabled. Achievements remain available
locally.

## Popup

Width: 380 px. Maximum height: 600 px.

### Header

- AMR icon and name
- update status dot
- settings icon

Tooltips:

- status dot: `All sources checked 12 minutes ago`
- settings: `Open AMR settings`

### Current Page Card

Supported manga page:

- title
- source
- `Add to library`
- `Open chapters`

Supported chapter page:

- title and chapter
- `Read in AMR`
- library state
- `Remove from library` in overflow menu

Unsupported page:

- `This page is not supported`
- `Try add by URL`
- `Request a source`

Auto-added chapter:

- notice: `Added to your library`
- actions: `Undo`, `View`

### Continue Reading

Show the most recently read item:

- cover
- title
- chapter
- progress
- `Continue`

### Footer Actions

- `Open AMR`
- `Search`
- `Check updates`

## Home

Sections:

- Continue reading
- New chapters
- Recently added
- Current reading goal
- Recent achievement
- Source health warning, only when action is required

Home has no charts by default.

Empty state:

- heading: `Your reading shelf is empty`
- body: `Search supported sources or open a manga chapter to add it automatically.`
- actions: `Search manga`, `Add by URL`

## Library

### Top Bar

- text search
- view selector: list or grid
- sort menu
- filter button
- multi-select button
- `Add by URL`

Search placeholder: `Search title, source, tag, or chapter`

### Sort Menu

- Last read
- Recently updated
- Recently added
- Title A-Z
- Unread chapters
- Completion

Tooltip: `Choose how manga are ordered`

### Filters

- Status: Reading, Plan to read, Paused, Completed, Dropped
- Update state: New chapters, Up to date, Check failed
- Source
- Language
- Tags
- Adult content
- Archived source

Actions:

- `Apply filters`
- `Clear all`
- `Save as view`

### List Row

- cover
- title
- source and language
- last read chapter
- latest chapter
- unread badge
- progress bar
- primary `Continue` or `Start`
- overflow menu

Overflow menu:

- Open details
- View chapters
- Mark latest chapter read
- Mark all unread
- Change status
- Edit tags
- Refresh
- Open source page
- Export item
- Remove from library

Removal requires confirmation and offers:

- remove library entry only
- also remove history and bookmarks

### Multi-Select Bar

- Mark read
- Change status
- Add tag
- Refresh
- Export
- Remove
- Cancel

## Manga Details

Header:

- cover
- title
- alternate title
- source
- language
- status
- `Continue reading`
- library status selector
- favorite toggle
- overflow menu

Tabs:

1. Chapters
2. Details
3. History
4. Bookmarks
5. Sources

Chapter row:

- chapter title and number
- release date when available
- read state
- bookmark state
- last page when partially read
- `Read`

Chapter menu:

- Mark read or unread
- Open source page
- Bookmark chapter
- Copy link
- Report broken chapter

## Search

### Search Controls

- query input
- source chips
- language filter
- adult-content filter
- cancel button while active

Placeholder: `Search manga across enabled sources`

Search starts after Enter or a 350 ms stable query. Queries under two characters do not
run.

### Result Group

Group normalized exact titles only. Do not guess aggressively.

Each group:

- title
- cover when available
- available sources count
- source rows

Source row:

- source name
- language
- status
- latest chapter when available
- `Add`
- `Open`

After add:

- button changes to `Added`
- secondary action becomes `Read`

### Search Status

Compact status strip:

- `4 of 6 sources complete`
- `2 sources need attention`
- `View details`

Source error detail:

- permission required
- login or Cloudflare required
- timed out
- source unavailable
- parser needs update

Never expose stack traces in normal UI.

## Add By URL

Fields:

- URL
- optional display name
- optional source selector when matching is ambiguous

Flow:

1. Normalize URL.
2. Match known adapters.
3. If known, load manga metadata and chapter list.
4. If unknown, test generic adapter templates.
5. Show detected title, source, and chapter count.
6. User confirms.

Actions:

- `Detect manga`
- `Add to library`
- `Open source`
- `Advanced site setup`

Error copy:

- `This URL is not a manga or chapter page`
- `AMR needs permission to access this site`
- `The site layout is not recognized`
- `The site requires a dedicated source adapter`

## Generic Site Setup

This feature supports common static and CMS layouts without arbitrary code.

Wizard:

1. Site identity
2. Manga page selectors
3. Chapter list selectors
4. Reader image selectors
5. Preview
6. Save locally

Allowed inputs:

- domains
- CSS selectors
- attribute names
- URL resolution rules
- pagination selector
- ordering rule
- language
- optional fixed request headers from an allowlist

Forbidden:

- JavaScript
- regular expressions with unsafe complexity
- arbitrary request bodies
- cookie extraction
- unrestricted header injection

Tooltip for selector:

`Choose the page element containing this value. AMR stores only the selector.`

Locally created site templates can be exported for review. They are never distributed
to other users without code review and signing.

## Reader

### Entry Behavior

Default:

- supported chapter pages show a small `Read in AMR` chip
- auto-open can be enabled per source
- reading a chapter auto-adds the manga unless disabled

The original page is not destroyed. The reader opens in an extension tab using resolved
chapter data. This avoids CSS conflicts and makes exit reliable.

### Top Bar

Left:

- back to source
- manga title
- chapter title

Center:

- page position
- load status

Right:

- previous chapter
- next chapter
- bookmark
- view mode
- settings
- fullscreen
- close

Tooltips:

- back: `Open the original chapter page`
- bookmark: `Bookmark this page`
- view mode: `Change reading mode`
- fullscreen: `Enter fullscreen`
- close: `Return to your previous tab`

### Reading Modes

Continuous:

- vertical pages
- optional page gap
- fit width
- maximum width

Single page:

- left-to-right or right-to-left
- fit width or height
- click zones

Double page:

- optional later feature
- cover-page offset
- automatic landscape spread detection

Webtoon:

- minimal page gap
- full available width
- aggressive near-viewport preload

### Reader Settings Drawer

Sections:

View:

- Continuous
- Single page
- Double page
- Webtoon

Sizing:

- Fit width
- Fit height
- Original size
- custom width slider

Navigation:

- reading direction
- click zones
- scroll amount
- keyboard shortcuts

Appearance:

- black, charcoal, warm gray, white
- hide toolbar while reading
- page gap
- reduced motion

Loading:

- preload pages: 1 to 10
- data saver
- retry failed pages automatically

Actions:

- Reset chapter settings
- Use for this manga
- Use as global default

### Keyboard Shortcuts

- Left or Right: previous or next page in single-page mode
- J or K: next or previous page
- N or P: next or previous chapter
- F: fullscreen
- M: toggle reader menu
- B: bookmark current page
- S: open settings
- Escape: close drawer, then exit fullscreen
- `?`: shortcut help

Shortcuts do not run inside inputs, selects, or editable content.

### Reader Errors

Page error card:

- `This page could not be loaded`
- `Retry`
- `Open image`
- `Report`

Chapter error:

- `AMR could not resolve this chapter`
- `Retry`
- `Open original page`
- `Copy diagnostic ID`

## Updates

Header:

- `Check now`
- last successful check
- schedule selector

Groups:

- New chapters
- Check failed
- Up to date

Bulk actions:

- Mark visible as read
- Refresh failed
- Open next unread

Update intervals:

- Manual only
- Every 6 hours
- Every 12 hours
- Daily

The extension uses browser alarms. It does not promise exact execution time.

## Sources

Each source row:

- icon and name
- language
- enabled state
- permission state
- last successful operation
- health status
- actions menu

Actions:

- Enable or disable
- Grant or remove permission
- Test search
- Test chapter
- View supported domains
- Reset source data
- Report issue

Health states:

- Healthy
- Slow
- Permission required
- Login required
- Site changed
- Offline
- Disabled

## Achievements

Achievements are calculated locally first.

Categories:

- Getting started
- Chapters read
- Series completed
- Reading streaks
- Source explorer
- Genre explorer
- Night reader
- Early reader
- Weekend marathon
- Bookmarker
- Library curator
- Hidden seasonal achievements

Examples:

- First Chapter: read one chapter
- Shelf Starter: add five manga
- Page Turner: read 100 chapters
- Century Shelf: add 100 manga
- Source Hopper: read from five sources
- Seven Day Streak: read on seven consecutive local dates
- Completionist: finish ten series
- Night Owl: read 25 chapters between 00:00 and 05:00 local time

Achievement card:

- name
- description
- icon
- progress
- unlocked date
- rarity, only when online statistics are enabled
- `Share`

Achievement notification:

- small toast after chapter completion
- never blocks navigation
- can be disabled

## Statistics And Records

Local metrics:

- chapters read
- pages viewed
- active reading days
- current and longest streak
- completed manga
- reading time
- top sources
- top languages
- monthly activity

Reading time rules:

- count only when reader tab is visible
- pause after 90 seconds without input or progress
- cap one chapter session at a configurable maximum
- do not count loading time

Share card controls:

- date range
- metrics
- theme
- display name
- hide title history

Generated cards contain no private titles unless selected.

## Profile And Friends

Profile fields:

- display name
- avatar
- bio
- favorite genres
- public achievements
- public aggregate statistics
- privacy level

Privacy:

- Private
- Friends only
- Public

Never expose the reading library by default.

Friend features:

- search exact username
- send request
- accept, decline, block
- view shared achievements
- compare opted-in aggregate stats

No direct messaging in the first online release.

## Leaderboards

Boards:

- friends this week
- verified chapters this month
- longest verified streak
- seasonal challenges
- achievement points

Do not rank raw reading time globally because it encourages idle farming.

Labels:

- Verified
- Imported
- Offline

Only verified events count toward competitive boards.

## Settings

Sections:

1. General
2. Reader
3. Library
4. Updates
5. Sources
6. Achievements
7. Account and Sync
8. Privacy
9. Accessibility
10. Data
11. Diagnostics
12. About

### General

- theme
- language
- open links in new tab
- auto-add on chapter visit
- auto-open reader

### Privacy

- analytics consent
- crash report consent
- source health contribution
- public profile
- leaderboard participation
- clear remote activity

### Diagnostics

- run self-test
- export redacted diagnostic bundle
- copy installation ID
- view recent local errors
- reset extension

Destructive reset requires typed confirmation: `RESET`.
