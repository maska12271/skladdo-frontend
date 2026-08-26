import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { useBreakpoint } from '../hooks/useBreakpoint'

// Side by side only once there is room for both halves. The busier lists carry three or four action
// buttons whose labels run 40-70% wider in Estonian and Russian than in English, and the old layout gave
// that row `shrink-0` with no way to wrap: it overflowed the card while squeezing the title to nothing.
//
// Now the title takes whatever the actions leave (flex-1, so its own width never pushes the buttons
// around) down to a floor of 12rem, past which the action row shrinks and wraps its buttons instead.
// Below lg the two halves stack, since neither fits beside the other at tablet widths.
//
// `primaryAction` is the opt-in half of that. Wrapping is still the wrong answer on a phone — "Export /
// Import / Configure categories / Add manufacturer" becomes four stacked rows of chrome above the data
// people came to see. A page that passes one gets, below `lg`, its primary button plus a "More" menu
// holding the rest. A page that does not is laid out exactly as before, so this changes nothing until a
// page asks for it.
export default function PageHeader({ title, description, action, primaryAction }) {
    const { t } = useTranslation()
    const isDesktop = useBreakpoint() === 'desktop'
    const collapsed = Boolean(primaryAction) && !isDesktop

    return (
        <div className="shadow-card mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
            <div className="min-w-0 lg:min-w-48 lg:flex-1">
                <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
                {description ? (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
                ) : null}
            </div>

            {/* justify-end keeps a wrapped second row under the first and against the right edge, rather
                than jumping back to the left of the header. */}
            {collapsed ? (
                <div className="flex items-center justify-end gap-2">
                    {action ? <OverflowActions label={t('common.moreActions')}>{action}</OverflowActions> : null}
                    {primaryAction}
                </div>
            ) : (
                (action || primaryAction) && (
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {action}
                        {primaryAction}
                    </div>
                )
            )}
        </div>
    )
}

/**
 * The secondary actions, behind one button.
 *
 * The children are whatever the page already passes — ordinary buttons, and in most cases a `DataToolbar`.
 * So rather than re-describing them as data, they are re-styled where they land, by the child selectors on
 * the sheet. That keeps every page's existing handlers, permissions and labels exactly as they are.
 *
 * The panel used to be a dropdown hung off this button. It was never a good fit for a phone: it opened
 * mid-screen at the top of the display, was as narrow as the trigger allowed, and had to be measured and
 * clamped every time just to stay on screen — the version before that opened 46px off the left edge with
 * every label cut off. A sheet is the platform's own answer to this and needs none of that arithmetic.
 */
function OverflowActions({ label, children }) {
    const [open, setOpen] = useState(false)
    const close = useCallback(() => setOpen(false), [])

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={label}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            <ActionSheet open={open} title={label} onClose={close}>
                {children}
            </ActionSheet>
        </>
    )
}
