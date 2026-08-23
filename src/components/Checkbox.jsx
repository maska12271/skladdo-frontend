import { forwardRef } from 'react'
import { Check, Minus } from 'lucide-react'

/**
 * The app's checkbox.
 *
 * Still a real `<input type="checkbox">` — `appearance-none` only removes the platform's drawing, so
 * every native behaviour is untouched: label association, the space key, `indeterminate`, `disabled`,
 * form participation and how a screen reader announces it. The tick and the dash are ours, drawn over the
 * input and marked `pointer-events-none` so the input still receives every click.
 *
 * `className` lands on the wrapper, for callers that need to position it (a top margin, a negative one).
 * Size and colour belong to the component, so checkboxes cannot drift apart across pages the way the
 * hand-rolled ones had.
 */
const Checkbox = forwardRef(function Checkbox({ className = '', ...props }, ref) {
    return (
        <span className={`relative inline-flex shrink-0 ${className}`}>
            <input
                ref={ref}
                type="checkbox"
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 bg-white transition checked:border-teal-600 checked:bg-teal-600 indeterminate:border-teal-600 indeterminate:bg-teal-600 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
                {...props}
            />
            {/* Hidden while indeterminate, so a partially-selected page shows the dash alone. */}
            <Check
                aria-hidden="true"
                strokeWidth={3}
                className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
            />
            <Minus
                aria-hidden="true"
                strokeWidth={3}
                className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-indeterminate:opacity-100"
            />
        </span>
    )
})

export default Checkbox
