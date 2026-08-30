// @vitest-environment jsdom
//
// The two things the calendar gained alongside the company settings: it starts the week where the company
// says to, and it marks Estonian public holidays. Both are easy to get subtly wrong — the first-day value
// crosses two numbering conventions (ISO 1-7 in, `Date.getDay()` 0-6 out), and three of the holidays move
// with Easter — and neither is visible to the other tests.
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '../i18n'
import DateField from './DateField'

// The company setting is mocked at the hook rather than supplied through a real provider: the provider
// fetches settings over the API on mount, which this has no interest in standing up.
const settings = vi.hoisted(() => ({ current: { firstDayOfWeek: null } }))
vi.mock('../context/SettingsContext', () => ({
    useSettings: () => settings.current,
}))

afterEach(cleanup)

/** Renders the field with a company `firstDayOfWeek` and opens its calendar on the given month. */
function openCalendar({ firstDayOfWeek = null, value = '2026-12-15' } = {}) {
    settings.current = { firstDayOfWeek }
    render(<DateField id="d" name="d" value={value} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calendar/i }))
}

/** The seven weekday abbreviations across the top of the grid, in display order. */
function weekdayHeader() {
    return screen.getByTestId('datefield-weekdays').textContent.trim()
}

describe('DateField calendar', () => {
    it('starts the week on Monday when the company says so', () => {
        openCalendar({ firstDayOfWeek: 1 })
        expect(weekdayHeader().startsWith('Mon')).toBe(true)
    })

    it('starts the week on Sunday when the company says so', () => {
        // 7 is ISO Sunday, which has to be folded to `Date.getDay()`'s 0 — the conversion this guards.
        openCalendar({ firstDayOfWeek: 7 })
        expect(weekdayHeader().startsWith('Sun')).toBe(true)
    })

    it('starts the week on Saturday when the company says so', () => {
        openCalendar({ firstDayOfWeek: 6 })
        expect(weekdayHeader().startsWith('Sat')).toBe(true)
    })

    it('marks fixed-date public holidays and names them', () => {
        openCalendar({ firstDayOfWeek: 1, value: '2026-12-15' })
        const grid = screen.getByTestId('datefield-days')
        expect(within(grid).getByRole('button', { name: /24 — Christmas Eve/ })).toBeInTheDocument()
        expect(within(grid).getByRole('button', { name: /25 — Christmas Day/ })).toBeInTheDocument()
        expect(within(grid).getByRole('button', { name: /26 — Boxing Day/ })).toBeInTheDocument()
    })

    it('marks the Easter-derived holidays, which move year to year', () => {
        // Easter 2026 is 5 April, so Good Friday is the 3rd — a date no fixed table would carry.
        openCalendar({ firstDayOfWeek: 1, value: '2026-04-15' })
        const grid = screen.getByTestId('datefield-days')
        expect(within(grid).getByRole('button', { name: /3 — Good Friday/ })).toBeInTheDocument()
        expect(within(grid).getByRole('button', { name: /5 — Easter Sunday/ })).toBeInTheDocument()
    })

    it('leaves ordinary days unnamed, so only holidays carry a title', () => {
        openCalendar({ firstDayOfWeek: 1, value: '2026-12-15' })
        const grid = screen.getByTestId('datefield-days')
        expect(within(grid).getByRole('button', { name: '15' })).toBeInTheDocument()
    })
})
