import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client'
import { useServerTable } from '../hooks/useServerTable'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import { sortOptionsFromColumns } from '../utils/sortOptions'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import DataToolbar from '../components/DataToolbar'
import StatusBadge from '../components/StatusBadge'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { useModal } from '../hooks/useModal'
import { useFrequentCountries } from '../hooks/useFrequentCountries'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { safeArray, parseBool } from '../utils/format'
import {FormField, TextareaField} from "../components/FormField.jsx";
import PhoneField from '../components/PhoneField'
import CountrySelectField from "../components/CountrySelectField.jsx";
import AddressAutocompleteField from "../components/AddressAutocompleteField.jsx";
import { Eye, Pencil, Trash2, Archive, ArchiveRestore, Users, Plus, Mail } from 'lucide-react'
import InfoHint from '../components/InfoHint'
import ModalActions from '../components/ModalActions'
import ComposeEmailModal from '../components/ComposeEmailModal'

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
    { key: 'notes', labelKey: 'common.notes', value: (r) => r.notes },
    { key: 'status', labelKey: 'common.status', aliasKeys: ['common.active'], example: 'Active', value: (r) => (r.archived ? 'Archived' : 'Active') },
]

// One blank contact row. The create form starts with exactly one: most clients have a person, and an
// empty list with an "add" button makes filling one in look optional in a way it usually is not.
const emptyContactRow = { name: '', position: '', email: '' }

const emptyForm = {
    name: '',
    registrationCode: '',
    email: '',
    phone: '',
    country: '',
    address: '',
    notes: '',
    active: true,
}

export default function ClientsPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('CLIENTS')
    // Emailing needs both halves: the company pays for the add-on, and this user may send. Same pair as
    // the manufacturers list.
    const { hasAddon } = useAuth()
    const { canCreate: canSendEmailPerm } = usePermissions('MANUFACTURER_EMAILS')
    const canSendEmail = canSendEmailPerm && hasAddon('MANUFACTURER_EMAILS')
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
                notes: r.notes || '',
                active: parseBool(r.status, true),
            },
        }
    }
    const [searchParams, setSearchParams] = useSearchParams()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()
    const composeModal = useModal()

    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    // Contacts typed on the create form. Only used when creating: an existing client's contacts are
    // managed on its own page, one at a time, which is the whole point of them being separate records.
    const [contactRows, setContactRows] = useState([emptyContactRow])
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
        setContactRows([emptyContactRow])
        formModal.open()
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setContactRows([emptyContactRow])
        setForm({
            name: item.name || '',
            registrationCode: item.registrationCode || '',
            email: item.email || '',
            phone: item.phone || '',
            country: item.country || '',
            address: item.address || '',
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

    const changeContact = (index, field, value) => {
        setContactRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    }

    const addContactRow = () => setContactRows((prev) => [...prev, emptyContactRow])

    const removeContactRow = (index) => {
        setContactRows((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (editingId) {
                await apiPut(`/clients/${editingId}`, form)
            } else {
                const created = await apiPost('/clients', form)
                // Contacts are their own records, so they are their own requests - posted after the client
                // exists because they hang off its id. A row with no name is one the user left blank rather
                // than one they meant, and is skipped. A contact that fails to save does not undo the
                // client: it is already created, and it can be added again from its page.
                const named = contactRows.filter((row) => row.name.trim())
                for (const row of named) {
                    await apiPost(`/clients/${created.id}/contacts`, row)
                }
            }
            toast.success(editingId ? t('clients.updated') : t('clients.created'))
            formModal.close()
            setEditingId(null)
            setForm(emptyForm)
            setContactRows([emptyContactRow])
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
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                    </div>
                }
                primaryAction={canCreate && (
                        <button onClick={openCreate} className="min-h-11 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 lg:min-h-0">
                            {t('clients.add')}
                        </button>
                    )}
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
                sort={{ sortBy, sortDir, onSortChange: setSort, options: sortOptionsFromColumns(columns) }}
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
                selectable={canDelete || canSendEmail}
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
                hideCardSort
                bulkActions={
                    <>
                        {canSendEmail && (
                            <button
                                onClick={composeModal.open}
                                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
                            >
                                <Mail className="h-4 w-4" /> {t('emails.emailSelected')}
                            </button>
                        )}
                        {canDelete && (
                            <button
                                onClick={bulkDeleteModal.open}
                                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
                            >
                                <Trash2 className="h-4 w-4" /> {t('common.deleteSelected')}
                            </button>
                        )}
                    </>
                }
            />

            <ComposeEmailModal
                isOpen={composeModal.isOpen}
                recipientType="CLIENT"
                recipientIds={selectedIds}
                onClose={composeModal.close}
                onSent={() => setSelectedIds([])}
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
                    <InfoHint label={t('clients.regCodeTooltipAria')} text={t('clients.regCodeTooltip')} />
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

                    <PhoneField
                        id="client-phone"
                        label={t('common.phone')}
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        country={form.country}
                        placeholder={t('common.phone')}
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

                    {/* Creation only. Editing a client sends you to its page, where each contact is its
                        own row - see PartnerContacts. */}
                    {!editingId && (
                        <div className="space-y-3 md:col-span-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('contacts.title')}</p>
                                <button
                                    type="button"
                                    onClick={addContactRow}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    <Plus className="h-4 w-4" /> {t('contacts.add')}
                                </button>
                            </div>
                            {contactRows.map((row, index) => (
                                <div key={index} className="flex flex-wrap items-end gap-2 md:flex-nowrap">
                                    <FormField
                                        id={`client-contact-name-${index}`}
                                        label={t('contacts.name')}
                                        name={`contact-name-${index}`}
                                        value={row.name}
                                        onChange={(e) => changeContact(index, 'name', e.target.value)}
                                        placeholder={t('contacts.namePlaceholder')}
                                        className="min-w-[10rem] flex-1"
                                    />
                                    <FormField
                                        id={`client-contact-position-${index}`}
                                        label={t('contacts.position')}
                                        name={`contact-position-${index}`}
                                        value={row.position}
                                        onChange={(e) => changeContact(index, 'position', e.target.value)}
                                        placeholder={t('contacts.positionPlaceholder')}
                                        className="min-w-[9rem] flex-1"
                                    />
                                    <FormField
                                        id={`client-contact-email-${index}`}
                                        label={t('common.email')}
                                        name={`contact-email-${index}`}
                                        type="email"
                                        value={row.email}
                                        onChange={(e) => changeContact(index, 'email', e.target.value)}
                                        placeholder="name@company.com"
                                        className="min-w-[12rem] flex-1"
                                    />
                                    {/* Only once there is more than one: with a single row, removing it
                                        would leave the section empty and the button is just a way to
                                        break the form. Clearing the fields is how you decline to fill it. */}
                                    {contactRows.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeContactRow(index)}
                                            aria-label={t('common.delete')}
                                            className="mb-0.5 rounded-lg border border-rose-200 p-2.5 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <ModalActions className="md:col-span-4">
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
                    </ModalActions>
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