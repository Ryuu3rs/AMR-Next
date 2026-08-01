// Lightweight diagnostic logger for background/service-worker code. Writes to the
// devtools console (unchanged) AND appends a redacted-at-export entry to the bounded
// `logs` ring buffer (recordLog) that backs the user-exportable diagnostic log. Call
// from background contexts (they have db access); it never throws or blocks the caller.

import { recordLog, type LogEntry } from "./database"

type Level = LogEntry["level"]

function stringifyDetail(value: unknown): string {
    if (typeof value === "string") return value
    if (value instanceof Error) return value.message
    try {
        return JSON.stringify(value, (_key, val) =>
            val instanceof Error ? { name: val.name, message: val.message } : val
        )
    } catch {
        return String(value)
    }
}

function emit(level: Level, scope: string, message: string, detail?: unknown): void {
    const line = `[AMR:${scope}] ${message}`
    if (level === "error") console.error(line, detail ?? "")
    else if (level === "warn") console.warn(line, detail ?? "")
    else console.debug(line, detail ?? "")
    void recordLog({
        ts: Date.now(),
        level,
        scope,
        message,
        ...(detail !== undefined ? { detail: stringifyDetail(detail) } : {})
    }).catch(() => {})
}

export const diag = {
    info: (scope: string, message: string, detail?: unknown) => emit("info", scope, message, detail),
    warn: (scope: string, message: string, detail?: unknown) => emit("warn", scope, message, detail),
    error: (scope: string, message: string, detail?: unknown) => emit("error", scope, message, detail)
}
