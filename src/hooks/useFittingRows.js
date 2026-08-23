import { useEffect, useRef, useState } from 'react'

/**
 * How many rows of roughly `rowHeight` fit in the element the returned ref is attached to.
 *
 * Dashboard widgets are resizable, so their height is whatever the person dragged it to — and a list
 * sized against one particular height is right only at that height. Tuned by hand it was always wrong
 * somewhere: too few rows left a band of empty space, too many put a scrollbar inside a widget that is
 * supposed to be glanceable. This measures the box instead of assuming it.
 *
 * Re-measures on resize, so dragging a widget larger fills it rather than leaving a gap.
 *
 * @param {number} rowHeight approximate height of one row, in pixels
 * @param {number} max       never show more than this many, however tall the widget gets
 * @returns {[React.RefObject, number]} the ref to attach, and the row count that fits
 */
export function useFittingRows(rowHeight, max) {
    const ref = useRef(null)
    const [count, setCount] = useState(max)

    useEffect(() => {
        const el = ref.current
        if (!el) return undefined
        const observer = new ResizeObserver(([entry]) => {
            const available = entry.contentRect.height
            // At least one row: a widget too short for even that should show one and clip, rather than
            // render an empty list that looks broken.
            const fits = Math.max(1, Math.floor(available / rowHeight))
            setCount(Math.min(max, fits))
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [rowHeight, max])

    return [ref, count]
}
