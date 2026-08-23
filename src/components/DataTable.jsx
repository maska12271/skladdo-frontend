import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown, LayoutGrid, Rows3 } from 'lucide-react'
import { useBreakpoint } from '../hooks/useBreakpoint'
import Checkbox from './Checkbox'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// Per-table column-visibility preferences are persisted in localStorage (per browser) keyed by
// the table's `tableId`, so a user's choices survive reloads and navigation.
const COLUMN_PREF_PREFIX = 'tableColumns:'

// Table or cards, remembered per table. Cards are forced below `md` regardless — this is the choice a
// wider screen gets, where both shapes are legible and which one reads better depends on the data and on
// the person. Stored beside the column preferences, so a table remembers how you like to look at it.
const VIEW_PREF_PREFIX = 'tableView:'

function loadViewPref(tableId) {
    if (!tableId || typeof localStorage === 'undefined') return null
    try {
        const value = localStorage.getItem(VIEW_PREF_PREFIX + tableId)
        return value === 'cards' || value === 'table' ? value : null
    } catch {
        return null
    }
}

function loadHiddenColumns(tableId) {
    if (!tableId || typeof localStorage === 'undefined') return []
    try {
        const raw = localStorage.getItem(COLUMN_PREF_PREFIX + tableId)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

// A column shows in the picker unless it opts out (hideable: false) and as long as it has a
// human-readable name. Pass `name` for columns whose `label` is empty/JSX (e.g. the image column).
function pickerName(column) {
    if (column.hideable === false) return null
    if (column.name) return column.name
    return typeof column.label === 'string' && column.label ? column.label : null
}

function SelectAllCheckbox({ checked, indeterminate, disabled, onChange, label }) {
    const ref = useRef(null)

    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = indeterminate
        }
    }, [indeterminate])

    return (
        <Checkbox ref={ref} checked={checked} disabled={disabled} onChange={onChange} aria-label={label} className="block" />
    )
}

/** Builds a compact list of page numbers with ellipses, e.g. [1, '…', 4, 5, 6, '…', 12]. */
function getPageWindow(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1)
    }
    const pages = [1]
    const left = Math.max(2, current - 1)
    const right = Math.min(total - 1, current + 1)
    if (left > 2) pages.push('…')
    for (let i = left; i <= right; i++) pages.push(i)
    if (right < total - 1) pages.push('…')
    pages.push(total)
    return pages
}

/** A column carrying a readable heading, as opposed to an image or an action menu. */
const isFieldColumn = (column) => typeof column.label === 'string' && column.label !== ''

/**
 * Regroups the visible columns into the parts a card needs, reading the shape the list pages already
 * write rather than asking them to declare anything new: a labelled column is a field, the first of them
 * is the card's title, and an unlabelled one is an adornment — the thumbnail that sits before the title,
 * the action menu that sits after it.
 */
function splitForCards(columns) {
    const titleIndex = columns.findIndex(isFieldColumn)
    // A table of nothing but adornments has no title to promote; keep them in order and add no heading.
    if (titleIndex === -1) return { leading: columns, title: null, fields: [], trailing: [] }
    const rest = columns.slice(titleIndex + 1)
    return {
        leading: columns.slice(0, titleIndex),
        title: columns[titleIndex],
        fields: rest.filter(isFieldColumn),
        trailing: rest.filter((column) => !isFieldColumn(column)),
    }
}

// Fewer than this and there is nothing worth managing — every column already fits, and the picker is a
// control that only adds a decision. Warehouses, with three, was the case that prompted it.
const MIN_COLUMNS_FOR_PICKER = 5

// Cards pass a context so a column can render differently there. The table passes none, so every existing
// `render(row)` is unaffected.
const CARD_CONTEXT = { card: true }

const cellValue = (column, row, context) => (column.render ? column.render(row, context) : row[column.key])

/** Whether a cell produced anything worth giving space to on a card. */
const isEmptyCell = (value) => value === null || value === undefined || value === false || value === ''

