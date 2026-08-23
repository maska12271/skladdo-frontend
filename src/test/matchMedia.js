// jsdom implements no `matchMedia`, and `useBreakpoint` reads it during the first render — so any
// component test mounting something responsive would throw on `window.matchMedia is not a function`.
//
// This is a width-driven stand-in rather than a stub returning a fixed answer: `setViewportWidth` lets a
// test say which tier it is testing, which is the only way to cover a card view and a table view of the
// same component.

const DEFAULT_WIDTH = 1280

let width = DEFAULT_WIDTH
const listeners = new Set()

/** Re-evaluates every live query, the way a real viewport resize would. */
export function setViewportWidth(next) {
    width = next
    listeners.forEach((listener) => listener())
}

export function resetViewportWidth() {
    setViewportWidth(DEFAULT_WIDTH)
}

function matches(query) {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query)
    const max = /\(max-width:\s*(\d+)px\)/.exec(query)
    // Anything that isn't a width query — `prefers-color-scheme`, `prefers-reduced-motion` — reads as
    // false, which is the conventional default for each of them.
    if (!min && !max) return false
    if (min && width < Number(min[1])) return false
    if (max && width > Number(max[1])) return false
    return true
}

export function installMatchMedia() {
    if (typeof window === 'undefined') return
    window.matchMedia = (query) => ({
        media: query,
        // A getter, so a list captured before a `setViewportWidth` still reports the current answer.
        get matches() {
            return matches(query)
        },
        onchange: null,
        addEventListener: (_event, listener) => listeners.add(listener),
        removeEventListener: (_event, listener) => listeners.delete(listener),
        // The deprecated pair, for anything still calling it.
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
        dispatchEvent: () => false,
    })
}
