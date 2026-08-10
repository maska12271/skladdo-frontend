// @vitest-environment jsdom
//
// Modal is the shared shell behind every form dialog in the app, so its keyboard contract is the app's
// keyboard contract: Escape closes, Tab cannot escape the dialog, and focus returns where it came from.
// Stage 11 of the test pass — none of this had a test before.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '../i18n'
import Modal from './Modal'

afterEach(cleanup)

/** Modal with three tabbables in the body, plus the header close button it always renders. */
function TestModal({ isOpen = true, onClose = () => {} }) {
    return (
        <Modal isOpen={isOpen} title="Test dialog" onClose={onClose}>
            <input aria-label="first" />
            <input aria-label="second" />
            <button type="button">Save</button>
        </Modal>
    )
}

describe('Modal', () => {
    it('renders nothing while closed', () => {
        render(<TestModal isOpen={false} />)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('marks itself as a modal dialog labelled by its title', () => {
        render(<TestModal />)
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(screen.getByText('Test dialog')).toBeInTheDocument()
    })

    it('moves focus into the dialog when it opens', async () => {
        render(<TestModal />)
        // The close button is the first focusable element in DOM order (it sits in the header).
        await waitFor(() => expect(document.activeElement).not.toBe(document.body))
        expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    })

    it('closes on Escape', async () => {
        const onClose = vi.fn()
        render(<TestModal onClose={onClose} />)
        await userEvent.keyboard('{Escape}')
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // The wrap-around assertions use fireEvent rather than userEvent.tab(). The trap works by handling
    // keydown on `document`, calling preventDefault() and moving focus itself; userEvent emulates the
    // browser's own tab-focus movement afterwards and does not honour that preventDefault, so it walks
    // focus one element past where the trap put it. fireEvent dispatches the key and nothing else, which
    // is exactly the handler contract under test here. Real browser tabbing is covered by the Playwright
    // focus-trap spec, which is the only place it can be checked honestly.
    it('wraps focus to the start when Tab is pressed on the last element', () => {
        render(<TestModal />)
        const closeButton = screen.getByLabelText('Close')
        const save = screen.getByRole('button', { name: 'Save' })

        save.focus()
        fireEvent.keyDown(document, { key: 'Tab' })
        expect(document.activeElement).toBe(closeButton)
    })

    it('wraps focus to the end when Shift+Tab is pressed on the first element', () => {
        render(<TestModal />)
        const closeButton = screen.getByLabelText('Close')
        const save = screen.getByRole('button', { name: 'Save' })

        closeButton.focus()
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
        expect(document.activeElement).toBe(save)
    })

    it('leaves focus alone when Tab is pressed mid-dialog', () => {
        render(<TestModal />)
        const second = screen.getByLabelText('second')

        second.focus()
        fireEvent.keyDown(document, { key: 'Tab' })
        // Not at either edge, so the trap must not interfere and the browser's own move stands.
        expect(document.activeElement).toBe(second)
    })

    it('locks body scroll while open and restores it on close', () => {
        const { rerender } = render(<TestModal />)
        expect(document.body.style.overflow).toBe('hidden')
        rerender(<TestModal isOpen={false} />)
        expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('returns focus to the element that opened it', async () => {
        const opener = document.createElement('button')
        document.body.appendChild(opener)
        opener.focus()
        expect(document.activeElement).toBe(opener)

        const { rerender } = render(<TestModal />)
        await waitFor(() => expect(document.activeElement).not.toBe(opener))

        rerender(<TestModal isOpen={false} />)
        expect(document.activeElement).toBe(opener)
        opener.remove()
    })

    it('closes when the backdrop is clicked but not when the dialog body is', async () => {
        const onClose = vi.fn()
        render(<TestModal onClose={onClose} />)

        await userEvent.click(screen.getByRole('dialog'))
        expect(onClose).not.toHaveBeenCalled()

        // The backdrop is the dialog's parent; a mousedown landing on it dismisses.
        await userEvent.click(screen.getByRole('dialog').parentElement)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
