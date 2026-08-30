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

/**
 * The company's chosen date/time patterns, or null for "follow the language".
 *
 * Module state rather than a hook, deliberately. `formatDate` is called from 100-odd places across two
 * dozen files, none of which are otherwise interested in settings; turning it into a hook would mean
 * rewriting every one of those call sites to make a display preference reach them. Set once from
 * {@link SettingsProvider} when the company's settings arrive, which happens on authentication — before
 * any page has data to render a date for.
 */
let companyDateFormat = null
let companyTimeFormat = null

/** Applies the company's format preference. Called by SettingsProvider; pass nulls to fall back to locale. */
export function setDateTimeFormats(dateFormat, timeFormat) {
    companyDateFormat = DATE_PATTERNS[dateFormat] ? dateFormat : null
    companyTimeFormat = TIME_PATTERNS[timeFormat] ? timeFormat : null
}

const pad = (n) => String(n).padStart(2, '0')

// Written out rather than mapped through Intl: these are exact patterns the company picked, and Intl
// would re-order them to suit the locale, which is the very thing the setting exists to override.
const DATE_PATTERNS = {
    'dd.MM.yyyy': (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    'dd/MM/yyyy': (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    'MM/dd/yyyy': (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`,
    'yyyy-MM-dd': (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
}

const TIME_PATTERNS = {
    'HH:mm': (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    'hh:mm a': (d) => {
        const h = d.getHours()
        const h12 = h % 12 === 0 ? 12 : h % 12
        return `${h12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
    },
}

/**
 * Renders a date/time in an explicit pattern, ignoring whatever the company has chosen.
 *
 * For the format pickers on the settings page, which have to show what each option *would* look like
 * while the company is still on a different one. Exported rather than reimplemented there so a sample can
 * never disagree with what the app will actually print.
 */
export function formatDateIn(pattern, date) {
    return DATE_PATTERNS[pattern] ? DATE_PATTERNS[pattern](date) : pattern
}

export function formatTimeIn(pattern, date) {
    return TIME_PATTERNS[pattern] ? TIME_PATTERNS[pattern](date) : pattern
}

/** Guards against an unparseable value reaching a formatter, which would render "NaN.NaN.NaN". */
const toDate = (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
    if (!value) return '-'
    const date = toDate(value)
    if (!date) return '-'
    const pattern = DATE_PATTERNS[companyDateFormat]
    return pattern ? pattern(date) : date.toLocaleDateString(activeLocale())
}

export function formatDateTime(value) {
    if (!value) return '-'
    const date = toDate(value)
    if (!date) return '-'
    const datePart = DATE_PATTERNS[companyDateFormat]
    const timePart = TIME_PATTERNS[companyTimeFormat]
    // Either half can be on its own: a company may pin the date order and leave the clock to the
    // language, or the other way round, so each half falls back independently.
    if (!datePart && !timePart) return date.toLocaleString(activeLocale())
    const left = datePart ? datePart(date) : date.toLocaleDateString(activeLocale())
    const right = timePart
        ? timePart(date)
        : date.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' })
    return `${left} ${right}`
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
