import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useServerTable } from '../hooks/useServerTable'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import DataToolbar from '../components/DataToolbar'
import StatusBadge from '../components/StatusBadge'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { useModal } from '../hooks/useModal'
import { useQuickCreate } from '../hooks/useQuickCreate'
import { usePermissions, useAuth } from '../context/AuthContext'
import QuickCreateModal from '../components/QuickCreateModal'
import TenderDashboard from '../components/TenderDashboard'
import { useToast } from '../context/ToastContext'
import { formatDate, safeArray } from '../utils/format'
import { FormField, FormSelect, TextareaField } from '../components/FormField.jsx'
import { useSettings } from '../context/SettingsContext'
import CurrencyRateField from '../components/CurrencyRateField.jsx'
import { Pencil, Trash2, ClipboardList, Eye } from 'lucide-react'

const emptyTenderForm = {
    title: '',
    tenderNumber: '',
    clientId: '',
    status: 'OPEN',
    publishedAt: '',
    deadline: '',
    description: '',
    estimatedValue: '',
    currency: '',
    exchangeRate: 1,
    rateSource: 'SAME',
    rateAsOfDate: null,
}

const exportColumns = [
    { header: 'ID', value: (r) => r.id },
    { header: 'Title', value: (r) => r.title },
    { header: 'Tender no.', value: (r) => r.tenderNumber },
    { header: 'Requester', value: (r) => r.clientName },
    { header: 'Status', value: (r) => r.status },
    { header: 'Published', value: (r) => r.publishedAt },
    { header: 'Deadline', value: (r) => r.deadline },
    { header: 'Estimated value', value: (r) => r.estimatedValue },
    { header: 'Parts', value: (r) => r.partCount },
    { header: 'Participating', value: (r) => r.participatingCount },
    { header: 'Won', value: (r) => r.wonCount },
    { header: 'Description', value: (r) => r.description },
]

