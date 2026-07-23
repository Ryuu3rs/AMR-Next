// Bulk-selection scoping for the library view.
//
// A selection must never stay armed for a bulk action on titles the user can no longer
// see. Selecting under one filter and then changing the filter/search previously left
// every off-screen id in the set, so "Remove" deleted titles that were nowhere on
// screen - silent, unconfirmed data loss. "Select all" made that trivial to trigger on
// a whole library in one click, so the selection is pruned to the visible set whenever
// the filtered view changes, and every bulk action is scoped to the visible set at the
// moment it runs.

export function pruneSelectionToVisible(selected: ReadonlySet<string>, visibleIds: Iterable<string>): Set<string> {
    const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds)
    const pruned = new Set<string>()
    for (const id of selected) {
        if (visible.has(id)) pruned.add(id)
    }
    return pruned
}
