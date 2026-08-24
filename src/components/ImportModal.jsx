import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { useToast } from '../context/ToastContext'
import { apiPost } from '../api/client'
import { buildCsv, downloadCsv } from '../utils/csv'
import { buildHeaderResolver, parseFileToObjects, remapToCanonical } from '../utils/spreadsheet'
import { Download, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

// Maps the entity slug pages pass to a translated noun for messages.
const ENTITY_NAV_KEY = {
    products: 'products',
    services: 'services',
    manufacturers: 'manufacturers',
    categories: 'categories',
    clients: 'clients',
    'sales-orders': 'salesOrders',
    'purchase-orders': 'purchaseOrders',
    tenders: 'tenders',
}

/**
 * Reusable CSV / Excel import modal. The page supplies:
 *  - `fields`: the entity's field schema (`[{ key, labelKey, required?, example?, importable? }]`).
 *    Headers are matched against each field's label in every app language, so a file written in any
 *    language imports regardless of the current UI language. Records passed on are keyed by `key`.
 *  - `parseRow(record, context)`: maps one canonical-keyed record to `{ payload }` or `{ error }`.
 *  - `prepare(records, { create })` (optional, async): resolves referenced relations and returns the
 *    `context` handed to parseRow. Called **twice**: with `create: false` for the preview, where it must
 *    not write anything (the user may still cancel), and again with `create: true` on confirm, after
 *    which every payload is rebuilt so newly created relations resolve to real ids.
 *  - `endpoint`: where each valid payload is POSTed.
 * Rows are created one at a time so a single failure never aborts the whole batch.
 */
export default function ImportModal({
    isOpen,
    onClose,
    entityLabel,
    endpoint,
    fields,
    parseRow,
    prepare,
    onImported,
}) {
    const { t, i18n } = useTranslation()
    const entity = ENTITY_NAV_KEY[entityLabel] ? t(`nav.${ENTITY_NAV_KEY[entityLabel]}`) : entityLabel
    const toast = useToast()
    const fileInputRef = useRef(null)
    const [stage, setStage] = useState('select') // select | preview | importing | done
    const [busy, setBusy] = useState(false) // reading/preparing the selected file
    const [fileName, setFileName] = useState('')
    const [parseError, setParseError] = useState('')
    const [parsed, setParsed] = useState([]) // { rowNumber, record, payload, error }
    const [rawRecords, setRawRecords] = useState([]) // kept so payloads can be rebuilt at import time
    const [dragOver, setDragOver] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const [result, setResult] = useState(null) // { created, failed: [{ rowNumber, message }] }

    // Importable columns, localised to the current language for the template + preview headers.
    const importFields = useMemo(() => fields.filter((f) => f.importable !== false), [fields])
    const templateColumns = useMemo(
        () => importFields.map((f) => ({ key: f.key, header: t(f.labelKey), required: f.required, example: f.example })),
        [importFields, t],
    )
    const resolveHeader = useMemo(() => buildHeaderResolver(importFields, i18n), [importFields, i18n])

    // The parent mounts this component only while open, so component state starts fresh on
    // every open and no reset effect is needed.
    const title = t('importModal.title', { entity })
    const validRows = parsed.filter((p) => !p.error)
    const errorRows = parsed.filter((p) => p.error)

    const handleFile = async (file) => {
        if (!file) return
        setFileName(file.name)
        setParseError('')
        setBusy(true)

        let raw
        try {
            raw = await parseFileToObjects(file)
        } catch {
            setParseError(t('importModal.fileError'))
            setParsed([])
            setBusy(false)
            setStage('preview')
            return
        }

        if (raw.records.length === 0) {
            setParseError(t('importModal.noRows'))
            setParsed([])
            setBusy(false)
            setStage('preview')
            return
        }

        const { records, presentKeys } = remapToCanonical(raw.headers, raw.records, resolveHeader)

        const missing = importFields
            .filter((c) => c.required && !presentKeys.has(c.key))
            .map((c) => t(c.labelKey))
        if (missing.length > 0) {
            setParseError(t('importModal.missingColumns', { count: missing.length, columns: missing.join(', ') }))
            setParsed([])
            setBusy(false)
            setStage('preview')
            return
        }

        // Resolve referenced relations (e.g. categories) so the preview reflects what will be imported.
        // `create: false` keeps this read-only: previewing a file must not change the user's data, since
        // they may still cancel. Anything missing is resolved to a placeholder here and created for real
        // in handleImport once they confirm.
        setRawRecords(records)
        let context = {}
        try {
            if (prepare) context = (await prepare(records, { create: false })) || {}
        } catch {
            // A failed prepare step shouldn't abort: rows referencing unresolved relations will
            // simply surface their own row-level error below.
        }

        const mapped = records.map((record, i) => {
            let outcome
            try {
                outcome = parseRow(record, context) || {}
            } catch (err) {
                outcome = { error: err.message || t('importModal.invalidRow') }
            }
            // rowNumber is 1-based and accounts for the header line, matching the spreadsheet row.
            return { rowNumber: i + 2, record, payload: outcome.payload, error: outcome.error }
        })
        setParsed(mapped)
        setBusy(false)
        setStage('preview')
    }

    const handleImport = async () => {
        setStage('importing')

        // Now that the user has committed, create any referenced relations for real and rebuild the
        // payloads against the result — the preview resolved them to placeholders with no id.
        let rows = validRows
        if (prepare) {
            try {
                const context = (await prepare(rawRecords, { create: true })) || {}
                rows = validRows.map((row) => {
                    let outcome
                    try {
                        outcome = parseRow(row.record, context) || {}
                    } catch (err) {
                        outcome = { error: err.message || t('importModal.invalidRow') }
                    }
                    return { ...row, payload: outcome.payload, error: outcome.error }
                })
            } catch {
                // Creating relations failed; fall through with the preview's rows so each one reports
                // its own server-side error rather than the whole import dying silently.
            }
        }

        setProgress({ done: 0, total: rows.length })
        const failed = []
        let created = 0

        for (let i = 0; i < rows.length; i++) {
            if (rows[i].error || !rows[i].payload) {
                failed.push({ rowNumber: rows[i].rowNumber, message: rows[i].error || t('importModal.failed') })
                setProgress({ done: i + 1, total: rows.length })
                continue
            }
            try {
                await apiPost(endpoint, rows[i].payload, { suppressErrorToast: true })
                created++
            } catch (err) {
                failed.push({ rowNumber: rows[i].rowNumber, message: err.message || t('importModal.failed') })
            }
            setProgress({ done: i + 1, total: rows.length })
        }

        setResult({ created, failed })
        setStage('done')
        if (created > 0) {
            toast.success(t('importModal.importedToast', { count: created, entity }))
            await onImported?.()
        }
    }

    const downloadTemplate = () => {
        const columns = templateColumns.map((c) => ({ header: c.header, value: (r) => r[c.header] ?? '' }))
        const exampleRow = Object.fromEntries(templateColumns.map((c) => [c.header, c.example ?? '']))
        const hasExamples = templateColumns.some((c) => c.example != null && c.example !== '')
        downloadCsv(`${entityLabel}-template.csv`, buildCsv(columns, hasExamples ? [exampleRow] : []))
    }

    const pickFile = () => fileInputRef.current?.click()

    return (
        <Modal isOpen={isOpen} title={title} onClose={onClose} width="max-w-3xl">
            {stage === 'select' && (
                <div className="space-y-5">
                    <div
                        onClick={pickFile}
                        onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(true)
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                            handleFile(e.dataTransfer.files?.[0])
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                            dragOver
                                ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
                                : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                        }`}
                    >
                        <UploadCloud className="h-10 w-10 text-teal-600 dark:text-teal-400" />
                        <div>
                            <p className="font-medium text-slate-700 dark:text-slate-200">
                                {t('importModal.dropHere')}
                            </p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {t('importModal.eachRow', { entity })}
                            </p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            className="hidden"
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-medium text-slate-700 dark:text-slate-200">
                                    {t('importModal.notSure')}
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('importModal.downloadTemplate')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={downloadTemplate}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <Download className="h-4 w-4" /> {t('importModal.template')}
                            </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {templateColumns.map((c) => (
                                <span
                                    key={c.key}
                                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    {c.header}
                                    {c.required && <span className="text-rose-500">*</span>}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {stage === 'preview' && busy && (
                <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" /> {t('importModal.reading')}
                </div>
            )}

            {stage === 'preview' && !busy && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <FileText className="h-4 w-4" /> {fileName}
                    </div>

                    {parseError ? (
                        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{parseError}</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-3 text-sm">
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <CheckCircle2 className="h-4 w-4" /> {t('importModal.readyToImport', { count: validRows.length })}
                                </span>
                                {errorRows.length > 0 && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                        <AlertCircle className="h-4 w-4" /> {t('importModal.withErrors', { count: errorRows.length })}
                                    </span>
                                )}
                            </div>

                            <PreviewTable templateColumns={templateColumns} parsed={parsed} />
                        </>
                    )}

                    <div className="flex justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setStage('select')}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium dark:border-slate-700"
                        >
                            {t('importModal.chooseAnother')}
                        </button>
                        <button
                            type="button"
                            onClick={handleImport}
                            disabled={validRows.length === 0}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                            {t('importModal.importN', { count: validRows.length, entity })}
                        </button>
                    </div>
                </div>
            )}

            {stage === 'importing' && (
                <div className="space-y-4 py-6">
                    <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">
                        {t('importModal.importingProgress', { done: progress.done, total: progress.total })}
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                            className="h-full rounded-full bg-teal-600 transition-all"
                            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            )}

            {stage === 'done' && result && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-5 w-5" />
                        {result.failed.length > 0
                            ? t('importModal.createdWithFailed', { count: result.created, entity, failed: result.failed.length })
                            : t('importModal.createdDot', { count: result.created, entity })}
                    </div>

                    {result.failed.length > 0 && (
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800/70">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">{t('importModal.row')}</th>
                                        <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">{t('importModal.error')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.failed.map((f) => (
                                        <tr key={f.rowNumber} className="border-t border-slate-200 dark:border-slate-800">
                                            <td className="px-4 py-2 align-middle text-slate-500">{f.rowNumber}</td>
                                            <td className="px-4 py-2 align-middle text-rose-600 dark:text-rose-400">{f.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            {t('common.done')}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    )
}

const PREVIEW_LIMIT = 100

function PreviewTable({ templateColumns, parsed }) {
    const { t } = useTranslation()
    const shown = parsed.slice(0, PREVIEW_LIMIT)
    return (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
                        {templateColumns.map((c) => (
                            <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                                {c.header}
                            </th>
                        ))}
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">{t('importModal.statusColumn')}</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((p) => (
                        <tr
                            key={p.rowNumber}
                            className={`border-t border-slate-200 dark:border-slate-800 ${
                                p.error ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''
                            }`}
                        >
                            <td className="px-3 py-2 align-middle text-slate-400">{p.rowNumber}</td>
                            {templateColumns.map((c) => (
                                <td key={c.key} className="whitespace-nowrap px-3 py-2 align-middle text-slate-700 dark:text-slate-200">
                                    {p.record[c.key] || <span className="text-slate-300">—</span>}
                                </td>
                            ))}
                            <td className="whitespace-nowrap px-3 py-2 align-middle">
                                {p.error ? (
                                    <span className="text-rose-600 dark:text-rose-400">{p.error}</span>
                                ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400">{t('importModal.ready')}</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {parsed.length > PREVIEW_LIMIT && (
                <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {t('importModal.previewNote', { limit: PREVIEW_LIMIT, total: parsed.length })}
                </p>
            )}
        </div>
    )
}
