import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { OVERLAY_BACKDROP } from '../constants/overlay'
import { ActionSheetContext } from '../context/ActionSheetContext'

/**
 * The phone-sized answer to "a few more actions": a sheet on the bottom edge, not a dropdown.
 *
 * A dropdown is anchored to its trigger, and on a phone that trigger is a 44px button two thirds of the
 * way across the screen — so the panel is narrow, floats mid-screen, sits at the far end of a thumb's
 * reach, and has to be measured and clamped just to stay on the display at all. A sheet has none of those
 * problems: it is the full width of the screen, its rows are as wide as they can be, and it lands where
 * the thumb already is.
 *
 * Rows are the children the page already passes; the selectors below restyle them in place — see
 * PageHeader. Everything else here is the sheet itself: the scrim, the safe-area allowance under the last
 * row, and a Cancel row, which is the dismissal people look for on a sheet. No drag handle: there is no
 * swipe-to-dismiss behind it, and a handle that does not drag is a promise the sheet cannot keep.
 */
export default function ActionSheet({ open, title, onClose, children }) {
    const { t } = useTranslation()
    const panelRef = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        // The page behind must not scroll while the sheet is over it.
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        // Focus the sheet so Escape and Tab reach it rather than the page underneath.
        panelRef.current?.focus()
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = previousOverflow
        }
    }, [open, onClose])

    // Hidden rather than unmounted. The rows are live components with state of their own — DataToolbar
    // owns whether its import dialog is showing — and tapping a row closes the sheet, so unmounting here
    // threw that state away in the same tick it was set: Import closed the sheet and opened nothing.
    // `display: none` also takes the rows out of the tab order and the accessibility tree, so a closed
    // sheet is as absent as it ever was.
    return createPortal(
        <div
            className={open
                ? `overlay-enter fixed inset-0 z-[70] flex items-end justify-center ${OVERLAY_BACKDROP}`
                : 'hidden'}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                ref={panelRef}
                role="menu"
                aria-label={title}
                tabIndex={-1}
                // `touch-manipulation` drops the browser's 300ms double-tap wait, which on a list of
                // one-shot actions is the difference between the sheet feeling native and feeling laggy.
                className="sheet-enter w-full max-w-md touch-manipulation p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] outline-none"
            >
                {/* Groups of rows, each group its own rounded card — the shape a phone user already reads
                    as "pick one of these", and what keeps Cancel visibly apart from the actions. */}
                <div className="shadow-pop overflow-hidden rounded-2xl bg-white dark:bg-slate-800">
                    <p className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {title}
                    </p>
                    <ActionSheetContext.Provider value>
                        {/* No row opens a menu of its own, so any tap in here is a decision and the sheet
                            can close on it. A row that opens a *dialog* still works: the rows are only
                            hidden, never unmounted, so the dialog it just opened stays open. */}
                        <div
                            onClick={onClose}
                            className="flex flex-col [&_button]:flex [&_button]:border-t [&_button]:border-slate-200 dark:[&_button]:border-slate-700/70 [&_button]:min-h-[52px] [&_button]:w-full [&_button]:items-center [&_button]:justify-center [&_button]:gap-2.5 [&_button]:rounded-none [&_button]:border-x-0 [&_button]:border-b-0 [&_button]:bg-transparent [&_button]:px-4 [&_button]:text-[15px] [&_button]:font-medium [&_button]:text-slate-700 [&_button:active]:bg-slate-100 dark:[&_button]:text-slate-100 dark:[&_button:active]:bg-slate-700/60 [&_div]:contents [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0 [&_svg]:text-slate-400"
                        >
                            {children}
                        </div>
                    </ActionSheetContext.Provider>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="shadow-pop mt-2 min-h-[52px] w-full touch-manipulation rounded-2xl bg-white text-[15px] font-semibold text-slate-600 active:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700/60"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </div>,
        document.body,
    )
}
