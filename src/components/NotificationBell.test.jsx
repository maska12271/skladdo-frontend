// @vitest-environment jsdom
//
// The bell polls the unread count on a timer and deliberately skips the poll while the tab is hidden, so a
// backgrounded tab isn't talking to the server all day. That pause is invisible in normal use and easy to
// delete by accident, and it can't be observed in the in-app browser pane (which reports itself hidden
// whenever it isn't displayed). Pinning it here instead. Stage 11 of the test pass.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../api/client', () => ({
    apiGet: (...args) => apiGet(...args),
    apiPost: (...args) => apiPost(...args),
}))

const { default: NotificationBell } = await import('./NotificationBell')

const POLL_INTERVAL_MS = 60000

const renderBell = () => render(<MemoryRouter><NotificationBell /></MemoryRouter>)

/** Lets the mocked promises settle inside act(), so state updates are flushed. */
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
    vi.useFakeTimers()
    apiGet.mockReset().mockResolvedValue({ count: 3 })
    apiPost.mockReset().mockResolvedValue({})
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

/** Counts only the unread-count polls, ignoring the list fetch the dropdown makes. */
const countPolls = () => apiGet.mock.calls.filter(([url]) => url === '/notifications/unread-count').length

describe('NotificationBell polling', () => {
    it('fetches the unread count on mount', async () => {
        renderBell()
        await flush()
        expect(countPolls()).toBe(1)
    })

    it('shows the unread badge', async () => {
        renderBell()
        await flush()
        expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('caps the badge at 99+', async () => {
        apiGet.mockResolvedValue({ count: 250 })
        renderBell()
        await flush()
        expect(screen.getByText('99+')).toBeInTheDocument()
    })

    it('shows no badge at zero unread', async () => {
        apiGet.mockResolvedValue({ count: 0 })
        renderBell()
        await flush()
        expect(screen.queryByText('0')).not.toBeInTheDocument()
    })

    it('polls again after the interval while the tab is visible', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        renderBell()
        await flush()
        expect(countPolls()).toBe(1)

        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS) })
        expect(countPolls()).toBe(2)

        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS) })
        expect(countPolls()).toBe(3)
    })

    it('does not poll while the tab is hidden', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        renderBell()
        await flush()
        // The mount fetch still happens; only the interval ticks are suppressed.
        expect(countPolls()).toBe(1)

        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS * 5) })
        expect(countPolls()).toBe(1)
    })

    it('resumes polling when the tab becomes visible again', async () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        renderBell()
        await flush()

        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS * 3) })
        expect(countPolls()).toBe(1)

        visibility.mockReturnValue('visible')
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS) })
        expect(countPolls()).toBe(2)
    })

    it('stops polling once unmounted', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        const { unmount } = renderBell()
        await flush()
        unmount()

        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS * 3) })
        expect(countPolls()).toBe(1)
    })

    it('keeps the previous badge value when a poll fails', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        renderBell()
        await flush()
        expect(screen.getByText('3')).toBeInTheDocument()

        apiGet.mockRejectedValue(new Error('network'))
        await act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS) })
        // A blip must not blank the badge or crash the header.
        expect(screen.getByText('3')).toBeInTheDocument()
    })
})
