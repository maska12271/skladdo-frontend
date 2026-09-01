import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Users, AlertTriangle, X, CalendarClock } from 'lucide-react'
import { apiDelete, apiGet, apiPut } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useModal } from '../hooks/useModal'
import { useSettings } from '../context/SettingsContext'
import DataTable from './DataTable'
import EmptyState from './EmptyState'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import ModalActions from './ModalActions'
import DateField from './DateField'
import TimeField from './TimeField'
import { formatDateTime, safeArray } from '../utils/format'
import { instantToLocalParts, localPartsToInstant } from '../utils/companyTime'

/**
 * Emails queued to go out later: what is waiting, when, and the two things that can still be done to one
 * (move it, or drop it).
 *
 * <p>Everything here is outstanding work - a send that fires is deleted from the queue and lives on in
 * the Sent tab instead - so the list is short by construction and needs no paging or search. The one
 * exception is a send that could not be made at all, which is kept with its reason so somebody sees it.</p>
 */
export default function ScheduledEmailsTab({ userNames = {}, isAdmin, clientId }) {
    const { t } = useTranslation()
    const toast = useToast()
    const { timezone } = useSettings()

    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [target, setTarget] = useState(null)
    // The new time under edit, as the two pickers hold it: an ISO date and a 24-hour HH:mm.
    const [newWhen, setNewWhen] = useState({ date: '', time: '' })
    const [busy, setBusy] = useState(false)

    const rescheduleModal = useModal()
    const cancelModal = useModal()

    // Deliberately does not raise `loading` itself: it starts true for the first fetch, and the reloads
    // after a reschedule or a cancel are already covered by `busy` on the modal that triggered them.
    // Keeping it out also keeps the mount effect free of a synchronous setState.
    const load = useCallback(() => apiGet(clientId ? `/scheduled-emails?clientId=${clientId}` : '/scheduled-emails')
        .then((res) => setRows(safeArray(res)))
        .catch(() => {})
        .finally(() => setLoading(false)), [clientId])

    useEffect(() => {
        load()
    }, [load])

    const openReschedule = (row) => {
        setTarget(row)
        setNewWhen(instantToLocalParts(row.scheduledAt, timezone))
        rescheduleModal.open()
    }

    const openCancel = (row) => {
        setTarget(row)
        cancelModal.open()
    }

    const doReschedule = async (e) => {
        e.preventDefault()
        if (!target || !newWhen.date || !newWhen.time) return
        setBusy(true)
        try {
            await apiPut(`/scheduled-emails/${target.id}`, {
                scheduledAt: localPartsToInstant(newWhen.date, newWhen.time, timezone),
            })
            toast.success(t('emails.scheduled.rescheduled'))
            rescheduleModal.close()
            await load()
        } finally {
            setBusy(false)
        }
    }

    const doCancel = async () => {
        if (!target) return
        setBusy(true)
        try {
            await apiDelete(`/scheduled-emails/${target.id}`)
            toast.success(t('emails.scheduled.cancelled'))
            cancelModal.close()
            await load()
        } finally {
            setBusy(false)
        }
    }

    const columns = [
        {
            key: 'scheduledAt',
            label: t('emails.scheduled.cols.when'),
            render: (r) => (
                <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {formatDateTime(r.scheduledAt)}
                </span>
            ),
        },
        { key: 'subject', label: t('emails.cols.subject'), render: (r) => <span className="line-clamp-1">{r.subject}</span> },
        {
            key: 'recipientCount',
            label: t('emails.cols.recipient'),
            render: (r) => (
                <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-slate-400" />
                    {t('emails.batch.recipients', { count: r.recipientCount })}
                    <span className="text-xs text-slate-400">
                        · {t(`emails.recipientType.${(r.recipientType || 'MANUFACTURER').toLowerCase()}`)}
                    </span>
                </span>
            ),
        },
        ...(isAdmin ? [{ key: 'createdById', label: t('emails.cols.sender'), render: (r) => userNames[r.createdById] || '—' }] : []),
        {
            key: 'status',
            label: t('common.status'),
            render: (r) => (r.status === 'PENDING'
                ? <span className="text-slate-600 dark:text-slate-300">{t('emails.scheduled.statuses.PENDING')}</span>
                : (
                    <span
                        className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"
                        title={r.failureReason || ''}
                    >
                        <AlertTriangle className="h-4 w-4" />
                        {t(`emails.scheduled.statuses.${r.status}`)}
                    </span>
                )),
        },
        {
            key: 'actions',
            label: '',
            render: (r) => (r.status === 'PENDING' ? (
                <div className="flex justify-end gap-1">
                    <button
                        onClick={() => openReschedule(r)}
                        aria-label={t('emails.scheduled.reschedule')}
                        title={t('emails.scheduled.reschedule')}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <CalendarClock className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => openCancel(r)}
                        aria-label={t('emails.scheduled.cancel')}
                        title={t('emails.scheduled.cancel')}
                        className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : null),
        },
    ]

    return (
        <div className="space-y-4">
            {/* A failed send explains itself in full here rather than only in a tooltip - the reason is
                usually something the company has to go and fix (SMTP, a lapsed add-on). */}
            {rows.filter((r) => r.status !== 'PENDING' && r.failureReason).map((r) => (
                <div
                    key={`failure-${r.id}`}
                    className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><span className="font-medium">{r.subject}</span> — {r.failureReason}</span>
                </div>
            ))}

            <DataTable
                tableId="scheduled-emails"
                columns={columns}
                rows={rows}
                loading={loading}
                getRowId={(r) => r.id}
                initialPageSize={25}
                emptyState={
                    <EmptyState
                        icon={Clock}
                        title={t('emails.scheduled.emptyTitle')}
                        description={t('emails.scheduled.emptyDesc')}
                    />
                }
            />

            <Modal isOpen={rescheduleModal.isOpen} title={t('emails.scheduled.reschedule')} onClose={rescheduleModal.close}>
                <form onSubmit={doReschedule} className="grid gap-4">
                    <div className="space-y-1">
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            {t('emails.compose.scheduledAt')}
                        </span>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <DateField
                                id="reschedule-when-date"
                                name="date"
                                value={newWhen.date}
                                onChange={(e) => setNewWhen((w) => ({ ...w, date: e.target.value }))}
                                inputClassName="text-sm bg-white dark:bg-slate-900"
                            />
                            <TimeField
                                id="reschedule-when-time"
                                name="time"
                                value={newWhen.time}
                                onChange={(e) => setNewWhen((w) => ({ ...w, time: e.target.value }))}
                                inputClassName="text-sm bg-white dark:bg-slate-900"
                            />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {timezone ? t('emails.compose.scheduleHintZone', { timezone }) : t('emails.compose.scheduleHint')}
                        </p>
                    </div>
                    <ModalActions>
                        <button type="button" onClick={rescheduleModal.close} className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={busy || !newWhen.date || !newWhen.time} className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60">
                            {busy ? t('common.saving') : t('common.save')}
                        </button>
                    </ModalActions>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={cancelModal.isOpen}
                title={t('emails.scheduled.cancelTitle')}
                message={t('emails.scheduled.cancelConfirm', { subject: target?.subject || '' })}
                onClose={cancelModal.close}
                onConfirm={doCancel}
                loading={busy}
            />
        </div>
    )
}
