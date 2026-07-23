import { describe, it, expect } from "vitest"
import { pruneSelectionToVisible } from "./library-selection"

// Mirrors App.svelte's toggleSelectAllVisible so the end-to-end scenario below runs the
// same logic the UI does.
function toggleSelectAllVisible(selected: ReadonlySet<string>, visible: ReadonlyArray<{ id: string }>): Set<string> {
    const allSelected = visible.length > 0 && visible.every(m => selected.has(m.id))
    const next = new Set(selected)
    for (const m of visible) {
        if (allSelected) next.delete(m.id)
        else next.add(m.id)
    }
    return next
}

describe("pruneSelectionToVisible", () => {
    it("keeps only ids present in the visible set", () => {
        const pruned = pruneSelectionToVisible(new Set(["a", "b", "c"]), ["b", "c", "d"])
        expect([...pruned].sort()).toEqual(["b", "c"])
    })

    it("returns an empty set when nothing visible matches", () => {
        expect(pruneSelectionToVisible(new Set(["a"]), ["z"]).size).toBe(0)
    })

    it("accepts a Set as the visible source", () => {
        expect([...pruneSelectionToVisible(new Set(["a", "b"]), new Set(["a"]))]).toEqual(["a"])
    })
})

describe("bulk-selection data-loss guard", () => {
    const ALL = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }]
    const COMPLETED = [{ id: "C" }, { id: "D" }]

    it("a filter change after select-all cannot leave off-screen titles armed for Remove", () => {
        // Select every title under filter=all.
        const selected = toggleSelectAllVisible(new Set<string>(), ALL)
        expect(selected.size).toBe(5)

        // User switches to the "completed" filter - only C and D are on screen now.
        const afterFilterChange = pruneSelectionToVisible(
            selected,
            COMPLETED.map(m => m.id)
        )

        // Remove must only ever target what the user can actually see.
        expect([...afterFilterChange].sort()).toEqual(["C", "D"])
    })

    it("deselect-all after a filter change clears the selection instead of leaving ghosts", () => {
        const selected = toggleSelectAllVisible(new Set<string>(), ALL)
        const scoped = pruneSelectionToVisible(
            selected,
            COMPLETED.map(m => m.id)
        )
        // With the selection scoped to the visible set, "Deselect all" empties it - it
        // can no longer leave hidden-but-armed ids behind while the screen shows none
        // highlighted.
        const afterDeselectAll = toggleSelectAllVisible(scoped, COMPLETED)
        expect(afterDeselectAll.size).toBe(0)
    })
})
