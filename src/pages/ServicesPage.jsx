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
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import QuickCreateModal from '../components/QuickCreateModal'
import CategoryManagerModal from '../components/CategoryManagerModal'
import { useToast } from '../context/ToastContext'
import { safeArray, parseBool, toNumber } from '../utils/format'
import { FormField, FormSelect, TextareaField } from '../components/FormField.jsx'
import { Eye, Pencil, Trash2, Wrench, Tags } from 'lucide-react'
import Checkbox from '../components/Checkbox'
import ModalActions from '../components/ModalActions'

// One schema drives both export (headers localised to the current language) and import (headers
// matched against each field's label in every app language). `id` is export-only. Category is
// referenced by name and an unknown one is created on import, as on the products page — but unlike
// there it is optional, matching the backend's optional category.
const SERVICE_FIELDS = [
    { key: 'id', labelKey: 'common.id', importable: false, value: (r) => r.id },
    { key: 'name', labelKey: 'common.name', required: true, example: 'Installation', value: (r) => r.name },
    { key: 'code', labelKey: 'common.code', example: 'INST-1', value: (r) => r.code },
    { key: 'category', labelKey: 'services.cols.category', example: 'Consulting', value: (r) => r.category?.name || '' },
    { key: 'description', labelKey: 'common.description', value: (r) => r.description },
    { key: 'price', labelKey: 'common.price', example: '45.00', value: (r) => r.price },
    { key: 'status', labelKey: 'common.status', aliasKeys: ['common.active'], example: 'Active', value: (r) => (r.active ? 'Active' : 'Inactive') },
]

const emptyForm = {
    name: '',
    code: '',
    categoryId: '',
    description: '',
    price: '',
    currency: '',
    taxRateId: '',
    active: true,
    recurrenceMonths: '',
}

