import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MARGIN = 8

/**
 * Places a dropdown against the *viewport* rather than against its trigger's box, and closes it on the
 * usual gestures (outside pointer, Escape, scroll, resize).
 *
 * `absolute right-0` is only correct when the trigger happens to sit near the right of the screen, and
 * the header toolbar's export button does not: right-aligned under it, the panel started at a negative x
 * on a narrow window with its labels cut off by the edge. Measuring the trigger and clamping the result is
 * what `ActionMenu` and `CustomSelect` already do for the same reason; this is that, shared.
 *
 * Returns the two refs to attach and the panel's inline style. The panel must be rendered into a portal:
 * `position: fixed` is still resolved against an ancestor that has a transform or a filter, and both are
 * common in this app's cards.
 */
export function useAnchoredMenu({ open, onClose, maxWidth = 240 }) {
    const triggerRef = useRef(null)
    const menuRef = useRef(null)
    const [style, setStyle] = useState(null)

    useLayoutEffect(() => {
        // Nothing to clear when it closes: the panel is unmounted, and the next open re-measures in the
        // same layout pass before anything is painted.
        if (!open) return
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return
        const width = Math.min(maxWidth, window.innerWidth - MARGIN * 2)
        // Right-aligned on the trigger by preference, then pushed back inside whichever edge it crossed.
        let left = rect.right - width
        left = Math.min(left, window.innerWidth - MARGIN - width)
        left = Math.max(left, MARGIN)
        setStyle({ position: 'fixed', top: rect.bottom + MARGIN, left, width })
    }, [open, maxWidth])

    useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
            if (triggerRef.current?.contains(event.target)) return
            if (menuRef.current?.contains(event.target)) return
            onClose()
        }
        const onKeyDown = (event) => event.key === 'Escape' && onClose()
        // Fixed to the viewport, so a scroll would otherwise leave the panel hanging beside nothing.
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        window.addEventListener('scroll', onClose, true)
        window.addEventListener('resize', onClose)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('scroll', onClose, true)
            window.removeEventListener('resize', onClose)
        }
    }, [open, onClose])

    return { triggerRef, menuRef, style }
}
