// @vitest-environment jsdom
//
// The card view DataTable falls back to below `md`, where a business table cannot fit. It is the same
// component and the same state — selection, sorting, paging, the column picker all still run through the
// props the list pages already pass — so what is worth pinning is that none of that quietly stops working
// when the rows stop being rows. Kept apart from DataTable.test.jsx, which covers the table at desktop
// width, so neither file has to keep resetting the viewport.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '../i18n'
import DataTable from './DataTable'
import { setViewportWidth, resetViewportWidth } from '../test/matchMedia'

beforeEach(() => {
    localStorage.clear()
    setViewportWidth(375)
})
afterEach(() => {
    cleanup()
    resetViewportWidth()
})

const columns = [
    { key: 'name', label: 'Name', sortKey: 'name' },
    { key: 'sku', label: 'SKU', sortKey: 'sku' },
]

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}`, sku: `S${i + 1}` }))

/** Cards are the `dl`-bearing blocks; a count of them is the card view's answer to `bodyRows()`. */
const cards = () => document.querySelectorAll('dl')

describe('DataTable — card view', () => {
    it('drops the table entirely below md', () => {
        render(<DataTable columns={columns} rows={makeRows(3)} />)
        expect(document.querySelector('table')).not.toBeInTheDocument()
        expect(cards()).toHaveLength(3)
    })

    it('keeps the table at desktop width', () => {
        setViewportWidth(1280)
        render(<DataTable columns={columns} rows={makeRows(3)} />)
        expect(document.querySelector('table')).toBeInTheDocument()
    })

    it('promotes the first labelled column to the card title and labels the rest', () => {
        render(<DataTable columns={columns} rows={makeRows(1)} />)

        // The title is the heading line, outside the field list — not repeated as a labelled pair.
        expect(screen.getByText('Item 1')).toBeInTheDocument()
        const fields = within(document.querySelector('dl'))
        expect(fields.getByText('SKU')).toBeInTheDocument()
        expect(fields.getByText('S1')).toBeInTheDocument()
        expect(fields.queryByText('Item 1')).not.toBeInTheDocument()
    })

    it('treats unlabelled columns as adornments rather than inventing a blank field', () => {
        // The shape every list page writes: a thumbnail before the title, an action menu after it, both
        // with `label: ''`. Neither should turn into an empty label/value row.
        const withAdornments = [
            { key: 'image', label: '', name: 'Image', render: () => <img alt="thumb" src="x.png" /> },
            ...columns,
            { key: 'actions', label: '', render: () => <button type="button">Menu</button> },
        ]
        render(<DataTable columns={withAdornments} rows={makeRows(1)} />)

        expect(screen.getByAltText('thumb')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
        // One field row only — SKU. The two unlabelled columns did not become fields.
        expect(document.querySelectorAll('dl > dt')).toHaveLength(1)
    })

    // Deliberately started from `desc`: several lists default to it, and an earlier version of this
    // control carried the old field's direction onto the newly picked one — so a list that arrived
    // descending could never be sorted A-Z from here at all.
    it('starts a newly chosen field ascending, the way a column header does', async () => {
        const onSortChange = vi.fn()
        render(
            <DataTable
                columns={columns}
                rows={makeRows(3)}
                sortBy="name"
                sortDir="desc"
                onSortChange={onSortChange}
            />
        )

        await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'sku')
        expect(onSortChange).toHaveBeenCalledWith('sku', 'asc')
    })

    it('flips direction without changing the field', async () => {
        const onSortChange = vi.fn()
        render(
            <DataTable
                columns={columns}
                rows={makeRows(3)}
                sortBy="name"
                sortDir="desc"
                onSortChange={onSortChange}
            />
        )

        await userEvent.click(screen.getByLabelText(/Sorted descending/))
        expect(onSortChange).toHaveBeenCalledWith('name', 'asc')
    })

    it('offers only columns the API can actually sort on', () => {
        const mixed = [
            ...columns,
            // Computed cells have no field behind them and would 400 — they stay out of the picker.
            { key: 'stockStatus', label: 'Stock status', render: () => 'Low' },
        ]
        render(<DataTable columns={mixed} rows={makeRows(1)} sortBy="name" sortDir="asc" onSortChange={vi.fn()} />)

        const options = within(screen.getByLabelText('Sort by')).getAllByRole('option')
        expect(options.map((o) => o.textContent)).toEqual(['Sort by', 'Name', 'SKU'])
    })

    it('selects a single card and selects all from the toolbar', async () => {
        const onSelectionChange = vi.fn()
        const { rerender } = render(
            <DataTable
                columns={columns}
                rows={makeRows(3)}
                selectable
                selectedIds={[]}
                onSelectionChange={onSelectionChange}
            />
        )

        await userEvent.click(screen.getAllByLabelText('Select row')[1])
        expect(onSelectionChange).toHaveBeenCalledWith([2])

        rerender(
            <DataTable
                columns={columns}
                rows={makeRows(3)}
                selectable
                selectedIds={[]}
                onSelectionChange={onSelectionChange}
            />
        )
        // No header row to hold it, so "select all" lives in the toolbar instead.
        await userEvent.click(screen.getByLabelText('Select all rows'))
        expect(onSelectionChange).toHaveBeenCalledWith([1, 2, 3])
    })

    it('pages with a readout instead of a row of page buttons', async () => {
        render(<DataTable columns={columns} rows={makeRows(25)} initialPageSize={10} />)

        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
        // The numbered buttons a desktop gets would overflow a phone.
        expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument()

        await userEvent.click(screen.getByLabelText('Next page'))
        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
        expect(screen.getByText('Item 11')).toBeInTheDocument()
        expect(screen.queryByText('Item 1')).not.toBeInTheDocument()
    })

    it('opens a record on card click, but not when a control inside it is used', async () => {
        const onRowClick = vi.fn()
        const onAction = vi.fn()
        const withAction = [
            ...columns,
            { key: 'actions', label: '', render: () => <button type="button" onClick={onAction}>Edit</button> },
        ]
        render(<DataTable columns={withAction} rows={makeRows(2)} onRowClick={onRowClick} />)

        await userEvent.click(screen.getByText('Item 1'))
        expect(onRowClick).toHaveBeenCalledTimes(1)

        // The action menu inside a card must not also navigate away from it.
        await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
        expect(onAction).toHaveBeenCalledTimes(1)
        expect(onRowClick).toHaveBeenCalledTimes(1)
    })

    it('still tells "nothing yet" apart from "nothing matched"', () => {
        const { rerender } = render(<DataTable columns={columns} rows={[]} />)
        expect(screen.getByText('No data found.')).toBeInTheDocument()

        rerender(<DataTable columns={columns} rows={[]} filtersActive />)
        expect(screen.getByText('No results match your filters.')).toBeInTheDocument()
    })

    it('follows the column picker, dropping a hidden column from the card', () => {
        localStorage.setItem('tableColumns:products', JSON.stringify(['sku']))
        render(<DataTable columns={columns} rows={makeRows(1)} tableId="products" />)

        expect(screen.getByText('Item 1')).toBeInTheDocument()
        expect(screen.queryByText('S1')).not.toBeInTheDocument()
    })
})
