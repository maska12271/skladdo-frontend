import i18n from '../i18n'

export function formatMoney(value, currency = 'EUR') {
    const number = Number(value || 0)
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'EUR',
    }).format(number)
}

/**
 * Converts an amount held in a transaction currency into the company base currency using the rate
 * snapshotted on the record (`1 base = exchangeRate foreign`, so base = amount / rate). Returns null when
 * the rate is missing/zero (unknown) so callers can hide the equivalent rather than divide by zero.
 */
export function toCompanyAmount(amount, exchangeRate) {
    const rate = Number(exchangeRate)
    if (!rate || rate <= 0) return null
    return Number(amount || 0) / rate
}

/**
 * The user's chosen language decides how a date reads, not the browser's.
 *
 * These used to pass no locale at all, which meant an app running in Estonian still printed `8/26/2026`
 * for anyone whose browser was set to US English. It matters more now that dates are also *typed*: the
 * date field accepts them in the locale's own order, so the order a date is shown in has to be the same
 * one it is read back in, or the two disagree about which number is the month.
 */
function activeLocale() {
    return i18n.resolvedLanguage || i18n.language || undefined
}

export function formatDate(value) {
    if (!value) return '-'
    return new Date(value).toLocaleDateString(activeLocale())
}

export function formatDateTime(value) {
    if (!value) return '-'
    return new Date(value).toLocaleString(activeLocale())
}

export function safeArray(value) {
    return Array.isArray(value) ? value : value?.content || []
}

export function isActiveStatus(status) {
    return ['NEW', 'OPEN', 'IN_PROGRESS', 'PUBLISHED', 'CONFIRMED'].includes(String(status || '').toUpperCase())
}

// Lenient parsers used when importing user-supplied CSV cells.
export function parseBool(value, fallback = true) {
    if (value == null || value === '') return fallback
    const v = String(value).trim().toLowerCase()
    if (['true', 'yes', 'y', '1', 'active'].includes(v)) return true
    if (['false', 'no', 'n', '0', 'inactive', 'archived'].includes(v)) return false
    return fallback
}

export function toNumber(value, fallback = 0) {
    if (value == null || value === '') return fallback
    const cleaned = String(value).replace(/[^0-9.-]/g, '')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : fallback
}
/**
 * A byte count as something a person reads: "1.4 MB", "812 KB".
 *
 * Binary units (1024) because that is what storage consoles report, so the figure here matches what the
 * bucket says rather than being 5% adrift from it.
 */
export function formatBytes(bytes) {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    const scaled = value / 1024 ** exponent
    // Whole bytes read oddly as "1.0 B"; anything larger gets one decimal until it reaches three digits.
    const decimals = exponent === 0 || scaled >= 100 ? 0 : 1
    return `${scaled.toFixed(decimals)} ${units[exponent]}`
}
