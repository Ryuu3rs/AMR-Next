export const SYNC_PAYLOAD_SCHEMA_VERSION = 1

/**
 * @param {unknown} value
 * @returns {{ schemaVersion: number, records: unknown[], usedLegacyArrayFormat: boolean }}
 */
export function normalizeSyncPayloadEnvelope(value) {
    if (Array.isArray(value)) {
        return {
            schemaVersion: 0,
            records: value,
            usedLegacyArrayFormat: true
        }
    }

    if (!value || typeof value !== "object") {
        return {
            schemaVersion: SYNC_PAYLOAD_SCHEMA_VERSION,
            records: [],
            usedLegacyArrayFormat: false
        }
    }

    const raw = /** @type {Record<string, unknown>} */ (value)
    const schemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : SYNC_PAYLOAD_SCHEMA_VERSION
    const records = Array.isArray(raw.records) ? raw.records : []

    return {
        schemaVersion,
        records,
        usedLegacyArrayFormat: false
    }
}

/**
 * @param {unknown[]} records
 * @returns {{ schemaVersion: number, records: unknown[] }}
 */
export function serializeSyncPayloadEnvelope(records) {
    return {
        schemaVersion: SYNC_PAYLOAD_SCHEMA_VERSION,
        records
    }
}
