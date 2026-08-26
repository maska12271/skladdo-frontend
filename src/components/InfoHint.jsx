import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Matches the trigger's own width allowance in CustomSelect: the widest the bubble is allowed to get,
// before the viewport clamp below narrows it further.
const MAX_WIDTH = 224
const MARGIN = 8

/**
 * The little `?` beside a field label, and the explanation it opens.
 *
 * Every copy of this used to be written out at the call site as an absolutely positioned span, centred on
 * the trigger with `left-1/2 -translate-x-1/2 w-56`. Centring a fixed 224px box on a 20px button only
 * works when the button is at least 112px from both edges of the screen, which on a phone it never is —
 * a hint on the first field of a modal opened ~80px off the left of the screen and was unreadable.
 *
 * So the bubble is rendered in a portal, positioned against the viewport and clamped to it, the same way
 * `CustomSelect` positions its panel. It also flips above the trigger when there is no room below.
 *
 * Opening is driven by state rather than `group-hover`, so the bubble can be measured before it is placed.
 * It opens on hover and on focus — which is what a tap on a button gives it, so a phone is covered by the
 * same rule — and closes on blur, Escape, or a pointer anywhere else.
 */
export default function InfoHint({ text, label }) {
    const bubbleId = useId()
    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState(null)
    const triggerRef = useRef(null)
    const bubbleRef = useRef(null)

    useLayoutEffect(() => {
        if (!open) return
        const trigger = triggerRef.current
        const bubble = bubbleRef.current
        if (!trigger || !bubble) return

        const rect = trigger.getBoundingClientRect()
        const width = Math.min(MAX_WIDTH, window.innerWidth - MARGIN * 2)
        // Centre on the trigger, then push back inside whichever edge it crossed.
        let left = rect.left + rect.width / 2 - width / 2
        left = Math.min(left, window.innerWidth - MARGIN - width)
        left = Math.max(left, MARGIN)

        const height = bubble.offsetHeight
        const below = rect.bottom + MARGIN + height <= window.innerHeight
        const top = below ? rect.bottom + MARGIN : rect.top - MARGIN - height

        setCoords({ left, top, width })
    }, [open, text])

    useEffect(() => {
        if (!open) return undefined
        const close = () => setOpen(false)
        const onKeyDown = (event) => event.key === 'Escape' && setOpen(false)
        const onPointerDown = (event) => {
            if (!triggerRef.current?.contains(event.target)) setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onPointerDown)
        // Anchored to a rect that a scroll invalidates, and nothing here is worth re-measuring for.
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onPointerDown)
            window.removeEventListener('scroll', close, true)
            window.removeEventListener('resize', close)
        }
    }, [open])

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-label={label}
                aria-describedby={open ? bubbleId : undefined}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                ?
            </button>

            {open &&
                createPortal(
                    <span
                        ref={bubbleRef}
                        id={bubbleId}
                        role="tooltip"
                        // Rendered before it has been measured, so it is laid out off-screen for one frame
                        // rather than flashing in the wrong place.
                        style={coords
                            ? { position: 'fixed', left: coords.left, top: coords.top, width: coords.width }
                            : { position: 'fixed', left: -9999, top: 0, width: MAX_WIDTH }}
                        className="pointer-events-none z-[200] block rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal text-white shadow-lg dark:bg-slate-700"
                    >
                        {text}
                    </span>,
                    document.body,
                )}
        </>
    )
}
