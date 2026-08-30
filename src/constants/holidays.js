/**
 * Estonian public holidays (riigipühad), for marking in the date picker.
 *
 * Estonia only, deliberately: it is the market the app is built for, and the alternative — a holiday
 * calendar per country — needs a country on the company, which does not exist yet. Everything below is
 * keyed off `HOLIDAYS`, so adding a second country later means adding a table beside it rather than
 * unpicking the callers.
 *
 * Names are i18n keys (`holidays.<key>`) rather than literal strings, so a holiday reads in whichever of
 * the three interface languages the viewer is using.
 */

/**
 * Easter Sunday for a Gregorian year, as `[month, day]` with a 1-based month.
 *
 * The anonymous Gregorian algorithm (Meeus/Jones/Butcher). It is pure integer arithmetic with no special
 * cases, and it is what makes the four moving holidays below computable instead of a hand-maintained
 * table that would quietly run out a few years from now.
 */
function easterSunday(year) {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return [month, day]
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`

/** ISO date `offset` days after Easter Sunday of `year` (negative offsets go before it). */
function fromEaster(year, offset) {
    const [month, day] = easterSunday(year)
    const date = new Date(year, month - 1, day + offset)
    return iso(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Fixed-date holidays, as `[month, day, key]`. */
const FIXED = [
    [1, 1, 'newYear'],
    [2, 24, 'independence'],
    [5, 1, 'springDay'],
    [6, 23, 'victoryDay'],
    [6, 24, 'midsummer'],
    [8, 20, 'restorationOfIndependence'],
    [12, 24, 'christmasEve'],
    [12, 25, 'christmasDay'],
    [12, 26, 'boxingDay'],
]

/** Easter-relative holidays, as `[daysFromEaster, key]`. */
const MOVING = [
    [-2, 'goodFriday'],
    [0, 'easterSunday'],
    [49, 'pentecost'],
]

// Built lazily and kept, because the picker asks for the same year on every re-render as the user pages
// through months — recomputing Easter each time would be pure waste.
const cache = new Map()

/**
 * The holidays of `year`, as a `Map` of ISO `yyyy-MM-dd` to i18n key.
 *
 * Returns the same Map instance for a given year, so callers may use it as a stable dependency.
 */
export function holidaysForYear(year) {
    const cached = cache.get(year)
    if (cached) return cached

    const result = new Map()
    for (const [month, day, key] of FIXED) {
        result.set(iso(year, month, day), key)
    }
    for (const [offset, key] of MOVING) {
        result.set(fromEaster(year, offset), key)
    }
    cache.set(year, result)
    return result
}

/** The i18n key for a holiday on an ISO date, or null when that date is an ordinary day. */
export function holidayKeyFor(isoDate) {
    const year = Number(String(isoDate).slice(0, 4))
    if (!Number.isFinite(year)) return null
    return holidaysForYear(year).get(isoDate) ?? null
}
