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

    // Regression: scope + sourceId were previously interpolated un-redacted, leaking a
    // secret/token that landed in either field.
    it("redacts a known secret in the sourceId field", () => {
        const out = formatDiagnosticLog(
            [entry({ sourceId: "abc-secret-123", message: "ok" })],
            meta(["abc-secret-123"])
        )
        expect(out).not.toContain("abc-secret-123")
    })

    it("redacts a token pattern in the scope field", () => {
        const out = formatDiagnosticLog(
            [entry({ scope: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", message: "ok" })],
            meta()
        )
        expect(out).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    })

    it("redacts a known secret in the detail field", () => {
        const out = formatDiagnosticLog(
            [entry({ message: "ok", detail: "user=abc-secret-123" })],
            meta(["abc-secret-123"])
        )
        expect(out).not.toContain("abc-secret-123")
    })

    // Regression: the line is flattened (zero-width stripped, whitespace collapsed) before
    // redaction, so an encoded secret no longer matched the raw value literally and leaked.
    it("redacts a known secret even when the log field carried a zero-width char", () => {
        const secret = "community-user-name-42"
        // The captured message embeds a U+200B inside the username; flatten() strips it,
        // so redaction must match the flattened secret, not just the raw value.
        const out = formatDiagnosticLog([entry({ message: `sync failed for community-user-​name-42` })], meta([secret]))
        expect(out).not.toContain("name-42")
        expect(out).toContain("[redacted]")
    })

    it("redacts a known secret even when a double space slips into the log field", () => {
        const secret = "community user name"
        const out = formatDiagnosticLog([entry({ message: `owner is community  user name here` })], meta([secret]))
        expect(out).not.toContain("community user name")
        expect(out).toContain("[redacted]")
    })

    it("redacts a bare JWT even when not passed as a known secret", () => {
        const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        const out = formatDiagnosticLog([entry({ message: `token refresh returned ${jwt}` })], meta())
        expect(out).not.toContain(jwt)
        expect(out).toContain("[redacted]")
    })
})
