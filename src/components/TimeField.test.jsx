// @vitest-environment jsdom
//
// The time field carries the same split DateField does — a canonical 24-hour `HH:mm` value, and whatever
// clock the company reads on screen — and that split is where a picker like this goes wrong: showing
// "9:30 PM" but emitting "9:30", or refusing a perfectly ordinary thing to type. Both halves are pinned
// here because neither is visible to any other test.
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import '../i18n'
import TimeField from './TimeField'

// Mocked at the hook rather than through a real provider, which would fetch settings over the API on
// mount. Same approach as DateField.test.jsx.
const settings = vi.hoisted(() => ({ current: { timeFormat: null } }))
vi.mock('../context/SettingsContext', () => ({
    useSettings: () => settings.current,
}))

afterEach(cleanup)

function renderField({ timeFormat = 'HH:mm', value = '', onChange = () => {} } = {}) {
    settings.current = { timeFormat }
    render(<TimeField id="t" name="t" value={value} onChange={onChange} />)
    return screen.getByRole('textbox')
}

describe('TimeField display', () => {
    it('shows a 24-hour clock when the company says so', () => {
        expect(renderField({ timeFormat: 'HH:mm', value: '21:05' })).toHaveValue('21:05')
    })

    it('shows a 12-hour clock when the company says so', () => {
        expect(renderField({ timeFormat: 'hh:mm a', value: '21:05' })).toHaveValue('9:05 PM')
    })

    it('writes midnight and noon the way a 12-hour clock does', () => {
        expect(renderField({ timeFormat: 'hh:mm a', value: '00:30' })).toHaveValue('12:30 AM')
        cleanup()
        expect(renderField({ timeFormat: 'hh:mm a', value: '12:30' })).toHaveValue('12:30 PM')
    })
})

describe('TimeField typing', () => {
    /** Types `text` into a fresh field on `timeFormat` and returns the value it emitted. */
    function commit(text, timeFormat = 'HH:mm') {
        // Torn down first so a test may call this more than once — otherwise the second render leaves
        // two textboxes on the screen and the query matches both.
        cleanup()
        let emitted = null
        const input = renderField({ timeFormat, onChange: (e) => { emitted = e.target.value } })
        fireEvent.change(input, { target: { value: text } })
        fireEvent.blur(input)
        return emitted
    }

    it('accepts a plain hour as the top of that hour', () => {
        expect(commit('9')).toBe('09:00')
    })

    it('accepts a separated time', () => {
        expect(commit('9:30')).toBe('09:30')
        expect(commit('21.45')).toBe('21:45')
    })

    it('accepts a run of digits, taking the last two as minutes', () => {
        expect(commit('0930')).toBe('09:30')
        expect(commit('930')).toBe('09:30')
    })

    it('reads pm as the afternoon, whatever clock the company is on', () => {
        expect(commit('9:30 pm', 'hh:mm a')).toBe('21:30')
        // Written on a 24-hour company but typed with a meridiem anyway — still unambiguous.
        expect(commit('9:30 pm', 'HH:mm')).toBe('21:30')
    })

    it('reads 12 AM as midnight rather than noon', () => {
        expect(commit('12:15 am', 'hh:mm a')).toBe('00:15')
    })

    it('emits 24-hour values even on a 12-hour company', () => {
        // The whole point of the split: what leaves the field never depends on how it is displayed.
        expect(commit('9:05', 'hh:mm a')).toBe('09:05')
    })

    it('leaves the value alone when the text is not a time', () => {
        let emitted = 'untouched'
        const input = renderField({ value: '08:00', onChange: (e) => { emitted = e.target.value } })
        fireEvent.change(input, { target: { value: 'lunchtime' } })
        fireEvent.blur(input)
        expect(emitted).toBe('untouched')
    })

    it('rejects an impossible time rather than rolling it over', () => {
        let emitted = 'untouched'
        const input = renderField({ onChange: (e) => { emitted = e.target.value } })
        fireEvent.change(input, { target: { value: '25:00' } })
        fireEvent.blur(input)
        expect(emitted).toBe('untouched')
    })
})

describe('TimeField picker', () => {
    it('labels its hours on the company clock', () => {
        renderField({ timeFormat: 'hh:mm a' })
        fireEvent.click(screen.getByRole('button', { name: /clock/i }))
        const hours = screen.getByTestId('timefield-hours').textContent
        expect(hours).toContain('9 PM')
        expect(hours).not.toContain('21')
    })

    it('offers 24-hour labels when the company reads that clock', () => {
        renderField({ timeFormat: 'HH:mm' })
        fireEvent.click(screen.getByRole('button', { name: /clock/i }))
        const hours = screen.getByTestId('timefield-hours').textContent
        expect(hours).toContain('21')
        expect(hours).not.toContain('PM')
    })

    it('keeps the chosen minutes when only the hour is picked', () => {
        let emitted = null
        renderField({ value: '08:25', onChange: (e) => { emitted = e.target.value } })
        fireEvent.click(screen.getByRole('button', { name: /clock/i }))
        const hours = screen.getByTestId('timefield-hours')
        fireEvent.click(within(hours).getByText('14'))
        expect(emitted).toBe('14:25')
    })
})
