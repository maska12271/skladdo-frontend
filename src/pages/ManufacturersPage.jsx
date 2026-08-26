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
import { useQuickCreate } from '../hooks/useQuickCreate'
import { useFrequentCountries } from '../hooks/useFrequentCountries'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { safeArray, parseBool } from '../utils/format'
import {FormField, TextareaField} from "../components/FormField.jsx";
import PhoneField from '../components/PhoneField'
import CountrySelectField from "../components/CountrySelectField.jsx";
import AddressAutocompleteField from "../components/AddressAutocompleteField.jsx";
import CustomSelect from '../components/CustomSelect'
import CategoryChips from '../components/CategoryChips'
import QuickCreateModal from '../components/QuickCreateModal'
import CategoryManagerModal from '../components/CategoryManagerModal'
import ComposeEmailModal from '../components/ComposeEmailModal'
import { Eye, Pencil, Trash2, Factory, Mail, Tags } from 'lucide-react'
import Checkbox from '../components/Checkbox'
import ModalActions from '../components/ModalActions'

// One schema drives both export (headers localised to the current language) and import (headers
// matched against each field's label in every app language). `id` is export-only. Categories are a
// semicolon-separated list of partner-category names; unknown ones are created on import.
const MANUFACTURER_FIELDS = [
    { key: 'id', labelKey: 'common.id', importable: false, value: (r) => r.id },
    { key: 'name', labelKey: 'common.name', required: true, example: 'Acme Industries', value: (r) => r.name },
    { key: 'country', labelKey: 'common.country', example: 'Germany', value: (r) => r.country },
    { key: 'address', labelKey: 'common.address', value: (r) => r.address },
    { key: 'email', labelKey: 'common.email', example: 'sales@acme.com', value: (r) => r.email },
    { key: 'phone', labelKey: 'common.phone', example: '+49 30 1234567', value: (r) => r.phone },
    { key: 'website', labelKey: 'common.website', example: 'https://acme.com', value: (r) => r.website },
    { key: 'categories', labelKey: 'partnerCategories.label', example: 'Packaging; Electronics', value: (r) => (r.categories || []).map((c) => c.name).join('; ') },
    { key: 'notes', labelKey: 'common.notes', value: (r) => r.notes },
    { key: 'status', labelKey: 'common.status', aliasKeys: ['common.active'], example: 'Active', value: (r) => (r.active ? 'Active' : 'Inactive') },
]

/** Split a semicolon-separated category cell into trimmed, non-empty names. */
const splitCategoryNames = (value) => (value || '').split(';').map((s) => s.trim()).filter(Boolean)

const emptyForm = {
    name: '',
    country: '',
    address: '',
    email: '',
    phone: '',
    website: '',
    notes: '',
    categoryIds: [],
    active: true,
}

