/**
 * Notification vocabulary shared by the bell and the account preferences.
 * Mirrors the backend `NotificationType` enum — keep the two in sync.
 */
import { AlertTriangle, CalendarClock, PackageMinus, MailOpen } from 'lucide-react'

export const NOTIFICATION_TYPES = [
    { value: 'INVOICE_OVERDUE', icon: AlertTriangle, accent: 'text-rose-600 dark:text-rose-400' },
    { value: 'TENDER_DEADLINE', icon: CalendarClock, accent: 'text-amber-600 dark:text-amber-400' },
    { value: 'LOW_STOCK', icon: PackageMinus, accent: 'text-orange-600 dark:text-orange-400' },
    { value: 'EMAIL_REPLY', icon: MailOpen, accent: 'text-teal-600 dark:text-teal-400' },
]

export const NOTIFICATION_TYPE_BY_VALUE = Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t.value, t])
)
