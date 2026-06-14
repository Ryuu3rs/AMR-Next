/**
 * Mangas Constants Module
 * Contains constants used across manga modules
 */

// Re-export manga constants from the manga module
export { MANGA_READ_STOP, MANGA_UPDATE_STOP } from "../../../amr/manga"

/**
 * Message thrown when a manga is abstract (no language specified)
 */
export const ABSTRACT_MANGA_MSG = "abstract_manga" as const

/**
 * Error code for empty chapter list
 */
export const ERROR_CODE_EMPTY_LIST = 1 as const

/**
 * Error code for failed update
 */
export const ERROR_CODE_FAILED_UPDATE = 2 as const

/**
 * Type for error codes
 */
export type MangaErrorCode = typeof ERROR_CODE_EMPTY_LIST | typeof ERROR_CODE_FAILED_UPDATE
