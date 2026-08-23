/**
 * Small shared pieces of the platform admin panel.
 *
 * The panel is deliberately **not translated**. It is an internal operator tool used by the person who
 * runs Skladdo, not by customers, so putting its ~80 strings through the three-locale parity contract
 * (en/et/ru, enforced by `locales.test.js`) would cost real effort and add two machine translations
 * nobody will ever read. Everything customer-facing stays fully translated; if a second operator ever
 * needs another language, these strings move into the locale files unchanged.
 */

/** The derived company states the backend reports, and how each should read at a glance. */
const STATUS_STYLES = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    // Sponsored is deliberately not green: it is a good state, but one with an end date the operator
    // needs to keep an eye on, so it should not blend into the "nothing to do here" rows.
    SPONSORED: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15 dark:text-secondary-300',
    OVERDUE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    SUSPENDED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    // Invite-link states, which share the vocabulary of "usable / not usable any more".
    REVOKED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    EXPIRED: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    EXHAUSTED: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

export const COMPANY_STATUSES = ['ACTIVE', 'SPONSORED', 'OVERDUE', 'SUSPENDED']

/** The 30/60/90 presets, plus the ability to type any number of days. */
export const FREE_PERIOD_PRESETS = [30, 60, 90]

export const COMPANY_TYPES = ['BUSINESS', 'WAREHOUSE']

export const PLANS = ['STARTER', 'BUSINESS', 'ENTERPRISE', 'WAREHOUSE']

export function StatusBadge({ status }) {
    const style = STATUS_STYLES[status] || STATUS_STYLES.ACTIVE
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
            {status ? status.charAt(0) + status.slice(1).toLowerCase() : '—'}
        </span>
    )
}

/** Neutral pill for a plan or account type — these are labels, not states, so they carry no colour. */
export function Pill({ children }) {
    if (!children) return <span className="text-slate-400">—</span>
    return (
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {children}
        </span>
    )
}

/**
 * A date the operator reads as recency ("3 days ago"), falling back to a plain em dash.
 *
 * Absence is real information here and must not be dressed up: a null creation date means the company
 * predates the column, and a null last-login means nobody has *ever* signed in. Both are shown as
 * "Unknown" / "Never" rather than a guessed date.
 */
export function relativeDays(value) {
    if (!value) return null
    const then = new Date(value).getTime()
    if (!Number.isFinite(then)) return null
    const days = Math.floor((Date.now() - then) / 86_400_000)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
    const years = Math.floor(days / 365)
    return `${years} year${years === 1 ? '' : 's'} ago`
}

/** The mirror of {@link relativeDays} for a date ahead of now — "in 12 days", "tomorrow". */
export function daysUntil(value) {
    if (!value) return null
    const then = new Date(value).getTime()
    if (!Number.isFinite(then)) return null
    const days = Math.ceil((then - Date.now()) / 86_400_000)
    if (days < 0) return 'expired'
    if (days === 0) return 'today'
    if (days === 1) return 'tomorrow'
    return `in ${days} days`
}
