import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../api/client'
import { useServerTable } from '../hooks/useServerTable'
import PageHeader from '../components/PageHeader'
import SearchFilters from '../components/SearchFilters'
import { sortOptionsFromColumns } from '../utils/sortOptions'
import EmptyState from '../components/EmptyState'
import DataTable from '../components/DataTable'
import DataToolbar from '../components/DataToolbar'
import StatusPicker from '../components/StatusPicker'
import StatusBadge from '../components/StatusBadge'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import { useModal } from '../hooks/useModal'
import { useQuickCreate } from '../hooks/useQuickCreate'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import QuickCreateModal from '../components/QuickCreateModal'
import { useToast } from '../context/ToastContext'
import { formatDate, formatMoney, safeArray, toCompanyAmount } from '../utils/format'
import {FormField, FormSelect, TextareaField} from "../components/FormField.jsx";
import AddressAutocompleteField from "../components/AddressAutocompleteField.jsx";
import CurrencyRateField from "../components/CurrencyRateField.jsx";
import MoneyWithBase from "../components/MoneyWithBase.jsx";
import ComposeEmailModal from '../components/ComposeEmailModal'
import { serviceReminderTemplate } from '../config/serviceReminderTemplate'
import { Pencil, Trash2, ShoppingCart } from 'lucide-react'
import ModalActions from '../components/ModalActions'

const exportColumns = [
    { header: 'ID', value: (r) => r.id },
    { header: 'Order no.', value: (r) => r.orderNumber },
    { header: 'Client', value: (r) => r.client?.name || '' },
    { header: 'Status', value: (r) => r.status },
    { header: 'Order date', value: (r) => r.orderDate },
    { header: 'Closing date', value: (r) => r.closingDate },
    { header: 'Delivery address', value: (r) => r.deliveryAddress },
    { header: 'Delivery price', value: (r) => r.deliveryPrice },
    { header: 'Total', value: (r) => r.totalAmount },
    {
        header: 'Items',
        value: (r) => (r.items || []).map((it) => `${it.product?.name || '?'} x${it.quantity} @ ${it.unitPrice}`).join('; '),
    },
    { header: 'Notes', value: (r) => r.notes },
]

const todayStr = () => new Date().toISOString().slice(0, 10)

/**
 * `dateStr` (or today, when absent) plus `months`, as the ISO date DateField expects. Clamps to the
 * target month's last day rather than overflowing into the month after - `setMonth` on the 31st would
 * otherwise turn "31 Aug + 6 months" into 3 March (Feb has no 31st), landing the reminder a week later
 * than the interval actually says.
 */
function addMonthsIso(dateStr, months) {
    const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDayOfTargetMonth))
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Amount-due figures on the payment column carry the invoice's own currency snapshot.
function paymentMoney(value, currency) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: 2,
    }).format(Number(value || 0))
}

const PAYMENT_STATUSES = [
    'NOT_INVOICED',
    'PREPAYMENT_PENDING',
    'PREPAYMENT_OVERDUE',
    'AWAITING_FINAL',
    'INVOICED',
    'OVERDUE',
    'PAID',
]

const NO_PAYMENT = { paymentStatus: 'NOT_INVOICED', amountDue: 0, penaltyAmount: 0, overdue: false, currency: null }

const emptyItem = { productId: '', serviceId: '', quantity: 1, unitPrice: 0, discountPercent: '', taxRatePercent: '' }

// A line sells either a product or a service, and the two have independent id sequences, so the one
// picker that offers both encodes which kind each option is into its value.
// Exported for unit testing: this pair is the only thing standing between "product 3" and "service 3".
export const refValue = (item) => (item.serviceId ? `s-${item.serviceId}` : item.productId ? `p-${item.productId}` : '')
export const decodeRef = (encoded) => {
    const str = String(encoded || '')
    return { isService: str.startsWith('s-'), id: str.slice(2) }
}

const emptyForm = {
    clientId: '',
    warehouseId: '',
    orderNumber: '',
    status: 'NEW',
    orderDate: todayStr(),
    closingDate: '',
    deliveryAddress: '',
    notes: '',
    deliveryPrice: 0,
    currency: '',
    exchangeRate: 1,
    rateSource: 'SAME',
    rateAsOfDate: null,
    tenderId: '',
    items: [{ ...emptyItem }],
}

