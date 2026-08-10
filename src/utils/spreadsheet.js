// Spreadsheet import/export helpers shared by the data toolbar and import modal. CSV stays
// dependency-free (see ./csv); Excel (.xlsx) support is loaded on demand via ExcelJS so the heavy
// library is only fetched when a user actually reads or writes a spreadsheet.
//
// The header helpers make import language-agnostic: a field's column can be written in English,
// Estonian or Russian (the app's languages) and still be recognised, regardless of the current UI
// language. Export, in turn, writes headers in the active language.

import { buildCsv, downloadCsv, parseCsvToObjects } from './csv'
import { triggerDownload } from './download'

// Languages whose header labels are recognised on import.
const HEADER_LANGUAGES = ['en', 'et', 'ru']

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Trim, lowercase and collapse whitespace so headers match across casing/spacing differences. */
function normalizeHeader(text) {
    return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Build a resolver mapping an incoming header cell to a field's canonical `key`. A header matches if
 * it equals the field's label in any supported language, any of its extra `aliasKeys` (also resolved
 * per language), any literal `aliases`, or the canonical key itself.
 * @param {Array} fields entity field descriptors ({ key, labelKey, aliasKeys?, aliases? })
 * @param {object} i18n the react-i18next instance (needs getFixedT)
 * @returns {(header: string) => string | null}
 */
export function buildHeaderResolver(fields, i18n) {
    const tByLang = HEADER_LANGUAGES.map((lng) => i18n.getFixedT(lng))
    const aliasToKey = new Map()
    const add = (alias, key) => {
        const norm = normalizeHeader(alias)
        // First writer wins: keeps a field's own labels ahead of any incidental collisions.
        if (norm && !aliasToKey.has(norm)) aliasToKey.set(norm, key)
    }
    for (const f of fields) {
        add(f.key, f.key)
        for (const t of tByLang) {
            if (f.labelKey) add(t(f.labelKey), f.key)
            for (const ak of f.aliasKeys || []) add(t(ak), f.key)
        }
        for (const a of f.aliases || []) add(a, f.key)
    }
    return (header) => aliasToKey.get(normalizeHeader(header)) ?? null
}

/** Flatten an ExcelJS cell value (string, number, date, formula, hyperlink, rich text) to text. */
function cellText(value) {
    if (value == null) return ''
    if (typeof value === 'object') {
        if (value instanceof Date) return value.toISOString().slice(0, 10)
        if (Array.isArray(value.richText)) return value.richText.map((rt) => rt.text).join('')
        if ('text' in value) return String(value.text) // hyperlink cell { text, hyperlink }
        if ('result' in value) return value.result == null ? '' : String(value.result) // formula
        if ('error' in value) return ''
        return ''
    }
    return String(value)
}

function isExcelFile(file) {
    return /\.(xlsx|xlsm|xls)$/i.test(file.name) || /spreadsheetml|ms-excel/.test(file.type || '')
}

/** Read an Excel file's first worksheet into { headers, records } keyed by raw header text. */
async function parseExcelToObjects(file) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws || ws.rowCount < 1) return { headers: [], records: [] }

    const headers = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col - 1] = cellText(cell.value).trim()
    })

    const records = []
    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const record = {}
        let hasValue = false
        headers.forEach((header, i) => {
            if (!header) return
            const v = cellText(row.getCell(i + 1).value).trim()
            if (v !== '') hasValue = true
            record[header] = v
        })
        if (hasValue) records.push(record) // drop fully empty rows, matching the CSV parser
    }
    return { headers: headers.filter(Boolean), records }
}

/** Parse a CSV or Excel file into { headers, records } (records keyed by raw header text). */
export async function parseFileToObjects(file) {
    if (isExcelFile(file)) return parseExcelToObjects(file)
    return parseCsvToObjects(await file.text())
}

/**
 * Re-key raw-header records to canonical field keys using a header resolver.
 * @returns {{ records: object[], presentKeys: Set<string> }}
 */
export function remapToCanonical(rawHeaders, rawRecords, resolveHeader) {
    const headerToKey = new Map()
    const presentKeys = new Set()
    for (const header of rawHeaders) {
        const key = resolveHeader(header)
        if (key) {
            headerToKey.set(header, key)
            presentKeys.add(key)
        }
    }
    const records = rawRecords.map((raw) => {
        const record = {}
        for (const [header, key] of headerToKey) record[key] = raw[header] ?? ''
        return record
    })
    return { records, presentKeys }
}

/** Export column list ([{ header, value }]) built from a field schema, localised to the active `t`. */
export function exportColumnsFromFields(fields, t) {
    return fields
        .filter((f) => f.exportable !== false)
        .map((f) => ({ header: t(f.labelKey), value: f.value ? f.value : (row) => row[f.key] ?? '' }))
}

function cellValue(col, row) {
    const v = col.value ? col.value(row) : row[col.field]
    return v == null ? '' : v
}

async function downloadXlsx(baseName, columns, rows) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Export')
    ws.columns = columns.map((c) => ({
        header: c.header,
        width: Math.min(Math.max(String(c.header).length + 2, 12), 40),
    }))
    ws.getRow(1).font = { bold: true }
    for (const row of rows) ws.addRow(columns.map((c) => cellValue(c, row)))
    const buffer = await wb.xlsx.writeBuffer()
    triggerDownload(new Blob([buffer], { type: XLSX_MIME }), `${baseName}.xlsx`)
}

/**
 * Download several tables as one workbook, a sheet per entry. Used by the company-wide data export;
 * `downloadTable` remains the single-table path used by every list page's toolbar.
 *
 * @param {string} baseName file name without extension
 * @param {{name: string, columns: {header: string, value?: (row) => unknown, field?: string}[], rows: object[]}[]} sheets
 */
export async function downloadWorkbook(baseName, sheets) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    for (const sheet of sheets) {
        // Excel rejects sheet names over 31 chars or containing []:*?/\
        const ws = wb.addWorksheet(String(sheet.name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31))
        ws.columns = sheet.columns.map((c) => ({
            header: c.header,
            width: Math.min(Math.max(String(c.header).length + 2, 12), 40),
        }))
        ws.getRow(1).font = { bold: true }
        for (const row of sheet.rows) ws.addRow(sheet.columns.map((c) => cellValue(c, row)))
    }
    const buffer = await wb.xlsx.writeBuffer()
    triggerDownload(new Blob([buffer], { type: XLSX_MIME }), `${baseName}.xlsx`)
}

/**
 * Download `rows` as `columns` in the chosen format.
 * @param {string} baseName file name without extension
 * @param {{header: string, value?: (row) => unknown, field?: string}[]} columns
 * @param {object[]} rows
 * @param {'csv'|'xlsx'} format
 */
export async function downloadTable(baseName, columns, rows, format) {
    if (format === 'xlsx') return downloadXlsx(baseName, columns, rows)
    downloadCsv(`${baseName}.csv`, buildCsv(columns, rows))
}
