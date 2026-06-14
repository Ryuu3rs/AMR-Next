import type {
    ChapterPagesResponse,
    DashboardOverviewResponse,
    DiscoverResponse,
    MangaChapter,
    MangaChapterPage,
    MangaDetail,
    MangaSourceLink,
    RecommendationItem,
    UserLibraryEntry
} from "@amr-next/contracts"
import "./styles.css"

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787"

type State = {
    status: string
    query: string
    selectedStatus: "any" | "ongoing" | "completed" | "hiatus" | "cancelled"
    selectedSort: "relevance" | "updated" | "title" | "sources"
    selectedGenre: string | null
    selectedTheme: string | null
    dashboard: DashboardOverviewResponse | null
    discover: DiscoverResponse | null
    selectedManga: MangaDetail | null
    selectedChapters: MangaChapter[]
    selectedSources: MangaSourceLink[]
    selectedReaderChapter: MangaChapter | null
    readerMode: ChapterPagesResponse["mode"] | null
    readerPages: MangaChapterPage[]
    readerPageCursor: number
    library: UserLibraryEntry[]
    recommendations: RecommendationItem[]
    updates: Array<{
        mangaId: string
        latestChapterId: string
        latestChapterNumber: string
        latestChapterTitle: string
        releasedAt: string
    }>
}

const state: State = {
    status: "Booting...",
    query: "",
    selectedStatus: "any",
    selectedSort: "relevance",
    selectedGenre: null,
    selectedTheme: null,
    dashboard: null,
    discover: null,
    selectedManga: null,
    selectedChapters: [],
    selectedSources: [],
    selectedReaderChapter: null,
    readerMode: null,
    readerPages: [],
    readerPageCursor: 1,
    library: [],
    recommendations: [],
    updates: []
}

const mount = document.querySelector<HTMLDivElement>("#app")
if (!mount) throw new Error("App mount point not found")
const app: HTMLDivElement = mount
let keyboardBound = false

const esc = (value: string): string =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

async function apiGet<T>(path: string): Promise<T> {
    const response = await fetch(`${apiBase}${path}`)
    if (!response.ok) throw new Error(`GET ${path} failed (${response.status})`)
    return (await response.json()) as T
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`POST ${path} failed (${response.status})`)
    return (await response.json()) as T
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`PATCH ${path} failed (${response.status})`)
    return (await response.json()) as T
}

function discoverPath(): string {
    const params = new URLSearchParams()
    if (state.query.trim()) params.set("q", state.query.trim())
    if (state.selectedGenre) params.set("genres", state.selectedGenre)
    if (state.selectedTheme) params.set("themes", state.selectedTheme)
    if (state.selectedStatus !== "any") params.set("status", state.selectedStatus)
    params.set("sort", state.selectedSort)
    params.set("page", "1")
    params.set("pageSize", "30")
    return `/v1/discover?${params.toString()}`
}

async function loadDiscover(): Promise<void> {
    state.discover = await apiGet<DiscoverResponse>(discoverPath())
}

async function loadLibrary(): Promise<void> {
    const payload = await apiGet<{ items: UserLibraryEntry[] }>("/v1/users/me/library")
    state.library = payload.items
}

async function loadRecommendations(): Promise<void> {
    const payload = await apiGet<{ items: RecommendationItem[] }>("/v1/users/me/recommendations")
    state.recommendations = payload.items
}

async function loadUpdates(): Promise<void> {
    const payload = await apiGet<{
        items: Array<{
            mangaId: string
            latestChapterId: string
            latestChapterNumber: string
            latestChapterTitle: string
            releasedAt: string
        }>
    }>("/v1/users/me/updates")
    state.updates = payload.items
}

async function loadDashboard(): Promise<void> {
    state.dashboard = await apiGet<DashboardOverviewResponse>("/v1/dashboard")
}

function getLibraryEntry(mangaId: string): UserLibraryEntry | null {
    return state.library.find(entry => entry.mangaId === mangaId) ?? null
}

