import { useEffect, useState } from 'react'

// The boundaries are Tailwind's own `md` and `lg`, so a component branching in JS and a class branching in
// CSS always agree — there is no second set of numbers to drift out of sync.
const TABLET_UP = '(min-width: 768px)'
const DESKTOP_UP = '(min-width: 1024px)'

function currentBreakpoint() {
    if (window.matchMedia(DESKTOP_UP).matches) return 'desktop'
    if (window.matchMedia(TABLET_UP).matches) return 'tablet'
    return 'mobile'
}

/**
 * Which device tier the viewport is in: `mobile` | `tablet` | `desktop`.
 *
 * For layout that cannot be expressed in CSS — rendering a *different tree* per tier, the way the sidebar
 * becomes a drawer. Anything that is only a matter of styling belongs in `md:`/`lg:` classes instead,
 * which cost no render and no listener.
 */
export function useBreakpoint() {
    const [breakpoint, setBreakpoint] = useState(currentBreakpoint)

    useEffect(() => {
        const lists = [window.matchMedia(TABLET_UP), window.matchMedia(DESKTOP_UP)]
        // Re-reads both queries rather than trusting whichever one fired: dragging a window narrow fast
        // enough crosses both boundaries, and only one `change` event is guaranteed to be seen.
        const sync = () => setBreakpoint(currentBreakpoint())
        lists.forEach((list) => list.addEventListener('change', sync))
        // A resize between the first render and this effect would otherwise stick until the next one.
        sync()
        return () => lists.forEach((list) => list.removeEventListener('change', sync))
    }, [])

    return breakpoint
}
