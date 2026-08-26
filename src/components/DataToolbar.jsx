import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Download, Upload, ChevronDown, FileText, FileSpreadsheet } from 'lucide-react'
import { downloadTable, exportColumnsFromFields } from '../utils/spreadsheet'
import { useAnchoredMenu } from '../hooks/useAnchoredMenu'
import { useInActionSheet } from '../context/ActionSheetContext'
import ImportModal from './ImportModal'

/**
 * Header toolbar with Export (always, as CSV or Excel) and Import (when `importConfig.canImport`).
 *
 * Columns come from a `fields` schema — one per entity — from which export columns are derived with
 * headers localised to the current language; the same schema drives the multilingual import matcher.
 * Legacy callers may instead pass a fixed `exportColumns` list ([{ header, value }]); those export
 * only (no import) with English headers.
 *
 * Export writes the rows it is given — pass the page's already-filtered rows so the export mirrors
 * the current search/filter view. For server-paginated pages, also pass `fetchRows` (an async fn
 * returning every matching row) so the export isn't limited to the current page, and `count` (the
 * grand total) for the button's enabled/label state.
 */
export default function DataToolbar({ entityLabel, fields, exportColumns, rows, fetchRows, count, importConfig, onImported }) {
    const { t } = useTranslation()
    const [importOpen, setImportOpen] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const [exporting, setExporting] = useState(false)
    const inSheet = useInActionSheet()
    const canImport = Boolean(importConfig?.canImport)
    const exportCount = count ?? rows.length

    // Measured against the viewport rather than hung off the button. Below `lg` this whole toolbar moves
    // into the page header's "More actions" sheet, where the export button is only about 130px wide and
    // two thirds of the way across a phone — a right-aligned panel under it started at a negative x, with
    // "Export as CSV"/"Export as Excel" clipped by the edge of the screen.
    const closeMenu = useCallback(() => setMenuOpen(false), [])
    const { triggerRef, menuRef, style } = useAnchoredMenu({ open: menuOpen, onClose: closeMenu, maxWidth: 176 })

    const handleExport = async (format) => {
        setMenuOpen(false)
        const columns = fields ? exportColumnsFromFields(fields, t) : exportColumns
        const date = new Date().toISOString().slice(0, 10)
        let data = rows
        if (fetchRows) {
            setExporting(true)
            try {
                data = await fetchRows()
            } catch {
                // The api client surfaces its own error toast; just abort the export.
                setExporting(false)
                return
            }
            setExporting(false)
        }
        await downloadTable(`${entityLabel}-${date}`, columns, data, format)
    }

    return (
        <>
            {/* In the sheet the two formats are rows of their own. A dropdown opening off a full-width
                row would cover the rows under it, and it would be the one thing in there that does not
                simply do what it says. */}
            {inSheet ? (
                <>
                    <button type="button" onClick={() => handleExport('csv')} disabled={exportCount === 0 || exporting}>
                        <FileText /> {t('toolbar.exportCsv')}
                    </button>
                    <button type="button" onClick={() => handleExport('xlsx')} disabled={exportCount === 0 || exporting}>
                        <FileSpreadsheet /> {t('toolbar.exportExcel')}
                    </button>
                </>
            ) : (
            <div className="relative">
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    disabled={exportCount === 0 || exporting}
                    title={exportCount === 0 ? t('toolbar.nothingToExport') : t('toolbar.exportTitle', { count: exportCount })}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <Download className="h-4 w-4" /> {t('toolbar.export')}
                    <ChevronDown className="h-4 w-4 opacity-60" />
                </button>
                {menuOpen && style &&
                    createPortal(
                        <div
                            ref={menuRef}
                            style={style}
                            className="z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                        >
                            <button
                                type="button"
                                onClick={() => handleExport('csv')}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <FileText className="h-4 w-4 text-slate-400" /> {t('toolbar.exportCsv')}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExport('xlsx')}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> {t('toolbar.exportExcel')}
                            </button>
                        </div>,
                        document.body,
                    )}
            </div>
            )}

            {canImport && (
                <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <Upload className="h-4 w-4" /> {t('toolbar.import')}
                </button>
            )}

            {canImport && importOpen && (
                <ImportModal
                    isOpen
                    onClose={() => setImportOpen(false)}
                    entityLabel={entityLabel}
                    endpoint={importConfig.endpoint}
                    fields={importConfig.fields ?? fields}
                    parseRow={importConfig.parseRow}
                    prepare={importConfig.prepare}
                    onImported={onImported}
                />
            )}
        </>
    )
}