function upsertLocalLibrary(entry: UserLibraryEntry): void {
    const index = state.library.findIndex(item => item.mangaId === entry.mangaId)
    if (index >= 0) {
        state.library[index] = entry
    } else {
        state.library.unshift(entry)
    }
}

async function ensureLibraryEntry(mangaId: string): Promise<void> {
    if (getLibraryEntry(mangaId)) return
    const created = await apiPost<UserLibraryEntry>("/v1/users/me/library", {
        mangaId,
        status: "reading",
        notifyOnUpdate: true
    })
    upsertLocalLibrary(created)
}

async function syncReaderProgress(mangaId: string, chapterId: string, page: number): Promise<void> {
    const next = await apiPatch<UserLibraryEntry>(`/v1/users/me/library/${encodeURIComponent(mangaId)}`, {
        status: "reading",
        lastReadChapterId: chapterId,
        lastReadPage: page
    })
    upsertLocalLibrary(next)
    if (state.dashboard) {
        const existing = state.dashboard.continueReading.find(item => item.mangaId === mangaId)
        if (existing) {
            existing.lastReadChapterId = chapterId
            existing.lastReadPage = page
            existing.status = "reading"
        }
    }
}

async function openManga(mangaId: string): Promise<void> {
    state.selectedManga = await apiGet<MangaDetail>(`/v1/manga/${encodeURIComponent(mangaId)}`)
    const [chapters, sources] = await Promise.all([
        apiGet<{ mangaId: string; items: MangaChapter[] }>(`/v1/manga/${encodeURIComponent(mangaId)}/chapters`),
        apiGet<{ mangaId: string; items: MangaSourceLink[] }>(`/v1/manga/${encodeURIComponent(mangaId)}/sources`)
    ])
    state.selectedChapters = chapters.items
    state.selectedSources = sources.items
    state.selectedReaderChapter = null
    state.readerMode = null
    state.readerPages = []
    state.readerPageCursor = 1

    const resume = getLibraryEntry(mangaId)
    if (resume?.lastReadChapterId) {
        await openReaderChapter(mangaId, resume.lastReadChapterId, resume.lastReadPage ?? 1, false)
    }
    await apiPost("/v1/users/me/events", { type: "view_manga", mangaId })
}

async function openReaderChapter(
    mangaId: string,
    chapterId: string,
    resumePage = 1,
    persistProgress = true
): Promise<void> {
    const chapter = state.selectedChapters.find(item => item.id === chapterId) ?? null
    if (!chapter) return
    await ensureLibraryEntry(mangaId)
    const payload = await apiGet<ChapterPagesResponse>(
        `/v1/manga/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}/pages`
    )
    state.selectedReaderChapter = chapter
    state.readerMode = payload.mode
    state.readerPages = payload.items
    state.readerPageCursor = Math.max(1, Math.min(resumePage, Math.max(1, payload.items.length)))
    if (persistProgress) {
        await syncReaderProgress(mangaId, chapterId, state.readerPageCursor)
    }
}

async function followManga(mangaId: string): Promise<void> {
    await apiPost("/v1/users/me/library", {
        mangaId,
        status: "following",
        notifyOnUpdate: true
    })
    await loadLibrary()
    await loadDashboard()
    await loadRecommendations()
    await loadUpdates()
}

async function markRead(mangaId: string, chapterId: string): Promise<void> {
    await ensureLibraryEntry(mangaId)
    const entry = await apiPatch<UserLibraryEntry>(`/v1/users/me/library/${encodeURIComponent(mangaId)}`, {
        lastReadChapterId: chapterId,
        lastReadPage: null,
        status: "reading"
    })
    upsertLocalLibrary(entry)
    await apiPost("/v1/users/me/events", { type: "read_chapter", mangaId, chapterId })
    await loadDashboard()
    await loadUpdates()
}

async function moveReader(delta: number): Promise<void> {
    if (!state.selectedManga || !state.selectedReaderChapter || state.readerPages.length === 0) return
    const next = Math.max(1, Math.min(state.readerPageCursor + delta, state.readerPages.length))
    if (next === state.readerPageCursor) return
    state.readerPageCursor = next
    await syncReaderProgress(state.selectedManga.id, state.selectedReaderChapter.id, next)
}

