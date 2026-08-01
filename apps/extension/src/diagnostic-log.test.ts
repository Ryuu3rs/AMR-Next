import { describe, it, expect } from "vitest"
import { formatDiagnosticLog } from "./diagnostic-log"
import type { LogEntry } from "./database"

const entry = (o: Partial<LogEntry>): LogEntry => ({
    ts: 1_700_000_000_000,
    level: "info",
    scope: "test",
    message: "",
    ...o
})
const meta = (secrets: string[] = []) => ({ version: "1.0.0", browser: "chrome", secrets })

describe("formatDiagnosticLog", () => {
    it("redacts known secret values passed in", () => {
        const out = formatDiagnosticLog(
            [entry({ message: "sync failed for user abc-secret-123" })],
            meta(["abc-secret-123"])
        )
        expect(out).not.toContain("abc-secret-123")
        expect(out).toContain("[redacted]")
    })

    it("redacts token patterns even when not passed as a known secret", () => {
        const bearer = formatDiagnosticLog(
            [entry({ message: "Authorization: Bearer eyJabc123def456ghi789xyz" })],
            meta()
        )
        expect(bearer).not.toContain("eyJabc123def456ghi789xyz")
        const pat = formatDiagnosticLog([entry({ message: "used ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" })], meta())
        expect(pat).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    })

    it("ignores trivially short secrets so a blank config field can't blank the log", () => {
        const out = formatDiagnosticLog([entry({ message: "hello world" })], meta(["a"]))
        expect(out).toContain("hello world")
    })

    it("flattens newlines so an entry cannot forge a new log line", () => {
        const out = formatDiagnosticLog([entry({ message: "real\nFORGED HEADER" })], meta())
        const body = out.split("\n\n")[1] ?? ""
        expect(body.split("\n").length).toBe(1)
        expect(body).toContain("real FORGED HEADER")
    })

    it("renders header + entry fields", () => {
        const out = formatDiagnosticLog(
            [entry({ level: "warn", scope: "chapters", sourceId: "weebcentral", message: "listed 9 chapters" })],
            { version: "9.9.9", browser: "firefox", secrets: [] }
        )
        expect(out).toContain("extension version: 9.9.9")
        expect(out).toContain("browser: firefox")
        expect(out).toContain("WARN chapters [weebcentral]: listed 9 chapters")
    })

    it("handles an empty log", () => {
        expect(formatDiagnosticLog([], meta())).toContain("(no entries)")
    })
})
