import { describe, expect, it } from "vitest"
import { isNewerVersion } from "./update-check"

describe("isNewerVersion", () => {
    it("detects newer major", () => expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true))
    it("detects newer minor", () => expect(isNewerVersion("1.1.0", "1.0.9")).toBe(true))
    it("detects newer patch", () => expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true))
    it("returns false for same version", () => expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false))
    it("returns false for older major", () => expect(isNewerVersion("0.9.9", "1.0.0")).toBe(false))
    it("returns false for older minor", () => expect(isNewerVersion("1.0.9", "1.1.0")).toBe(false))
    it("returns false for older patch", () => expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false))
    it("handles missing patch segment", () => expect(isNewerVersion("1.1", "1.0.0")).toBe(true))
    it("treats non-numeric segments as 0", () => expect(isNewerVersion("1.0.0", "1.0.alpha")).toBe(false))
})
