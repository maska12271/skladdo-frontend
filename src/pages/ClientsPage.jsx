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
import { useFrequentCountries } from '../hooks/useFrequentCountries'
import { usePermissions } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { safeArray, parseBool } from '../utils/format'
import {FormField, TextareaField} from "../components/FormField.jsx";
import CountrySelectField from "../components/CountrySelectField.jsx";
import AddressAutocompleteField from "../components/AddressAutocompleteField.jsx";
import { Eye, Pencil, Trash2, Archive, ArchiveRestore, Users } from 'lucide-react'

// One schema drives both export (headers localised to the current language) and import (headers
// matched against each field's label in every app language). `id` is export-only.
const CLIENT_FIELDS = [
    { key: 'id', labelKey: 'common.id', importable: false, value: (r) => r.id },
    { key: 'name', labelKey: 'common.name', required: true, example: 'City Hospital', value: (r) => r.name },
    { key: 'registrationCode', labelKey: 'clients.registrationCode', aliasKeys: ['clients.regCode'], example: '12345678', value: (r) => r.registrationCode },
    { key: 'email', labelKey: 'common.email', example: 'procurement@hospital.gov', value: (r) => r.email },
    { key: 'phone', labelKey: 'common.phone', example: '+372 555 1234', value: (r) => r.phone },
    { key: 'country', labelKey: 'common.country', example: 'Estonia', value: (r) => r.country },
    { key: 'address', labelKey: 'common.address', value: (r) => r.address },
    { key: 'contactPerson', labelKey: 'clients.contactPerson', example: 'Jane Doe', value: (r) => r.contactPerson },
    { key: 'notes', labelKey: 'common.notes', value: (r) => r.notes },
    { key: 'status', labelKey: 'common.status', aliasKeys: ['common.active'], example: 'Active', value: (r) => (r.archived ? 'Archived' : 'Active') },
]

const emptyForm = {
    name: '',
    registrationCode: '',
    email: '',
    phone: '',
    country: '',
    address: '',
    contactPerson: '',
    notes: '',
    active: true,
}

