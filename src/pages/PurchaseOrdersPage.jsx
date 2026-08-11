import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from '../api/client'
import { useServerTable } from '../hooks/useServerTable'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import DataToolbar from '../components/DataToolbar'
import StatusBadge from '../components/StatusBadge'
import StatusPicker from '../components/StatusPicker'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { useModal } from '../hooks/useModal'
import { useQuickCreate } from '../hooks/useQuickCreate'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import QuickCreateModal from '../components/QuickCreateModal'
import { useToast } from '../context/ToastContext'
import { formatDate, formatMoney, safeArray } from '../utils/format'
import {FormField, FormSelect, TextareaField} from "../components/FormField.jsx";
import AddressAutocompleteField from "../components/AddressAutocompleteField.jsx";
import CurrencyRateField from "../components/CurrencyRateField.jsx";
import MoneyWithBase from "../components/MoneyWithBase.jsx";
import { Info, Pencil, Trash2, Upload, FileText, X } from 'lucide-react'

const exportColumns = [
    { header: 'ID', value: (r) => r.id },
    { header: 'Order no.', value: (r) => r.orderNumber },
    { header: 'Manufacturer', value: (r) => r.manufacturer?.name || '' },
    { header: 'Status', value: (r) => r.status },
    { header: 'Order date', value: (r) => r.orderDate },
    { header: 'Closing date', value: (r) => r.closingDate },
    { header: 'Expected delivery', value: (r) => r.expectedDeliveryDate },
    { header: 'Delivery address', value: (r) => r.deliveryAddress },
    { header: 'Delivery price', value: (r) => r.deliveryPrice },
    { header: 'Total', value: (r) => r.totalAmount },
    {
        header: 'Items',
        value: (r) => (r.items || []).map((it) => `${it.product?.name || '?'} x${it.quantity} @ ${it.unitPrice}`).join('; '),
    },
    { header: 'Notes', value: (r) => r.notes },
]

const emptyForm = {
    manufacturerId: '',
    warehouseId: '',
    orderNumber: '',
    status: 'NEW',
    orderDate: '',
    closingDate: '',
    expectedDeliveryDate: '',
    deliveryAddress: '',
    notes: '',
    deliveryPrice: 0,
    currency: '',
    exchangeRate: 1,
    rateSource: 'SAME',
    rateAsOfDate: null,
    tenderId: '',
    invoiceFileUrl: '',
    invoiceFileName: '',
    items: [
        {
            productId: '',
            quantity: 1,
            unitPrice: 0,
            lotNumber: '',
            productionDate: '',
            expiryDate: '',
        },
    ],
}