export default function ManufacturersPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('MANUFACTURERS')
    const { canCreate: canCreateCategory, canEdit: canEditCategory, canDelete: canDeleteCategory } = usePermissions('PARTNER_CATEGORIES')
    // Sending needs both halves: the company pays for outreach, and this user may send it.
    const { hasAddon } = useAuth()
    const { canCreate: canSendEmailPerm } = usePermissions('MANUFACTURER_EMAILS')
    const canSendEmail = canSendEmailPerm && hasAddon('MANUFACTURER_EMAILS')
    const canManageCategories = canCreateCategory || canEditCategory || canDeleteCategory
    const toast = useToast()
    const navigate = useNavigate()
    const frequentCountries = useFrequentCountries('manufacturers')
    // Runs once before preview: creates any partner categories referenced by the file that don't
    // exist yet (when the user may create them), and returns a name→category map for parseRow.
    // Called twice: `create: false` for the preview, `create: true` only once the user confirms, so
    // choosing a file never creates partner categories the user might then cancel out of (finding N-010).
    const prepareImport = async (records, { create = false } = {}) => {
        const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))
        if (canCreateCategory) {
            const wanted = new Map()
            for (const r of records) {
                for (const nm of splitCategoryNames(r.categories)) {
                    if (!byName.has(nm.toLowerCase())) wanted.set(nm.toLowerCase(), nm)
                }
            }
            if (!create) {
                // Placeholders so the preview shows these categories being attached. They carry no id;
                // ImportModal rebuilds every payload against the real ones after creating them.
                for (const [key, display] of wanted) {
                    byName.set(key, { id: null, name: display, pendingCreate: true })
                }
            } else {
                const created = []
                for (const display of wanted.values()) {
                    try {
                        const cat = await apiPost('/partner-categories', { name: display }, { suppressErrorToast: true })
                        byName.set(display.toLowerCase(), cat)
                        created.push(cat)
                    } catch { /* leave unresolved: the category is simply skipped for that row */ }
                }
                if (created.length) {
                    setCategories((prev) => [...prev, ...created])
                    toast.success(t('importModal.categoriesCreated', { count: created.length }))
                }
            }
        }
        return { categoriesByName: byName }
    }

    const parseImportRow = (r, ctx = {}) => {
        const name = (r.name || '').trim()
        if (!name) return { error: t('manufacturers.import.nameRequired') }
        const linked = splitCategoryNames(r.categories)
            .map((nm) => ctx.categoriesByName?.get(nm.toLowerCase()))
            .filter(Boolean)
        return {
            payload: {
                name,
                country: r.country || '',
                address: r.address || '',
                email: r.email || '',
                phone: r.phone || '',
                website: r.website || '',
                notes: r.notes || '',
                categories: linked.map((c) => ({ id: c.id })),
                active: parseBool(r.status, true),
            },
        }
    }
    const [searchParams, setSearchParams] = useSearchParams()
    const { quickCreate, openQuickCreate, closeQuickCreate, handleQuickCreated } = useQuickCreate()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()
    const categoryModal = useModal()
    const composeModal = useModal()

    const [categories, setCategories] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    const [loading, setLoading] = useState(false)

    const buildManufacturersQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1) // the backend's pages are 0-based
        params.set('size', size)
        params.set('sortBy', sortBy)
        params.set('sortDir', sortDir)
        if (q) params.set('search', q)
        if (filters.category?.length) params.set('categoryId', filters.category.join(','))
        const status = filters.status || []
        if (status.length === 1) params.set('active', status[0] === 'active' ? 'true' : 'false')
        return params
    }

    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['category', 'status'],
        fetcher: (params) => apiGet(`/manufacturers?${buildManufacturersQuery(params).toString()}`),
    })

    const statusFilter = filters.status
    const categoryFilter = filters.category
    const filtersActive = !!search || statusFilter.length > 0 || categoryFilter.length > 0

    const fetchAllManufacturers = async () => {
        const params = buildManufacturersQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/manufacturers?${params.toString()}`))
    }

    useEffect(() => {
        loadReferences()
    }, [])

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

    // Partner categories power the filter dropdown + form chips; fetched in full (the manufacturer
    // list is paged server-side).
    const loadReferences = async () => {
        const categoriesRes = await apiGet('/partner-categories?page=0&size=500&sortBy=name&sortDir=asc')
        setCategories(safeArray(categoriesRes))
    }

    const openCreate = () => {
        setEditingId(null)
        setForm(emptyForm)
        formModal.open()
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setForm({
            name: item.name || '',
            country: item.country || '',
            address: item.address || '',
            email: item.email || '',
            phone: item.phone || '',
            website: item.website || '',
            notes: item.notes || '',
            categoryIds: (item.categories || []).map((c) => String(c.id)),
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

        const { categoryIds, ...rest } = form
        const payload = {
            ...rest,
            categories: categoryIds.map((id) => ({ id: Number(id) })),
        }

        try {
            if (editingId) {
                await apiPut(`/manufacturers/${editingId}`, payload)
            } else {
                await apiPost('/manufacturers', payload)
            }
            toast.success(editingId ? t('manufacturers.updated') : t('manufacturers.created'))
            formModal.close()
            setForm(emptyForm)
            setEditingId(null)
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingItem) return
        setLoading(true)
        try {
            await apiDelete(`/manufacturers/${deletingItem.id}`)
            toast.success(t('manufacturers.deleted'))
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
            await Promise.all(selectedIds.map((id) => apiDelete(`/manufacturers/${id}`)))
            toast.success(t('manufacturers.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const columns = [
        { key: 'name', label: t('common.name'), sortKey: 'name' },
        { key: 'country', label: t('common.country'), sortKey: 'country' },
        { key: 'email', label: t('common.email'), sortKey: 'email' },
        { key: 'phone', label: t('common.phone'), sortKey: 'phone' },
        { key: 'website', label: t('common.website') },
        {
            key: 'categories',
            label: t('partnerCategories.label'),
            render: (row) => <CategoryChips categories={row.categories} />,
        },
        {
            key: 'active',
            sortKey: 'active',
            label: t('common.status'),
            render: (row) => <StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} />,
        },
        {
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                        actions={[
                            { key: 'view', label: t('common.viewDetails'), icon: Eye, onClick: () => navigate(`/manufacturers/${row.id}`) },
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
                title={t('manufacturers.title')}
                description={t('manufacturers.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <DataToolbar
                            entityLabel="manufacturers"
                            fields={MANUFACTURER_FIELDS}
                            rows={rows}
                            fetchRows={fetchAllManufacturers}
                            count={total}
                            importConfig={{
                                canImport: canCreate,
                                endpoint: '/manufacturers',
                                parseRow: parseImportRow,
                                prepare: prepareImport,
                            }}
                            onImported={reload}
                        />
                        {canManageCategories && (
                            <button onClick={categoryModal.open} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                                <Tags className="h-4 w-4" /> {t('common.configureCategories')}
                            </button>
                        )}
                    </div>
                }
                primaryAction={canCreate && (
                        <button onClick={openCreate} className="min-h-11 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 lg:min-h-0">
                            {t('manufacturers.add')}
                        </button>
                    )}
            />

            <SearchFilters
                search={search}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'category',
                        value: categoryFilter,
                        onChange: (v) => setFilter('category', v),
                        searchable: true,
                        placeholder: t('common.allPartnerCategories'),
                        options: categories.map((c) => ({ value: String(c.id), label: c.name })),
                    },
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: (v) => setFilter('status', v),
                        placeholder: t('common.allStatuses'),
                        options: [
                            { value: 'active', label: t('common.active') },
                            { value: 'inactive', label: t('common.inactive') },
                        ],
                    },
                ]}
                sort={{ sortBy, sortDir, onSortChange: setSort, options: sortOptionsFromColumns(columns) }}
            />

            <DataTable
                tableId="manufacturers"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={Factory}
                        title={t('manufacturers.emptyTitle')}
                        description={t('manufacturers.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('manufacturers.add')}
                            </button>
                        ) : null}
                    />
                }
                selectable={canDelete || canSendEmail}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onRowClick={(row) => navigate(`/manufacturers/${row.id}`)}
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

            <Modal isOpen={formModal.isOpen} title={editingId ? t('manufacturers.editTitle') : t('manufacturers.addTitle')} onClose={formModal.close}>
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
                    {/* Identity */}
                    <FormField
                        id="manufacturer-name"
                        label={t('common.name')}
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t('common.name')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="manufacturer-website"
                        label={t('common.website')}
                        name="website"
                        type="url"
                        value={form.website}
                        onChange={handleChange}
                        placeholder="https://example.com"
                        className="md:col-span-2"
                    />

                    {/* Location — country and address kept side by side */}
                    <CountrySelectField
                        id="manufacturer-country"
                        label={t('common.country')}
                        name="country"
                        value={form.country}
                        onChange={handleChange}
                        frequentCountries={frequentCountries}
                        placeholder={t('common.country')}
                        className="md:col-span-2"
                    />

                    <AddressAutocompleteField
                        id="manufacturer-address"
                        label={t('common.address')}
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                        placeholder={t('common.address')}
                        className="md:col-span-2"
                    />

                    {/* Contact */}
                    <FormField
                        id="manufacturer-email"
                        label={t('common.email')}
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder={t('common.email')}
                        className="md:col-span-2"
                    />

                    <PhoneField
                        id="manufacturer-phone"
                        label={t('common.phone')}
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        country={form.country}
                        placeholder={t('common.phone')}
                        className="md:col-span-2"
                    />

                    <div className="md:col-span-4 space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {t('partnerCategories.label')}
                        </label>
                        <CustomSelect
                            multiple
                            searchable
                            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                            value={form.categoryIds}
                            onChange={(vals) => setForm((prev) => ({ ...prev, categoryIds: vals }))}
                            placeholder={t('partnerCategories.selectPlaceholder')}
                            ariaLabel={t('partnerCategories.label')}
                            onQuickCreate={canCreateCategory ? (name) => openQuickCreate('partnerCategory', name, (item) => {
                                setCategories((prev) => [...prev, item.raw])
                                setForm((prev) => ({ ...prev, categoryIds: [...prev.categoryIds, item.value] }))
                            }) : undefined}
                        />
                    </div>

                    <TextareaField
                        id="manufacturer-notes"
                        label={t('common.notes')}
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        placeholder={t('common.notes')}
                        className="md:col-span-4"
                    />

                    {/* Active is a lifecycle toggle, only meaningful once a record exists — new records are active. */}
                    {editingId && (
                        <label className="md:col-span-4 inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                            <Checkbox name="active" checked={form.active} onChange={handleChange} />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('common.active')}</span>
                        </label>
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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('manufacturers.createBtn')}
                        </button>
                    </ModalActions>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('manufacturers.deleteTitle')}
                message={t('manufacturers.deleteConfirm', { name: deletingItem?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('manufacturers.bulkDeleteTitle')}
                message={t('manufacturers.bulkDeleteConfirm', { count: selectedIds.length })}
                onClose={bulkDeleteModal.close}
                onConfirm={handleBulkDelete}
                loading={loading}
            />

            <CategoryManagerModal
                isOpen={categoryModal.isOpen}
                onClose={categoryModal.close}
                endpoint="/partner-categories"
                module="PARTNER_CATEGORIES"
                i18nKey="partnerCategories"
                onChanged={() => { loadReferences(); reload() }}
            />

            <QuickCreateModal
                type={quickCreate?.type}
                initialName={quickCreate?.name ?? ''}
                isOpen={!!quickCreate}
                onClose={closeQuickCreate}
                onCreated={handleQuickCreated}
            />

            <ComposeEmailModal
                isOpen={composeModal.isOpen}
                manufacturerIds={selectedIds}
                onClose={composeModal.close}
                onSent={() => setSelectedIds([])}
            />
        </div>
    )
}