export default function ClientsPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('CLIENTS')
    const toast = useToast()
    const navigate = useNavigate()
    const frequentCountries = useFrequentCountries('clients')
    const parseImportRow = (r) => {
        const name = (r.name || '').trim()
        if (!name) return { error: t('clients.import.nameRequired') }
        return {
            payload: {
                name,
                registrationCode: r.registrationCode || '',
                email: r.email || '',
                phone: r.phone || '',
                country: r.country || '',
                address: r.address || '',
                contactPerson: r.contactPerson || '',
                notes: r.notes || '',
                active: parseBool(r.status, true),
            },
        }
    }
    const [searchParams, setSearchParams] = useSearchParams()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()

    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    const [loading, setLoading] = useState(false)

    const buildClientsQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1) // the backend's pages are 0-based
        params.set('size', size)
        params.set('sortBy', sortBy)
        params.set('sortDir', sortDir)
        if (q) params.set('search', q)
        if (filters.status?.length) params.set('status', filters.status.join(','))
        // Archived clients stay hidden unless the user explicitly asks for them via the status filter.
        params.set('includeArchived', filters.status?.includes('archived') ? 'true' : 'false')
        return params
    }

    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['status'],
        fetcher: (params) => apiGet(`/clients?${buildClientsQuery(params).toString()}`),
    })

    const statusFilter = filters.status
    const filtersActive = !!search || statusFilter.length > 0

    const fetchAllClients = async () => {
        const params = buildClientsQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/clients?${params.toString()}`))
    }

    // Deep-link support: ?edit=<id> opens the edit modal once rows are loaded (used by the detail
    // page's Edit button), then clears the param so a refresh/back doesn't reopen it.
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

    const openCreate = () => {
        setEditingId(null)
        setForm(emptyForm)
        formModal.open()
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setForm({
            name: item.name || '',
            registrationCode: item.registrationCode || '',
            email: item.email || '',
            phone: item.phone || '',
            country: item.country || '',
            address: item.address || '',
            contactPerson: item.contactPerson || '',
            notes: item.notes || '',
            active: !!item.active,
        })
        formModal.open()
    }

    const openDelete = (item) => {
        setDeletingItem(item)
        deleteModal.open()
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (editingId) {
                await apiPut(`/clients/${editingId}`, form)
            } else {
                await apiPost('/clients', form)
            }
            toast.success(editingId ? t('clients.updated') : t('clients.created'))
            formModal.close()
            setEditingId(null)
            setForm(emptyForm)
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingItem) return
        setLoading(true)
        try {
            await apiDelete(`/clients/${deletingItem.id}`)
            toast.success(t('clients.deleted'))
            deleteModal.close()
            setDeletingItem(null)
            setSelectedIds((prev) => prev.filter((id) => id !== deletingItem.id))
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const handleArchiveToggle = async (item) => {
        await apiPut(`/clients/${item.id}/${item.archived ? 'unarchive' : 'archive'}`, {})
        toast.success(item.archived ? t('clients.unarchived') : t('clients.archived'))
        setSelectedIds((prev) => prev.filter((id) => id !== item.id))
        await reload()
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return
        setLoading(true)
        try {
            await Promise.all(selectedIds.map((id) => apiDelete(`/clients/${id}`)))
            toast.success(t('clients.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const columns = [
        { key: 'name', label: t('common.name'), sortKey: 'name' },
        { key: 'registrationCode', label: t('clients.regCode'), sortKey: 'registrationCode' },
        { key: 'email', label: t('common.email'), sortKey: 'email' },
        { key: 'phone', label: t('common.phone'), sortKey: 'phone' },
        { key: 'country', label: t('common.country'), sortKey: 'country' },
        { key: 'contactPerson', label: t('clients.contactPerson') },
        {
            key: 'active',
            sortKey: 'archived',
            label: t('common.status'),
            render: (row) => <StatusBadge status={row.archived ? 'ARCHIVED' : 'ACTIVE'} />,
        },
        {
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                        actions={[
                            { key: 'view', label: t('common.viewDetails'), icon: Eye, onClick: () => navigate(`/clients/${row.id}`) },
                            ...(canEdit ? [{ key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEdit(row) }] : []),
                            ...(canEdit ? [{
                                key: 'archive',
                                label: row.archived ? t('clients.unarchive') : t('clients.archive'),
                                icon: row.archived ? ArchiveRestore : Archive,
                                onClick: () => handleArchiveToggle(row),
                            }] : []),
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
                title={t('clients.title')}
                description={t('clients.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        <DataToolbar
                            entityLabel="clients"
                            fields={CLIENT_FIELDS}
                            rows={rows}
                            fetchRows={fetchAllClients}
                            count={total}
                            importConfig={{
                                canImport: canCreate,
                                endpoint: '/clients',
                                parseRow: parseImportRow,
                            }}
                            onImported={reload}
                        />
                        {canCreate && (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('clients.add')}
                            </button>
                        )}
                    </div>
                }
            />

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
                            { value: 'active', label: t('common.active') },
                            { value: 'archived', label: t('statuses.ARCHIVED') },
                        ],
                    },
                ]}
            />

            <DataTable
                tableId="clients"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={Users}
                        title={t('clients.emptyTitle')}
                        description={t('clients.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('clients.add')}
                            </button>
                        ) : null}
                    />
                }
                selectable={canDelete}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onRowClick={(row) => navigate(`/clients/${row.id}`)}
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

            <Modal isOpen={formModal.isOpen} title={editingId ? t('clients.editTitle') : t('clients.addTitle')} onClose={formModal.close}>
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
                    {/* Identity */}
                    <FormField
                        id="client-name"
                        label={t('common.name')}
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t('common.name')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="client-registration-code"
                        label={
                            <span className="inline-flex items-center gap-2">
                    {t('clients.registrationCode')}
                    <span className="group relative inline-flex">
                        <button
                            type="button"
                            tabIndex={0}
                            aria-label={t('clients.regCodeTooltipAria')}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            ?
                        </button>
                        <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal text-white shadow-lg group-hover:block group-focus-within:block dark:bg-slate-700"
                        >
                            {t('clients.regCodeTooltip')}
                        </span>
                    </span>
                </span>
                        }
                        name="registrationCode"
                        value={form.registrationCode}
                        onChange={handleChange}
                        placeholder={t('clients.registrationCode')}
                        className="md:col-span-2"
                    />

                    {/* Location — country and address kept side by side */}
                    <CountrySelectField
                        id="client-country"
                        label={t('common.country')}
                        name="country"
                        value={form.country}
                        onChange={handleChange}
                        frequentCountries={frequentCountries}
                        placeholder={t('common.country')}
                        className="md:col-span-2"
                    />

                    <AddressAutocompleteField
                        id="client-address"
                        label={t('common.address')}
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                        placeholder={t('common.address')}
                        className="md:col-span-2"
                    />

                    {/* Contact */}
                    <FormField
                        id="client-email"
                        label={t('common.email')}
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder={t('common.email')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="client-phone"
                        label={t('common.phone')}
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder={t('common.phone')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="client-contact-person"
                        label={t('clients.contactPerson')}
                        name="contactPerson"
                        value={form.contactPerson}
                        onChange={handleChange}
                        placeholder={t('clients.contactPerson')}
                        className="md:col-span-2"
                    />

                    <TextareaField
                        id="client-notes"
                        label={t('common.notes')}
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        placeholder={t('common.notes')}
                        className="md:col-span-4"
                    />

                    <div className="md:col-span-4 flex justify-end gap-3">
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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('clients.createBtn')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('clients.deleteTitle')}
                message={t('clients.deleteConfirm', { name: deletingItem?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('clients.bulkDeleteTitle')}
                message={t('clients.bulkDeleteConfirm', { count: selectedIds.length })}
                onClose={bulkDeleteModal.close}
                onConfirm={handleBulkDelete}
                loading={loading}
            />
        </div>
    )
}