export default function DataTable({
    columns,
    rows,
    selectable = false,
    selectedIds = [],
    onSelectionChange,
    getRowId = (row) => row.id,
    isRowSelectable = () => true,
    bulkActions = null,
    paginate = true,
    initialPageSize = 10,
    onRowClick = null,
    // Drops the outer card chrome (border/rounded/background) so the table can be embedded inside
    // another container that already provides it, e.g. a dashboard widget frame.
    bare = false,
    // When set, enables the persisted column-visibility picker, keyed by this id in localStorage.
    tableId = null,
    // Optional controlled pagination. When provided, these override the internal state so a
    // parent can persist the current page/size (e.g. in the URL) across navigation.
    page: controlledPage,
    pageSize: controlledPageSize,
    onPageChange,
    onPageSizeChange,
    // Server-side mode. When `total` is provided, `rows` are already just the current page — the table
    // paginates against `total` instead of slicing. `loading` swaps the body for skeleton rows.
    total: serverTotal,
    loading = false,
    // Rich empty state (a node, e.g. <EmptyState .../>) shown when there are genuinely no records and
    // no filters are active. `filtersActive` tells "you have nothing yet" apart from "no match".
    emptyState = null,
    filtersActive = false,
    // Sorting. Supply all three to make columns carrying a `sortKey` clickable; the parent owns the state
    // (useServerTable keeps it in the URL) so a sorted view survives reload and Back.
    sortBy,
    sortDir,
    onSortChange,
    // Set when the page has moved sorting into its filter sheet, so the card toolbar does not offer a
    // second control for the same state.
    hideCardSort = false,
    // Forces the card layout at every width. For a container too narrow for a table whatever the screen
    // size — a dashboard widget in a one-third column.
    alwaysCards = false,
}) {
    const { t } = useTranslation()
    const [internalPage, setInternalPage] = useState(1)
    const [internalPageSize, setInternalPageSize] = useState(initialPageSize)
    const [hiddenColumns, setHiddenColumns] = useState(() => loadHiddenColumns(tableId))

    const hideableColumns = columns
        .map((c) => ({ key: c.key, name: pickerName(c) }))
        .filter((c) => c.name)
    const visibleColumns = columns.filter((c) => !hiddenColumns.includes(c.key))

    const persistHidden = (next) => {
        setHiddenColumns(next)
        if (!tableId || typeof localStorage === 'undefined') return
        try {
            if (next.length === 0) localStorage.removeItem(COLUMN_PREF_PREFIX + tableId)
            else localStorage.setItem(COLUMN_PREF_PREFIX + tableId, JSON.stringify(next))
        } catch {
            /* ignore quota/serialization errors */
        }
    }

    const toggleColumn = (key) =>
        persistHidden(hiddenColumns.includes(key) ? hiddenColumns.filter((k) => k !== key) : [...hiddenColumns, key])
    const resetColumns = () => persistHidden([])

    const page = controlledPage ?? internalPage
    const pageSize = controlledPageSize ?? internalPageSize
    const setPage = (next) => (onPageChange ? onPageChange(next) : setInternalPage(next))
    const setPageSize = (next) => (onPageSizeChange ? onPageSizeChange(next) : setInternalPageSize(next))

    // Server mode: the parent already fetched just this page and tells us the grand total.
    const serverMode = serverTotal != null
    const total = serverMode ? serverTotal : rows.length
    const totalPages = paginate ? Math.max(1, Math.ceil(total / pageSize)) : 1

    // Keep the current page in range when the row set shrinks (filters, deletes). Skip while loading
    // so a deep-linked page isn't reset to 1 before the first server response arrives.
    useEffect(() => {
        if (!loading && page > totalPages) setPage(totalPages)
    }, [page, totalPages, loading])

    const safePage = Math.min(page, totalPages)
    const start = paginate ? (safePage - 1) * pageSize : 0
    // In server mode `rows` is already the current page; only client mode slices.
    const pageRows = paginate && !serverMode ? rows.slice(start, start + pageSize) : rows

    const selectionEnabled = selectable && typeof onSelectionChange === 'function'

    // "Select all" acts on the rows visible on the current page.
    const pageSelectableIds = selectionEnabled
        ? pageRows.filter(isRowSelectable).map(getRowId)
        : []
    const selectedSet = new Set(selectedIds)
    const pageSelectedCount = pageSelectableIds.filter((id) => selectedSet.has(id)).length
    const allSelected = pageSelectableIds.length > 0 && pageSelectedCount === pageSelectableIds.length
    const someSelected = pageSelectedCount > 0 && !allSelected

    const toggleRow = (id) => {
        const next = new Set(selectedIds)
        if (next.has(id)) {
            next.delete(id)
        } else {
            next.add(id)
        }
        onSelectionChange(Array.from(next))
    }

    const toggleAll = () => {
        const next = new Set(selectedIds)
        if (allSelected) {
            pageSelectableIds.forEach((id) => next.delete(id))
        } else {
            pageSelectableIds.forEach((id) => next.add(id))
        }
        onSelectionChange(Array.from(next))
    }

    // A row is clickable as a whole (e.g. navigate to a detail page), but cells often contain their
    // own interactive controls — action menus, status pickers, checkboxes, links. A click on any of
    // those must not also fire the row navigation, so we ignore clicks originating inside one.
    const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, label, [role="menu"], [role="menuitem"]'
    const handleRowClick = onRowClick
        ? (event, row) => {
            if (event.target.closest(INTERACTIVE_SELECTOR)) return
            onRowClick(row)
        }
        : undefined

    const sortingEnabled = typeof onSortChange === 'function'
    const totalColumns = visibleColumns.length + (selectionEnabled ? 1 : 0)
    const showBulkBar = selectionEnabled && selectedIds.length > 0
    const showColumnPicker = tableId && hideableColumns.length >= MIN_COLUMNS_FOR_PICKER

    // A phone cannot hold a business table: eight columns of it means a horizontal scroll for every row,
    // and reading one record turns into panning. Below `md` each row becomes a card instead. Everything
    // around the rows — selection, sorting, paging, the column picker — is the same state either way;
    // only the shape the rows are drawn in changes.
    const isMobile = useBreakpoint() === 'mobile'
    const [viewPref, setViewPref] = useState(() => loadViewPref(tableId))
    // A phone has no choice to offer; anywhere else the saved preference decides, defaulting to the table.
    const asCards = alwaysCards || isMobile || viewPref === 'cards'
    const showViewToggle = !isMobile && !alwaysCards && Boolean(tableId)

    const chooseView = (next) => {
        setViewPref(next)
        if (!tableId || typeof localStorage === 'undefined') return
        try {
            localStorage.setItem(VIEW_PREF_PREFIX + tableId, next)
        } catch {
            /* ignore quota errors — the choice just won't outlive the page */
        }
    }

    // Container queries, not viewport ones: `xl:grid-cols-3` put three columns inside a 340px dashboard
    // widget whenever the *window* was wide, giving one word per line and labels colliding with their
    // values. How many columns fit depends on how wide this list actually is.
    const cardGridClass = `@container grid content-start grid-cols-1 @[34rem]:grid-cols-2 @[60rem]:grid-cols-3 ${bare ? 'gap-1.5' : 'gap-2 p-3'}`

    const cardSplit = splitForCards(visibleColumns)
    // Cards have no column headers to click, so sorting needs a control of its own, and no header row to
    // hold "select all" either — both move into the toolbar.
    const sortableColumns = sortingEnabled ? visibleColumns.filter((c) => c.sortKey && isFieldColumn(c)) : []
    const showCardSort = asCards && sortableColumns.length > 0 && !hideCardSort
    const showCardSelectAll = asCards && selectionEnabled && total > 0
    const showToolbar = showColumnPicker || showCardSort || showCardSelectAll || showViewToggle
    const rangeStart = total === 0 ? 0 : start + 1
    const rangeEnd = Math.min(start + pageSize, total)

    // Genuinely empty (no records, no active filters, done loading): show the rich empty-state card
    // instead of an empty table with headers. Filtered-empty still shows the table + a "no results" row.
    if (emptyState && !filtersActive && !loading && total === 0) {
        return emptyState
    }

    return (
        <div className={bare ? '' : 'shadow-card overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}>
            {showBulkBar && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => onSelectionChange([])}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-teal-700 transition hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-900/50"
                            aria-label={t('table.clearSelection')}
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                            {t('table.selected', { count: selectedIds.length })}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">{bulkActions}</div>
                </div>
            )}

            {showToolbar && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                    {showCardSelectAll && (
                        <label className="mr-auto flex min-h-11 items-center gap-2 text-sm text-slate-500 lg:min-h-0 dark:text-slate-400">
                            <SelectAllCheckbox
                                checked={allSelected}
                                indeterminate={someSelected}
                                disabled={pageSelectableIds.length === 0}
                                onChange={toggleAll}
                                label={t('table.selectAll')}
                            />
                            {t('table.selectAll')}
                        </label>
                    )}
                    {showCardSort && (
                        <CardSortControl
                            columns={sortableColumns}
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSortChange={onSortChange}
                        />
                    )}
                    {showColumnPicker && (
                        <ColumnPicker
                            columns={hideableColumns}
                            hiddenColumns={hiddenColumns}
                            onToggle={toggleColumn}
                            onReset={resetColumns}
                        />
                    )}
                    {showViewToggle && (
                        <div role="group" aria-label={t('table.view')} className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                            {[['table', Rows3, t('table.viewTable')], ['cards', LayoutGrid, t('table.viewCards')]].map(([mode, Icon, label]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => chooseView(mode)}
                                    aria-pressed={asCards === (mode === 'cards')}
                                    aria-label={label}
                                    title={label}
                                    className={`inline-flex min-h-11 min-w-11 items-center justify-center px-3 transition lg:min-h-0 lg:min-w-0 lg:py-1.5 ${
                                        asCards === (mode === 'cards')
                                            ? 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300'
                                            : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {asCards ? (
                // One column on a phone; on a wider screen the cards become a gallery rather than a
                // single tall stack, which is the shape that makes this view worth choosing there.
                <div className={cardGridClass}>
                    {loading && pageRows.length === 0 ? (
                        <CardSkeleton count={Math.min(paginate ? pageSize : 4, 6)} />
                    ) : total === 0 ? (
                        <p className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                            {filtersActive ? t('table.noResults') : t('table.noData')}
                        </p>
                    ) : (
                        pageRows.map((row, index) => {
                            const rowId = getRowId(row)
                            const rowSelectable = selectionEnabled && isRowSelectable(row)
                            return (
                                <RowCard
                                    key={rowId ?? index}
                                    split={cardSplit}
                                    row={row}
                                    selectable={rowSelectable}
                                    selected={rowSelectable && selectedSet.has(rowId)}
                                    onToggleSelect={() => toggleRow(rowId)}
                                    onClick={handleRowClick ? (event) => handleRowClick(event, row) : undefined}
                                    selectRowLabel={t('table.selectRow')}
                                    dense={bare}
                                />
                            )
                        })
                    )}
                </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                        {selectionEnabled && (
                            <th className="w-12 px-4 py-3 text-left">
                                <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center lg:m-0 lg:h-auto lg:w-auto">
                                    <SelectAllCheckbox
                                        checked={allSelected}
                                        indeterminate={someSelected}
                                        disabled={pageSelectableIds.length === 0}
                                        onChange={toggleAll}
                                        label={t('table.selectAll')}
                                    />
                                </label>
                            </th>
                        )}
                        {visibleColumns.map((column) => {
                            // A column is sortable only if it opts in with `sortKey` — the name of a field
                            // the API can actually sort on. Computed cells (stock status, payment status,
                            // converted totals) have no such field and would 400, so they stay plain.
                            const sortable = sortingEnabled && column.sortKey
                            const active = sortable && sortBy === column.sortKey
                            return (
                                <th
                                    key={column.key}
                                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                                    className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300"
                                >
                                    {sortable ? (
                                        <button
                                            type="button"
                                            onClick={() => onSortChange(
                                                column.sortKey,
                                                active && sortDir === 'asc' ? 'desc' : 'asc',
                                            )}
                                            // The negative margin lets the button grow into the cell's
                                            // existing padding, so it becomes a 44px touch target on a
                                            // tablet without making the header row any taller.
                                            className="group -my-3 inline-flex items-center gap-1.5 py-3 font-semibold text-slate-600 transition hover:text-slate-900 lg:my-0 lg:py-0 dark:text-slate-300 dark:hover:text-white"
                                        >
                                            {column.label}
                                            <SortIcon active={active} dir={sortDir} />
                                        </button>
                                    ) : (
                                        column.label
                                    )}
                                </th>
                            )
                        })}
                    </tr>
                    </thead>
                    <tbody>
                    {loading && pageRows.length === 0 ? (
                        <TableSkeleton rows={Math.min(paginate ? pageSize : 6, 8)} columns={totalColumns} />
                    ) : total === 0 ? (
                        <tr>
                            <td colSpan={totalColumns} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                                {filtersActive ? t('table.noResults') : t('table.noData')}
                            </td>
                        </tr>
                    ) : (
                        pageRows.map((row, index) => {
                            const rowId = getRowId(row)
                            const rowSelectable = selectionEnabled && isRowSelectable(row)
                            const isSelected = rowSelectable && selectedSet.has(rowId)
                            return (
                                <tr
                                    key={rowId ?? index}
                                    onClick={handleRowClick ? (event) => handleRowClick(event, row) : undefined}
                                    className={`border-t border-slate-200 dark:border-slate-800 ${
                                        isSelected ? 'bg-teal-50/60 dark:bg-teal-950/20' : ''
                                    } ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
                                >
                                    {selectionEnabled && (
                                        <td className="w-12 px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                                            {rowSelectable && (
                                                <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center lg:m-0 lg:h-auto lg:w-auto">
                                                    <Checkbox checked={isSelected} onChange={() => toggleRow(rowId)} aria-label={t('table.selectRow')} className="block" />
                                                </label>
                                            )}
                                        </td>
                                    )}
                                    {visibleColumns.map((column) => (
                                        <td key={column.key} className="whitespace-nowrap px-4 py-3 align-middle text-slate-700 dark:text-slate-200">
                                            {column.render ? column.render(row) : row[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })
                    )}
                    </tbody>
                </table>
            </div>
            )}

            {paginate && total > 0 && (
                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        {t('table.showing')} <span className="font-semibold text-slate-700 dark:text-slate-200">{rangeStart}–{rangeEnd}</span>{' '}
                        {t('table.of')} <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            {t('table.rowsPerPage')}
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value))
                                    // Only reset the page ourselves in uncontrolled mode. A controlled
                                    // parent keeps this state in the URL, and two setSearchParams calls in
                                    // one tick both resolve against the params from the last render — the
                                    // second would recompute from stale params and drop the size change,
                                    // leaving the size silently unchanged. useServerTable already clears
                                    // the page as part of its own size update.
                                    if (!onPageSizeChange) setPage(1)
                                }}
                                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-teal-500 lg:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            >
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </label>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <PageButton onClick={() => setPage(1)} disabled={safePage === 1} ariaLabel={t('table.firstPage')}>
                                    <ChevronsLeft className="h-4 w-4" />
                                </PageButton>
                                <PageButton onClick={() => setPage(safePage - 1)} disabled={safePage === 1} ariaLabel={t('table.previousPage')}>
                                    <ChevronLeft className="h-4 w-4" />
                                </PageButton>

                                {/* Up to seven page buttons plus four arrows do not fit a phone, but the
                                    position still has to be legible — so it becomes a readout. */}
                                {isMobile ? (
                                    <span aria-current="page" className="px-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                                        {t('table.pageOf', { page: safePage, total: totalPages })}
                                    </span>
                                ) : getPageWindow(safePage, totalPages).map((p, i) =>
                                    p === '…' ? (
                                        <span key={`gap-${i}`} className="px-2 text-sm text-slate-400">…</span>
                                    ) : (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPage(p)}
                                            aria-current={p === safePage ? 'page' : undefined}
                                            className={`min-h-11 min-w-11 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:min-h-0 lg:min-w-9 ${
                                                p === safePage
                                                    ? 'bg-teal-600 text-white'
                                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}

                                <PageButton onClick={() => setPage(safePage + 1)} disabled={safePage === totalPages} ariaLabel={t('table.nextPage')}>
                                    <ChevronRight className="h-4 w-4" />
                                </PageButton>
                                <PageButton onClick={() => setPage(totalPages)} disabled={safePage === totalPages} ariaLabel={t('table.lastPage')}>
                                    <ChevronsRight className="h-4 w-4" />
                                </PageButton>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * One record as a card: the thumbnail, title and action menu on a header line, every other visible
 * column beneath it as a labelled pair. The cells are the table's own `render` output, so a badge or a
 * money cell looks the same here as it does in a row.
 */
function RowCard({ split, row, selectable, selected, onToggleSelect, onClick, selectRowLabel, dense = false }) {
    const { leading, title, fields, trailing } = split
    // An adornment that renders nothing is dropped rather than given an empty box: a product with no
    // picture should not reserve a thumbnail-sized hole on its card the way it does in a table, where the
    // placeholder is what keeps the column lined up.
    const adornments = (columns) =>
        columns
            .map((column) => ({ key: column.key, value: cellValue(column, row, CARD_CONTEXT) }))
            .filter((cell) => !isEmptyCell(cell.value))

    const leadingCells = adornments(leading)
    const trailingCells = adornments(trailing)

    return (
        <div
            onClick={onClick}
            className={`rounded-xl border transition ${dense ? 'p-1.5' : 'p-3'} ${
                selected
                    ? 'border-teal-300 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/20'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
            } ${onClick ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50' : ''}`}
        >
            <div className="flex items-center gap-3">
                {selectable && (
                    // The box stays 16px — a giant checkbox looks wrong — but the *tappable* area is the
                    // label around it, at the full 44. The negative margins give that area back to the
                    // layout so the title still sits where it did.
                    <label
                        onClick={(event) => event.stopPropagation()}
                        className="-my-2 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                    >
                        <Checkbox checked={selected} onChange={onToggleSelect} aria-label={selectRowLabel} className="block" />
                    </label>
                )}
                {leadingCells.map((cell) => (
                    <div key={cell.key} className="shrink-0">{cell.value}</div>
                ))}
                {title && (
                    <div className={`min-w-0 flex-1 break-words font-semibold text-slate-800 dark:text-slate-100 ${dense ? 'text-sm' : ''}`}>
                        {cellValue(title, row, CARD_CONTEXT)}
                    </div>
                )}
                {trailingCells.map((cell) => (
                    <div key={cell.key} className="shrink-0">{cell.value}</div>
                ))}
            </div>

            {fields.length > 0 && (
                // A two-column grid rather than a row of `justify-between` flexes: with the latter every
                // label sat at a different distance from its value, because each row was spaced
                // independently. A shared column keeps the values lined up down the card.
                <dl className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 border-t border-slate-100 text-sm dark:border-slate-800 ${dense ? 'mt-1 gap-y-0.5 pt-1 text-xs' : 'mt-2.5 gap-y-1.5 pt-2.5'}`}>
                    {fields.map((column) => (
                        <Fragment key={column.key}>
                            <dt className="whitespace-nowrap text-slate-500 dark:text-slate-400">{column.label}</dt>
                            <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 break-words text-right text-slate-700 dark:text-slate-200">
                                {cellValue(column, row, CARD_CONTEXT)}
                            </dd>
                        </Fragment>
                    ))}
                </dl>
            )}
        </div>
    )
}

/**
 * The card view's replacement for clickable column headers. A native `select` on purpose: it opens the
 * platform's own picker, which beats a custom menu on the devices this view exists for.
 */
function CardSortControl({ columns, sortBy, sortDir, onSortChange }) {
    const { t } = useTranslation()
    const descending = sortDir === 'desc'

    return (
        <div className="flex items-center gap-1.5">
            <select
                value={sortBy ?? ''}
                // Ascending, not the direction the previous field happened to be in: clicking an inactive
                // column header sorts ascending, and picking a field here has to mean the same thing.
                onChange={(event) => onSortChange(event.target.value, 'asc')}
                aria-label={t('table.sortBy')}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-teal-500 lg:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
                <option value="" disabled>{t('table.sortBy')}</option>
                {columns.map((column) => (
                    <option key={column.key} value={column.sortKey}>{column.label}</option>
                ))}
            </select>
            <button
                type="button"
                disabled={!sortBy}
                onClick={() => onSortChange(sortBy, descending ? 'asc' : 'desc')}
                aria-label={descending ? t('table.sortDescending') : t('table.sortAscending')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 lg:h-8 lg:w-8 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                {descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </button>
        </div>
    )
}

// The card-view counterpart of TableSkeleton, for the same reason: no flash of "no data" before the
// first response lands.
function CardSkeleton({ count }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                    <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="mt-3 space-y-2">
                        <div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                </div>
            ))}
        </>
    )
}

function ColumnPicker({ columns, hiddenColumns, onToggle, onReset }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const triggerRef = useRef(null)
    const menuRef = useRef(null)
    const WIDTH = 224

    // Anchored with position: fixed so the table card's overflow-hidden can't clip it.
    useLayoutEffect(() => {
        if (!open) return
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) return
        const margin = 8
        const gap = 4
        let left = rect.right - WIDTH
        const maxLeft = window.innerWidth - WIDTH - margin
        if (left > maxLeft) left = maxLeft
        if (left < margin) left = margin

        // Vertical placement matters as much as horizontal on a short screen: a `fixed` panel hung below
        // a trigger near the bottom simply lands off the viewport, and the page cannot be scrolled to
        // reach it — scrolling closes it. So it flips above when below is tight, and is capped to the
        // room it actually has either way.
        const spaceBelow = window.innerHeight - rect.bottom - margin - gap
        const spaceAbove = rect.top - margin - gap
        const dropUp = spaceBelow < 220 && spaceAbove > spaceBelow
        setCoords({
            top: dropUp ? undefined : rect.bottom + gap,
            // Anchored by its bottom edge when flipped, so a short menu still sits against the trigger.
            bottom: dropUp ? window.innerHeight - rect.top + gap : undefined,
            left,
            maxHeight: Math.max(160, dropUp ? spaceAbove : spaceBelow),
        })
    }, [open])

    useEffect(() => {
        if (!open) return
        const close = () => setOpen(false)
        const onKeyDown = (event) => event.key === 'Escape' && setOpen(false)
        const onPointerDown = (event) => {
            if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
            setOpen(false)
        }
        // Close when the page scrolls (the fixed menu would otherwise detach from its trigger),
        // but ignore scrolling that happens inside the menu's own column list.
        const onScroll = (event) => {
            if (menuRef.current?.contains(event.target)) return
            setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('mousedown', onPointerDown)
        window.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', close)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('mousedown', onPointerDown)
            window.removeEventListener('scroll', onScroll, true)
            window.removeEventListener('resize', close)
        }
    }, [open])

    const allVisible = hiddenColumns.length === 0

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={open}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition lg:min-h-0 ${
                    open
                        ? 'border-teal-500 bg-teal-50 text-teal-600 dark:border-teal-500 dark:bg-teal-500/10 dark:text-teal-300'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
            >
                <SlidersHorizontal className="h-4 w-4" /> {t('table.columns')}
            </button>

            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        bottom: coords.bottom,
                        left: coords.left,
                        width: WIDTH,
                        maxHeight: coords.maxHeight,
                    }}
                    className="z-[60] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800"
                >
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {t('table.showColumns')}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto border-y border-slate-200 py-1 dark:border-slate-700">
                        {columns.map((column) => (
                            <label
                                key={column.key}
                                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60"
                            >
                                <Checkbox checked={!hiddenColumns.includes(column.key)} onChange={() => onToggle(column.key)} />
                                <span>{column.name}</span>
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={allVisible}
                        className="w-full px-3 py-2 text-left text-sm font-medium text-teal-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-teal-400 dark:hover:bg-slate-700/60 dark:disabled:text-slate-500"
                    >
                        {t('table.reset')}
                    </button>
                </div>
            )}
        </>
    )
}

// Shimmer placeholder rows shown while the first page of data loads, so the table doesn't flash an
// empty "no data" state before the request resolves.
function TableSkeleton({ rows, columns }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, r) => (
                <tr key={r} className="border-t border-slate-200 dark:border-slate-800" aria-hidden="true">
                    {Array.from({ length: columns }).map((_, c) => (
                        <td key={c} className="px-4 py-3.5">
                            <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}

/**
 * Sort affordance in a column header. The inactive state stays visible but faint, so a sortable column
 * advertises itself without a hover — the alternative (icon only on hover) hides the feature entirely from
 * anyone who doesn't happen to sweep the mouse across the header.
 */
function SortIcon({ active, dir }) {
    if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
    return dir === 'asc'
        ? <ArrowUp className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
        : <ArrowDown className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
}

function PageButton({ onClick, disabled, ariaLabel, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 lg:h-8 lg:w-8 dark:text-slate-300 dark:hover:bg-slate-800"
        >
            {children}
        </button>
    )
}
