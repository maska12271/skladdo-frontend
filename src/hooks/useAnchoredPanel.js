import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A dropdown panel positioned against the viewport rather than its parent, plus the open/close plumbing
 * every such panel needs: outside click, Escape, and re-measuring on scroll and resize.
 *
 * <p>Fixed positioning in a portal is what the pickers need to survive a modal: inside a modal body a
 * calendar is taller than the space below its field, and an absolutely positioned one was either clipped
 * by the scrolling body or pushed off the bottom of a phone. Extracted from {@code DateField} when
 * {@code TimeField} needed the identical behaviour - two copies of this would drift.</p>
 *
 * <p>The caller owns when to re-measure beyond scroll/resize, because only it knows what changes its
 * panel's height (paging to the month grid, say). Run {@code measure} from a layout effect keyed on
 * whatever those are.</p>
 */
export function useAnchoredPanel({ estimatedHeight = 330, maxWidth = 310 } = {}) {
    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState(null)
    const wrapRef = useRef(null)
    const panelRef = useRef(null)

    const measure = useCallback(() => {
        const el = wrapRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const gap = 4
        const margin = 8
        const height = panelRef.current?.offsetHeight ?? estimatedHeight
        const width = Math.min(maxWidth, window.innerWidth - margin * 2)

        const spaceBelow = window.innerHeight - rect.bottom - margin
        // Flip above the field only when there is genuinely more room up there - otherwise a panel near
        // the middle of the screen would jump sides on every small scroll.
        const openUp = spaceBelow < height && rect.top - margin > spaceBelow

        let left = rect.left
        left = Math.min(left, window.innerWidth - margin - width)
        left = Math.max(left, margin)

        setCoords(openUp
            ? { left, bottom: window.innerHeight - rect.top + gap, width }
            : { left, top: rect.bottom + gap, width })
    }, [estimatedHeight, maxWidth])

    useEffect(() => {
        if (!open) return undefined
        const reposition = () => measure()
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false)
        }
        const onPointerDown = (event) => {
            if (wrapRef.current?.contains(event.target)) return
            if (panelRef.current?.contains(event.target)) return
            setOpen(false)
        }
        // Capture, so a scroll inside a modal body repositions the panel too, not just a window scroll.
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onPointerDown)
        return () => {
            window.removeEventListener('scroll', reposition, true)
            window.removeEventListener('resize', reposition)
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onPointerDown)
        }
    }, [open, measure])

    /** Inline style for the panel: fixed, and parked off-screen until the first measurement lands. */
    const panelStyle = {
        position: 'fixed',
        left: coords?.left ?? -9999,
        width: coords?.width ?? maxWidth,
        ...(coords && 'bottom' in coords ? { bottom: coords.bottom } : { top: coords?.top ?? 0 }),
    }

    return { open, setOpen, coords, wrapRef, panelRef, measure, panelStyle }
}
