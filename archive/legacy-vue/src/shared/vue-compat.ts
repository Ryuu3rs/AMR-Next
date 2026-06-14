/**
 * Vue 3 compatibility utilities
 * In Vue 3, reactivity is Proxy-based, so direct assignment/deletion works
 */

/**
 * Set a reactive property on an object
 * In Vue 3: Direct assignment works due to Proxy-based reactivity
 * @param target - The target object
 * @param key - The property key
 * @param value - The value to set
 */
export function reactiveSet<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
    target[key] = value
}

/**
 * Delete a reactive property from an object
 * In Vue 3: Direct delete works due to Proxy-based reactivity
 * @param target - The target object
 * @param key - The property key to delete
 */
export function reactiveDelete<T extends object, K extends keyof T>(target: T, key: K): void {
    delete target[key]
}
