// Coalesces reader page-progress reports into a trailing 1s window so a
// 100-page webtoon chapter doesn't fire a runtime message (and a DB write +
// live-bus event) on every single image `onload`. Continuous-mode images can
// load out of order (lazy loading), so this tracks the MAX pageIndex seen
// since the last flush - never "the last call's pageIndex" - and a
// sticky-OR'd `completed` flag so a later, lower-index, not-completed call
// can never regress an already-true completed signal.
export function createProgressReporter(send: (payload: { pageIndex: number; completed: boolean }) => void): {
    report: (pageIndex: number, completed: boolean) => void
    flush: () => void
} {
    let maxPageIndex = 0
    let completedSticky = false
    let pending = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function flush() {
        if (!pending) return
        if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
        }
        send({ pageIndex: maxPageIndex, completed: completedSticky })
        maxPageIndex = 0
        completedSticky = false
        pending = false
    }

    function report(pageIndex: number, completed: boolean) {
        maxPageIndex = Math.max(maxPageIndex, pageIndex)
        completedSticky = completedSticky || completed
        pending = true
        if (timer === undefined) {
            timer = setTimeout(() => {
                timer = undefined
                flush()
            }, 1000)
        }
    }

    return { report, flush }
}
