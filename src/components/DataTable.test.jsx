// @vitest-environment jsdom
//
// DataTable backs every list page in the app, in two quite different modes: client-side (it holds all the
// rows and slices them) and server-side (the parent already fetched one page and passes `total`). The
// modes share one component, so a change made for one can silently break the other. Stage 11 of the test
// pass; nothing here had a test before.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '../i18n'
import DataTable from './DataTable'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const columns = [
    { key: 'name', label: 'Name' },
    { key: 'sku', label: 'SKU' },
]

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}`, sku: `S${i + 1}` }))

/** Row count excluding the header row. */
const bodyRows = () => within(document.querySelector('tbody')).queryAllByRole('row')

/** The "Showing 1–10 of 25" line, normalised — the numbers in it are ambiguous page-wide. */
const summaryText = () => screen.getByText(/Showing/).textContent.replace(/\s+/g, ' ').trim()

describe('DataTable — client mode', () => {
    it('slices rows to the page size', () => {
        render(<DataTable columns={columns} rows={makeRows(25)} initialPageSize={10} />)
        expect(bodyRows()).toHaveLength(10)
        expect(screen.getByText('Item 1')).toBeInTheDocument()
        expect(screen.queryByText('Item 11')).not.toBeInTheDocument()
    })

    it('moves to the next page', async () => {
        render(<DataTable columns={columns} rows={makeRows(25)} initialPageSize={10} />)
        await userEvent.click(screen.getByLabelText('Next page'))
        expect(screen.getByText('Item 11')).toBeInTheDocument()
        expect(screen.queryByText('Item 1')).not.toBeInTheDocument()
    })

    it('returns to page 1 when the page size changes', async () => {
        render(<DataTable columns={columns} rows={makeRows(60)} initialPageSize={10} />)
        await userEvent.click(screen.getByLabelText('Next page'))
        expect(screen.getByText('Item 11')).toBeInTheDocument()

        await userEvent.selectOptions(screen.getByRole('combobox'), '25')
        // Staying on page 2 with a bigger page size would silently skip rows 1-25.
        expect(screen.getByText('Item 1')).toBeInTheDocument()
    })

    it('reports the visible range against the true total', () => {
        render(<DataTable columns={columns} rows={makeRows(25)} initialPageSize={10} />)
        // Scoped to the summary line: the totals also appear as page-size options and page numbers.
        expect(summaryText()).toBe('Showing 1–10 of 25')
    })
})

describe('DataTable — server mode', () => {
    it('renders the given rows without slicing and paginates against `total`', () => {
        // The parent fetched page 3 of 100: only 10 rows are passed, but the pager must know there are 100.
        render(
            <DataTable
                columns={columns}
                rows={makeRows(10)}
                total={100}
                page={3}
                pageSize={10}
                onPageChange={() => {}}
            />
        )
        expect(bodyRows()).toHaveLength(10)
        expect(summaryText()).toBe('Showing 21–30 of 100')
    })

    it('asks the parent to change page rather than paging internally', async () => {
        const onPageChange = vi.fn()
        render(
            <DataTable
                columns={columns}
                rows={makeRows(10)}
                total={100}
                page={3}
                pageSize={10}
                onPageChange={onPageChange}
            />
        )
        await userEvent.click(screen.getByLabelText('Next page'))
        expect(onPageChange).toHaveBeenCalledWith(4)
    })

    it('shows skeleton rows instead of an empty state while the first page loads', () => {
        render(
            <DataTable
                columns={columns}
                rows={[]}
                total={0}
                loading
                emptyState={<div>Nothing here yet</div>}
                initialPageSize={10}
            />
        )
        expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
        expect(screen.queryByText('No data found.')).not.toBeInTheDocument()
        expect(document.querySelectorAll('tbody tr[aria-hidden="true"]').length).toBeGreaterThan(0)
    })
})

describe('DataTable — empty states', () => {
    it('shows the rich empty state when there are genuinely no records', () => {
        render(
            <DataTable columns={columns} rows={[]} emptyState={<div>Nothing here yet</div>} filtersActive={false} />
        )
        expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
        // The rich state replaces the table entirely — no stray headers.
        expect(document.querySelector('table')).toBeNull()
    })

    it('keeps the table and says "no results" when filters are what emptied it', () => {
        render(
            <DataTable columns={columns} rows={[]} emptyState={<div>Nothing here yet</div>} filtersActive />
        )
        // Telling a user with active filters that they have no records at all is wrong and hides the fix.
        expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
        expect(screen.getByText('No results match your filters.')).toBeInTheDocument()
        expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('falls back to "no data" with no empty state supplied', () => {
        render(<DataTable columns={columns} rows={[]} />)
        expect(screen.getByText('No data found.')).toBeInTheDocument()
    })
})

describe('DataTable — row click', () => {
    it('fires onRowClick for a click on an inert cell', async () => {
        const onRowClick = vi.fn()
        render(<DataTable columns={columns} rows={makeRows(3)} onRowClick={onRowClick} />)
        await userEvent.click(screen.getByText('Item 2'))
        expect(onRowClick).toHaveBeenCalledTimes(1)
        expect(onRowClick.mock.calls[0][0].id).toBe(2)
    })

    it('does not fire onRowClick for a click on a control inside the row', async () => {
        const onRowClick = vi.fn()
        const withButton = [
            ...columns,
            { key: 'actions', label: 'Actions', render: () => <button type="button">Edit</button> },
        ]
        render(<DataTable columns={withButton} rows={makeRows(3)} onRowClick={onRowClick} />)
        // Row navigation must not hijack the row's own action buttons.
        await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
        expect(onRowClick).not.toHaveBeenCalled()
    })
})

describe('DataTable — column visibility', () => {
    // The picker only appears once a table has enough columns to be worth managing — a two-column table
    // has nothing to hide that would not fit anyway. These cases need a table above that threshold.
    const manyColumns = [
        ...columns,
        { key: 'a', label: 'Country' },
        { key: 'b', label: 'Phone' },
        { key: 'c', label: 'Email' },
        { key: 'd', label: 'Status' },
    ]

    it('does not offer the picker on a table with only a couple of columns', () => {
        render(<DataTable columns={columns} rows={makeRows(3)} tableId="tiny" />)
        expect(screen.queryByRole('button', { name: /Columns/ })).not.toBeInTheDocument()
    })

    it('hides a column and persists the choice under the table id', async () => {
        render(<DataTable columns={manyColumns} rows={makeRows(3)} tableId="products" />)

        await userEvent.click(screen.getByRole('button', { name: /Columns/ }))
        await userEvent.click(within(screen.getByRole('menu')).getByLabelText('SKU'))

        expect(screen.queryByRole('columnheader', { name: 'SKU' })).not.toBeInTheDocument()
        expect(JSON.parse(localStorage.getItem('tableColumns:products'))).toEqual(['sku'])
    })

    it('restores hidden columns from localStorage on mount', () => {
        localStorage.setItem('tableColumns:products', JSON.stringify(['sku']))
        render(<DataTable columns={manyColumns} rows={makeRows(3)} tableId="products" />)
        expect(screen.queryByRole('columnheader', { name: 'SKU' })).not.toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    })

    it('offers no picker without a tableId, so preferences cannot collide between tables', () => {
        render(<DataTable columns={columns} rows={makeRows(3)} />)
        expect(screen.queryByRole('button', { name: /Columns/ })).not.toBeInTheDocument()
    })
})

describe('DataTable — selection', () => {
    it('selects every selectable row on the current page only', async () => {
        const onSelectionChange = vi.fn()
        render(
            <DataTable
                columns={columns}
                rows={makeRows(25)}
                initialPageSize={10}
                selectable
                selectedIds={[]}
                onSelectionChange={onSelectionChange}
            />
        )
        await userEvent.click(screen.getByLabelText('Select all rows'))
        // Page 2 and 3 must not be swept up by a control that only shows page 1.
        expect(onSelectionChange).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    it('respects isRowSelectable', async () => {
        const onSelectionChange = vi.fn()
        render(
            <DataTable
                columns={columns}
                rows={makeRows(5)}
                selectable
                selectedIds={[]}
                onSelectionChange={onSelectionChange}
                isRowSelectable={(row) => row.id % 2 === 1}
            />
        )
        await userEvent.click(screen.getByLabelText('Select all rows'))
        expect(onSelectionChange).toHaveBeenCalledWith([1, 3, 5])
    })
})
