/**
 * AMR Event System - Lightweight typed event emitter
 *
 * Features:
 * - No external dependencies (replaces mitt)
 * - Full TypeScript support with typed events
 * - Debug mode integration
 * - Listener count tracking for leak detection
 *
 * Usage:
 *   import { createEventEmitter } from '@/core/events'
 *
 *   type MyEvents = {
 *     'user-login': { userId: string }
 *     'page-load': void
 *   }
 *
 *   const events = createEventEmitter<MyEvents>()
 *   events.on('user-login', (data) => console.log(data.userId))
 *   events.emit('user-login', { userId: '123' })
 */

import { debug } from "./debug"

/** Event handler function type */
export type EventHandler<T = unknown> = (payload: T) => void

/** Map of event names to their payload types */
export type EventMap = Record<string, unknown>

/** Event emitter interface */
export interface IEventEmitter<Events extends EventMap> {
    /** Subscribe to an event */
    on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void
    /** Unsubscribe from an event */
    off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void
    /** Emit an event */
    emit<K extends keyof Events>(event: K, ...args: Events[K] extends void ? [] : [Events[K]]): void
    /** Subscribe to an event, automatically unsubscribe after first call */
    once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void
    /** Get current listener count for an event */
    listenerCount<K extends keyof Events>(event: K): number
    /** Clear all listeners for an event (or all events if none specified) */
    clear<K extends keyof Events>(event?: K): void
}

/**
 * Create a new typed event emitter
 */
export function createEventEmitter<Events extends EventMap>(name = "EventEmitter"): IEventEmitter<Events> {
    const handlers = new Map<keyof Events, Set<EventHandler<unknown>>>()

    const on = <K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): (() => void) => {
        if (!handlers.has(event)) {
            handlers.set(event, new Set())
        }
        handlers.get(event)!.add(handler as EventHandler<unknown>)
        debug.events.trace(`${name}.on: ${String(event)}`, {
            count: handlers.get(event)!.size
        })

        // Return unsubscribe function
        return () => off(event, handler)
    }

    const off = <K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void => {
        const eventHandlers = handlers.get(event)
        if (eventHandlers) {
            eventHandlers.delete(handler as EventHandler<unknown>)
            debug.events.trace(`${name}.off: ${String(event)}`, {
                count: eventHandlers.size
            })
        }
    }

    const emit = <K extends keyof Events>(event: K, ...args: Events[K] extends void ? [] : [Events[K]]): void => {
        const eventHandlers = handlers.get(event)
        if (!eventHandlers || eventHandlers.size === 0) {
            debug.events.trace(`${name}.emit: ${String(event)} (no listeners)`)
            return
        }

        const payload = args[0] as Events[K]
        debug.events.trace(`${name}.emit: ${String(event)}`, {
            listenerCount: eventHandlers.size
        })

        // Copy to array to avoid issues if handler modifies the set
        for (const handler of Array.from(eventHandlers)) {
            try {
                handler(payload)
            } catch (error) {
                debug.events.error(`${name} handler error for ${String(event)}`, error)
            }
        }
    }

    const once = <K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): (() => void) => {
        const wrappedHandler: EventHandler<Events[K]> = payload => {
            off(event, wrappedHandler)
            handler(payload)
        }
        return on(event, wrappedHandler)
    }

    const listenerCount = <K extends keyof Events>(event: K): number => {
        return handlers.get(event)?.size ?? 0
    }

    const clear = <K extends keyof Events>(event?: K): void => {
        if (event !== undefined) {
            handlers.delete(event)
            debug.events.trace(`${name}.clear: ${String(event)}`)
        } else {
            handlers.clear()
            debug.events.trace(`${name}.clear: all events`)
        }
    }

    return { on, off, emit, once, listenerCount, clear }
}