export default function SalesOrdersPage() {
    const { t, i18n } = useTranslation()
    const { canCreate, canEdit, canDelete } = usePermissions('SALES_ORDERS')
    const invoicePerms = usePermissions('INVOICES')
    // The permission alone is not enough: a company that has not bought the Tenders add-on has the
    // module closed on the server, so asking for the options 403s and raises a "Forbidden" toast on
    // every visit to this page. The nav hides the Tenders page for exactly the same reason.
    const tenderPerms = usePermissions('TENDERS')
    const emailPerms = usePermissions('MANUFACTURER_EMAILS')
    const { canSeePrices, hasAddon } = useAuth()
    const canUseTenders = tenderPerms.canView && hasAddon('TENDERS')
    // Same pair the client/manufacturer pages gate emailing on: the add-on bought, and this user allowed
    // to send. Guards the post-create "schedule a reminder?" prompt below.
    const canOfferReminders = emailPerms.canCreate && hasAddon('MANUFACTURER_EMAILS')
    const { defaultWarehouseId, currency: baseCurrency, currencies, currencySymbol } = useSettings()
    const navigate = useNavigate()
    const toast = useToast()
    const { quickCreate, openQuickCreate, closeQuickCreate, handleQuickCreated } = useQuickCreate()
    const formModal = useModal()
    const deleteModal = useModal()
    const bulkDeleteModal = useModal()

    const [clients, setClients] = useState([])
    const [products, setProducts] = useState([])
    const [services, setServices] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [taxRates, setTaxRates] = useState([])
    const [tenders, setTenders] = useState([])
    const [form, setForm] = useState(emptyForm)
    const [editingId, setEditingId] = useState(null)
    const [suggestedOrderNumber, setSuggestedOrderNumber] = useState(null)
    const [deletingItem, setDeletingItem] = useState(null)
    const [selectedIds, setSelectedIds] = useState([])
    // orderId -> derived billing summary (payment status, amount due, penalty). Orders absent from the
    // map are treated as NOT_INVOICED.
    const [paymentByOrder, setPaymentByOrder] = useState({})
    const [loading, setLoading] = useState(false)

    // Builds the /sales-orders query for the current page + filters. Payment status is derived, not a
    // column: it is resolved to an id include/exclude set from the billing summaries (see below).
    const buildOrdersQuery = ({ page, size, sortBy, sortDir, q, filters }) => {
        const params = new URLSearchParams()
        params.set('page', page - 1) // the backend's pages are 0-based
        params.set('size', size)
        params.set('sortBy', sortBy)
        params.set('sortDir', sortDir)
        if (q) params.set('search', q)
        if (filters.client?.length) params.set('clientId', filters.client.join(','))
        if (filters.status?.length) params.set('status', filters.status.join(','))
        const paySel = filters.paymentStatus || []
        if (paySel.length) {
            const orderIds = Object.keys(paymentByOrder)
            if (paySel.includes('NOT_INVOICED')) {
                // NOT_INVOICED orders are absent from the summary map, so exclude the invoiced orders
                // whose status isn't selected rather than trying to enumerate the (unknown) rest.
                const exclude = orderIds.filter((id) => !paySel.includes(paymentByOrder[id].paymentStatus)).map(Number)
                if (exclude.length) params.set('excludeId', exclude.join(','))
            } else {
                const include = orderIds.filter((id) => paySel.includes(paymentByOrder[id].paymentStatus)).map(Number)
                params.set('id', include.length ? include.join(',') : '-1') // -1 → forces an empty page
            }
        }
        return params
    }

    const {
        rows, total, loading: listLoading, page, pageSize, sortBy, sortDir, q: search, filters,
        setSearch, setFilter, setPage, setPageSize, setSort, reload,
    } = useServerTable({
        filterKeys: ['client', 'status', 'paymentStatus'],
        fetcher: (params) => apiGet(`/sales-orders?${buildOrdersQuery(params).toString()}`),
    })

    const statusFilter = filters.status
    const clientFilter = filters.client
    const paymentStatusFilter = filters.paymentStatus
    const filtersActive = !!search || statusFilter.length > 0 || clientFilter.length > 0 || paymentStatusFilter.length > 0

    const fetchAllOrders = async () => {
        const params = buildOrdersQuery({ page: 1, size: 10000, sortBy: 'id', sortDir: 'desc', q: search, filters })
        return safeArray(await apiGet(`/sales-orders?${params.toString()}`))
    }
    const [statusLoading, setStatusLoading] = useState({})
    // productId -> on-hand quantity in the currently selected warehouse (for availability hints).
    const [stockLevels, setStockLevels] = useState({})
    // Form-level validation message shown in the modal when submit is blocked.
    // `{ message, focusId }` for the first problem found, or null. A fresh object per failed submit, so the
    // scroll effect below re-runs even when the same message comes back twice.
    const [formError, setFormError] = useState(null)
    // Fallback scroll target for a validation message that names no single field (an order with no lines).
    const formErrorRef = useRef(null)
    // When editing an order that already shipped, its own units were already drawn from the warehouse,
    // so they must be added back to the "available" pool to validate its quantities fairly.
    const [editBaseline, setEditBaseline] = useState(null)
    // Recurring-service reminders offered right after a create: one entry per recurring-service line
    // sold, shown one at a time via ComposeEmailModal. Closing (or sending) the modal advances the
    // queue - Cancel on it is simply "no thanks for this one".
    const [reminderQueue, setReminderQueue] = useState([])
    const [reminderClientId, setReminderClientId] = useState(null)
    const activeReminder = reminderQueue[0] || null
    const advanceReminders = () => setReminderQueue((q) => q.slice(1))

    useEffect(() => {
        loadReferences()
    }, [])

    // Clear the validation banner as soon as the user edits the form again.
    useEffect(() => {
        setFormError(null)
    }, [form])

    // Bring the control at fault into view once the banner is in the DOM. A layout effect rather than a
    // callback in the submit handler: the banner adds height to a form that is several screens tall on a
    // phone, and scrolling before React has committed it lands in the wrong place — the browser then
    // re-anchors the scrollport and undoes the move. Running before paint also means no visible jump.
    useLayoutEffect(() => {
        if (!formError) return
        const field = formError.focusId ? document.getElementById(formError.focusId) : null
        const target = field ?? formErrorRef.current
        target?.scrollIntoView({ block: 'center' })
        // Focus lands on the control itself, so a keyboard or screen-reader user carries on from the
        // problem rather than from wherever they were.
        field?.focus?.({ preventScroll: true })
    }, [formError])

    // Pick a sensible warehouse for a new order: the company default if it still exists, else the only
    // warehouse when there is just one, else leave it for the user to choose.
    const pickDefaultWarehouse = () => {
        if (defaultWarehouseId && warehouses.some((w) => String(w.id) === String(defaultWarehouseId))) {
            return String(defaultWarehouseId)
        }
        return warehouses.length === 1 ? String(warehouses[0].id) : ''
    }

    // Load per-product stock for the chosen warehouse whenever it changes while the form is open.
    useEffect(() => {
        if (!formModal.isOpen || !form.warehouseId) {
            setStockLevels({})
            return
        }
        let cancelled = false
        apiGet(`/warehouses/${form.warehouseId}/stock-levels`)
            .then((res) => !cancelled && setStockLevels(res && typeof res === 'object' ? res : {}))
            .catch(() => !cancelled && setStockLevels({}))
        return () => {
            cancelled = true
        }
    }, [form.warehouseId, formModal.isOpen])

    // Reference lists for the form + filters (fetched in full — the order list is paged server-side).
    const loadReferences = async () => {
        const [clientsRes, productsRes, servicesRes, warehousesRes, taxRes] = await Promise.all([
            apiGet('/clients?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/products?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/services?page=0&size=500&sortBy=id&sortDir=asc'),
            apiGet('/warehouses'),
            apiGet('/settings/tax-rates'),
        ])

        setClients(safeArray(clientsRes))
        setProducts(safeArray(productsRes))
        setServices(safeArray(servicesRes))
        setWarehouses(safeArray(warehousesRes))
        setTaxRates(Array.isArray(taxRes) ? taxRes : [])

        // Tender options power the optional "part of a tender" picker; only for users who can view tenders.
        if (canUseTenders) {
            try {
                setTenders(safeArray(await apiGet('/tenders/options')))
            } catch { /* leave the picker empty if tenders can't be loaded */ }
        }

        // Billing summaries drive the payment column and filter; only fetched when the user can see
        // invoices, so orders stay usable for staff without invoice access.
        if (invoicePerms.canView) {
            try {
                const summaries = await apiGet('/sales-orders/payment-summaries')
                const map = {}
                for (const s of safeArray(summaries)) map[s.orderId] = s
                setPaymentByOrder(map)
                // The initial list query ran before payment statuses were known; if a payment filter is
                // active (e.g. restored from the URL), re-run it now that we can resolve those ids.
                if (filters.paymentStatus.length) reload()
            } catch {
                setPaymentByOrder({})
            }
        }
    }

    const paymentFor = (row) => paymentByOrder[row.id] || NO_PAYMENT

    // Active tax rates as picker options; the value is the percentage (snapshotted onto the line).
    const taxOptions = useMemo(() => {
        const active = taxRates.filter((r) => r.active !== false)
        return [
            { value: '', label: t('salesOrders.form.noTax') },
            ...active.map((r) => ({ value: String(Number(r.percentage)), label: `${r.name} (${Number(r.percentage)}%)` })),
        ]
    }, [taxRates, t])

    const defaultTaxValue = useMemo(() => {
        const def = taxRates.find((r) => r.isDefault)
        return def ? String(Number(def.percentage)) : ''
    }, [taxRates])

    // Live totals: subtotal (net, after discounts), tax, and totals with/without tax.
    const totals = useMemo(() => {
        let subtotal = 0
        let tax = 0
        for (const it of form.items) {
            const net = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0) * (1 - (Number(it.discountPercent) || 0) / 100)
            subtotal += net
            tax += net * ((Number(it.taxRatePercent) || 0) / 100)
        }
        const delivery = Number(form.deliveryPrice) || 0
        return { subtotal, tax, delivery, totalExcl: subtotal + delivery, totalIncl: subtotal + tax + delivery }
    }, [form.items, form.deliveryPrice])

    const openCreate = async () => {
        setEditingId(null)
        setFormError(null)
        setEditBaseline(null)
        setForm({ ...emptyForm, orderDate: todayStr(), warehouseId: pickDefaultWarehouse(), currency: baseCurrency || 'EUR', items: [{ ...emptyItem, taxRatePercent: defaultTaxValue }] })
        formModal.open()
        // Prefill a system-suggested order number the user can override.
        try {
            const res = await apiGet('/sales-orders/next-number')
            const number = res?.number || ''
            setSuggestedOrderNumber(number)
            setForm((prev) => ({ ...prev, orderNumber: number }))
        } catch {
            setSuggestedOrderNumber(null)
        }
        // Preselect the most-used currency with its suggested rate (falls back to the base currency).
        try {
            const q = await apiGet('/exchange-rates/most-used?scope=SALES_ORDER')
            if (q?.currency) {
                setForm((prev) => ({ ...prev, currency: q.currency, exchangeRate: q.rate ?? 1, rateSource: q.source, rateAsOfDate: q.asOfDate }))
            }
        } catch { /* keep the base currency default */ }
    }

    const openEdit = (item) => {
        setEditingId(item.id)
        setSuggestedOrderNumber(null)
        setFormError(null)
        // Stock-affecting orders (shipped/closed) already consumed their units; remember per-product
        // totals so the availability check credits them back when re-validating this order.
        const wasStockAffecting = ['SHIPPED', 'CLOSED'].includes(item.status)
        const baselineByProduct = {}
        if (wasStockAffecting) {
            for (const it of item.items || []) {
                const pid = String(it.product?.id)
                baselineByProduct[pid] = (baselineByProduct[pid] || 0) + (Number(it.quantity) || 0)
            }
        }
        setEditBaseline(wasStockAffecting ? baselineByProduct : null)
        setForm({
            clientId: item.client?.id || '',
            warehouseId: item.warehouse?.id || '',
            orderNumber: item.orderNumber || '',
            status: item.status || 'NEW',
            orderDate: item.orderDate || '',
            closingDate: item.closingDate || '',
            deliveryAddress: item.deliveryAddress || '',
            notes: item.notes || '',
            deliveryPrice: item.deliveryPrice ?? 0,
            currency: item.currency || baseCurrency || 'EUR',
            exchangeRate: item.exchangeRate ?? 1,
            rateSource: 'SAVED',
            rateAsOfDate: null,
            tenderId: item.tenderId ?? '',
            items: item.items?.length
                ? item.items.map((it) => ({
                    productId: it.product?.id || '',
                    serviceId: it.service?.id || '',
                    quantity: it.quantity ?? 1,
                    unitPrice: it.unitPrice ?? 0,
                    discountPercent: it.discountPercent ?? '',
                    taxRatePercent: it.taxRatePercent != null ? String(Number(it.taxRatePercent)) : '',
                }))
                : [{ ...emptyItem }],
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

    // Picking a client fills the delivery address with that client's address (kept if they have none).
    const handleClientChange = (clientId) => {
        const client = clients.find((c) => String(c.id) === String(clientId))
        setForm((prev) => ({
            ...prev,
            clientId,
            deliveryAddress: client?.address ? client.address : prev.deliveryAddress,
        }))
    }

    const handleItemChange = (index, field, value) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
        }))
    }

    // Picking a product or a service prefills its unit price and tax rate (its own rate, else the
    // default), and clears whichever of the two ids the line is no longer for.
    // `justCreated` carries the record straight from a quick-created service. Without it the lookup below
    // would miss: `setServices` has not re-rendered yet when the callback runs, so the array in this
    // closure is still the pre-create one and `ref` came back undefined — leaving the new line at the
    // empty item's 0 price and the fallback tax rate.
    const handleItemRefChange = (index, encoded, justCreated = null) => {
        const { isService, id } = decodeRef(encoded)
        const ref = justCreated ?? (isService
            ? services.find((s) => String(s.id) === id)
            : products.find((p) => String(p.id) === id))
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, i) =>
                i === index
                    ? {
                          ...item,
                          productId: isService ? '' : id,
                          serviceId: isService ? id : '',
                          unitPrice: ref ? ref.price : item.unitPrice,
                          taxRatePercent:
                              ref?.taxRate?.percentage != null
                                  ? String(Number(ref.taxRate.percentage))
                                  : defaultTaxValue,
                      }
                    : item
            ),
        }))
    }

    // New lines open on the company's default rate rather than "No tax". Picking a product still
    // overrides it with that product's own rate, so this only decides what an untouched line reads as —
    // and "No tax" was the one answer that was almost never right.
    const addItem = () => {
        setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem, taxRatePercent: defaultTaxValue }] }))
    }

    const removeItem = (index) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }))
    }

    // Units of a product available in the selected warehouse. When editing a shipped order, its own
    // units are credited back so unchanged quantities don't read as oversold.
    const availableFor = (productId) => {
        const raw = Number(stockLevels[String(productId)] ?? 0)
        const credit = editBaseline ? editBaseline[String(productId)] || 0 : 0
        return raw + credit
    }

    // Returns `{ message, focusId }` for the first problem found, or null when the form is valid.
    // `focusId` names the control at fault so the caller can bring it into view: the banner renders at the
    // very top of a form that is several screens tall on a phone, so a submit from down among the line
    // items used to look like nothing had happened at all.
    const validate = () => {
        if (!form.clientId) {
            return { message: t('salesOrders.validation.clientRequired'), focusId: 'sales-order-client' }
        }
        if (!form.warehouseId) {
            return { message: t('salesOrders.validation.warehouseRequired'), focusId: 'sales-order-warehouse' }
        }
        if (!form.items.length) return { message: t('salesOrders.validation.itemRequired'), focusId: null }
        for (let i = 0; i < form.items.length; i++) {
            const it = form.items[i]
            if (!it.productId && !it.serviceId) {
                return {
                    message: t('salesOrders.validation.productRequired', { line: i + 1 }),
                    focusId: `sales-order-item-product-${i}`,
                }
            }
            if (!(Number(it.quantity) > 0)) {
                return {
                    message: t('salesOrders.validation.quantityRequired', { line: i + 1 }),
                    focusId: `sales-order-item-quantity-${i}`,
                }
            }
        }
        // Block overselling: no line may exceed what the chosen warehouse holds. Service lines are
        // skipped — there is no stock to oversell.
        for (let i = 0; i < form.items.length; i++) {
            const it = form.items[i]
            if (!it.productId) continue
            const available = availableFor(it.productId)
            if (Number(it.quantity) > available) {
                return {
                    message: t('salesOrders.validation.overStock', { line: i + 1, available }),
                    focusId: `sales-order-item-quantity-${i}`,
                }
            }
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
        setFormError(null)
        setLoading(true)

        // If the user kept the system suggestion, send a blank number so the backend allocates (and
        // advances) the counter; a changed value is sent as-is.
        const keptSuggestion = !editingId && form.orderNumber === suggestedOrderNumber

        const payload = {
            clientId: Number(form.clientId),
            warehouseId: Number(form.warehouseId),
            orderNumber: keptSuggestion ? null : form.orderNumber || null,
            status: form.status,
            orderDate: form.orderDate || null,
            closingDate: form.closingDate || null,
            deliveryAddress: form.deliveryAddress,
            notes: form.notes,
            deliveryPrice: Number(form.deliveryPrice || 0),
            currency: form.currency || baseCurrency || null,
            exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : null,
            tenderId: form.tenderId ? Number(form.tenderId) : null,
            items: form.items.map((item) => ({
                // Exactly one of the two is set; the backend rejects a line that names both or neither.
                productId: item.productId ? Number(item.productId) : null,
                serviceId: item.serviceId ? Number(item.serviceId) : null,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                discountPercent: item.discountPercent !== '' && item.discountPercent != null ? Number(item.discountPercent) : 0,
                taxRatePercent: item.taxRatePercent !== '' && item.taxRatePercent != null ? Number(item.taxRatePercent) : null,
            })),
        }

        try {
            let created = null
            if (editingId) {
                await apiPut(`/sales-orders/${editingId}`, payload)
            } else {
                created = await apiPost('/sales-orders', payload)
            }
            toast.success(editingId ? t('salesOrders.updated') : t('salesOrders.created'))
            formModal.close()
            setEditingId(null)
            setForm(emptyForm)
            await reload()

            // Offer a reminder for each recurring service just sold - only on a fresh order, only when
            // this company/user can actually send one, and only when there is an address to send it to.
            if (created && canOfferReminders && created.client?.email) {
                const queue = safeArray(created.items)
                    .filter((it) => it.service?.recurrenceMonths)
                    .map((it) => ({
                        serviceId: it.service.id,
                        serviceName: it.service.name,
                        suggestedDate: addMonthsIso(created.orderDate, it.service.recurrenceMonths),
                    }))
                if (queue.length) {
                    setReminderClientId(created.client.id)
                    setReminderQueue(queue)
                }
            }
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingItem) return
        setLoading(true)
        try {
            await apiDelete(`/sales-orders/${deletingItem.id}`)
            toast.success(t('salesOrders.deleted'))
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
            await apiPatch(`/sales-orders/${row.id}/status`, { status: newStatus })
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
            await Promise.all(selectedIds.map((id) => apiDelete(`/sales-orders/${id}`)))
            toast.success(t('salesOrders.bulkDeleted', { count: selectedIds.length }))
            bulkDeleteModal.close()
            setSelectedIds([])
            await reload()
        } finally {
            setLoading(false)
        }
    }

    const columns = [
        { key: 'orderNumber', label: t('salesOrders.cols.orderNo'), sortKey: 'orderNumber' },
        { key: 'client', label: t('salesOrders.cols.client'), sortKey: 'client.name', render: (row) => row.client?.name || '-' },
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
        ...(invoicePerms.canView
            ? [{
                key: 'paymentStatus',
                label: t('salesOrders.cols.payment'),
                render: (row) => {
                    const p = paymentFor(row)
                    return (
                        <div className="space-y-1">
                            <StatusBadge status={p.paymentStatus} />
                            {canSeePrices && Number(p.amountDue) > 0 && (
                                <div className={`text-xs ${p.overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {paymentMoney(p.amountDue, p.currency)}
                                    {Number(p.penaltyAmount) > 0 && (
                                        <span className="text-rose-500"> · {t('invoices.penaltyIncluded', { amount: paymentMoney(p.penaltyAmount, p.currency) })}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                },
            }]
            : []),
        { key: 'orderDate', label: t('salesOrders.cols.orderDate'), sortKey: 'orderDate', render: (row) => formatDate(row.orderDate) },
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
                title={t('salesOrders.title')}
                description={t('salesOrders.description')}
                action={
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <DataToolbar
                            entityLabel="sales-orders"
                            exportColumns={exportColumns}
                            rows={rows}
                            fetchRows={fetchAllOrders}
                            count={total}
                        />
                    </div>
                }
                primaryAction={canCreate && (
                        <button onClick={openCreate} className="min-h-11 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 lg:min-h-0">
                            {t('salesOrders.add')}
                        </button>
                    )}
            />

            <SearchFilters
                search={search}
                onSearchChange={setSearch}
                filters={[
                    {
                        key: 'client',
                        value: clientFilter,
                        onChange: (v) => setFilter('client', v),
                        placeholder: t('common.allClients'),
                        searchable: true,
                        options: clients.map((c) => ({ value: String(c.id), label: c.name })),
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
                    ...(invoicePerms.canView
                        ? [{
                            key: 'paymentStatus',
                            value: paymentStatusFilter,
                            onChange: (v) => setFilter('paymentStatus', v),
                            placeholder: t('salesOrders.allPaymentStatuses'),
                            options: PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })),
                        }]
                        : []),
                ]}
                sort={{ sortBy, sortDir, onSortChange: setSort, options: sortOptionsFromColumns(columns) }}
            />

            <DataTable
                tableId="sales-orders"
                columns={columns}
                rows={rows}
                total={total}
                loading={listLoading}
                filtersActive={filtersActive}
                emptyState={
                    <EmptyState
                        icon={ShoppingCart}
                        title={t('salesOrders.emptyTitle')}
                        description={t('salesOrders.emptyDesc')}
                        action={canCreate ? (
                            <button onClick={openCreate} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">
                                {t('salesOrders.add')}
                            </button>
                        ) : null}
                    />
                }
                onRowClick={(row) => navigate(`/sales-orders/${row.id}`)}
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

            <Modal
                isOpen={formModal.isOpen}
                title={editingId ? t('salesOrders.editTitle') : t('salesOrders.addTitle')}
                onClose={formModal.close}
            >
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    {formError && (
                        <div
                            ref={formErrorRef}
                            role="alert"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                            {formError.message}
                        </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormSelect
                            id="sales-order-client"
                            label={t('salesOrders.form.client')}
                            name="clientId"
                            value={form.clientId}
                            onChange={(e) => handleClientChange(e.target.value)}
                            required
                            searchable
                            placeholder={t('salesOrders.form.selectClient')}
                            options={clients.map((item) => ({ value: String(item.id), label: item.name }))}
                            onQuickCreate={(name) => openQuickCreate('client', name, (item) => {
                                setClients((prev) => [...prev, item.raw])
                                handleClientChange(item.value)
                            })}
                        />

                        <FormSelect
                            id="sales-order-warehouse"
                            label={t('salesOrders.form.warehouse')}
                            name="warehouseId"
                            value={form.warehouseId}
                            onChange={handleChange}
                            required
                            placeholder={t('salesOrders.form.selectWarehouse')}
                            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                        />

                        <FormField
                            id="sales-order-number"
                            label={t('salesOrders.form.orderNumber')}
                            name="orderNumber"
                            value={form.orderNumber}
                            onChange={handleChange}
                            placeholder={t('salesOrders.form.orderNumber')}
                        />

                        <FormSelect
                            id="sales-order-status"
                            label={t('common.status')}
                            name="status"
                            value={form.status}
                            onChange={handleChange}
                            placeholder={t('salesOrders.form.selectStatus')}
                            options={[
                                { value: 'NEW', label: t('statuses.NEW') },
                                { value: 'IN_PROGRESS', label: t('statuses.IN_PROGRESS') },
                                { value: 'CONFIRMED', label: t('statuses.CONFIRMED') },
                                { value: 'SHIPPED', label: t('statuses.SHIPPED') },
                                { value: 'CLOSED', label: t('statuses.CLOSED') },
                                { value: 'CANCELLED', label: t('statuses.CANCELLED') },
                            ]}
                        />

                        {/* Two dates that are read together and are short enough to sit together, rather than
                            two full-width rows of a phone. `md:contents` dissolves this wrapper once the
                            form is two columns wide, so the desktop layout is exactly what it was. */}
                        <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 md:contents">
                            <FormField
                                id="sales-order-date"
                                label={t('salesOrders.form.orderDate')}
                                type="date"
                                name="orderDate"
                                value={form.orderDate}
                                onChange={handleChange}
                            />

                            <FormField
                                id="sales-order-closing-date"
                                label={t('salesOrders.form.closingDate')}
                                type="date"
                                name="closingDate"
                                value={form.closingDate}
                                onChange={handleChange}
                            />
                        </div>

                        <FormField
                            id="sales-order-delivery-price"
                            label={`${t('salesOrders.form.deliveryPrice')} (${currencySymbol(form.currency || baseCurrency)})`}
                            type="number"
                            step="0.01"
                            name="deliveryPrice"
                            value={form.deliveryPrice}
                            onChange={handleChange}
                            placeholder={t('salesOrders.form.deliveryPrice')}
                        />

                        <CurrencyRateField
                            value={{ currency: form.currency, exchangeRate: form.exchangeRate, source: form.rateSource, asOfDate: form.rateAsOfDate }}
                            onChange={(next) => setForm((prev) => ({ ...prev, currency: next.currency, exchangeRate: next.exchangeRate, rateSource: next.source, rateAsOfDate: next.asOfDate }))}
                            baseCurrency={baseCurrency}
                            currencies={currencies}
                        />

                        {canUseTenders && (
                            <FormSelect
                                id="sales-order-tender"
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
                            id="sales-order-delivery-address"
                            label={t('salesOrders.form.deliveryAddress')}
                            name="deliveryAddress"
                            value={form.deliveryAddress}
                            onChange={handleChange}
                            placeholder={t('salesOrders.form.deliveryAddress')}
                        />
                    </div>

                    <TextareaField
                        id="sales-order-notes"
                        label={t('salesOrders.form.additionalInfo')}
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        placeholder={t('salesOrders.form.additionalInfoPlaceholder')}
                        rows={3}
                    />

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{t('salesOrders.form.orderItems')}</h3>
                            <button
                                type="button"
                                onClick={addItem}
                                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white dark:bg-slate-700"
                            >
                                {t('salesOrders.form.addItem')}
                            </button>
                        </div>

                        {form.items.map((item, index) => {
                            const net = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0) * (1 - (Number(item.discountPercent) || 0) / 100)
                            // Availability of this product in the chosen warehouse (sales draws stock down).
                            const available = availableFor(item.productId)
                            const showAvailability = !!form.warehouseId && !!item.productId
                            const overStock = showAvailability && (Number(item.quantity) || 0) > available
                            return (
                                <div key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                                    <div className="flex items-end gap-3">
                                            {/* One picker for both catalogues rather than a kind toggle:
                                                the user searches for what they are selling and picks it,
                                                without first having to say which sort of thing it is.
                                                `flex-1` sits on the field itself rather than a wrapper
                                                around it: the wrapper ran taller than the control inside
                                                it, so `items-end` lined the delete button up with the
                                                wrapper's edge and left it sitting below the select. */}
                                            <FormSelect
                                                className="flex-1"
                                                id={`sales-order-item-product-${index}`}
                                                label={t('salesOrders.form.item')}
                                                name={`itemRef-${index}`}
                                                value={refValue(item)}
                                                onChange={(e) => handleItemRefChange(index, e.target.value)}
                                                required
                                                searchable
                                                placeholder={t('salesOrders.form.selectItem')}
                                                options={[
                                                    ...products.map((product) => ({
                                                        value: `p-${product.id}`,
                                                        label: product.sku ? `${product.name} · ${product.sku}` : product.name,
                                                        search: product.sku,
                                                    })),
                                                    ...services.map((service) => ({
                                                        value: `s-${service.id}`,
                                                        label: `${service.name} · ${t('salesOrders.form.serviceTag')}`,
                                                        search: service.code,
                                                    })),
                                                ]}
                                                // Services only. A product invented here would be created
                                                // with no stock, and the overselling guard below then
                                                // refuses the very line it was made for — so the offer led
                                                // to a dead end. Products are stocked before they are sold:
                                                // they get created on the products page, or on the purchase
                                                // order that brings them in. A service has no stock to run
                                                // out of, so it stays.
                                                quickCreateActions={[
                                                    {
                                                        key: 'service',
                                                        label: t('quickCreate.service'),
                                                        onSelect: (name) => openQuickCreate('service', name, (created) => {
                                                            setServices((prev) => [...prev, created.raw])
                                                            handleItemRefChange(index, `s-${created.value}`, created.raw)
                                                        }),
                                                    },
                                                ]}
                                            />
                                        {/* Absent rather than disabled on the only line: an order must
                                            have something on it, so there is no action to offer here. */}
                                        {form.items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            aria-label={t('common.remove')}
                                            title={t('common.remove')}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                        )}
                                    </div>

                                    {showAvailability && (
                                        <p className={`text-xs ${overStock ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                            {available === 0
                                                ? t('salesOrders.form.notStockedHere')
                                                : overStock
                                                    ? t('salesOrders.form.overStock', { count: available })
                                                    : t('salesOrders.form.inStockHere', { count: available })}
                                        </p>
                                    )}

                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                        <FormField
                                            id={`sales-order-item-quantity-${index}`}
                                            label={t('common.quantity')}
                                            type="number"
                                            min={1}
                                            required
                                            name={`quantity-${index}`}
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                            placeholder={t('common.qty')}
                                        />
                                        <FormField
                                            id={`sales-order-item-unit-price-${index}`}
                                            label={`${t('orderDetail.cols.unitPrice')} (${currencySymbol(form.currency || baseCurrency)})`}
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            name={`unitPrice-${index}`}
                                            value={item.unitPrice}
                                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                                            placeholder={t('orderDetail.cols.unitPrice')}
                                        />
                                        <FormField
                                            id={`sales-order-item-discount-${index}`}
                                            label={t('salesOrders.form.discountPercent')}
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            max={100}
                                            name={`discountPercent-${index}`}
                                            value={item.discountPercent}
                                            onChange={(e) => handleItemChange(index, 'discountPercent', e.target.value)}
                                            placeholder="0"
                                        />
                                        <FormSelect
                                            id={`sales-order-item-tax-${index}`}
                                            label={t('salesOrders.form.tax')}
                                            name={`taxRatePercent-${index}`}
                                            value={item.taxRatePercent}
                                            onChange={(e) => handleItemChange(index, 'taxRatePercent', e.target.value)}
                                            placeholder={t('salesOrders.form.noTax')}
                                            options={taxOptions}
                                        />
                                    </div>

                                    {canSeePrices && (
                                        <div className="text-right text-sm text-slate-500 dark:text-slate-400">
                                            {t('salesOrders.form.lineNet')}: <span className="font-medium text-slate-700 dark:text-slate-200">{formatMoney(net, form.currency || baseCurrency)}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {canSeePrices && (
                        <div className="ml-auto w-full max-w-xs space-y-1.5 rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
                            <TotalRow label={t('salesOrders.form.subtotalExclTax')} value={formatMoney(totals.subtotal, form.currency || baseCurrency)} />
                            <TotalRow label={t('salesOrders.form.taxTotal')} value={formatMoney(totals.tax, form.currency || baseCurrency)} />
                            <TotalRow label={t('salesOrders.form.deliveryPrice')} value={formatMoney(totals.delivery, form.currency || baseCurrency)} />
                            <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                            <TotalRow label={t('salesOrders.form.totalExclTax')} value={formatMoney(totals.totalExcl, form.currency || baseCurrency)} />
                            <TotalRow label={t('salesOrders.form.totalInclTax')} value={formatMoney(totals.totalIncl, form.currency || baseCurrency)} strong />
                            {form.currency && form.currency !== baseCurrency && toCompanyAmount(totals.totalIncl, form.exchangeRate) != null && (
                                <p className="pt-1 text-right text-xs text-slate-400 dark:text-slate-500">
                                    {t('currency.approxIn', { amount: formatMoney(toCompanyAmount(totals.totalIncl, form.exchangeRate), baseCurrency) })}
                                </p>
                            )}
                        </div>
                    )}

                    <ModalActions>
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
                            {loading ? t('common.saving') : editingId ? t('common.saveChanges') : t('salesOrders.createBtn')}
                        </button>
                    </ModalActions>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('salesOrders.deleteTitle')}
                message={t('salesOrders.deleteConfirm', { name: deletingItem?.orderNumber || '' })}
                onClose={deleteModal.close}
                onConfirm={handleDelete}
                loading={loading}
            />

            <ConfirmModal
                isOpen={bulkDeleteModal.isOpen}
                title={t('salesOrders.bulkDeleteTitle')}
                message={t('salesOrders.bulkDeleteConfirm', { count: selectedIds.length })}
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

            {/* One at a time, keyed on the remaining queue length so each advance remounts the modal
                (and its own reset effect) with the next entry's prefill instead of reusing stale state. */}
            {activeReminder && (
                <ComposeEmailModal
                    key={reminderQueue.length}
                    isOpen
                    recipientType="CLIENT"
                    recipientIds={[reminderClientId]}
                    title={t('salesOrders.reminderPrompt.title', { service: activeReminder.serviceName })}
                    initialSubject={serviceReminderTemplate(i18n.language, activeReminder.serviceName).subject}
                    initialBody={serviceReminderTemplate(i18n.language, activeReminder.serviceName).body}
                    initialScheduledDate={activeReminder.suggestedDate}
                    initialServiceId={activeReminder.serviceId}
                    onClose={advanceReminders}
                    onSent={advanceReminders}
                />
            )}
        </div>
    )
}

function TotalRow({ label, value, strong = false }) {
    return (
        <div className={`flex items-center justify-between ${strong ? 'text-base font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    )
}