function setupKeyboardNavigation(): void {
    if (keyboardBound) return
    keyboardBound = true

    window.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
        if (tag === "input" || tag === "select" || tag === "textarea") return

        event.preventDefault()
        void moveReader(event.key === "ArrowRight" ? 1 : -1).then(() => {
            render()
        })
    })
}

function render(): void {
    const dashboard = state.dashboard
    const discover = state.discover
    const facets = discover?.facets ?? { genres: [], themes: [] }
    const followed = new Set(state.library.map(entry => entry.mangaId))
    const updatesByMangaId = new Map(state.updates.map(item => [item.mangaId, item]))
    const readingEntries = state.library.filter(entry => entry.status === "reading")
    const followingEntries = state.library.filter(entry => entry.status === "following")
    const backlogEntries = state.library.filter(entry => entry.status === "paused" || entry.status === "dropped")
    const finishedEntries = state.library.filter(entry => entry.status === "completed")
    const selectedLibraryEntry = state.selectedManga ? getLibraryEntry(state.selectedManga.id) : null
    const activePage =
        state.readerPages.find(page => page.index === state.readerPageCursor) ??
        state.readerPages[Math.max(0, state.readerPageCursor - 1)] ??
        null

    app.innerHTML = `
    <div class="app">
      <header class="hero">
        <div>
          <h1>AMR Next</h1>
          <p>Discovery + reader + library platform rewrite</p>
        </div>
        <span class="badge">${esc(state.status)}</span>
      </header>

      <section class="dashboard-grid">
        <article class="panel">
          <h2>System</h2>
          <div class="kpi-grid">
            <div class="kpi"><span>Total Manga</span><strong>${dashboard?.ingest.totalManga ?? 0}</strong></div>
            <div class="kpi"><span>Total Chapters</span><strong>${dashboard?.ingest.totalChapters ?? 0}</strong></div>
            <div class="kpi"><span>Source Links</span><strong>${dashboard?.ingest.totalSourceLinks ?? 0}</strong></div>
            <div class="kpi"><span>Ingest Runs</span><strong>${dashboard?.ingest.totalIngestRuns ?? 0}</strong></div>
          </div>
          <p class="muted">Updated: ${
              dashboard?.generatedAt ? esc(new Date(dashboard.generatedAt).toLocaleString()) : "-"
          }</p>
        </article>
        <article class="panel">
          <h2>Library Status</h2>
          <div class="kpi-grid">
            <div class="kpi"><span>Total</span><strong>${dashboard?.library.total ?? 0}</strong></div>
            <div class="kpi"><span>Reading</span><strong>${dashboard?.library.reading ?? 0}</strong></div>
            <div class="kpi"><span>Following</span><strong>${dashboard?.library.following ?? 0}</strong></div>
            <div class="kpi"><span>Completed</span><strong>${dashboard?.library.completed ?? 0}</strong></div>
          </div>
        </article>
        <article class="panel">
          <h2>Source Health</h2>
          <div class="list">
            ${
                (dashboard?.sourceHealth ?? [])
                    .slice(0, 5)
                    .map(
                        item => `<article class="row">
                  <strong>${esc(item.source)}</strong>
                  <span class="muted">runs: ${item.totalRuns} · latest: ${esc(
                            new Date(item.latestRunAt).toLocaleString()
                        )}</span>
                  <span class="muted">upserts: m${item.latestMangaUpserts}/c${item.latestChapterUpserts}</span>
                </article>`
                    )
                    .join("") || `<p class="muted">No source runs yet.</p>`
            }
          </div>
          <h2>Recent Runs</h2>
          <div class="list">
            ${
                (dashboard?.recentRuns ?? [])
                    .slice(0, 4)
                    .map(
                        run => `<article class="row">
                  <strong>${esc(run.source)}</strong>
                  <span class="muted">${esc(new Date(run.createdAt).toLocaleString())}</span>
                  <span class="muted">m${run.mangaUpserts}/c${run.chapterUpserts}</span>
                </article>`
                    )
                    .join("") || `<p class="muted">No ingest history yet.</p>`
            }
          </div>
        </article>
        <article class="panel">
          <h2>Ingest Errors (${dashboard?.ingestErrors.length ?? 0})</h2>
          <div class="list">
            ${
                (dashboard?.ingestErrors ?? [])
                    .slice(0, 6)
                    .map(
                        error => `<article class="row">
                  <strong>${esc(error.source)} · ${esc(error.stage)}</strong>
                  <span class="muted">${esc(new Date(error.at).toLocaleString())}</span>
                  <span class="muted">${esc(error.message)}</span>
                  ${error.details ? `<span class="muted">${esc(error.details)}</span>` : ""}
                  <span class="${error.retryable ? "status" : "muted"}">${
                            error.retryable ? "retryable" : "non-retryable"
                        }</span>
                </article>`
                    )
                    .join("") || `<p class="muted">No ingest errors recorded.</p>`
            }
          </div>
        </article>
      </section>

      <section class="panel">
        <h2>Continue Reading (${dashboard?.continueReading.length ?? 0})</h2>
        <div class="cards">
          ${
              (dashboard?.continueReading ?? [])
                  .slice(0, 6)
                  .map(
                      item => `<article class="card compact">
                <img class="cover compact" src="${esc(item.coverUrl)}" alt="${esc(item.title)}" />
                <div class="card-body">
                  <p class="title">${esc(item.title)}</p>
                  <p class="meta">last: ${esc(item.lastReadChapterId ?? "-")} · page ${item.lastReadPage ?? "-"}</p>
                  <p class="meta">latest: ${esc(item.latestChapterNumber ?? "-")} · ${esc(
                          item.latestChapterTitle ?? "-"
                      )}</p>
                  <div class="card-actions">
                    <button data-open="${esc(item.mangaId)}">Open</button>
                    ${
                        item.lastReadChapterId
                            ? `<button data-resume-manga="${esc(item.mangaId)}" data-resume-chapter="${esc(
                                  item.lastReadChapterId
                              )}" data-resume-page="${item.lastReadPage ?? 1}">Resume</button>`
                            : ""
                    }
                  </div>
                </div>
              </article>`
                  )
                  .join("") || `<p class="muted">No active reading sessions yet.</p>`
          }
        </div>
      </section>

      <section class="layout">
        <aside class="panel controls">
          <h2>Discover Filters</h2>
          <input id="q" type="text" placeholder="Search title, alt title, synopsis..." value="${esc(state.query)}" />
          <label class="muted" for="status-filter">Status</label>
          <select id="status-filter">
            <option value="any" ${state.selectedStatus === "any" ? "selected" : ""}>Any</option>
            <option value="ongoing" ${state.selectedStatus === "ongoing" ? "selected" : ""}>Ongoing</option>
            <option value="completed" ${state.selectedStatus === "completed" ? "selected" : ""}>Completed</option>
            <option value="hiatus" ${state.selectedStatus === "hiatus" ? "selected" : ""}>Hiatus</option>
            <option value="cancelled" ${state.selectedStatus === "cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
          <label class="muted" for="sort-filter">Sort</label>
          <select id="sort-filter">
            <option value="relevance" ${state.selectedSort === "relevance" ? "selected" : ""}>Relevance</option>
            <option value="updated" ${state.selectedSort === "updated" ? "selected" : ""}>Recently Updated</option>
            <option value="title" ${state.selectedSort === "title" ? "selected" : ""}>Title</option>
            <option value="sources" ${state.selectedSort === "sources" ? "selected" : ""}>Most Sources</option>
          </select>
          <button id="search">Search</button>
          <button id="clear" class="secondary">Clear Filters</button>

          <div>
            <p class="muted">Genres</p>
            <div class="facet-grid">
              ${facets.genres
                  .map(
                      facet =>
                          `<span class="chip ${state.selectedGenre === facet.value ? "active" : ""}" data-genre="${esc(
                              facet.value
                          )}">${esc(facet.value)} (${facet.count})</span>`
                  )
                  .join("")}
            </div>
          </div>

          <div>
            <p class="muted">Themes</p>
            <div class="facet-grid">
              ${facets.themes
                  .map(
                      facet =>
                          `<span class="chip ${state.selectedTheme === facet.value ? "active" : ""}" data-theme="${esc(
                              facet.value
                          )}">${esc(facet.value)} (${facet.count})</span>`
                  )
                  .join("")}
            </div>
          </div>
        </aside>

        <main class="main-grid">
          <section class="panel">
            <h2>Discover Results (${discover?.total ?? 0})</h2>
            <div class="cards">
              ${(discover?.items ?? [])
                  .map(
                      manga => `
                <article class="card">
                  <img class="cover" src="${esc(manga.coverUrl)}" alt="${esc(manga.title)}" />
                  <div class="card-body">
                    <p class="title">${esc(manga.title)}</p>
                    <p class="meta">${esc(manga.genres.join(", "))}</p>
                    <p class="meta">${esc(manga.themes.join(", "))}</p>
                    <p class="meta">Sources: ${manga.sourceCount} · Ch: ${esc(manga.lastChapterNumber)}</p>
                    <div class="card-actions">
                      <button data-open="${esc(manga.id)}">Open</button>
                      <button data-follow="${esc(manga.id)}" class="${followed.has(manga.id) ? "secondary" : ""}">
                        ${followed.has(manga.id) ? "Followed" : "Follow"}
                      </button>
                    </div>
                  </div>
                </article>`
                  )
                  .join("")}
            </div>
          </section>

          <section class="panel split">
            <div>
              <h2>Library Shelves (${state.library.length})</h2>
              <h3 class="subhead">Reading (${readingEntries.length})</h3>
              <div class="list">
                ${
                    readingEntries
                        .map(entry => {
                            const update = updatesByMangaId.get(entry.mangaId)
                            return `<article class="row">
                      <strong>${esc(entry.mangaId)}</strong>
                      <span class="muted">lastRead: ${esc(entry.lastReadChapterId ?? "-")} · page ${
                                entry.lastReadPage ?? "-"
                            }</span>
                      ${
                          update
                              ? `<span class="status">Update: #${esc(update.latestChapterNumber)} ${esc(
                                    update.latestChapterTitle
                                )}</span>`
                              : `<span class="muted">Up to date</span>`
                      }
                      <div class="card-actions">
                        <button data-open="${esc(entry.mangaId)}">Open</button>
                        ${
                            entry.lastReadChapterId
                                ? `<button data-resume-manga="${esc(entry.mangaId)}" data-resume-chapter="${esc(
                                      entry.lastReadChapterId
                                  )}" data-resume-page="${entry.lastReadPage ?? 1}">Resume</button>`
                                : ""
                        }
                      </div>
                    </article>`
                        })
                        .join("") || `<p class="muted">No reading entries yet.</p>`
                }
              </div>
              <h3 class="subhead">Following (${followingEntries.length})</h3>
              <div class="list">
                ${
                    followingEntries
                        .map(entry => {
                            const update = updatesByMangaId.get(entry.mangaId)
                            return `<article class="row">
                      <strong>${esc(entry.mangaId)}</strong>
                      ${
                          update
                              ? `<span class="status">New chapter: #${esc(update.latestChapterNumber)}</span>`
                              : `<span class="muted">No pending updates</span>`
                      }
                      <div class="card-actions">
                        <button data-open="${esc(entry.mangaId)}">Open</button>
                      </div>
                    </article>`
                        })
                        .join("") || `<p class="muted">No following entries yet.</p>`
                }
              </div>
              <h3 class="subhead">Backlog (${backlogEntries.length})</h3>
              <div class="list">
                ${
                    backlogEntries
                        .map(
                            entry => `<article class="row">
                      <strong>${esc(entry.mangaId)}</strong>
                      <span class="muted">status: ${esc(entry.status)}</span>
                      <div class="card-actions">
                        <button data-open="${esc(entry.mangaId)}">Open</button>
                      </div>
                    </article>`
                        )
                        .join("") || `<p class="muted">No backlog entries yet.</p>`
                }
              </div>
              <h3 class="subhead">Completed (${finishedEntries.length})</h3>
              <div class="list">
                ${
                    finishedEntries
                        .map(
                            entry => `<article class="row">
                      <strong>${esc(entry.mangaId)}</strong>
                      <span class="muted">completed</span>
                    </article>`
                        )
                        .join("") || `<p class="muted">No completed entries yet.</p>`
                }
              </div>
            </div>
            <div>
              <h2>Recommendations (${state.recommendations.length})</h2>
              <div class="list">
                ${state.recommendations
                    .map(
                        item => `<article class="row">
                      <strong>${esc(item.mangaId)}</strong>
                      <span class="muted">${esc(item.reason)}</span>
                      <span class="status">score: ${item.score.toFixed(2)}</span>
                    </article>`
                    )
                    .join("")}
              </div>
            </div>
          </section>

          <section class="panel split">
            <div>
              <h2>Selected Manga</h2>
              ${
                  state.selectedManga
                      ? `<article class="row">
                      <strong>${esc(state.selectedManga.title)}</strong>
                      <span class="muted">${esc(state.selectedManga.synopsis)}</span>
                      <span class="muted">authors: ${esc(state.selectedManga.authors.join(", "))}</span>
                      <span class="muted">artists: ${esc(state.selectedManga.artists.join(", "))}</span>
                    </article>`
                      : `<p class="muted">Select a manga from discover results.</p>`
              }
              ${
                  state.selectedManga && selectedLibraryEntry?.lastReadChapterId
                      ? `<div class="card-actions">
                      <button
                        data-resume-manga="${esc(state.selectedManga.id)}"
                        data-resume-chapter="${esc(selectedLibraryEntry.lastReadChapterId)}"
                        data-resume-page="${selectedLibraryEntry.lastReadPage ?? 1}">
                        Resume Reading
                      </button>
                    </div>`
                      : ""
              }
              <h2>Chapters (${state.selectedChapters.length})</h2>
              <div class="list">
                ${state.selectedChapters
                    .slice(0, 15)
                    .map(
                        chapter => `<article class="row">
                      <strong>${esc(chapter.title)}</strong>
                      <span class="muted">source: ${esc(chapter.sourceName)}</span>
                      <div class="card-actions">
                        <button data-read-here-manga="${esc(chapter.mangaId)}" data-read-here-chapter="${esc(
                            chapter.id
                        )}">Read Here</button>
                        <button data-read-manga="${esc(chapter.mangaId)}" data-read-chapter="${esc(
                            chapter.id
                        )}">Mark Read</button>
                        <button class="secondary" data-open-chapter="${esc(
                            chapter.sourceChapterUrl
                        )}">Open Source</button>
                      </div>
                    </article>`
                    )
                    .join("")}
              </div>
              <h2>Sources (${state.selectedSources.length})</h2>
              <div class="list">
                ${state.selectedSources
                    .map(
                        source => `<article class="row">
                      <strong>${esc(source.source)}</strong>
                      <span class="muted">title: ${esc(source.sourceTitle ?? "-")}</span>
                      <span class="muted">id: ${esc(source.sourceMangaId ?? "-")}</span>
                      <span class="muted">last seen: ${esc(new Date(source.lastSeenAt).toLocaleString())}</span>
                      ${
                          source.sourceMangaUrl
                              ? `<div class="card-actions"><button class="secondary" data-open-source="${esc(
                                    source.sourceMangaUrl
                                )}">Open Source Page</button></div>`
                              : ""
                      }
                    </article>`
                    )
                    .join("")}
              </div>
              <h2>Reader</h2>
              ${
                  state.selectedReaderChapter
                      ? `<article class="row reader-meta">
                      <strong>${esc(state.selectedReaderChapter.title)}</strong>
                      <span class="muted">${esc(state.selectedReaderChapter.sourceName)} · ${
                            state.readerPages.length
                        } pages · ${state.readerMode === "adapter-cache" ? "adapter" : "fallback"}</span>
                    </article>
                    <div class="reader-jump">
                      <label class="muted" for="reader-chapter-jump">Jump Chapter</label>
                      <select id="reader-chapter-jump">
                        ${state.selectedChapters
                            .slice(0, 80)
                            .map(
                                chapter =>
                                    `<option value="${esc(chapter.id)}" ${
                                        chapter.id === state.selectedReaderChapter?.id ? "selected" : ""
                                    }>${esc(chapter.title)}</option>`
                            )
                            .join("")}
                      </select>
                    </div>
                    <div class="card-actions reader-controls">
                      <button class="secondary" data-reader-prev="1">Prev</button>
                      <span class="muted">Page ${state.readerPageCursor}/${Math.max(1, state.readerPages.length)}</span>
                      <button class="secondary" data-reader-next="1">Next</button>
                    </div>
                    <div class="reader-progress">
                      <input
                        id="reader-page-range"
                        type="range"
                        min="1"
                        max="${Math.max(1, state.readerPages.length)}"
                        value="${Math.max(1, state.readerPageCursor)}" />
                    </div>
                    <div class="reader-pages">
                      ${
                          activePage
                              ? `<figure class="reader-page">
                              <img loading="lazy" src="${esc(activePage.imageUrl)}" alt="${esc(
                                    `${state.selectedReaderChapter?.title ?? "chapter"} page ${activePage.index}`
                                )}" />
                              <figcaption>Page ${activePage.index}</figcaption>
                            </figure>`
                              : `<p class="muted">No pages available.</p>`
                      }
                    </div>`
                      : `<p class="muted">Use "Read Here" on a chapter to load in-app pages.</p>`
              }
            </div>
            <div>
              <h2>Updates (${state.updates.length})</h2>
              <div class="list">
                ${state.updates
                    .map(
                        update => `<article class="row">
                      <strong>${esc(update.mangaId)}</strong>
                      <span class="muted">${esc(update.latestChapterTitle)} (#${esc(update.latestChapterNumber)})</span>
                      <span class="status">${esc(new Date(update.releasedAt).toLocaleString())}</span>
                    </article>`
                    )
                    .join("")}
              </div>
            </div>
          </section>
        </main>
      </section>
    </div>
  `

    bindHandlers()
}

