/**
 * Sync utility constants
 */

/** Marker indicating a manga has been deleted (for sync purposes) */
export const DELETED = 1 as const

/** Placeholder key for failed operations */
export const FAIL_KEY = "_no_key_" as const

/** Type for deleted marker */
export type DeletedMarker = typeof DELETED

/** Type for fail key */
export type FailKey = typeof FAIL_KEY
