import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import {
    applyDeletionSemantics,
    mergeMangaPayload,
    mergeMangaPayloadWithStats,
    normalizeMangaRecord
} from "../src/core/sync/reconcile.js"
import {
    normalizeSyncPayloadEnvelope,
    serializeSyncPayloadEnvelope,
    SYNC_PAYLOAD_SCHEMA_VERSION
} from "../src/core/sync/payload.js"

function testNormalizeSupportsLegacyDeletedAndTs() {
    const normalized = normalizeMangaRecord({
        key: "manga:1",
        ts: 1700000000000,
        deleted: 1,
        displayName: "Sample"
    })

    assert.ok(normalized)
    assert.equal(normalized.key, "manga:1")
    assert.equal(normalized.updatedAt, 1700000000000)
    assert.equal(normalized.deletedAt, 1)
    assert.equal(normalized.data, null)
}

function testMergeUsesLatestTimestamp() {
    const local = [
        {
            key: "manga:1",
            updatedAt: 100,
            deletedAt: null,
            data: { displayName: "Older local" }
        }
    ]

    const remote = [
        {
            key: "manga:1",
            updatedAt: 150,
            deletedAt: null,
            data: { displayName: "Newer remote" }
        },
        {
            key: "manga:2",
            updatedAt: 90,
            deletedAt: 90,
            data: { deleted: 1 }
        }
    ]

    const merged = mergeMangaPayload(local, remote)

    assert.equal(merged.length, 2)
    const first = merged.find(item => item.key === "manga:1")
    assert.ok(first)
    assert.equal(first.updatedAt, 150)
    assert.equal(first.data.displayName, "Newer remote")
}

function testTieConflictPrefersTombstoneAndCountsConflict() {
    const local = [
        {
            key: "manga:1",
            updatedAt: 100,
            deletedAt: null,
            data: { title: "Active" }
        }
    ]

    const remote = [
        {
            key: "manga:1",
            updatedAt: 100,
            deletedAt: 100,
            data: { stale: true }
        }
    ]

    const merged = mergeMangaPayloadWithStats(local, remote)

    assert.equal(merged.records.length, 1)
    assert.equal(merged.tieConflicts, 1)
    assert.equal(merged.tombstoneTieBreaks, 1)
    assert.equal(merged.duplicateKeyConflicts, 1)
    assert.equal(merged.records[0].deletedAt, 100)
}

function testNormalizeRejectsMalformedRecords() {
    assert.equal(normalizeMangaRecord(null), null)
    assert.equal(normalizeMangaRecord({}), null)
    assert.equal(normalizeMangaRecord({ updatedAt: 10 }), null)
}

function testDeletionSemanticsRemovesOldTombstonesAndNullsData() {
    const now = Date.now()
    const fortyDays = 40 * 24 * 60 * 60 * 1000

    const result = applyDeletionSemantics([
        { key: "active", updatedAt: now, deletedAt: null, data: { title: "A" } },
        { key: "recent-delete", updatedAt: now - 1000, deletedAt: now - 1000, data: { stale: true } },
        { key: "old-delete", updatedAt: now - fortyDays, deletedAt: now - fortyDays, data: null }
    ])

    assert.equal(result.records.length, 2)
    assert.equal(result.keptTombstones, 1)
    assert.equal(result.prunedTombstones, 1)
    assert.equal(result.propagatedDeletes, 1)
    const recent = result.records.find(r => r.key === "recent-delete")
    assert.ok(recent)
    assert.equal(recent.data, null)
    assert.equal(
        result.records.find(r => r.key === "old-delete"),
        undefined
    )
}

function testFixtureBatches() {
    const fixturePath = path.resolve("scripts/fixtures/sync-payload-samples.json")
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))

    const tieHeavy = fixture.tieHeavyBatch.map(normalizeMangaRecord).filter(item => item !== null)

    const merged = mergeMangaPayloadWithStats([], tieHeavy)
    assert.equal(merged.records.length, 3)
    assert.equal(merged.tieConflicts, 2)
    assert.equal(merged.tombstoneTieBreaks, 1)
    assert.equal(merged.duplicateKeyConflicts, 2)

    const malformed = fixture.malformedBatch
    const accepted = malformed.map(normalizeMangaRecord).filter(item => item !== null)
    const rejected = malformed.length - accepted.length
    assert.equal(accepted.length, 1)
    assert.equal(rejected, 3)
}

function testPayloadEnvelopeCompatibility() {
    const legacy = normalizeSyncPayloadEnvelope([{ key: "a", updatedAt: 1 }])
    assert.equal(legacy.usedLegacyArrayFormat, true)
    assert.equal(legacy.schemaVersion, 0)
    assert.equal(legacy.records.length, 1)

    const modern = normalizeSyncPayloadEnvelope({
        schemaVersion: 3,
        records: [{ key: "b", updatedAt: 2 }]
    })
    assert.equal(modern.usedLegacyArrayFormat, false)
    assert.equal(modern.schemaVersion, 3)
    assert.equal(modern.records.length, 1)

    const serialized = serializeSyncPayloadEnvelope([{ key: "c", updatedAt: 3 }])
    assert.equal(serialized.schemaVersion, SYNC_PAYLOAD_SCHEMA_VERSION)
    assert.equal(Array.isArray(serialized.records), true)
}

function main() {
    testNormalizeSupportsLegacyDeletedAndTs()
    testMergeUsesLatestTimestamp()
    testTieConflictPrefersTombstoneAndCountsConflict()
    testNormalizeRejectsMalformedRecords()
    testDeletionSemanticsRemovesOldTombstonesAndNullsData()
    testFixtureBatches()
    testPayloadEnvelopeCompatibility()
    console.log("sync regression checks passed")
}

main()