function bindHandlers(): void {
    const input = document.querySelector<HTMLInputElement>("#q")
    const statusFilter = document.querySelector<HTMLSelectElement>("#status-filter")
    const sortFilter = document.querySelector<HTMLSelectElement>("#sort-filter")
    const search = document.querySelector<HTMLButtonElement>("#search")
    const clear = document.querySelector<HTMLButtonElement>("#clear")

    search?.addEventListener("click", async () => {
        state.query = input?.value ?? ""
        await refreshDiscover()
    })

    clear?.addEventListener("click", async () => {
        state.query = ""
        state.selectedStatus = "any"
        state.selectedSort = "relevance"
        state.selectedGenre = null
        state.selectedTheme = null
        await refreshDiscover()
    })

    statusFilter?.addEventListener("change", async () => {
        const value = statusFilter.value
        if (
            value === "ongoing" ||
            value === "completed" ||
            value === "hiatus" ||
            value === "cancelled" ||
            value === "any"
        ) {
            state.selectedStatus = value
            await refreshDiscover()
        }
    })

    sortFilter?.addEventListener("change", async () => {
        const value = sortFilter.value
        if (value === "relevance" || value === "updated" || value === "title" || value === "sources") {
            state.selectedSort = value
            await refreshDiscover()
        }
    })

    document.querySelectorAll<HTMLElement>("[data-genre]").forEach(el => {
        el.addEventListener("click", async () => {
            const value = el.dataset.genre ?? null
            state.selectedGenre = state.selectedGenre === value ? null : value
            await refreshDiscover()
        })
    })

    document.querySelectorAll<HTMLElement>("[data-theme]").forEach(el => {
        el.addEventListener("click", async () => {
            const value = el.dataset.theme ?? null
            state.selectedTheme = state.selectedTheme === value ? null : value
            await refreshDiscover()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-open]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.open
            if (!id) return
            state.status = `Loading ${id}...`
            render()
            await openManga(id)
            state.status = `Loaded ${id}`
            render()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-follow]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.follow
            if (!id) return
            await followManga(id)
            state.status = `Followed ${id}`
            render()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-read-manga][data-read-chapter]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const mangaId = btn.dataset.readManga
            const chapterId = btn.dataset.readChapter
            if (!mangaId || !chapterId) return
            await markRead(mangaId, chapterId)
            state.status = `Marked read ${chapterId}`
            render()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-read-here-manga][data-read-here-chapter]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const mangaId = btn.dataset.readHereManga
            const chapterId = btn.dataset.readHereChapter
            if (!mangaId || !chapterId) return
            const entry = getLibraryEntry(mangaId)
            const resumePage = entry?.lastReadChapterId === chapterId ? entry.lastReadPage ?? 1 : 1
            state.status = `Loading reader ${chapterId}...`
            render()
            await openReaderChapter(mangaId, chapterId, resumePage, true)
            state.status = `Reader ready ${chapterId}`
            render()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-resume-manga][data-resume-chapter]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const mangaId = btn.dataset.resumeManga
            const chapterId = btn.dataset.resumeChapter
            const page = Number.parseInt(btn.dataset.resumePage ?? "1", 10)
            if (!mangaId || !chapterId) return
            state.status = `Resuming ${chapterId}...`
            render()
            await openReaderChapter(mangaId, chapterId, Number.isFinite(page) ? page : 1, false)
            state.status = `Resumed ${chapterId}`
            render()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-reader-prev]").forEach(btn => {
        btn.addEventListener("click", async () => {
            await moveReader(-1)
            render()
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-reader-next]").forEach(btn => {
        btn.addEventListener("click", async () => {
            await moveReader(1)
            render()
        })
    })

    const chapterJump = document.querySelector<HTMLSelectElement>("#reader-chapter-jump")
    chapterJump?.addEventListener("change", async () => {
        const chapterId = chapterJump.value
        const mangaId = state.selectedManga?.id
        if (!chapterId || !mangaId) return
        state.status = `Opening ${chapterId}...`
        render()
        await openReaderChapter(mangaId, chapterId, 1, true)
        state.status = `Reader ready ${chapterId}`
        render()
    })

    const pageRange = document.querySelector<HTMLInputElement>("#reader-page-range")
    pageRange?.addEventListener("change", async () => {
        if (!state.selectedManga || !state.selectedReaderChapter) return
        const parsed = Number.parseInt(pageRange.value, 10)
        if (!Number.isFinite(parsed)) return
        const next = Math.max(1, Math.min(parsed, state.readerPages.length))
        state.readerPageCursor = next
        await syncReaderProgress(state.selectedManga.id, state.selectedReaderChapter.id, next)
        render()
    })

    document.querySelectorAll<HTMLButtonElement>("[data-open-chapter]").forEach(btn => {
        btn.addEventListener("click", () => {
            const url = btn.dataset.openChapter
            if (!url) return
            window.open(url, "_blank")
        })
    })

    document.querySelectorAll<HTMLButtonElement>("[data-open-source]").forEach(btn => {
        btn.addEventListener("click", () => {
            const url = btn.dataset.openSource
            if (!url) return
            window.open(url, "_blank")
        })
    })
}

async function refreshDiscover(): Promise<void> {
    state.status = "Refreshing discover..."
    render()
    await loadDiscover()
    state.status = "Ready"
    render()
}

async function boot(): Promise<void> {
    try {
        setupKeyboardNavigation()
        state.status = "Loading initial data..."
        render()
        await Promise.all([loadDashboard(), loadDiscover(), loadLibrary(), loadRecommendations(), loadUpdates()])
        state.status = "Ready"
        render()
    } catch (error) {
        state.status = error instanceof Error ? error.message : "Boot failed"
        render()
    }
}

void boot()
