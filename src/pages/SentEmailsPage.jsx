import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Mail, Eye, MailCheck, Users } from 'lucide-react'
import { apiGet } from '../api/client'
import { useServerTable } from '../hooks/useServerTable'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import SentEmailDetailModal from '../components/SentEmailDetailModal'
import { formatDateTime, safeArray } from '../utils/format'

export default function SentEmailsPage() {
    const { t } = useTranslation()
    const { isAdmin } = useAuth()
    const navigate = useNavigate()

    // A single-recipient send opens the per-email modal directly; a bulk send (recipientCount > 1) opens
    // the batch detail page instead.
    const [detailId, setDetailId] = useState(null)
    // Managers can see who sent each email; resolve sender ids to names from the users list.
    const [userNames, setUserNames] = useState({})

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

    const buildQuery = ({ page, size, q }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1)
        params.set('size', size)
        if (q) params.set('search', q)
        return params
    }

    const {
        rows, total, loading, page, pageSize, sortBy, sortDir, q: search,
        setSearch, setPage, setPageSize, setSort,
    } = useServerTable({
        fetcher: (params) => apiGet(`/sent-email-batches?${buildQuery(params).toString()}`),
    })

    const filtersActive = !!search

    // "read by 4/10" style fraction, emerald once at least one recipient has hit the milestone.
    const countCell = (Icon, count, total) => (
        count > 0
            ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Icon className="h-4 w-4" />{count}/{total}</span>
            : <span className="text-slate-400">0/{total}</span>
    )

    const columns = [
        {
            key: 'recipient',
            label: t('emails.cols.recipient'),
            render: (r) => (r.recipientCount > 1
                ? <span className="inline-flex items-center gap-1.5 font-medium"><Users className="h-4 w-4 text-slate-400" />{t('emails.batch.recipients', { count: r.recipientCount })}</span>
                : (r.manufacturerName || r.recipientEmail || '—')),
        },
        { key: 'subject', label: t('emails.cols.subject'), sortKey: 'subject', render: (r) => <span className="line-clamp-1">{r.subject}</span> },
        ...(isAdmin ? [{ key: 'sentById', label: t('emails.cols.sender'), render: (r) => userNames[r.sentById] || '—' }] : []),
        { key: 'sentAt', label: t('emails.cols.sentAt'), sortKey: 'sentAt', render: (r) => formatDateTime(r.sentAt) },
        {
            key: 'status',
            sortKey: 'status',
            label: t('common.status'),
            render: (r) => (r.recipientCount === 1
                ? <StatusBadge status={r.failedCount > 0 ? 'FAILED' : 'SENT'} />
                : (
                    <span className="inline-flex items-center gap-2">
                        <span className="text-slate-600 dark:text-slate-300">{t('emails.batch.sent', { sent: r.sentCount, total: r.recipientCount })}</span>
                        {r.failedCount > 0 && (
                            <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                                {t('emails.batch.failed', { count: r.failedCount })}
                            </span>
                        )}
                    </span>
                )),
        },
        { key: 'viewed', label: t('emails.cols.viewed'), render: (r) => countCell(Eye, r.viewedCount, r.recipientCount) },
        { key: 'replied', label: t('emails.cols.replied'), render: (r) => countCell(MailCheck, r.repliedCount, r.recipientCount) },
    ]

    return (
        <div className="space-y-6">
            <PageHeader title={t('emails.title')} description={t('emails.description')} />

            <SearchFilters search={search} onSearchChange={setSearch} filters={[]} />

            <DataTable
                tableId="sent-emails"
                columns={columns}
                rows={rows}
                total={total}
                loading={loading}
                filtersActive={filtersActive}
                getRowId={(r) => r.batchKey}
                emptyState={
                    <EmptyState
                        icon={Mail}
                        title={t('emails.emptyTitle')}
                        description={t('emails.emptyDesc')}
                    />
                }
                onRowClick={(row) => (row.recipientCount > 1
                    ? navigate(`/emails/${encodeURIComponent(row.batchKey)}`)
                    : setDetailId(row.representativeId))}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                sortBy={sortBy}
                sortDir={sortDir}
                onSortChange={setSort}
            />

            <SentEmailDetailModal
                emailId={detailId}
                isOpen={detailId != null}
                onClose={() => setDetailId(null)}
            />
        </div>
    )
}
