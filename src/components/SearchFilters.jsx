import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, ArrowDown, ArrowUp } from 'lucide-react'
import CustomSelect from "./CustomSelect"
import Modal from "./Modal"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { useModal } from "../hooks/useModal"

/**
 * Search box plus a set of multi-select filters. Each filter's `value` is an array of selected
 * option values and `onChange` receives the new array. An empty array means "no filter" (show all),
 * so the option lists should NOT include an "All ..." sentinel.
 *
 * Below `lg` the filters move into a sheet behind one button. Stacked, they were three or four
 * full-width selects sitting between the page title and the first record — the controls took more of the
 * screen than the data did. Search stays out in the open because it is the one that gets used every time.
 *
 * `sort` is optional: pass it and the sheet also owns sorting, which is where it belongs once the table
 * has no column headers to click. Pages that pass it should tell DataTable `hideCardSort`, so the two do
 * not both offer the same control.
 */
export default function SearchFilters({
                                          search,
                                          onSearchChange,
                                          filters = [],
                                          rightContent,
                                          sort,
                                      }) {
    const { t } = useTranslation()
    const isDesktop = useBreakpoint() === 'desktop'
    const sheet = useModal()

    const activeCount = filters.reduce((n, f) => n + (f.value?.length ? 1 : 0), 0)

    const searchBox = (
        <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('common.search')}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950"
        />
    )

    const filterControls = filters.map((filter) => (
        <CustomSelect
            key={filter.key}
            multiple
            options={filter.options}
            value={filter.value}
            searchable={filter.searchable && filter.options.length > 5}
            onChange={filter.onChange}
            placeholder={filter.placeholder || t('common.allStatuses')}
            ariaLabel={filter.placeholder}
        />
    ))

    if (isDesktop) {
        return (
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid gap-4 lg:grid-cols-[2fr_repeat(3,1fr)]">
                    {searchBox}
                    {filterControls}
                </div>
                {rightContent ? <div className="flex justify-end">{rightContent}</div> : null}
            </div>
        )
    }

    const hasSheet = filters.length > 0 || Boolean(sort)

    return (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">{searchBox}</div>
                {hasSheet && (
                    <button
                        type="button"
                        onClick={sheet.open}
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        {t('common.filters')}
                        {activeCount > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1 text-xs font-semibold text-white">
                                {activeCount}
                            </span>
                        )}
                    </button>
                )}
            </div>
            {rightContent ? <div className="flex justify-end">{rightContent}</div> : null}

            <Modal isOpen={sheet.isOpen} onClose={sheet.close} title={t('common.filters')} width="max-w-md">
                <div className="space-y-4">
                    {sort && <SortControls {...sort} />}

                    {filters.map((filter, index) => (
                        <div key={filter.key} className="space-y-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {filter.placeholder || t('common.allStatuses')}
                            </p>
                            {filterControls[index]}
                        </div>
                    ))}

                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <button
                            type="button"
                            disabled={activeCount === 0}
                            onClick={() => filters.forEach((f) => f.onChange([]))}
                            className="min-h-11 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {t('common.clearFilters')}
                        </button>
                        <button
                            type="button"
                            onClick={sheet.close}
                            className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
                        >
                            {t('common.done')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

/** Sort field and direction, together, which is the pairing the toolbar version kept apart. */
function SortControls({ sortBy, sortDir, onSortChange, options = [] }) {
    const { t } = useTranslation()
    if (options.length === 0) return null

    return (
        <div className="space-y-2 border-b border-slate-200 pb-4 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('table.sortBy')}</p>
            <CustomSelect
                options={options}
                value={sortBy ?? ''}
                // A new field starts ascending, the same as clicking an inactive column header does.
                onChange={(value) => onSortChange(value, 'asc')}
                placeholder={t('table.sortBy')}
                ariaLabel={t('table.sortBy')}
            />
            <div className="flex gap-2">
                {[['asc', ArrowUp, t('table.sortAsc')], ['desc', ArrowDown, t('table.sortDesc')]].map(([dir, Icon, label]) => (
                    <button
                        key={dir}
                        type="button"
                        disabled={!sortBy}
                        onClick={() => onSortChange(sortBy, dir)}
                        aria-pressed={sortDir === dir}
                        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition disabled:opacity-40 ${
                            sortDir === dir
                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300'
                                : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>
        </div>
    )
}
