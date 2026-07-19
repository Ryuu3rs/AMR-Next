// Runs an async action over each item independently so one failure never aborts
// the rest of the batch. A bulk UI loop that fires one background message per
// selected item with no per-item error handling leaves local UI state stale and
// swallows the error on partial failure (a service-worker restart mid-batch, one
// bad id). runSettled gives callers the exact split of what landed and what
// didn't, so they can update local state from only the succeeded set, keep the
// failed items selected, and surface a partial-failure message. Sequential by
// design: these callers hit the same background dispatcher, and the pre-existing
// bulk loops were sequential - preserve that ordering/back-pressure.
export async function runSettled<T>(
    items: T[],
    fn: (item: T) => Promise<void>
): Promise<{ succeeded: T[]; failed: T[] }> {
    const succeeded: T[] = []
    const failed: T[] = []
    for (const item of items) {
        try {
            await fn(item)
            succeeded.push(item)
        } catch (cause) {
            console.warn("[AMR] bulk action failed for", item, cause)
            failed.push(item)
        }
    }
    return { succeeded, failed }
}
