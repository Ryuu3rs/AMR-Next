/**
 * Shared EventBus singleton using core/events (no external dependencies)
 *
 * This module provides a centralized event bus that can be used across
 * all contexts: popup, dashboard, reader, and components.
 *
 * Events used:
 * - multi-manga:select-manga, multi-manga:deselect-manga - Multi-selection
 * - multi-manga:show-multiselect, multi-manga:hide-multiselect - UI state
 * - multi-manga:select-all, multi-manga:select-unread, multi-manga:deselect-all
 * - multi-manga:open-latest:{key}, multi-manga:open-first-new:{key}
 * - multi-manga:refresh:{key}
 * - show-snackbar - Display snackbar messages
 * - open-bookmarks - Reader: open bookmarks popup
 * - thin-scan - Reader: thin scan detected
 * - go-next-chapter, go-previous-chapter - Reader navigation
 * - temporary-dialog - Reader: display temporary message
 * - pages-loaded, chapter-loaded, loaded-scan - Reader loading states
 * - go-to-scanurl - Reader: navigate to specific scan
 * - check-viewport - Reader: check visible pages
 * - offset-book - Reader: offset book mode first page
 */
import { createEventEmitter } from "../core/events"
import { debug } from "../core/debug"

// Define event types for better type safety
export type EventBusEvents = {
    // Multi-manga selection events
    "multi-manga:select-manga": string
    "multi-manga:deselect-manga": string
    "multi-manga:show-multiselect": void
    "multi-manga:hide-multiselect": void
    "multi-manga:select-all": void
    "multi-manga:select-unread": void
    "multi-manga:deselect-all": void
    // Snackbar
    "show-snackbar": { text: string; color?: string }
    // Reader events
    "open-bookmarks": unknown
    "thin-scan": unknown
    "go-next-chapter": unknown
    "go-previous-chapter": unknown
    "temporary-dialog": { message: string; duration: number }
    "pages-loaded": unknown
    "chapter-loaded": unknown
    "loaded-scan": unknown
    "go-to-scanurl": string
    "check-viewport": void
    "offset-book": unknown
    "reload-all-errors": void
    // Dynamic events (multi-manga with key suffix)
    [key: `multi-manga:open-latest:${string}`]: void
    [key: `multi-manga:open-first-new:${string}`]: void
    [key: `multi-manga:refresh:${string}`]: void
}

// Handler type for compatibility
type Handler<T> = (payload: T) => void

// Create the emitter using our core events module
const emitter = createEventEmitter<EventBusEvents>()

/**
 * EventBus interface with Vue 2 compatible API ($on, $off, $emit, $once)
 * and direct methods (on, off, emit)
 */
export interface IEventBus {
    // Vue 2 compatible API (for backwards compatibility)
    $on: <K extends keyof EventBusEvents>(event: K, handler: Handler<EventBusEvents[K]>) => void
    $off: <K extends keyof EventBusEvents>(event: K, handler?: Handler<EventBusEvents[K]>) => void
    $emit: <K extends keyof EventBusEvents>(
        event: K,
        ...args: EventBusEvents[K] extends void ? [] : [EventBusEvents[K]]
    ) => void
    $once: <K extends keyof EventBusEvents>(event: K, handler: Handler<EventBusEvents[K]>) => void
    // Direct methods
    on: <K extends keyof EventBusEvents>(event: K, handler: Handler<EventBusEvents[K]>) => void
    off: <K extends keyof EventBusEvents>(event: K, handler?: Handler<EventBusEvents[K]>) => void
    emit: <K extends keyof EventBusEvents>(event: K, payload?: EventBusEvents[K]) => void
    once: <K extends keyof EventBusEvents>(event: K, handler: Handler<EventBusEvents[K]>) => void
    // Listener count for debugging
    listenerCount: <K extends keyof EventBusEvents>(event: K) => number
}

/**
 * Shared EventBus singleton
 *
 * Usage:
 * ```typescript
 * import EventBus from "@/shared/EventBus"
 *
 * // Subscribe to events
 * EventBus.$on("show-snackbar", (payload) => { ... })
 *
 * // Emit events
 * EventBus.$emit("show-snackbar", { text: "Hello", color: "success" })
 * ```
 */
const EventBus: IEventBus = {
    // Vue 2 compatible API
    $on: (event, handler) => {
        debug.events.trace(`$on: ${String(event)}`)
        emitter.on(event, handler)
    },
    $off: (event, handler) => {
        debug.events.trace(`$off: ${String(event)}`)
        emitter.off(event, handler)
    },
    $emit: (event, ...args) => {
        debug.events.trace(`$emit: ${String(event)}`, args.length > 0 ? "(with payload)" : "")
        // Use type assertion to handle the conditional spread
        if (args.length > 0) {
            ;(emitter.emit as (e: typeof event, p: unknown) => void)(event, args[0])
        } else {
            ;(emitter.emit as (e: typeof event) => void)(event)
        }
    },
    $once: (event, handler) => {
        debug.events.trace(`$once: ${String(event)}`)
        emitter.once(event, handler)
    },

    // Direct methods
    on: (event, handler) => {
        debug.events.trace(`on: ${String(event)}`)
        emitter.on(event, handler)
    },
    off: (event, handler) => {
        debug.events.trace(`off: ${String(event)}`)
        emitter.off(event, handler)
    },
    emit: (event, payload) => {
        debug.events.trace(`emit: ${String(event)}`, payload !== undefined ? "(with payload)" : "")
        // Use type assertion to handle the conditional spread
        if (payload !== undefined) {
            ;(emitter.emit as (e: typeof event, p: unknown) => void)(event, payload)
        } else {
            ;(emitter.emit as (e: typeof event) => void)(event)
        }
    },
    once: (event, handler) => {
        debug.events.trace(`once: ${String(event)}`)
        emitter.once(event, handler)
    },

    // Listener count for debugging
    listenerCount: event => emitter.listenerCount(event)
}

export default EventBus

/**
 * Helper to create Vue plugin for EventBus
 * Provides $eventBus on globalProperties
 */
export function createEventBusPlugin() {
    return {
        install(app: { config: { globalProperties: Record<string, unknown> } }) {
            app.config.globalProperties.$eventBus = EventBus
        }
    }
}
