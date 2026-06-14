/**
 * Internationalization helper
 * Wraps browser.i18n.getMessage for cleaner usage
 */
import browser from "webextension-polyfill"

/**
 * Get a localized message
 * @param message - Message key from _locales messages.json files
 * @param args - Substitution arguments (strings or numbers)
 * @returns Localized message string
 */
export default function i18n(message: string, ...args: (string | number)[]): string {
    const stringArgs = args.map(arg => String(arg))
    return browser.i18n.getMessage(message, stringArgs) || message
}
