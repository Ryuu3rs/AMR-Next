import "fake-indexeddb/auto"
import { describe, expect, it } from "vitest"
import { AmrDatabase, db } from "./database"

// FROZEN guard: the IndexedDB database name is keyed to every user's stored library.
// Renaming it makes every installed library appear empty on upgrade, with no clean
// rollback. There is no other CI check on this string, so this test is the guard -
// do not "fix" it by updating the expected value.
const FROZEN_DB_NAME = "all-mangas-reader"

describe("Dexie database name (FROZEN)", () => {
    it("keeps the shared db instance named exactly all-mangas-reader", () => {
        expect(db.name).toBe(FROZEN_DB_NAME)
    })

    it("keeps a freshly constructed AmrDatabase named exactly all-mangas-reader", () => {
        const fresh = new AmrDatabase()
        expect(fresh.name).toBe(FROZEN_DB_NAME)
    })
})
