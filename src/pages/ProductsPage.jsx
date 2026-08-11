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
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import QuickCreateModal from '../components/QuickCreateModal'
import CategoryManagerModal from '../components/CategoryManagerModal'
import ReorderSuggestions from '../components/ReorderSuggestions'
import LotAdjustModal from '../components/LotAdjustModal'
import { useToast } from '../context/ToastContext'
import { safeArray, parseBool, toNumber } from '../utils/format'
import {FormField, FormSelect, TextareaField} from "../components/FormField.jsx";
import UnitSelect from "../components/UnitSelect.jsx";
import { Eye, Pencil, Trash2, PackagePlus, Package } from 'lucide-react'
import ImageUploadField, { resolveImageUrl } from '../components/ImageUploadField.jsx'
import { stockStatusOf } from '../utils/stock'

// One schema drives both export (headers localised to the current language) and import (headers
// matched against each field's label in every app language). `id` is export-only. Manufacturer and
// category are referenced by name; an unknown category is created on import, an unknown manufacturer
// errors (we never invent suppliers from a typo).
const PRODUCT_FIELDS = [
    { key: 'id', labelKey: 'common.id', importable: false, value: (r) => r.id },
    { key: 'name', labelKey: 'common.name', required: true, example: 'A4 Paper 80g', value: (r) => r.name },
    { key: 'sku', labelKey: 'common.sku', example: 'PAP-A4-80', value: (r) => r.sku },
    { key: 'manufacturer', labelKey: 'products.cols.manufacturer', required: true, example: 'Acme Industries', value: (r) => r.manufacturer?.name || '' },
    { key: 'category', labelKey: 'products.cols.category', required: true, example: 'Office Supplies', value: (r) => r.category?.name || '' },
    { key: 'size', labelKey: 'common.size', example: 'A4', value: (r) => r.size },
    { key: 'unit', labelKey: 'common.unit', example: 'box', value: (r) => r.unit },
    { key: 'description', labelKey: 'common.description', value: (r) => r.description },
    { key: 'images', labelKey: 'imageUpload.label', example: 'https://... ; https://...', value: (r) => (r.imageUrls || []).join('; ') },
    { key: 'price', labelKey: 'common.price', example: '4.50', value: (r) => r.price },
    { key: 'stock', labelKey: 'products.cols.stock', example: '120', value: (r) => r.stockQuantity },
    { key: 'minStock', labelKey: 'products.cols.minStock', example: '20', value: (r) => r.minimumStock },
    { key: 'status', labelKey: 'common.status', aliasKeys: ['common.active'], example: 'Active', value: (r) => (r.active ? 'Active' : 'Inactive') },
]

const emptyForm = {
    name: '',
    sku: '',
    manufacturerId: '',
    categoryId: '',
    size: '',
    unit: '',
    description: '',
    images: [],
    price: '',
    currency: '',
    taxRateId: '',
    minimumStock: 0,
    reorderQuantity: '',
    warehouseMethod: 'FEFO',
    active: true,
}

