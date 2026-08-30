// The company's date/time format reaches ~100 call sites through module state rather than through a hook,
// so these lock down the two things that arrangement has to get right: the patterns render exactly as
// chosen, and clearing them falls back to the language instead of leaving the last company's format behind.
import { describe, expect, it, afterEach } from 'vitest'
import { formatDate, formatDateTime, setDateTimeFormats } from './format'

// A 25th-of-the-month afternoon: the day and month cannot be confused for each other, and the hour
// distinguishes the 24- and 12-hour clocks.
const SAMPLE = new Date(2026, 11, 25, 14, 30).toISOString()

afterEach(() => setDateTimeFormats(null, null))

describe('formatDate', () => {
    it('renders each supported pattern exactly as chosen', () => {
        const cases = {
            'dd.MM.yyyy': '25.12.2026',
            'dd/MM/yyyy': '25/12/2026',
            'MM/dd/yyyy': '12/25/2026',
            'yyyy-MM-dd': '2026-12-25',
        }
        for (const [pattern, expected] of Object.entries(cases)) {
            setDateTimeFormats(pattern, null)
            expect(formatDate(SAMPLE), pattern).toBe(expected)
        }
    })

    it('falls back to the language when no company format is set', () => {
        setDateTimeFormats(null, null)
        // Not asserting an exact string — that is the locale's business. What matters is that it still
        // renders a real date rather than the empty placeholder.
        expect(formatDate(SAMPLE)).not.toBe('-')
    })

    it('ignores a pattern it cannot render rather than printing NaN', () => {
        setDateTimeFormats('nonsense-pattern', null)
        expect(formatDate(SAMPLE)).not.toContain('NaN')
        expect(formatDate(SAMPLE)).not.toBe('-')
    })

    it('renders a placeholder for empty and unparseable values', () => {
        setDateTimeFormats('dd.MM.yyyy', null)
        expect(formatDate(null)).toBe('-')
        expect(formatDate('')).toBe('-')
        expect(formatDate('not a date')).toBe('-')
    })
})

describe('formatDateTime', () => {
    it('combines the chosen date and time patterns', () => {
        setDateTimeFormats('dd.MM.yyyy', 'HH:mm')
        expect(formatDateTime(SAMPLE)).toBe('25.12.2026 14:30')
    })

    it('renders the 12-hour clock with a meridiem', () => {
        setDateTimeFormats('yyyy-MM-dd', 'hh:mm a')
        expect(formatDateTime(SAMPLE)).toBe('2026-12-25 2:30 PM')
    })

    it('lets each half fall back independently', () => {
        // Date pinned, clock left to the language: the date half must still be exact.
        setDateTimeFormats('dd.MM.yyyy', null)
        expect(formatDateTime(SAMPLE).startsWith('25.12.2026 ')).toBe(true)
    })

    it('clears back to the language when formats are unset', () => {
        setDateTimeFormats('MM/dd/yyyy', 'hh:mm a')
        const withCompanyFormat = formatDateTime(SAMPLE)
        setDateTimeFormats(null, null)
        // Compared against the company-formatted string rather than asserting the absence of some token:
        // the fallback locale here is en-US, which renders a 12-hour clock of its own, so "no PM" would
        // pass for the wrong reason. What matters is that the pinned format stopped being applied.
        expect(formatDateTime(SAMPLE)).not.toBe(withCompanyFormat)
        expect(withCompanyFormat).toBe('12/25/2026 2:30 PM')
    })
})
