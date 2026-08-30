import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { OVERLAY_BACKDROP } from '../constants/overlay'

function getFocusableElements(container) {
    if (!container) return []
    return Array.from(
        container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'))
}

/**
 * The caller's width cap, paired with the `sm:`-prefixed variant that actually applies it.
 *
 * Spelled out as literal strings on purpose. Tailwind only emits a utility it can see written out in
 * the source, and this used to build the variant at runtime (`sm:${width}`) — which produced a class
 * name with no rule behind it, so **every modal in the app was uncapped on desktop** and grew to the
 * full width of the window. Adding a size here means adding both halves of the pair.
 */
const WIDTHS = {
    'max-w-md': 'sm:max-w-md',
    'max-w-lg': 'sm:max-w-lg',
    'max-w-xl': 'sm:max-w-xl',
    'max-w-2xl': 'sm:max-w-2xl',
    'max-w-3xl': 'sm:max-w-3xl',
}

const DEFAULT_WIDTH = 'max-w-3xl'

export default function Modal({ isOpen, title, children, onClose, width = DEFAULT_WIDTH }) {
    const { t } = useTranslation()
    const dialogRef = useRef(null)
    const lastActiveElementRef = useRef(null)

    useEffect(() => {
        if (!isOpen) return

        lastActiveElementRef.current = document.activeElement

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const dialog = dialogRef.current

        const focusFirst = () => {
            const focusable = getFocusableElements(dialog)
            if (focusable.length > 0) {
                focusable[0].focus()
            } else {
                dialog?.focus()
            }
        }

        const timer = setTimeout(focusFirst, 0)

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
            }

            if (event.key === 'Tab') {
                const focusable = getFocusableElements(dialog)
                if (focusable.length === 0) {
                    event.preventDefault()
                    dialog?.focus()
                    return
                }

                const first = focusable[0]
                const last = focusable[focusable.length - 1]

                if (event.shiftKey) {
                    if (document.activeElement === first || document.activeElement === dialog) {
                        event.preventDefault()
                        last.focus()
                    }
                } else {
                    if (document.activeElement === last) {
                        event.preventDefault()
                        first.focus()
                    }
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            clearTimeout(timer)
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', handleKeyDown)
            lastActiveElementRef.current?.focus?.()
        }
    }, [isOpen])

    if (!isOpen) return null

    // The cap is a desktop concern. Below `sm` the dialog is a sheet the full width of the screen, so it
    // only takes effect from `sm` up — a capped box floating in the middle of a phone wastes the screen
    // and leaves the form squeezed inside it.
    const widthFromSm = WIDTHS[width] ?? WIDTHS[DEFAULT_WIDTH]

    // Portalled to the body rather than rendered where it was declared. `fixed` is resolved against the
    // nearest transformed or filtered ancestor rather than the viewport, and a dialog opened from inside a
    // hidden container inherits the hiding — which is exactly what happened to the import dialog once the
    // toolbar that owns it moved into the action sheet: the sheet closed, and the dialog went with it.
    return createPortal(
        <div
            className={`overlay-enter fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 ${OVERLAY_BACKDROP}`}
            onMouseDown={(e) => {
                // Click on the dim backdrop (outside the dialog) dismisses the modal.
                if (e.target === e.currentTarget) onClose()
            }}
        >
            {/* A column with a scrolling body rather than a block with a tall child: it keeps the title and
                the close button pinned while the content moves, which matters most on the screen where the
                content is longest relative to the viewport.

                Capped in `dvh` rather than `vh`: on a phone `vh` counts the space behind the browser's own
                collapsing toolbars, so a 92vh sheet can still run off the bottom of what you can see —
                taking the buttons, which are pinned to the bottom of the body, with it. */}
            <div
                className={`dialog-enter shadow-pop flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 sm:max-h-[85dvh] sm:rounded-3xl ${widthFromSm}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                ref={dialogRef}
                tabIndex={-1}
            >
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800 sm:px-6 sm:py-4">
                    {/* Truncated: a long title on a narrow sheet would otherwise push the close button off. */}
                    <h2 id="modal-title" className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="-mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* No safe-area allowance here: `ModalActions` is the bottom-most thing in every dialog
                    that has buttons, and it carries the allowance itself. */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {children}
                </div>
            </div>
        </div>,
        document.body,
    )
}