export default function ProductsPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('PRODUCTS')
    const { canCreate: canAdjustStock } = usePermissions('INVENTORY')
    const { canCreate: canCreateCategory, canEdit: canEditCategory, canDelete: canDeleteCategory } = usePermissions('CATEGORIES')
    const canManageCategories = canCreateCategory || canEditCategory || canDeleteCategory
    const { canSeePrices } = useAuth()
    const { formatPrice, pricesIncludeTax, defaultTaxPercent, currency: baseCurrency, currencies, currencySymbol } = useSettings()
    const toast = useToast()
    const { quickCreate, openQuickCreate, closeQuickCreate, handleQuickCreated } = useQuickCreate()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()
    const adjustModal = useModal()
    const categoryModal = useModal()
    const [adjustingProduct, setAdjustingProduct] = useState(null)
    const [adjustBatches, setAdjustBatches] = useState([])

    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    const [manufacturers, setManufacturers] = useState([])
    const [categories, setCategories] = useState([])
    const [taxRates, setTaxRates] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    const [loading, setLoading] = useState(false)

    // Builds the /products query for the current page + filters. The status filter mixes activity
    // (active/inactive) and stock level (ok/low/out), which map to the backend's `active` and
    // `stockStatus` params respectively.
    const buildProductQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1) // the backend's pages are 0-based
        params.set('size', size)
        params.set('sortBy', sortBy)
        params.set('sortDir', sortDir)
        if (q) params.set('search', q)
        if (filters.manufacturer?.length) params.set('manufacturerId', filters.manufacturer.join(','))
        if (filters.category?.length) params.set('categoryId', filters.category.join(','))
        const status = filters.status || []
        const activeSel = status.filter((v) => v === 'active' || v === 'inactive')
        if (activeSel.length === 1) params.set('active', activeSel[0] === 'active' ? 'true' : 'false')
        const stockSel = status.filter((v) => v === 'ok' || v === 'low' || v === 'out')
        if (stockSel.length) params.set('stockStatus', stockSel.join(','))
        return params
    }

    // Server-driven table: page/size/sort/search/filters live in the URL; `rows` is just the current page.
    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['manufacturer', 'category', 'status'],
        fetcher: (params) => apiGet(`/products?${buildProductQuery(params).toString()}`),
    })

    const manufacturerFilter = filters.manufacturer
    const categoryFilter = filters.category
    const statusFilter = filters.status
    const filtersActive = !!search || manufacturerFilter.length > 0 || categoryFilter.length > 0 || statusFilter.length > 0

    // Export must include every matching row, not only the current page.
    const fetchAllProducts = async () => {
        const params = buildProductQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/products?${params.toString()}`))
    }

    useEffect(() => {
        loadReferences()
    }, [])

    // Deep-link support: ?edit=<id> opens the edit modal once rows are loaded (used by the
    // detail page's Edit button), then clears the param so a refresh/back doesn't reopen it.
    // List / Reorder tab, persisted in the URL (?tab=reorder) so it survives refresh and deep links.
    const tab = searchParams.get('tab') === 'reorder' ? 'reorder' : 'list'
    const setTab = (next) => {
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev)
            if (next === 'list') p.delete('tab')
            else p.set('tab', next)
            return p
        }, { replace: true })
    }

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

    // Reference lists for the filter dropdowns, forms, and CSV import name-resolution. These are
    // intentionally fetched in full (not paginated) — the product list itself is paged server-side.
    const loadReferences = async () => {
        const [manufacturersRes, categoriesRes, taxRatesRes] = await Promise.all([
            apiGet('/manufacturers?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/categories?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/settings/tax-rates'),
        ])
        setManufacturers(safeArray(manufacturersRes))
        setCategories(safeArray(categoriesRes))
        setTaxRates(safeArray(taxRatesRes))
    }

    // Builds the name→entity maps parseRow resolves against.
    //
    // Called twice: once for the preview with `create: false`, and again with `create: true` only after
    // the user confirms the import. Categories referenced by the file but not yet in the company are
    // resolved to a placeholder during the preview and created for real on confirm — previewing a file
    // must not change the user's data, because they may still cancel (finding N-010).
    const prepareImport = async (records, { create = false } = {}) => {
        const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))
        const mfrByName = new Map(manufacturers.map((m) => [m.name.trim().toLowerCase(), m]))
        if (canCreateCategory) {
            const wanted = new Map()
            for (const r of records) {
                const nm = (r.category || '').trim()
                if (nm && !catByName.has(nm.toLowerCase())) wanted.set(nm.toLowerCase(), nm)
            }
            if (!create) {
                // Placeholder so the row previews as importable rather than as categoryNotFound. It has
                // no id on purpose — the payload it produces is never sent; handleImport rebuilds every
                // payload against the real categories once they exist.
                for (const [key, display] of wanted) {
                    catByName.set(key, { id: null, name: display, pendingCreate: true })
                }
            } else {
                const created = []
                for (const display of wanted.values()) {
                    try {
                        const cat = await apiPost('/categories', { name: display }, { suppressErrorToast: true })
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
        return { categoriesByName: catByName, manufacturersByName: mfrByName }
    }

    // Resolve manufacturer/category by name against the prepared maps, erroring out (rather than
    // silently dropping) when a referenced one is still missing.
    const parseImportRow = (r, ctx = {}) => {
        const name = (r.name || '').trim()
        if (!name) return { error: t('products.import.nameRequired') }

        const manufacturerName = (r.manufacturer || '').trim()
        if (!manufacturerName) return { error: t('products.import.manufacturerRequired') }
        const manufacturer = ctx.manufacturersByName?.get(manufacturerName.toLowerCase())
        if (!manufacturer) return { error: t('products.import.manufacturerNotFound', { name: manufacturerName }) }

        const categoryName = (r.category || '').trim()
        if (!categoryName) return { error: t('products.import.categoryRequired') }
        const category = ctx.categoriesByName?.get(categoryName.toLowerCase())
        if (!category) return { error: t('products.import.categoryNotFound', { name: categoryName }) }

        return {
            payload: {
                name,
                sku: r.sku || '',
                manufacturer: { id: manufacturer.id },
                category: { id: category.id },
                size: r.size || '',
                unit: r.unit || '',
                description: r.description || '',
                imageUrls: (r.images || '')
                    .split(';')
                    .map((u) => u.trim())
                    .filter(Boolean),
                price: toNumber(r.price),
                stockQuantity: toNumber(r.stock),
                minimumStock: toNumber(r.minStock),
                active: parseBool(r.status, true),
            },
        }
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
            sku: item.sku || '',
            manufacturerId: item.manufacturer?.id || '',
            categoryId: item.category?.id || '',
            size: item.size || '',
            unit: item.unit || '',
            description: item.description || '',
            images: item.imageUrls || [],
            price: item.price || '',
            currency: item.currency || '',
            taxRateId: item.taxRate?.id ? String(item.taxRate.id) : '',
            minimumStock: item.minimumStock ?? 0,
            reorderQuantity: item.reorderQuantity ?? '',
            warehouseMethod: item.warehouseMethod || 'FEFO',
            active: !!item.active,
        })
        formModal.open()
    }

    const openDelete = (item) => {
        setDeletingItem(item)
        deleteModal.open()
    }

    const openAdjust = async (item) => {
        setAdjustingProduct(item)
        try {
            const res = await apiGet(`/products/${item.id}/batches`)
            setAdjustBatches(safeArray(res))
        } catch {
            setAdjustBatches([])
        }
        adjustModal.open()
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
            sku: form.sku,
            manufacturer: { id: Number(form.manufacturerId) },
            category: { id: Number(form.categoryId) },
            size: form.size,
            unit: form.unit,
            description: form.description,
            imageUrls: form.images,
            price: Number(form.price),
            currency: form.currency || baseCurrency || null,
            taxRate: form.taxRateId ? { id: Number(form.taxRateId) } : null,
            minimumStock: Number(form.minimumStock),
            // Blank means "no fixed batch size" - the reorder view then suggests the shortfall instead.
            reorderQuantity: form.reorderQuantity === '' ? null : Number(form.reorderQuantity),
            warehouseMethod: form.warehouseMethod,
            active: form.active,
        }

        try {
            if (editingId) {
                await apiPut(`/products/${editingId}`, payload)
            } else {
                await apiPost('/products', payload)
            }
            toast.success(editingId ? t('products.updated') : t('products.created'))
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
            await apiDelete(`/products/${deletingItem.id}`)
            toast.success(t('products.deleted'))
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
            await Promise.all(selectedIds.map((id) => apiDelete(`/products/${id}`)))
            toast.success(t('products.bulkDeleted', { count: selectedIds.length }))
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

    // The rate shown for a product: its own rate, else the company default (falling back to the
    // bare default percentage if no named default rate exists).
    const taxLabelOf = (row) => {
        if (row.taxRate) return `${row.taxRate.name} (${Number(row.taxRate.percentage)}%)`
        if (defaultRate) return t('products.tax.defaultTag', { name: defaultRate.name })
        return defaultTaxPercent ? `${defaultTaxPercent}%` : t('common.none')
    }

    const columns = [
        {
            key: 'image',
            label: '',
            name: t('products.cols.image'),
            render: (row) => {
                const url = resolveImageUrl(row.imageUrls?.[0])
                return url ? (
                    <img src={url} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                    <div className="h-8 w-8 rounded bg-slate-100 dark:bg-slate-800" />
                )
            },
        },
        { key: 'name', label: t('common.name'), sortKey: 'name' },
        { key: 'sku', label: t('common.sku'), sortKey: 'sku' },
        { key: 'manufacturer', label: t('products.cols.manufacturer'), sortKey: 'manufacturer.name', render: (row) => row.manufacturer?.name || '-' },
        { key: 'category', label: t('products.cols.category'), sortKey: 'category.name', render: (row) => row.category?.name || '-' },
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
            key: 'stockQuantity',
            sortKey: 'stockQuantity',
            label: t('products.cols.stock'),
            render: (row) => {
                const status = stockStatusOf(row)
                return (
                    <span
                        className={
                            status === 'out'
                                ? 'font-semibold text-rose-600 dark:text-rose-400'
                                : status === 'low'
                                    ? 'font-semibold text-amber-600 dark:text-amber-400'
                                    : ''
                        }
                    >
                        {row.stockQuantity}
                    </span>
                )
            },
        },
        { key: 'minimumStock', label: t('products.cols.minStock'), sortKey: 'minimumStock' },
        {
            key: 'active',
            sortKey: 'active',
            label: t('common.status'),
            render: (row) => {
                const stock = stockStatusOf(row)
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} />
                        {stock === 'out' && <StatusBadge status="OUT_OF_STOCK" />}
                        {stock === 'low' && <StatusBadge status="LOW_STOCK" />}
                    </div>
                )
            },
        },
        {
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                        actions={[
                            { key: 'view', label: t('common.viewDetails'), icon: Eye, onClick: () => navigate(`/products/${row.id}`) },
                            ...(canAdjustStock ? [{ key: 'adjust', label: t('inventory.adjustStock'), icon: PackagePlus, onClick: () => openAdjust(row) }] : []),
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
                title={t('products.title')}
                description={t('products.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        <DataToolbar
                            entityLabel="products"
                            fields={PRODUCT_FIELDS}
                            rows={rows}
                            fetchRows={fetchAllProducts}
                            count={total}
                            importConfig={{
                                canImport: canCreate,
                                endpoint: '/products',
                                parseRow: parseImportRow,
                                prepare: prepareImport,
                            }}
                            onImported={reload}
                        />
                        {canManageCategories && (
                            <button onClick={categoryModal.open} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                                {t('common.configureCategories')}
                            </button>
                        )}
                        {canCreate && (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('products.add')}
                            </button>
                        )}
                    </div>
                }
            />

            {/* List / Reorder tabs */}
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
                {['list', 'reorder'].map((tabKey) => (
                    <button
                        key={tabKey}
                        onClick={() => setTab(tabKey)}
                        className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                            tab === tabKey
                                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                        {t(`products.tab.${tabKey}`)}
                    </button>
                ))}
            </div>

            {tab === 'reorder' && <ReorderSuggestions />}

            {tab === 'list' && (
            <>
            <SearchFilters
                search={search}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'manufacturer',
                        value: manufacturerFilter,
                        onChange: (v) => setFilter('manufacturer', v),
                        searchable: true,
                        placeholder: t('common.allManufacturers'),
                        options: manufacturers.map((m) => ({ value: String(m.id), label: m.name })),
                    },
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
                            { value: 'ok', label: t('products.filters.inStock') },
                            { value: 'low', label: t('products.filters.lowStock') },
                            { value: 'out', label: t('products.filters.outOfStock') },
                        ],
                    },
                ]}
            />

            <DataTable
                tableId="products"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={Package}
                        title={t('products.emptyTitle')}
                        description={t('products.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('products.add')}
                            </button>
                        ) : null}
                    />
                }
                selectable={canDelete}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onRowClick={(row) => navigate(`/products/${row.id}`)}
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

            <Modal isOpen={formModal.isOpen} title={editingId ? t('products.editTitle') : t('products.addTitle')} onClose={formModal.close}>
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
                    <FormField
                        id="product-name"
                        label={t('common.name')}
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t('common.name')}
                        className="md:col-span-2"
                    />

                    <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                        <FormField
                            id="product-sku"
                            label={
                                <span className="inline-flex items-center gap-2">
                        {t('common.sku')}
                        <span className="group relative inline-flex">
                            <button
                                type="button"
                                tabIndex={0}
                                aria-label={t('products.form.skuTooltipAria')}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                ?
                            </button>
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal text-white shadow-lg group-hover:block group-focus-within:block dark:bg-slate-700"
                            >
                                {t('products.form.skuTooltip')}
                            </span>
                        </span>
                    </span>
                            }
                            name="sku"
                            value={form.sku}
                            onChange={handleChange}
                            placeholder={t('common.sku')}
                        />

                        <UnitSelect
                            id="product-unit"
                            label={t('common.unit')}
                            name="unit"
                            value={form.unit}
                            onChange={handleChange}
                        />
                    </div>

                    <FormSelect
                        id="product-manufacturer-id"
                        label={t('products.cols.manufacturer')}
                        name="manufacturerId"
                        value={form.manufacturerId}
                        onChange={handleChange}
                        required
                        searchable
                        placeholder={t('products.form.selectManufacturer')}
                        className="md:col-span-2"
                        options={manufacturers.map((item) => ({ value: String(item.id), label: item.name }))}
                        onQuickCreate={(name) => openQuickCreate('manufacturer', name, (item) => {
                            setManufacturers((prev) => [...prev, item.raw])
                            handleChange({ target: { name: 'manufacturerId', value: item.value } })
                        })}
                    />

                    <FormSelect
                        id="product-category-id"
                        label={t('products.cols.category')}
                        name="categoryId"
                        value={form.categoryId}
                        onChange={handleChange}
                        required
                        searchable
                        placeholder={t('products.form.selectCategory')}
                        className="md:col-span-2"
                        options={categories.map((item) => ({ value: String(item.id), label: item.name }))}
                        onQuickCreate={(name) => openQuickCreate('category', name, (item) => {
                            setCategories((prev) => [...prev, item.raw])
                            handleChange({ target: { name: 'categoryId', value: item.value } })
                        })}
                    />

                    <FormField
                        id="product-size"
                        label={t('common.size')}
                        name="size"
                        value={form.size}
                        onChange={handleChange}
                        placeholder={t('common.size')}
                        className="md:col-span-2"
                    />

                    <FormField
                        id="product-price"
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
                        id="product-currency"
                        label={t('common.currency')}
                        name="currency"
                        value={form.currency || baseCurrency || 'EUR'}
                        onChange={handleChange}
                        className="md:col-span-2"
                        options={(currencies.length ? currencies : [{ code: baseCurrency || 'EUR', name: baseCurrency || 'EUR' }])
                            .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                    />

                    <FormSelect
                        id="product-tax-rate"
                        label={t('products.form.taxRate')}
                        name="taxRateId"
                        value={form.taxRateId}
                        onChange={handleChange}
                        placeholder={t('products.form.taxRate')}
                        className="md:col-span-2"
                        options={taxRateOptions}
                    />

                    <ImageUploadField
                        value={form.images}
                        onChange={(images) => setForm((prev) => ({ ...prev, images }))}
                        className="md:col-span-4"
                    />

                    <FormField
                        id="product-minimum-stock"
                        label={
                            <span className="inline-flex items-center gap-2">
                                {t('products.cols.minStock')}
                            <span className="group relative inline-flex">
                        <button
                            type="button"
                            tabIndex={0}
                            aria-label={t('products.form.minStockTooltipAria')}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            ?
                        </button>
                        <span
                            role="tooltip"
                            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal text-white shadow-lg group-hover:block group-focus-within:block dark:bg-slate-700"
                        >
                            {t('products.form.minStockTooltip')}
                        </span>
                    </span>
                </span>
                        }
                        type="number"
                        name="minimumStock"
                        value={form.minimumStock}
                        onChange={handleChange}
                        placeholder="0"
                        className="md:col-span-2"
                    />

                    <FormField
                        id="product-reorder-quantity"
                        label={t('products.form.reorderQuantity')}
                        type="number"
                        name="reorderQuantity"
                        value={form.reorderQuantity}
                        onChange={handleChange}
                        placeholder={t('products.form.reorderQuantityPlaceholder')}
                        className="md:col-span-2"
                    />

                    <FormSelect
                        id="product-warehouse-method"
                        label={
                            <span className="inline-flex items-center gap-2">
                                {t('products.form.warehouseMethod')}
                                <span className="group relative inline-flex">
                                    <button
                                        type="button"
                                        tabIndex={0}
                                        aria-label={t('products.form.warehouseMethodTooltipAria')}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        ?
                                    </button>
                                    <span
                                        role="tooltip"
                                        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal text-white shadow-lg group-hover:block group-focus-within:block dark:bg-slate-700"
                                    >
                                        {t('products.form.warehouseMethodTooltip')}
                                    </span>
                                </span>
                            </span>
                        }
                        name="warehouseMethod"
                        value={form.warehouseMethod}
                        onChange={handleChange}
                        className="md:col-span-2"
                        options={[
                            { value: 'FEFO', label: t('products.warehouseMethods.FEFO') },
                            { value: 'FIFO', label: t('products.warehouseMethods.FIFO') },
                            { value: 'LIFO', label: t('products.warehouseMethods.LIFO') },
                        ]}
                    />

                    <TextareaField
                        id="product-description"
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
                            <input
                                type="checkbox"
                                name="active"
                                checked={form.active}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700"
                            />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{t('common.active')}</span>
                        </label>
                    )}

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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('products.createBtn')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('products.deleteTitle')}
                message={t('products.deleteConfirm', { name: deletingItem?.name || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('products.bulkDeleteTitle')}
                message={t('products.bulkDeleteConfirm', { count: selectedIds.length })}
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
                endpoint="/categories"
                module="CATEGORIES"
                i18nKey="categories"
                onChanged={() => { loadReferences(); reload() }}
            />

            <LotAdjustModal
                product={adjustingProduct}
                batches={adjustBatches}
                isOpen={adjustModal.isOpen}
                onClose={adjustModal.close}
                onSaved={reload}
            />
        </div>
    )
}