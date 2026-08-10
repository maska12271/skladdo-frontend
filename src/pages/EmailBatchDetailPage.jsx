import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Users, Eye, MailCheck, AlertTriangle } from 'lucide-react'
import { apiGet } from '../api/client'
import { useAuth } from '../context/AuthContext'
import LoadingBlock from '../components/LoadingBlock'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import SentEmailDetailModal from '../components/SentEmailDetailModal'
import { formatDateTime, safeArray } from '../utils/format'

/**
 * Per-recipient breakdown of one bulk send: the shared subject/sender plus a table of every recipient with
 * their individual open/reply state. Clicking a recipient opens the existing single-email detail (rendered
 * body + reply thread). Reached from the sent-emails list only for batches with more than one recipient.
 */
export default function EmailBatchDetailPage() {
    const { t } = useTranslation()
    const { batchId } = useParams()
    const navigate = useNavigate()
    const { isAdmin } = useAuth()

    const [batch, setBatch] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [detailId, setDetailId] = useState(null)
    const [userNames, setUserNames] = useState({})

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        apiGet(`/sent-email-batches/${encodeURIComponent(batchId)}`)
            .then((res) => !cancelled && setBatch(res))
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => { cancelled = true }
    }, [batchId])

    useEffect(() => {
        if (!isAdmin) return
        apiGet('/users')
            .then((res) => {
                const map = {}
                for (const u of safeArray(res)) map[u.id] = u.fullName || u.email
                setUserNames(map)
            })
            .catch(() => {})
    }, [isAdmin])

    if (loading) return <LoadingBlock text={t('common.loading')} />
    if (error || !batch) {
        return (
            <div className="space-y-4">
                <BackButton onClick={() => navigate('/emails')} label={t('emails.batch.back')} />
                <LoadingBlock text={t('emails.batch.notFound')} />
            </div>
        )
    }

    const columns = [
        {
            key: 'manufacturerName',
            label: t('emails.cols.manufacturer'),
            render: (r) => r.manufacturerName || r.recipientEmail || '—',
        },
        { key: 'recipientEmail', label: t('emails.detail.recipient'), render: (r) => r.recipientEmail || '—' },
        { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
        {
            key: 'viewed',
            label: t('emails.cols.viewed'),
            render: (r) => (r.viewed
                ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Eye className="h-4 w-4" />{formatDateTime(r.viewedAt)}</span>
                : <span className="text-slate-400">{t('common.no')}</span>),
        },
        {
            key: 'replied',
            label: t('emails.cols.replied'),
            render: (r) => (r.replied
                ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><MailCheck className="h-4 w-4" />{formatDateTime(r.repliedAt)}</span>
                : <span className="text-slate-400">{t('common.no')}</span>),
        },
    ]

    return (
        <div className="space-y-6">
            <BackButton onClick={() => navigate('/emails')} label={t('emails.batch.back')} />

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h1 className="text-2xl font-bold tracking-tight">{batch.subject}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {formatDateTime(batch.sentAt)}
                    {isAdmin && batch.sentById != null && ` · ${userNames[batch.sentById] || ''}`}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat icon={Users} color="slate" label={t('emails.batch.recipientsLabel')} value={batch.recipientCount} />
                    <Stat icon={Eye} color="emerald" label={t('emails.cols.viewed')} value={`${batch.viewedCount}/${batch.recipientCount}`} />
                    <Stat icon={MailCheck} color="emerald" label={t('emails.cols.replied')} value={`${batch.repliedCount}/${batch.recipientCount}`} />
                    <Stat icon={AlertTriangle} color="rose" label={t('emails.batch.failedLabel')} value={batch.failedCount} />
                </div>
            </div>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('emails.batch.recipientsTitle')}</h2>
                <DataTable
                    tableId="email-batch-recipients"
                    columns={columns}
                    rows={safeArray(batch.recipients)}
                    getRowId={(r) => r.id}
                    onRowClick={(r) => setDetailId(r.id)}
                    initialPageSize={25}
                />
            </section>

            <SentEmailDetailModal
                emailId={detailId}
                isOpen={detailId != null}
                onClose={() => setDetailId(null)}
            />
        </div>
    )
}

const STAT_COLORS = {
    slate: 'text-slate-500 dark:text-slate-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
}

function Stat({ icon: Icon, color, label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${STAT_COLORS[color]}`}>
                <Icon className="h-4 w-4" /> {label}
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
    )
}

function BackButton({ onClick, label }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
            <ChevronLeft className="h-4 w-4" /> {label}
        </button>
    )
}
