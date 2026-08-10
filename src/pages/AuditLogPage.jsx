import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'
import { apiGet } from '../api/client'
import { formatDateTime, safeArray } from '../utils/format'
import { useServerTable } from '../hooks/useServerTable'
import { AUDIT_ACTIONS, AUDIT_ACTION_STYLES, AUDIT_ENTITY_TYPES, AUDIT_ENTITY_BY_VALUE } from '../constants/audit'
import PageHeader from '../components/PageHeader'
import DataTable from '../components/DataTable'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'

const ENTITY_BY_VALUE = AUDIT_ENTITY_BY_VALUE

/** Coloured pill naming what kind of change a row records. */
function ActionBadge({ action }) {
    const { t } = useTranslation()
    const style = AUDIT_ACTION_STYLES[action] || AUDIT_ACTION_STYLES.UPDATE
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
            {t(`audit.action.${action}`, action)}
        </span>
    )
}

/**
 * Company-wide "who did what, when" trail (owner/administrator only). Server-paginated like the other
 * list pages; rows link through to the audited record when it still exists.
 */
export default function AuditLogPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [actors, setActors] = useState([])

    const fetcher = useCallback(({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams({
            // The table is 1-based, the backend 0-based.
            page: String(page - 1),
            size: String(size),
            sortBy,
            sortDir,
        })
        if (q) params.set('search', q)
        if (filters.entityType?.length) params.set('entityType', filters.entityType.join(','))
        if (filters.action?.length) params.set('action', filters.action.join(','))
        if (filters.actor?.length) params.set('actorId', filters.actor.join(','))
        return apiGet(`/audit-logs?${params.toString()}`)
    }, [])

    const {
        rows, total, loading, page, pageSize, q, filters,
        setSearch, setFilter, setPage, setPageSize,
    } = useServerTable({
        filterKeys: ['entityType', 'action', 'actor'],
        fetcher,
        defaultSortBy: 'createdAt',
        defaultSortDir: 'desc',
    })

    // The "who" options come from the trail itself, so archived/deleted actors still appear.
    useEffect(() => {
        apiGet('/audit-logs/actors')
            .then((res) => setActors(safeArray(res)))
            .catch(() => { /* the api client already surfaced the error */ })
    }, [])

    const filtersActive = Boolean(q) || Object.values(filters).some((v) => v.length > 0)

    const entityLabel = (row) => t(ENTITY_BY_VALUE[row.entityType]?.labelKey || 'audit.entity.unknown', row.entityType)

    const linkFor = (row) => {
        const path = ENTITY_BY_VALUE[row.entityType]?.path
        return path && row.entityId ? path(row.entityId) : null
    }

    const columns = [
        { key: 'createdAt', label: t('audit.cols.when'), render: (r) => formatDateTime(r.createdAt) },
        { key: 'actorName', label: t('audit.cols.who'), render: (r) => r.actorName || t('audit.system') },
        { key: 'action', label: t('audit.cols.action'), render: (r) => <ActionBadge action={r.action} /> },
        { key: 'entityType', label: t('audit.cols.entity'), render: entityLabel },
        {
            key: 'details',
            label: t('audit.cols.details'),
            render: (r) => <span className="text-slate-600 dark:text-slate-300">{r.details || '—'}</span>,
        },
    ]

    return (
        <div>
            <PageHeader title={t('audit.title')} description={t('audit.subtitle')} />

            <SearchFilters
                search={q}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'entityType',
                        value: filters.entityType,
                        onChange: (v) => setFilter('entityType', v),
                        placeholder: t('audit.filters.allEntities'),
                        options: AUDIT_ENTITY_TYPES.map((e) => ({ value: e.value, label: t(e.labelKey) })),
                    },
                    {
                        key: 'action',
                        value: filters.action,
                        onChange: (v) => setFilter('action', v),
                        placeholder: t('audit.filters.allActions'),
                        options: AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`audit.action.${a}`) })),
                    },
                    {
                        key: 'actor',
                        value: filters.actor,
                        onChange: (v) => setFilter('actor', v),
                        placeholder: t('audit.filters.allActors'),
                        searchable: true,
                        options: actors.map((a) => ({ value: String(a.id), label: a.name || String(a.id) })),
                    },
                ]}
            />

            <DataTable
                tableId="auditLog"
                columns={columns}
                rows={rows}
                total={total}
                loading={loading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={ScrollText}
                        title={t('audit.emptyTitle')}
                        description={t('audit.emptyDesc')}
                    />
                }
                onRowClick={(row) => {
                    const to = linkFor(row)
                    if (to) navigate(to)
                }}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
            />
        </div>
    )
}
