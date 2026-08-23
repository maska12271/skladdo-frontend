import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Download } from 'lucide-react'
import { apiGet } from '../api/client'
import { safeArray } from '../utils/format'
import { downloadWorkbook } from '../utils/spreadsheet'
import { useToast } from '../context/ToastContext'

/**
 * Which entities the company-wide export includes, and which columns of each.
 *
 * The columns are listed explicitly rather than dumped from the API response: an export is a copy of the
 * company's data leaving the app, so what it contains should be a deliberate choice (the users sheet in
 * particular must never carry auth fields).
 */
const EXPORT_SHEETS = [
    {
        key: 'clients', path: '/clients?size=1000', labelKey: 'nav.clients',
        columns: ['name', 'registrationCode', 'email', 'phone', 'address', 'country', 'contactPerson'],
    },
    {
        key: 'manufacturers', path: '/manufacturers?size=1000', labelKey: 'nav.manufacturers',
        columns: ['name', 'registrationCode', 'email', 'phone', 'address', 'country', 'contactPerson'],
    },
    {
        key: 'products', path: '/products?size=1000', labelKey: 'nav.products',
        columns: ['name', 'sku', 'unit', 'price', 'currency', 'stockQuantity', 'minimumStock', 'reorderQuantity'],
    },
    {
        key: 'salesOrders', path: '/sales-orders?size=1000', labelKey: 'nav.salesOrders',
        columns: ['orderNumber', 'status', 'orderDate', 'currency', 'totalAmount'],
    },
    {
        key: 'purchaseOrders', path: '/purchase-orders?size=1000', labelKey: 'nav.purchaseOrders',
        columns: ['orderNumber', 'status', 'orderDate', 'currency', 'totalAmount'],
    },
    {
        key: 'tenders', path: '/tenders?size=1000', labelKey: 'nav.tenders',
        columns: ['tenderNumber', 'title', 'status', 'publishedAt', 'deadline'],
    },
    {
        key: 'users', path: '/users', labelKey: 'nav.users',
        columns: ['email', 'fullName', 'role', 'active', 'archived'],
    },
]

/** "Your data" card: downloads a copy of the company's records as one multi-sheet workbook. */
export default function CompanyDataExport() {
    const { t } = useTranslation()
    const toast = useToast()
    const [exporting, setExporting] = useState(false)

    const exportEverything = async () => {
        setExporting(true)
        try {
            const sheets = []
            for (const sheet of EXPORT_SHEETS) {
                const res = await apiGet(sheet.path)
                // List endpoints are a mix of paged and plain — both end up as an array here.
                const rows = Array.isArray(res) ? res : safeArray(res)
                sheets.push({
                    name: t(sheet.labelKey),
                    columns: sheet.columns.map((field) => ({ header: field, field })),
                    rows,
                })
            }
            await downloadWorkbook(`skladdo-export-${new Date().toISOString().slice(0, 10)}`, sheets)
            toast.success(t('settings.company.exportDone'))
        } catch {
            toast.error(t('settings.company.exportFailed'))
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div>
                <h2 className="text-base font-semibold">{t('settings.company.dataHeading')}</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('settings.company.dataDescription')}</p>
            </div>
            <button
                type="button"
                onClick={exportEverything}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exporting ? t('settings.company.exporting') : t('settings.company.exportAll')}
            </button>
        </div>
    )
}
