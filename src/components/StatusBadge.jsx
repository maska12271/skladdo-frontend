import { useTranslation } from 'react-i18next'

/**
 * Unified status pill used across all tables. Each known status maps to a tone
 * (colored dot + matching background) so statuses are scannable at a glance.
 * Unknown values fall back to a neutral slate pill with a prettified label.
 */

const TONES = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20',
    sky: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-400/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-400/20',
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-400/20',
    violet: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-400/20',
    rose: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-400/20',
    slate: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
}

const DOTS = {
    emerald: 'bg-emerald-500',
    sky: 'bg-sky-500',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-500',
    cyan: 'bg-cyan-500',
    violet: 'bg-violet-500',
    rose: 'bg-rose-500',
    slate: 'bg-slate-400',
}

// Tone per status. The human-readable label comes from the i18n `statuses.*` keys (CANCELED is an
// alias of CANCELLED), falling back to a prettified version of unknown values.
const STATUS_TONE = {
    NEW: 'sky',
    IN_PROGRESS: 'amber',
    CONFIRMED: 'indigo',
    SHIPPED: 'cyan',
    CLOSED: 'slate',
    CANCELLED: 'rose',
    CANCELED: 'rose',
    OPEN: 'emerald',
    PUBLISHED: 'violet',
    ACTIVE: 'emerald',
    INACTIVE: 'slate',
    LOW_STOCK: 'amber',
    OUT_OF_STOCK: 'rose',
    ARCHIVED: 'slate',
    WINNER: 'emerald',
    // Invoice statuses (OVERDUE is a synthetic value the frontend derives for unpaid + past-due rows).
    UNPAID: 'amber',
    PAID: 'emerald',
    VOID: 'slate',
    OVERDUE: 'rose',
    // Order payment statuses (derived from an order's invoices).
    NOT_INVOICED: 'slate',
    PREPAYMENT_PENDING: 'amber',
    PREPAYMENT_OVERDUE: 'rose',
    AWAITING_FINAL: 'violet',
    INVOICED: 'sky',
    // Sent-email send outcome.
    SENT: 'emerald',
    FAILED: 'rose',
    // Warehouse-connection lifecycle.
    PENDING: 'amber',
    REVOKED: 'slate',
}

// i18n key per status (CANCELED maps to the CANCELLED label).
const STATUS_LABEL_KEY = {
    NEW: 'NEW',
    IN_PROGRESS: 'IN_PROGRESS',
    CONFIRMED: 'CONFIRMED',
    SHIPPED: 'SHIPPED',
    CLOSED: 'CLOSED',
    CANCELLED: 'CANCELLED',
    CANCELED: 'CANCELLED',
    OPEN: 'OPEN',
    PUBLISHED: 'PUBLISHED',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    LOW_STOCK: 'LOW_STOCK',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
    ARCHIVED: 'ARCHIVED',
    WINNER: 'WINNER',
    UNPAID: 'UNPAID',
    PAID: 'PAID',
    VOID: 'VOID',
    OVERDUE: 'OVERDUE',
    NOT_INVOICED: 'NOT_INVOICED',
    PREPAYMENT_PENDING: 'PREPAYMENT_PENDING',
    PREPAYMENT_OVERDUE: 'PREPAYMENT_OVERDUE',
    AWAITING_FINAL: 'AWAITING_FINAL',
    INVOICED: 'INVOICED',
    SENT: 'SENT',
    FAILED: 'FAILED',
    PENDING: 'PENDING',
    REVOKED: 'REVOKED',
}

function prettify(value) {
    return String(value)
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
}

export default function StatusBadge({ status }) {
    const { t } = useTranslation()
    if (status === null || status === undefined || status === '') {
        return <span className="text-slate-400">—</span>
    }

    const key = String(status).toUpperCase()
    const tone = STATUS_TONE[key] || 'slate'
    const labelKey = STATUS_LABEL_KEY[key]
    const meta = { tone, label: labelKey ? t(`statuses.${labelKey}`) : prettify(status) }

    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONES[meta.tone]}`}
        >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[meta.tone]}`} />
            {meta.label}
        </span>
    )
}