export default function ServicesPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('SERVICES')
    const {
        canCreate: canCreateCategory, canEdit: canEditCategory, canDelete: canDeleteCategory,
    } = usePermissions('SERVICE_CATEGORIES')
    const canManageCategories = canCreateCategory || canEditCategory || canDeleteCategory
    const { canSeePrices } = useAuth()
    const { formatPrice, pricesIncludeTax, defaultTaxPercent, currency: baseCurrency, currencies, currencySymbol } = useSettings()
    const toast = useToast()
    const { quickCreate, openQuickCreate, closeQuickCreate, handleQuickCreated } = useQuickCreate()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()
    const categoryModal = useModal()

    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    const [categories, setCategories] = useState([])
    const [taxRates, setTaxRates] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    const [loading, setLoading] = useState(false)

    const buildServiceQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
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

    // Server-driven table: page/size/sort/search/filters live in the URL; `rows` is just the current page.
    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['category', 'status'],
        fetcher: (params) => apiGet(`/services?${buildServiceQuery(params).toString()}`),
    })

    const categoryFilter = filters.category
    const statusFilter = filters.status
    const filtersActive = !!search || categoryFilter.length > 0 || statusFilter.length > 0

    // Export must include every matching row, not only the current page.
    const fetchAllServices = async () => {
        const params = buildServiceQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/services?${params.toString()}`))
    }

    useEffect(() => {
        loadReferences()
    }, [])

    // Deep-link support: ?edit=<id> opens the edit modal once rows are loaded (used by the
    // detail page's Edit button), then clears the param so a refresh/back doesn't reopen it.
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

    const loadReferences = async () => {
        const [categoriesRes, taxRatesRes] = await Promise.all([
            apiGet('/service-categories?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/settings/tax-rates'),
        ])
        setCategories(safeArray(categoriesRes))
        setTaxRates(safeArray(taxRatesRes))
    }

    // Builds the name→category map parseRow resolves against. Called twice: once for the preview with
    // `create: false`, and again with `create: true` only after the user confirms — previewing a file
    // must not change the user's data, because they may still cancel.
    const prepareImport = async (records, { create = false } = {}) => {
        const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))
        if (canCreateCategory) {
            const wanted = new Map()
            for (const r of records) {
                const nm = (r.category || '').trim()
                if (nm && !catByName.has(nm.toLowerCase())) wanted.set(nm.toLowerCase(), nm)
            }
            if (!create) {
                // Placeholder so the row previews as importable. It has no id on purpose — the payload it
                // produces is never sent; handleImport rebuilds every payload once the categories exist.
                for (const [key, display] of wanted) {
                    catByName.set(key, { id: null, name: display, pendingCreate: true })
                }
            } else {
                const created = []
                for (const display of wanted.values()) {
                    try {
                        const cat = await apiPost('/service-categories', { name: display }, { suppressErrorToast: true })
                        catByName.set(display.toLowerCase(), cat)
                        created.push(cat)
                    } catch { /* leave unresolved: the row then reports categoryNotFound */ }
                }
                if (created.length) {
                    setCategories((prev) => [...prev, ...created])
                    toast.success(t('importModal.categoriesCreated', { count: created.length }))
                }
            }
        }
        return { categoriesByName: catByName }
    }

    // A named-but-unresolvable category still errors: silently dropping it would import the service
    // uncategorised and look like it worked. An absent category is simply left unset.
    const parseImportRow = (r, ctx = {}) => {
        const name = (r.name || '').trim()
        if (!name) return { error: t('services.import.nameRequired') }

        const categoryName = (r.category || '').trim()
        let category = null
        if (categoryName) {
            category = ctx.categoriesByName?.get(categoryName.toLowerCase())
            if (!category) return { error: t('services.import.categoryNotFound', { name: categoryName }) }
        }

        return {
            payload: {
                name,
                code: r.code || '',
                category: category ? { id: category.id } : null,
                description: r.description || '',
                price: toNumber(r.price),
                active: parseBool(r.status, true),
            },
        }
    }

    const openCreate = () => {
        setEditingId(null)
        // Start on the company's default rate rather than blank — same reasoning as the product form.
        const fallback = taxRates.find((r) => r.isDefault)
        setForm({ ...emptyForm, taxRateId: fallback ? String(fallback.id) : '' })
        formModal.open()
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setForm({
            name: item.name || '',
            code: item.code || '',
            categoryId: item.category?.id || '',
            description: item.description || '',
            price: item.price || '',
            currency: item.currency || '',
            taxRateId: item.taxRate?.id ? String(item.taxRate.id) : '',
            active: !!item.active,
            recurrenceMonths: item.recurrenceMonths ?? '',
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

        const payload = {
            name: form.name,
            code: form.code,
            // Optional, unlike a product's — a service need not be categorised.
            category: form.categoryId ? { id: Number(form.categoryId) } : null,
            description: form.description,
            price: Number(form.price),
            currency: form.currency || baseCurrency || null,
            taxRate: form.taxRateId ? { id: Number(form.taxRateId) } : null,
            active: form.active,
            recurrenceMonths: form.recurrenceMonths ? Number(form.recurrenceMonths) : null,
        }

        try {
            if (editingId) {
                await apiPut(`/services/${editingId}`, payload)
            } else {
                await apiPost('/services', payload)
            }
            toast.success(editingId ? t('services.updated') : t('services.created'))
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
            await apiDelete(`/services/${deletingItem.id}`)
            toast.success(t('services.deleted'))
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
            await Promise.all(selectedIds.map((id) => apiDelete(`/services/${id}`)))
            toast.success(t('services.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const defaultRate = taxRates.find((r) => r.isDefault)
    const taxRateOptions = [
        { value: '', label: defaultRate ? t('products.tax.useDefault', { name: defaultRate.name }) : t('products.tax.useDefaultPlain') },
        ...taxRates.map((r) => ({ value: String(r.id), label: `${r.name} (${Number(r.percentage)}%)` })),
    ]

    const taxLabelOf = (row) => {
        if (row.taxRate) return `${row.taxRate.name} (${Number(row.taxRate.percentage)}%)`
        if (defaultRate) return t('products.tax.defaultTag', { name: defaultRate.name })
        return defaultTaxPercent ? `${defaultTaxPercent}%` : t('common.none')
    }

    const columns = [
        { key: 'name', label: t('common.name'), sortKey: 'name' },
        { key: 'code', label: t('common.code'), sortKey: 'code' },
        { key: 'category', label: t('services.cols.category'), sortKey: 'category.name', render: (row) => row.category?.name || '-' },
        ...(canSeePrices
            ? [{
                key: 'price',
                sortKey: 'price',
                label: `${t('common.price')} ${pricesIncludeTax ? t('settings.tax.inclShort') : t('settings.tax.exclShort')}`,
                render: (row) => formatPrice(row.price, row.taxRate?.percentage, row.currency),
            }, {
                key: 'tax',
                label: t('products.cols.tax'),
                render: (row) => taxLabelOf(row),
            }]
            : []),
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
                            { key: 'view', label: t('common.viewDetails'), icon: Eye, onClick: () => navigate(`/services/${row.id}`) },
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
                title={t('services.title')}
                description={t('services.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <DataToolbar
                            entityLabel="services"
                            fields={SERVICE_FIELDS}
                            rows={rows}
                            fetchRows={fetchAllServices}
                            count={total}
                            importConfig={{
                                canImport: canCreate,
                                endpoint: '/services',
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
                        {t('services.add')}
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
                        placeholder: t('common.allCategories'),
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
                tableId="services"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={Wrench}
                        title={t('services.emptyTitle')}
                        description={t('services.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('services.add')}
                            </button>
                        ) : null}
                    />
                }
                selectable={canDelete}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onRowClick={(row) => navigate(`/services/${row.id}`)}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                sortBy={sortBy}
                sortDir={sortDir}
                onSortChange={setSort}
                hideCardSort
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

            <Modal isOpen={formModal.isOpen} title={editingId ? t('services.editTitle') : t('services.addTitle')} onClose={formModal.close}>
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
                    <FormField
                        id="service-name"
                        label={t('common.name')}
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t('common.name')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="service-code"
                        label={t('common.code')}
                        name="code"
                        value={form.code}
                        onChange={handleChange}
                        placeholder={t('common.code')}
                        className="md:col-span-2"
                    />

                    <FormSelect
                        id="service-category-id"
                        label={t('services.cols.category')}
                        name="categoryId"
                        value={form.categoryId}
                        onChange={handleChange}
                        searchable
                        placeholder={t('services.form.selectCategory')}
                        className="md:col-span-4"
                        options={categories.map((item) => ({ value: String(item.id), label: item.name }))}
                        onQuickCreate={(name) => openQuickCreate('serviceCategory', name, (item) => {
                            setCategories((prev) => [...prev, item.raw])
                            handleChange({ target: { name: 'categoryId', value: item.value } })
                        })}
                    />

                    <FormField
                        id="service-price"
                        label={`${t('common.price')} ${t('settings.tax.exclShort')} (${currencySymbol(form.currency || baseCurrency)})`}
                        type="number"
                        step="0.01"
                        name="price"
                        value={form.price}
                        onChange={handleChange}
                        placeholder={t('common.price')}
                        className="md:col-span-2"
                    />

                    <FormSelect
                        id="service-currency"
                        label={t('common.currency')}
                        name="currency"
                        value={form.currency || baseCurrency || 'EUR'}
                        onChange={handleChange}
                        className="md:col-span-2"
                        options={(currencies.length ? currencies : [{ code: baseCurrency || 'EUR', name: baseCurrency || 'EUR' }])
                            .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                    />

                    <FormSelect
                        id="service-tax-rate"
                        label={t('products.form.taxRate')}
                        name="taxRateId"
                        value={form.taxRateId}
                        onChange={handleChange}
                        placeholder={t('products.form.taxRate')}
                        className="md:col-span-4"
                        options={taxRateOptions}
                    />

                    <div className="md:col-span-4 space-y-1.5">
                        <FormField
                            id="service-recurrence-months"
                            label={t('services.form.recurrenceMonths')}
                            type="number"
                            min="1"
                            step="1"
                            name="recurrenceMonths"
                            value={form.recurrenceMonths}
                            onChange={handleChange}
                            placeholder={t('services.form.recurrenceMonthsPlaceholder')}
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('services.form.recurrenceMonthsHint')}</p>
                    </div>

                    <TextareaField
                        id="service-description"
                        label={t('common.description')}
                        name="description"
                        value={form.description}
                        onChange={handleChange}
                        placeholder={t('common.description')}
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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('services.createBtn')}
                        </button>
                    </ModalActions>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('services.deleteTitle')}
                message={t('services.deleteConfirm', { name: deletingItem?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('services.bulkDeleteTitle')}
                message={t('services.bulkDeleteConfirm', { count: selectedIds.length })}
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

            <CategoryManagerModal
                isOpen={categoryModal.isOpen}
                onClose={categoryModal.close}
                endpoint="/service-categories"
                module="SERVICE_CATEGORIES"
                i18nKey="serviceCategories"
                onChanged={() => { loadReferences(); reload() }}
            />
        </div>
    )
}
