import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import type { IngestCatalogInput, MangaDetail } from "@amr-next/contracts"
import { PostgresStore } from "../src/postgres-store.js"
import { runMigrations } from "../src/migration-runner.js"
import { fileURLToPath } from "node:url"

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/amr_next"
const schemaName = `test_${randomUUID().replace(/-/g, "").slice(0, 12)}`
const migrationsDir = fileURLToPath(new URL("../db/migrations", import.meta.url))
const nowIso = new Date().toISOString()

const baseManga = (id: string, title: string, altTitles: string[] = []): MangaDetail => ({
    id,
    title,
    coverUrl: `https://example.org/${id}.jpg`,
    synopsis: `${title} synopsis`,
    genres: ["Action"],
    themes: ["Shonen"],
    status: "ongoing",
    sourceCount: 1,
    lastChapterNumber: "10",
    updatedAt: nowIso,
    altTitles,
    authors: ["Author"],
    artists: ["Artist"]
})

async function main(): Promise<void> {
    const adminPool = new Pool({ connectionString })

    // Create isolated test schema
    await adminPool.query(`create schema ${schemaName}`)
    console.log(`[test:pg] created schema: ${schemaName}`)

    // Build a connection string that targets the test schema via search_path
    const testPool = new Pool({ connectionString })
    await testPool.query(`set search_path to ${schemaName}, public`)

    // Run migrations inside the test schema
    // We need to run each migration manually against the test schema
    await testPool.query(`set search_path to ${schemaName}`)
    await runMigrations(testPool, migrationsDir)
    console.log(`[test:pg] migrations applied in schema ${schemaName}`)

    // The PostgresStore uses its own pool, so we need to set search_path per connection.
    // Simplest: create a store that uses a modified connection string with options.
    const storeConnStr = `${connectionString}?options=-csearch_path%3D${schemaName}`
    const store = new PostgresStore({
        connectionString: storeConnStr,
        userId: "test-user",
        autoMigrate: false
    })
    await store.init()

    try {
        const ingestA: IngestCatalogInput = {
            source: "source-a",
            harvestedAt: nowIso,
            items: [
                {
                    sourceMangaId: "mha-a",
                    sourceMangaUrl: "https://source-a.example/mha",
                    sourceTitle: "My Hero Academia",
                    manga: baseManga("hero-a", "My Hero Academia", ["Boku no Hero Academia"]),
                    chapters: [
                        {
                            id: "ch-1",
                            mangaId: "hero-a",
                            title: "Chapter 1",
                            number: "1",
                            sourceName: "source-a",
                            sourceChapterUrl: "https://source-a.example/mha/ch-1",
                            releasedAt: nowIso
                        }
                    ]
                }
            ]
        }

        const ingestB: IngestCatalogInput = {
            source: "source-b",
            harvestedAt: nowIso,
            items: [
                {
                    sourceMangaId: "mha-b",
                    sourceMangaUrl: "https://source-b.example/mha",
                    sourceTitle: "Boku no Hero Academia",
                    manga: baseManga("hero-b", "Boku no Hero Academia"),
                    chapters: [
                        {
                            id: "ch-2",
                            mangaId: "hero-b",
                            title: "Chapter 2",
                            number: "2",
                            sourceName: "source-b",
                            sourceChapterUrl: "https://source-b.example/mha/ch-2",
                            releasedAt: nowIso
                        }
                    ]
                }
            ]
        }

        const ingestAUpdate: IngestCatalogInput = {
            source: "source-a",
            harvestedAt: nowIso,
            items: [
                {
                    sourceMangaId: "mha-a",
                    sourceMangaUrl: "https://source-a.example/mha",
                    sourceTitle: "My Hero Academia",
                    manga: baseManga("hero-c", "MHA alt id"),
                    chapters: [
                        {
                            id: "ch-3",
                            mangaId: "hero-c",
                            title: "Chapter 3",
                            number: "3",
                            sourceName: "source-a",
                            sourceChapterUrl: "https://source-a.example/mha/ch-3",
                            releasedAt: nowIso
                        }
                    ]
                }
            ]
        }

        await store.upsertCatalog(ingestA)
        await store.upsertCatalog(ingestB)
        await store.upsertCatalog(ingestAUpdate)
        await store.upsertLibrary({ mangaId: "hero-a", status: "reading", notifyOnUpdate: true }, nowIso)
        await store.patchLibrary("hero-a", { lastReadChapterId: "ch-3", lastReadPage: 7, status: "reading" }, nowIso)
        await store.appendIngestError(
            { source: "source-a", stage: "post_catalog", message: "temporary rate limit", retryable: true },
            nowIso
        )
        const chapterPageResult = await store.upsertChapterPages({
            source: "source-a",
            harvestedAt: nowIso,
            items: [
                {
                    sourceName: "source-a",
                    sourceChapterUrl: "https://source-a.example/mha/ch-3",
                    chapterId: "ch-3",
                    mangaId: "hero-a",
                    items: [
                        { index: 1, imageUrl: "https://img.example/ch-3/1.jpg" },
                        { index: 2, imageUrl: "https://img.example/ch-3/2.jpg" }
                    ]
                }
            ]
        })

        const heroA = await store.getManga("hero-a")
        const heroB = await store.getManga("hero-b")
        const heroC = await store.getManga("hero-c")
        const catalog = await store.listCatalog()
        const sources = await store.listMangaSources("hero-a")
        const chapters = await store.listChapters("hero-a")
        const runsBySourceA = await store.listIngestRuns({ source: "source-a", limit: 10 })
        const overview = await store.getIngestOverview()
        const cachedPages = await store.getChapterPages("source-a", "https://source-a.example/mha/ch-3")
        const library = await store.listLibrary()
        const ingestErrors = await store.listIngestErrors({ source: "source-a", limit: 10 })

        assert.ok(heroA, "canonical manga should exist")
        assert.equal(heroB, null, "alias-mapped manga id should not create separate canonical manga")
        assert.equal(heroC, null, "source-id remap should not create separate canonical manga")
        assert.equal(catalog.length, 1, "dedupe should keep a single canonical manga record")
        assert.equal(sources.length, 2, "two distinct source links should be tracked")
        assert.equal(chapters.length, 3, "chapters from all ingests should merge onto canonical manga")
        assert.equal(chapterPageResult.upserts, 1, "chapter pages should upsert")
        assert.equal(cachedPages?.length ?? 0, 2, "chapter pages should be retrievable")
        assert.equal(library[0]?.lastReadChapterId, "ch-3", "library should persist last chapter")
        assert.equal(library[0]?.lastReadPage, 7, "library should persist last page")
        assert.equal(ingestErrors.length, 1, "ingest errors should be queryable by source")
        assert.equal(runsBySourceA.length, 2, "source filter should return only matching ingest runs")
        assert.ok(overview.totalAliases >= 2, "aliases should be tracked")
        assert.ok(overview.totalSourceLinks >= 2, "source links should be counted in overview")
        assert.ok(overview.totalIngestRuns >= 3, "ingest runs should be counted in overview")

        console.log("[test:pg-store] pass — all assertions match file-store parity")
    } finally {
        await store.close()
        await adminPool.query(`drop schema ${schemaName} cascade`)
        console.log(`[test:pg] dropped schema: ${schemaName}`)
        await adminPool.end()
        await testPool.end()
    }
}

await main()