// A fresh, empty order line. Reused by the "Add item" button and the empty-form fallback.
const emptyItem = () => ({ productId: '', quantity: 1, unitPrice: 0, lotNumber: '', productionDate: '', expiryDate: '' })

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function PurchaseOrdersPage() {
    const { t } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('PURCHASE_ORDERS')
    const tenderPerms = usePermissions('TENDERS')
    const { canSeePrices } = useAuth()
    const { defaultWarehouseId, currency: baseCurrency, currencies, currencySymbol } = useSettings()
    const navigate = useNavigate()
    const toast = useToast()
    const { quickCreate, openQuickCreate, closeQuickCreate, handleQuickCreated } = useQuickCreate()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()

    const [manufacturers, setManufacturers] = useState([])
    const [products, setProducts] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [tenders, setTenders] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [suggestedOrderNumber, setSuggestedOrderNumber] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    const [loading, setLoading] = useState(false)
    const [statusLoading, setStatusLoading] = useState({})
    // Form-level validation message shown in the modal when submit is blocked.
    const [formError, setFormError] = useState('')
    const [uploadingInvoice, setUploadingInvoice] = useState(false)
    const invoiceInputRef = useRef(null)

    const buildOrdersQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1) // the backend's pages are 0-based
        params.set('size', size)
        params.set('sortBy', sortBy)
        params.set('sortDir', sortDir)
        if (q) params.set('search', q)
        if (filters.manufacturer?.length) params.set('manufacturerId', filters.manufacturer.join(','))
        if (filters.status?.length) params.set('status', filters.status.join(','))
        return params
    }

    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['manufacturer', 'status'],
        fetcher: (params) => apiGet(`/purchase-orders?${buildOrdersQuery(params).toString()}`),
    })

    const manufacturerFilter = filters.manufacturer
    const statusFilter = filters.status
    const filtersActive = !!search || manufacturerFilter.length > 0 || statusFilter.length > 0

    const fetchAllOrders = async () => {
        const params = buildOrdersQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/purchase-orders?${params.toString()}`))
    }

    useEffect(() => {
        loadReferences()
    }, [])

    // Clear the validation banner as soon as the user edits the form again.
    useEffect(() => {
        setFormError('')
    }, [form])

    // Reference lists for the create form and filters; fetched in full (the order list is paged server-side).
    const loadReferences = async () => {
        const [manufacturersRes, productsRes, warehousesRes] = await Promise.all([
            apiGet('/manufacturers?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/products?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/warehouses'),
        ])

        setManufacturers(safeArray(manufacturersRes))
        setProducts(safeArray(productsRes))
        setWarehouses(safeArray(warehousesRes))

        // Tender options power the optional "part of a tender" picker; only for users who can view tenders.
        if (tenderPerms.canView) {
            try {
                setTenders(safeArray(await apiGet('/tenders/options')))
            } catch { /* leave the picker empty if tenders can't be loaded */ }
        }
    }

    // Pre-select the company default warehouse (when it still exists) or the only warehouse, if one.
    const pickDefaultWarehouse = () => {
        if (defaultWarehouseId && warehouses.some((w) => String(w.id) === String(defaultWarehouseId))) {
            return String(defaultWarehouseId)
        }
        return warehouses.length === 1 ? String(warehouses[0].id) : ''
    }

    const openCreate = async () => {
        setEditingId(null)
        setFormError('')
        // Prefill what we sensibly can: today's date and the default warehouse.
        setForm({ ...emptyForm, orderDate: todayStr(), warehouseId: pickDefaultWarehouse(), currency: baseCurrency || 'EUR', items: [emptyItem()] })
        formModal.open()
        // Prefill a system-suggested order number the user can override (mirrors sales orders).
        try {
            const res = await apiGet('/purchase-orders/next-number')
            const number = res?.number || ''
            setSuggestedOrderNumber(number)
            setForm((prev) => ({ ...prev, orderNumber: number }))
        } catch {
            setSuggestedOrderNumber(null)
        }
        // Preselect the most-used currency with its suggested rate (falls back to the base currency).
        try {
            const q = await apiGet('/exchange-rates/most-used?scope=PURCHASE_ORDER')
            if (q?.currency) {
                setForm((prev) => ({ ...prev, currency: q.currency, exchangeRate: q.rate ?? 1, rateSource: q.source, rateAsOfDate: q.asOfDate }))
            }
        } catch { /* keep the base currency default */ }
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setFormError('')
        setSuggestedOrderNumber(null)
        setForm({
            manufacturerId: item.manufacturer?.id || '',
            warehouseId: item.warehouse?.id || '',
            orderNumber: item.orderNumber || '',
            status: item.status || 'NEW',
            orderDate: item.orderDate || '',
            closingDate: item.closingDate || '',
            expectedDeliveryDate: item.expectedDeliveryDate || '',
            deliveryAddress: item.deliveryAddress || '',
            notes: item.notes || '',
            deliveryPrice: item.deliveryPrice ?? 0,
            currency: item.currency || baseCurrency || 'EUR',
            exchangeRate: item.exchangeRate ?? 1,
            rateSource: 'SAVED',
            rateAsOfDate: null,
            tenderId: item.tenderId ?? '',
            invoiceFileUrl: item.invoiceFileUrl || '',
            invoiceFileName: item.invoiceFileName || '',
            items: item.items?.length
                ? item.items.map((it) => ({
                    productId: it.product?.id || '',
                    quantity: it.quantity ?? 1,
                    unitPrice: it.unitPrice ?? 0,
                    lotNumber: it.lotNumber || '',
                    productionDate: it.productionDate || '',
                    expiryDate: it.expiryDate || '',
                }))
                : [emptyItem()],
        })
        formModal.open()
    }

    const openDelete = (item) => {
        setDeletingItem(item)
        deleteModal.open()
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    const handleItemChange = (index, field, value) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, i) => {
                if (i !== index) return item
                const next = { ...item, [field]: value }
                // Editing the product or lot number unlocks the dates until the lot is re-checked.
                if (field === 'lotNumber' || field === 'productId') next.lotExists = false
                return next
            }),
        }))
    }

    // Picking a product prefills its unit price (the catalogue price) as a starting point — same as
    // sales orders. The user can still adjust it to the actual purchase cost.
    const handleProductChange = (index, productId) => {
        const product = products.find((p) => String(p.id) === String(productId))
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, i) =>
                i === index
                    ? { ...item, productId, unitPrice: product ? product.price : item.unitPrice, lotExists: false }
                    : item
            ),
        }))
    }

    // On blur of a line's lot field: if that product already has the lot, lock + pre-fill its dates.
    const checkLotExists = async (index) => {
        const item = form.items[index]
        const lot = (item?.lotNumber || '').trim()
        if (!item?.productId || !lot) return
        try {
            const res = await apiGet(`/products/${item.productId}/batches/lookup?lotNumber=${encodeURIComponent(lot)}`)
            setForm((prev) => ({
                ...prev,
                items: prev.items.map((it, i) => {
                    if (i !== index) return it
                    if (res?.exists) {
                        return { ...it, lotExists: true, productionDate: res.productionDate || '', expiryDate: res.expiryDate || '' }
                    }
                    return { ...it, lotExists: false }
                }),
            }))
        } catch {
            /* lookup failure is non-blocking — leave the fields editable */
        }
    }

    const addItem = () => {
        setForm((prev) => ({
            ...prev,
            items: [...prev.items, emptyItem()],
        }))
    }

    const removeItem = (index) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }))
    }

    // Upload a supplier invoice document; the returned /uploads url + original name are saved with the order.
    const uploadInvoiceFile = async (file) => {
        if (!file) return
        setUploadingInvoice(true)
        try {
            const data = new FormData()
            data.append('file', file)
            const res = await apiUpload('/upload/document', data)
            setForm((prev) => ({ ...prev, invoiceFileUrl: res.url, invoiceFileName: res.name || file.name }))
            toast.success(t('purchaseOrders.invoice.uploaded'))
        } finally {
            setUploadingInvoice(false)
            if (invoiceInputRef.current) invoiceInputRef.current.value = ''
        }
    }

    const removeInvoiceFile = () => setForm((prev) => ({ ...prev, invoiceFileUrl: '', invoiceFileName: '' }))

    // Returns a message when the form can't be submitted yet, or null when it is valid.
    const validate = () => {
        if (!form.manufacturerId) return t('purchaseOrders.validation.manufacturerRequired')
        if (!form.warehouseId) return t('purchaseOrders.validation.warehouseRequired')
        if (!form.items.length) return t('purchaseOrders.validation.itemRequired')
        for (let i = 0; i < form.items.length; i++) {
            const it = form.items[i]
            if (!it.productId) return t('purchaseOrders.validation.productRequired', { line: i + 1 })
            if (!(Number(it.quantity) > 0)) return t('purchaseOrders.validation.quantityRequired', { line: i + 1 })
            if (!it.lotNumber || !it.lotNumber.trim()) return t('purchaseOrders.validation.lotRequired', { line: i + 1 })
        }
        return null
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        const validationError = validate()
        if (validationError) {
            setFormError(validationError)
            return
        }
        setFormError('')
        setLoading(true)

        // If the user kept the system suggestion, send a blank number so the backend allocates (and
        // advances) the counter; a changed value is sent as-is.
        const keptSuggestion = !editingId && form.orderNumber === suggestedOrderNumber

        const payload = {
            manufacturerId: Number(form.manufacturerId),
            warehouseId: Number(form.warehouseId),
            orderNumber: keptSuggestion ? null : form.orderNumber || null,
            status: form.status,
            orderDate: form.orderDate || null,
            closingDate: form.closingDate || null,
            expectedDeliveryDate: form.expectedDeliveryDate || null,
            deliveryAddress: form.deliveryAddress,
            notes: form.notes,
            deliveryPrice: Number(form.deliveryPrice || 0),
            currency: form.currency || baseCurrency || null,
            exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : null,
            tenderId: form.tenderId ? Number(form.tenderId) : null,
            invoiceFileUrl: form.invoiceFileUrl || null,
            invoiceFileName: form.invoiceFileName || null,
            items: form.items.map((item) => ({
                productId: Number(item.productId),
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                lotNumber: item.lotNumber?.trim() || null,
                productionDate: item.productionDate || null,
                expiryDate: item.expiryDate || null,
            })),
        }

        try {
            if (editingId) {
                await apiPut(`/purchase-orders/${editingId}`, payload)
            } else {
                await apiPost('/purchase-orders', payload)
            }
            toast.success(editingId ? t('purchaseOrders.updated') : t('purchaseOrders.created'))
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
            await apiDelete(`/purchase-orders/${deletingItem.id}`)
            toast.success(t('purchaseOrders.deleted'))
            deleteModal.close()
            setDeletingItem(null)
            setSelectedIds((prev) => prev.filter((id) => id !== deletingItem.id))
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const handleStatusChange = async (row, newStatus) => {
        setStatusLoading((prev) => ({ ...prev, [row.id]: true }))
        try {
            await apiPatch(`/purchase-orders/${row.id}/status`, { status: newStatus })
            toast.success(t('toast.statusUpdated'))
            await reload()
        } finally {
            setStatusLoading((prev) => ({ ...prev, [row.id]: false }))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return
        setLoading(true)
        try {
            await Promise.all(selectedIds.map((id) => apiDelete(`/purchase-orders/${id}`)))
            toast.success(t('purchaseOrders.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const columns = [
        { key: 'orderNumber', label: t('purchaseOrders.cols.orderNo'), sortKey: 'orderNumber' },
        { key: 'manufacturer', label: t('purchaseOrders.cols.manufacturer'), sortKey: 'manufacturer.name', render: (row) => row.manufacturer?.name || '-' },
        {
            key: 'status',
            sortKey: 'status',
            label: t('common.status'),
            render: (row) => (
                <span onClick={(e) => e.stopPropagation()}>
                    <StatusPicker
                        status={row.status}
                        onSelect={canEdit ? (s) => handleStatusChange(row, s) : undefined}
                        loading={!!statusLoading[row.id]}
                    />
                </span>
            ),
        },
        { key: 'orderDate', label: t('purchaseOrders.cols.orderDate'), sortKey: 'orderDate', render: (row) => formatDate(row.orderDate) },
        ...(canSeePrices ? [{ key: 'totalAmount', label: t('common.total'), sortKey: 'totalAmount', render: (row) => <MoneyWithBase amount={row.totalAmount} currency={row.currency} exchangeRate={row.exchangeRate} base={baseCurrency} /> }] : []),
        ...((canEdit || canDelete) ? [{
            key: 'actions',
            label: '',
            render: (row) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                        actions={[
                            ...(canEdit ? [{ key: 'edit', label: t('common.edit'), icon: Pencil, onClick: () => openEdit(row) }] : []),
                            ...(canDelete ? [{ key: 'delete', label: t('common.delete'), icon: Trash2, danger: true, onClick: () => openDelete(row) }] : []),
                        ]}
                    />
                </div>
            ),
        }] : []),
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('purchaseOrders.title')}
                description={t('purchaseOrders.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        <DataToolbar
                            entityLabel="purchase-orders"
                            exportColumns={exportColumns}
                            rows={rows}
                            fetchRows={fetchAllOrders}
                            count={total}
                        />
                        {canCreate && (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('purchaseOrders.add')}
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
                        key: 'manufacturer',
                        value: manufacturerFilter,
                        onChange: (v) => setFilter('manufacturer', v),
                        searchable: true,
                        placeholder: t('common.allManufacturers'),
                        options: manufacturers.map((m) => ({ value: String(m.id), label: m.name })),
                    },
                    {
                        key: 'status',
                        value: statusFilter,
                        onChange: (v) => setFilter('status', v),
                        placeholder: t('common.allStatuses'),
                        options: [
                            { value: 'NEW', label: t('statuses.NEW') },
                            { value: 'IN_PROGRESS', label: t('statuses.IN_PROGRESS') },
                            { value: 'CONFIRMED', label: t('statuses.CONFIRMED') },
                            { value: 'SHIPPED', label: t('statuses.SHIPPED') },
                            { value: 'CLOSED', label: t('statuses.CLOSED') },
                            { value: 'CANCELLED', label: t('statuses.CANCELLED') },
                        ],
                    },
                ]}
            />

            <DataTable
                tableId="purchase-orders"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={FileText}
                        title={t('purchaseOrders.emptyTitle')}
                        description={t('purchaseOrders.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('purchaseOrders.add')}
                            </button>
                        ) : null}
                    />
                }
                onRowClick={(row) => navigate(`/purchase-orders/${row.id}`)}
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

            <Modal
                isOpen={formModal.isOpen}
                title={editingId ? t('purchaseOrders.editTitle') : t('purchaseOrders.addTitle')}
                onClose={formModal.close}
            >
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    {formError && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            {formError}
                        </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormSelect
                            id="purchase-order-manufacturer"
                            label={t('purchaseOrders.form.manufacturer')}
                            name="manufacturerId"
                            value={form.manufacturerId}
                            onChange={handleChange}
                            required
                            searchable
                            placeholder={t('purchaseOrders.form.selectManufacturer')}
                            options={manufacturers.map((item) => ({ value: String(item.id), label: item.name }))}
                            onQuickCreate={(name) => openQuickCreate('manufacturer', name, (item) => {
                                setManufacturers((prev) => [...prev, item.raw])
                                handleChange({ target: { name: 'manufacturerId', value: item.value } })
                            })}
                        />

                        <FormSelect
                            id="purchase-order-warehouse"
                            label={t('purchaseOrders.form.warehouse')}
                            name="warehouseId"
                            value={form.warehouseId}
                            onChange={handleChange}
                            required
                            placeholder={t('purchaseOrders.form.selectWarehouse')}
                            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                        />

                        <FormField
                            id="purchase-order-number"
                            label={t('purchaseOrders.form.orderNumber')}
                            name="orderNumber"
                            value={form.orderNumber}
                            onChange={handleChange}
                            placeholder={t('purchaseOrders.form.orderNumber')}
                        />

                        <FormSelect
                            id="purchase-order-status"
                            label={t('common.status')}
                            name="status"
                            value={form.status}
                            onChange={handleChange}
                            placeholder={t('purchaseOrders.form.selectStatus')}
                            options={[
                                { value: 'NEW', label: t('statuses.NEW') },
                                { value: 'IN_PROGRESS', label: t('statuses.IN_PROGRESS') },
                                { value: 'CONFIRMED', label: t('statuses.CONFIRMED') },
                                { value: 'SHIPPED', label: t('statuses.SHIPPED') },
                                { value: 'CLOSED', label: t('statuses.CLOSED') },
                                { value: 'CANCELLED', label: t('statuses.CANCELLED') },
                            ]}
                        />

                        <FormField
                            id="purchase-order-date"
                            label={t('purchaseOrders.form.orderDate')}
                            type="date"
                            name="orderDate"
                            value={form.orderDate}
                            onChange={handleChange}
                        />

                        <FormField
                            id="purchase-order-closing-date"
                            label={t('purchaseOrders.form.closingDate')}
                            type="date"
                            name="closingDate"
                            value={form.closingDate}
                            onChange={handleChange}
                        />

                        <FormField
                            id="purchase-order-expected-delivery"
                            label={t('purchaseOrders.form.expectedDelivery')}
                            type="date"
                            name="expectedDeliveryDate"
                            value={form.expectedDeliveryDate}
                            onChange={handleChange}
                        />

                        <FormField
                            id="purchase-order-delivery-price"
                            label={`${t('purchaseOrders.form.deliveryPrice')} (${currencySymbol(form.currency || baseCurrency)})`}
                            type="number"
                            step="0.01"
                            name="deliveryPrice"
                            value={form.deliveryPrice}
                            onChange={handleChange}
                            placeholder={t('purchaseOrders.form.deliveryPrice')}
                        />

                        <CurrencyRateField
                            value={{ currency: form.currency, exchangeRate: form.exchangeRate, source: form.rateSource, asOfDate: form.rateAsOfDate }}
                            onChange={(next) => setForm((prev) => ({ ...prev, currency: next.currency, exchangeRate: next.exchangeRate, rateSource: next.source, rateAsOfDate: next.asOfDate }))}
                            baseCurrency={baseCurrency}
                            currencies={currencies}
                        />

                        {tenderPerms.canView && (
                            <FormSelect
                                id="purchase-order-tender"
                                label={t('orders.form.tender')}
                                name="tenderId"
                                value={form.tenderId ? String(form.tenderId) : ''}
                                onChange={handleChange}
                                searchable
                                placeholder={t('orders.form.noTender')}
                                options={[
                                    { value: '', label: t('orders.form.noTender') },
                                    ...tenders.map((td) => ({
                                        value: String(td.id),
                                        label: td.tenderNumber ? `${td.title} · ${td.tenderNumber}` : td.title,
                                        search: td.tenderNumber,
                                    })),
                                ]}
                            />
                        )}

                        <AddressAutocompleteField
                            id="purchase-order-delivery-address"
                            label={t('purchaseOrders.form.deliveryAddress')}
                            name="deliveryAddress"
                            value={form.deliveryAddress}
                            onChange={handleChange}
                            placeholder={t('purchaseOrders.form.deliveryAddress')}
                        />
                    </div>

                    <TextareaField
                        id="purchase-order-notes"
                        label={t('common.notes')}
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        placeholder={t('common.notes')}
                        rows={3}
                    />

                    {/* Supplier (manufacturer) invoice document attachment. */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{t('purchaseOrders.invoice.label')}</label>
                        <input
                            ref={invoiceInputRef}
                            type="file"
                            accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv"
                            onChange={(e) => uploadInvoiceFile(e.target.files?.[0])}
                            className="hidden"
                        />
                        {form.invoiceFileName ? (
                            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{form.invoiceFileName}</span>
                                <button
                                    type="button"
                                    onClick={() => invoiceInputRef.current?.click()}
                                    disabled={uploadingInvoice}
                                    className="text-sm font-medium text-teal-600 hover:underline disabled:opacity-60 dark:text-teal-400"
                                >
                                    {uploadingInvoice ? t('common.saving') : t('purchaseOrders.invoice.replace')}
                                </button>
                                <button
                                    type="button"
                                    onClick={removeInvoiceFile}
                                    aria-label={t('common.remove')}
                                    className="text-rose-500 hover:text-rose-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => invoiceInputRef.current?.click()}
                                disabled={uploadingInvoice}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                                <Upload className="h-4 w-4" /> {uploadingInvoice ? t('common.saving') : t('purchaseOrders.invoice.upload')}
                            </button>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchaseOrders.invoice.hint')}</p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{t('purchaseOrders.form.orderItems')}</h3>
                            <button
                                type="button"
                                onClick={addItem}
                                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white dark:bg-slate-700"
                            >
                                {t('purchaseOrders.form.addItem')}
                            </button>
                        </div>

                        {form.items.map((item, index) => (
                            <div
                                key={index}
                                className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                            >
                                <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                                <FormSelect
                                    id={`purchase-order-item-product-${index}`}
                                    label={t('purchaseOrders.form.product')}
                                    name={`productId-${index}`}
                                    value={item.productId}
                                    onChange={(e) => handleProductChange(index, e.target.value)}
                                    required
                                    searchable
                                    placeholder={t('purchaseOrders.form.selectProduct')}
                                    options={products.map((product) => ({ value: String(product.id), label: product.name }))}
                                    onQuickCreate={(name) => openQuickCreate('product', name, (created) => {
                                        setProducts((prev) => [...prev, created.raw])
                                        handleProductChange(index, created.value)
                                    })}
                                />

                                <FormField
                                    id={`purchase-order-item-quantity-${index}`}
                                    label={t('common.quantity')}
                                    type="number"
                                    min={1}
                                    required
                                    name={`quantity-${index}`}
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                                    placeholder={t('common.qty')}
                                />

                                <FormField
                                    id={`purchase-order-item-unit-price-${index}`}
                                    label={`${t('orderDetail.cols.unitPrice')} (${currencySymbol(form.currency || baseCurrency)})`}
                                    type="number"
                                    step="0.01"
                                    name={`unitPrice-${index}`}
                                    value={item.unitPrice}
                                    onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
                                    placeholder={t('orderDetail.cols.unitPrice')}
                                />

                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        disabled={form.items.length === 1}
                                        aria-label={t('common.remove')}
                                        title={t('common.remove')}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-rose-950/40"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <FormField
                                            id={`purchase-order-item-lot-${index}`}
                                            label={t('purchaseOrders.form.lotNumber')}
                                            name={`lotNumber-${index}`}
                                            value={item.lotNumber}
                                            onChange={(e) => handleItemChange(index, 'lotNumber', e.target.value)}
                                            onBlur={() => checkLotExists(index)}
                                            required
                                            placeholder={t('purchaseOrders.form.lotNumberPlaceholder')}
                                        />

                                        <FormField
                                            id={`purchase-order-item-production-${index}`}
                                            label={t('purchaseOrders.form.productionDate')}
                                            type="date"
                                            name={`productionDate-${index}`}
                                            value={item.productionDate}
                                            onChange={(e) => handleItemChange(index, 'productionDate', e.target.value)}
                                            disabled={item.lotExists}
                                            inputClassName={item.lotExists ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-800/60' : ''}
                                        />

                                        <FormField
                                            id={`purchase-order-item-expiry-${index}`}
                                            label={t('purchaseOrders.form.expiryDate')}
                                            type="date"
                                            name={`expiryDate-${index}`}
                                            value={item.expiryDate}
                                            onChange={(e) => handleItemChange(index, 'expiryDate', e.target.value)}
                                            disabled={item.lotExists}
                                            inputClassName={item.lotExists ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-800/60' : ''}
                                        />
                                    </div>
                                    {item.lotExists && (
                                        <p className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                                            <Info className="h-3.5 w-3.5 shrink-0" /> {t('purchaseOrders.form.lotExists', { lot: (item.lotNumber || '').trim() })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3">
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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('purchaseOrders.createBtn')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('purchaseOrders.deleteTitle')}
                message={t('purchaseOrders.deleteConfirm', { name: deletingItem?.orderNumber || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('purchaseOrders.bulkDeleteTitle')}
                message={t('purchaseOrders.bulkDeleteConfirm', { count: selectedIds.length })}
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