export default function TendersPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('TENDERS')
    const { canSeePrices } = useAuth()
    const toast = useToast()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const { currency: baseCurrency, currencies, currencySymbol } = useSettings()

    // List / Dashboard tab, persisted in the URL (?tab=dashboard) so it survives refresh and deep links.
    const tab = searchParams.get('tab') === 'dashboard' ? 'dashboard' : 'list'
    const setTab = (next) => {
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev)
            if (next === 'list') p.delete('tab')
            else p.set('tab', next)
            return p
        }, { replace: true })
    }
    const { quickCreate, openQuickCreate, closeQuickCreate, handleQuickCreated } = useQuickCreate()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()

    const [clients, setClients] = useState([])
    const [form, setForm] = useState(emptyTenderForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    const [loading, setLoading] = useState(false)

    const buildTendersQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1) // the backend's pages are 0-based
        params.set('size', size)
        params.set('sortBy', sortBy)
        params.set('sortDir', sortDir)
        if (q) params.set('search', q)
        if (filters.status?.length) params.set('status', filters.status.join(','))
        return params
    }

    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['status'],
        fetcher: (params) => apiGet(`/tenders?${buildTendersQuery(params).toString()}`),
    })

    const statusFilter = filters.status
    const filtersActive = !!search || statusFilter.length > 0

    const fetchAllTenders = async () => {
        const params = buildTendersQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/tenders?${params.toString()}`))
    }

    useEffect(() => {
        loadReferences()
    }, [])

    // Clients populate the tender form's client picker; fetched in full (the tender list is paged
    // server-side).
    const loadReferences = async () => {
        const clientsRes = await apiGet('/clients?page=0&size=500&sortBy=id&sortDir=asc')
        setClients(safeArray(clientsRes))
    }

    const openCreate = async () => {
        setEditingId(null)
        setForm({ ...emptyTenderForm, currency: baseCurrency || 'EUR' })
        formModal.open()
        // Prefill a system-suggested tender number the user can override; the counter only advances when
        // the tender is actually saved with it (see CompanySettingsService.allocateNextTenderNumber).
        try {
            const res = await apiGet('/tenders/next-number')
            if (res?.number) setForm((prev) => ({ ...prev, tenderNumber: res.number }))
        } catch { /* leave the number blank; the backend allocates one on save */ }
        // Preselect the most-used currency with its suggested rate (falls back to the base currency).
        try {
            const q = await apiGet('/exchange-rates/most-used?scope=TENDER')
            if (q?.currency) {
                setForm((prev) => ({ ...prev, currency: q.currency, exchangeRate: q.rate ?? 1, rateSource: q.source, rateAsOfDate: q.asOfDate }))
            }
        } catch { /* keep the base currency default */ }
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setForm({
            title: item.title || '',
            tenderNumber: item.tenderNumber || '',
            clientId: item.clientId || '',
            status: item.status || 'OPEN',
            publishedAt: item.publishedAt || '',
            deadline: item.deadline || '',
            description: item.description || '',
            estimatedValue: item.estimatedValue ?? '',
            currency: item.currency || baseCurrency || 'EUR',
            exchangeRate: item.exchangeRate ?? 1,
            rateSource: 'SAVED',
            rateAsOfDate: null,
        })
        formModal.open()
    }

    // Deep-link support: ?edit=<id> opens the edit modal once rows are loaded (used by the detail page's
    // Edit button), then clears the param so a refresh/back doesn't reopen it.
    const editId = searchParams.get('edit')
    useEffect(() => {
        if (!editId || rows.length === 0) return
        const item = rows.find((r) => String(r.id) === String(editId))
        if (item) {
            openEdit(item)
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                next.delete('edit')
                return next
            }, { replace: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId, rows])

    const openDelete = (item) => {
        setDeletingItem(item)
        deleteModal.open()
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        const payload = {
            title: form.title,
            tenderNumber: form.tenderNumber,
            clientId: Number(form.clientId),
            status: form.status,
            publishedAt: form.publishedAt || null,
            deadline: form.deadline || null,
            description: form.description,
            estimatedValue: Number(form.estimatedValue || 0),
            currency: form.currency || baseCurrency || null,
            exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : null,
        }

        try {
            let saved
            if (editingId) {
                await apiPut(`/tenders/${editingId}`, payload)
            } else {
                saved = await apiPost('/tenders', payload)
            }
            toast.success(editingId ? t('tenders.updated') : t('tenders.created'))
            formModal.close()
            const createdId = saved?.id
            setEditingId(null)
            setForm(emptyTenderForm)
            await reload()
            // Send the user straight to the new tender's detail page to set up its parts.
            if (createdId) navigate(`/tenders/${createdId}`)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingItem) return
        setLoading(true)
        try {
            await apiDelete(`/tenders/${deletingItem.id}`)
            toast.success(t('tenders.deleted'))
            deleteModal.close()
            setDeletingItem(null)
            setSelectedIds((prev) => prev.filter((id) => id !== deletingItem.id))
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return
        setLoading(true)
        try {
            await Promise.all(selectedIds.map((id) => apiDelete(`/tenders/${id}`)))
            toast.success(t('tenders.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const renderRollup = (row) => {
        const parts = row.partCount ?? 0
        if (!parts) return <span className="text-slate-400">—</span>
        return (
            <div className="text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{t('tenders.rollup.parts', { n: parts })}</span>
                <span className="text-slate-400"> · {t('tenders.rollup.in', { n: row.participatingCount ?? 0 })}</span>
                {row.wonCount ? (
                    <span className="ml-1 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {t('tenders.rollup.won', { n: row.wonCount })}
                    </span>
                ) : null}
            </div>
        )
    }

    const columns = [
        { key: 'title', label: t('tenders.cols.title'), sortKey: 'title' },
        { key: 'tenderNumber', label: t('tenders.cols.tenderNo'), sortKey: 'tenderNumber' },
        { key: 'clientName', label: t('tenders.cols.requester'), sortKey: 'clientName' },
        { key: 'status', label: t('common.status'), sortKey: 'status', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'deadline', label: t('tenders.cols.deadline'), sortKey: 'deadline', render: (row) => formatDate(row.deadline) },
        { key: 'parts', label: t('tenders.cols.parts'), render: renderRollup },
        {
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end">
                    <ActionMenu
                        actions={[
                            { key: 'view', label: t('common.viewDetails'), icon: Eye, onClick: () => navigate(`/tenders/${row.id}`) },
                            ...(canEdit ? [{ key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEdit(row) }] : []),
                            ...(canDelete ? [{ key: 'delete', label: t('common.delete'), icon: Trash2, danger: true, onClick: () => openDelete(row) }] : []),
                        ]}
                    />
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('tenders.title')}
                description={t('tenders.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        {tab === 'list' && (
                            <DataToolbar
                                entityLabel="tenders"
                                exportColumns={exportColumns}
                                rows={rows}
                                fetchRows={fetchAllTenders}
                                count={total}
                            />
                        )}
                        {canCreate && (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('tenders.add')}
                            </button>
                        )}
                    </div>
                }
            />

            {/* List / Dashboard tabs */}
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
                {['list', 'dashboard'].map((tabKey) => (
                    <button
                        key={tabKey}
                        onClick={() => setTab(tabKey)}
                        className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                            tab === tabKey
                                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                        {t(`tenders.dashboard.tab.${tabKey}`)}
                    </button>
                ))}
            </div>

            {tab === 'dashboard' && <TenderDashboard canSeePrices={canSeePrices} baseCurrency={baseCurrency} />}

            {tab === 'list' && (
            <>
            <SearchFilters
                search={search}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: (v) => setFilter('status', v),
                        placeholder: t('common.allStatuses'),
                        options: [
                            { value: 'OPEN', label: t('statuses.OPEN') },
                            { value: 'PUBLISHED', label: t('statuses.PUBLISHED') },
                            { value: 'IN_PROGRESS', label: t('statuses.IN_PROGRESS') },
                            { value: 'CLOSED', label: t('statuses.CLOSED') },
                            { value: 'CANCELLED', label: t('statuses.CANCELLED') },
                        ],
                    },
                ]}
            />

            <DataTable
                tableId="tenders"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                onRowClick={(row) => navigate(`/tenders/${row.id}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={t('tenders.emptyTitle')}
                        description={t('tenders.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('tenders.add')}
                            </button>
                        ) : null}
                    />
                }
                selectable={canDelete}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                sortBy={sortBy}
                sortDir={sortDir}
                onSortChange={setSort}
                bulkActions={
                    canDelete ? (
                        <button
                            onClick={bulkDeleteModal.open}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
                        >
                            <Trash2 className="h-4 w-4" /> {t('common.deleteSelected')}
                        </button>
                    ) : null
                }
            />
            </>
            )}

            <Modal
                isOpen={formModal.isOpen}
                title={editingId ? t('tenders.editTitle') : t('tenders.addTitle')}
                onClose={formModal.close}
            >
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                    <FormField
                        id="tender-title"
                        label={t('tenders.form.title')}
                        name="title"
                        value={form.title}
                        onChange={handleChange}
                        required
                        placeholder={t('tenders.form.titlePlaceholder')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="tender-number"
                        label={t('tenders.form.tenderNumber')}
                        name="tenderNumber"
                        value={form.tenderNumber}
                        onChange={handleChange}
                        placeholder={t('tenders.form.tenderNumber')}
                    />

                    <FormSelect
                        id="tender-client"
                        label={t('tenders.form.requester')}
                        name="clientId"
                        value={form.clientId}
                        onChange={handleChange}
                        required
                        searchable
                        placeholder={t('tenders.form.selectRequester')}
                        options={clients.map((item) => ({ value: String(item.id), label: item.name }))}
                        onQuickCreate={(name) => openQuickCreate('client', name, (item) => {
                            setClients((prev) => [...prev, item.raw])
                            handleChange({ target: { name: 'clientId', value: item.value } })
                        })}
                    />

                    <FormSelect
                        id="tender-status"
                        label={t('common.status')}
                        name="status"
                        value={form.status}
                        onChange={handleChange}
                        placeholder={t('tenders.form.selectStatus')}
                        options={[
                            { value: 'OPEN', label: t('statuses.OPEN') },
                            { value: 'PUBLISHED', label: t('statuses.PUBLISHED') },
                            { value: 'IN_PROGRESS', label: t('statuses.IN_PROGRESS') },
                            { value: 'CLOSED', label: t('statuses.CLOSED') },
                            { value: 'CANCELLED', label: t('statuses.CANCELLED') },
                        ]}
                    />

                    <FormField
                        id="tender-estimated-value"
                        label={`${t('tenders.form.estimatedValue')} (${currencySymbol(form.currency || baseCurrency)})`}
                        type="number"
                        step="0.01"
                        min="0"
                        name="estimatedValue"
                        value={form.estimatedValue}
                        onChange={handleChange}
                        placeholder={t('tenders.form.estimatedValue')}
                    />

                    <CurrencyRateField
                        value={{ currency: form.currency, exchangeRate: form.exchangeRate, source: form.rateSource, asOfDate: form.rateAsOfDate }}
                        onChange={(next) => setForm((prev) => ({ ...prev, currency: next.currency, exchangeRate: next.exchangeRate, rateSource: next.source, rateAsOfDate: next.asOfDate }))}
                        baseCurrency={baseCurrency}
                        currencies={currencies}
                    />

                    <FormField
                        id="tender-published-at"
                        label={t('tenders.form.publishedAt')}
                        type="date"
                        name="publishedAt"
                        value={form.publishedAt}
                        onChange={handleChange}
                    />

                    <FormField
                        id="tender-deadline"
                        label={t('tenders.form.deadline')}
                        type="date"
                        name="deadline"
                        value={form.deadline}
                        onChange={handleChange}
                    />

                    <TextareaField
                        id="tender-description"
                        label={t('common.description')}
                        name="description"
                        value={form.description}
                        onChange={handleChange}
                        placeholder={t('common.description')}
                        rows={5}
                        className="md:col-span-2"
                    />

                    <div className="md:col-span-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={formModal.close}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 dark:border-slate-700"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                        >
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('tenders.createBtn')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('tenders.deleteTitle')}
                message={t('tenders.deleteConfirm', { name: deletingItem?.title || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('tenders.bulkDeleteTitle')}
                message={t('tenders.bulkDeleteConfirm', { count: selectedIds.length })}
                onClose={bulkDeleteModal.close}
                onConfirm={handleBulkDelete}
                loading={loading}
            />

            <QuickCreateModal
                type={quickCreate?.type}
                initialName={quickCreate?.name ?? ''}
                isOpen={!!quickCreate}
                onClose={closeQuickCreate}
                onCreated={handleQuickCreated}
            />
        </div>
    )
}
