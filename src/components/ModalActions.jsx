/**
 * A modal's buttons, pinned to the bottom of its scrolling body.
 *
 * The forms in this app are long — Add product is eight fields before the fold on a phone — and the
 * buttons used to be the last thing in the scroll, so opening one showed a wall of inputs and no way to
 * finish. Sticky rather than a separate footer region: the buttons stay inside their `<form>`, so submit
 * still submits, and there is nothing to plumb through Modal.
 *
 * The negative insets cancel the body's padding, and the bottom takes two of them to do it:
 *   - `-bottom-4` lets the bar sit *past* the scrollport's bottom edge while it is stuck, covering the
 *     body's bottom padding rather than leaving a strip of scrolling content visible under it.
 *   - `-mb-4` shortens its own margin box by the same amount, so its resting place at the end of the
 *     scroll is where it was while stuck. Without it the bar jumps 16px on the last scroll tick.
 * The safe-area allowance keeps the buttons clear of a phone's home indicator, which matters now that the
 * dialog sits on the bottom edge again.
 */
export default function ModalActions({ children, className = '' }) {
    return (
        <div
            className={`sticky -bottom-4 z-10 -mx-4 -mb-4 mt-5 flex justify-end gap-3 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pt-4 sm:pb-4 ${className}`}
        >
            {children}
        </div>
    )
}
