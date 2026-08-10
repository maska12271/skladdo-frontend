// @vitest-environment jsdom
//
// Pins N-010 (Stage 9): selecting a file used to create referenced relations — categories — immediately,
// so a user who previewed a file and then cancelled was left with categories they never asked for. The fix
// splits `prepare` into a read-only preview pass (`create: false`) and a real one on confirm
// (`create: true`). That fix had never been exercised end-to-end before Stage 11; this is that exercise.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import '../i18n'

const apiPost = vi.fn()
vi.mock('../api/client', () => ({ apiPost: (...args) => apiPost(...args) }))

const toastSuccess = vi.fn()
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: toastSuccess, error: vi.fn() }) }))

const { default: ImportModal } = await import('./ImportModal')

const fields = [
    { key: 'name', labelKey: 'common.name', required: true },
    { key: 'category', labelKey: 'products.category' },
]

const CSV = 'Name,Category\nWidget,Tools\nGadget,Tools\n'

/** Records the create flag of every prepare call, which is the whole point of the N-010 fix. */
let prepareCalls
let prepare
let onClose

function renderModal(extra = {}) {
    return render(
        <ImportModal
            isOpen
            onClose={onClose}
            entityLabel="products"
            endpoint="/products"
            fields={fields}
            prepare={prepare}
            parseRow={(record) => ({ payload: { name: record.name, category: record.category } })}
            {...extra}
        />
    )
}

async function selectFile(contents = CSV, name = 'products.csv') {
    const file = new File([contents], name, { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')
    // The input is visually hidden behind a drop zone, so drive it directly rather than via a click.
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument())
}

beforeEach(() => {
    prepareCalls = []
    prepare = vi.fn(async (records, opts) => {
        prepareCalls.push(opts)
        return { categories: {} }
    })
    onClose = vi.fn()
    apiPost.mockReset().mockResolvedValue({})
    toastSuccess.mockReset()
})

afterEach(cleanup)

describe('ImportModal preview', () => {
    it('previews the file without creating anything', async () => {
        renderModal()
        await selectFile()

        expect(screen.getByText('Widget')).toBeInTheDocument()
        expect(screen.getByText('Gadget')).toBeInTheDocument()
        // Nothing may be written during a preview — the user has not committed yet.
        expect(apiPost).not.toHaveBeenCalled()
        expect(prepareCalls).toEqual([{ create: false }])
    })

    it('creates nothing when the user cancels after previewing', async () => {
        renderModal()
        await selectFile()

        await userEvent.click(screen.getByLabelText('Close'))

        expect(onClose).toHaveBeenCalled()
        expect(apiPost).not.toHaveBeenCalled()
        // The read-only preview pass is the only prepare that ever ran.
        expect(prepareCalls).toEqual([{ create: false }])
        expect(prepareCalls.some((c) => c.create)).toBe(false)
    })

    it('creates nothing when the user backs out to pick another file', async () => {
        renderModal()
        await selectFile()

        await userEvent.click(screen.getByRole('button', { name: /choose another/i }))

        expect(apiPost).not.toHaveBeenCalled()
        expect(prepareCalls).toEqual([{ create: false }])
    })
})

describe('ImportModal confirm', () => {
    it('re-runs prepare with create:true and posts one row at a time', async () => {
        renderModal()
        await selectFile()

        await userEvent.click(screen.getByRole('button', { name: /import 2/i }))

        await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
        // Order matters: relations are created first, then the rows that reference them.
        expect(prepareCalls).toEqual([{ create: false }, { create: true }])
        expect(apiPost.mock.calls[0][0]).toBe('/products')
        expect(apiPost.mock.calls[0][1]).toMatchObject({ name: 'Widget' })
        expect(apiPost.mock.calls[1][1]).toMatchObject({ name: 'Gadget' })
    })

    it('keeps going after a row fails and reports the failed row number', async () => {
        apiPost.mockRejectedValueOnce(new Error('Duplicate name')).mockResolvedValue({})
        renderModal()
        await selectFile()

        await userEvent.click(screen.getByRole('button', { name: /import 2/i }))

        // One bad row must not abort the batch.
        await waitFor(() => expect(screen.getByText('Duplicate name')).toBeInTheDocument())
        expect(apiPost).toHaveBeenCalledTimes(2)
        // Row 2 is the first data row: rowNumber is 1-based and counts the header line.
        expect(screen.getByText('2')).toBeInTheDocument()
    })
})

describe('ImportModal validation', () => {
    it('refuses a file missing a required column and creates nothing', async () => {
        renderModal()
        await selectFile('Category\nTools\n', 'bad.csv')

        expect(screen.getByText(/missing/i)).toBeInTheDocument()
        expect(apiPost).not.toHaveBeenCalled()
        // A file that cannot be imported must not trigger the relation-resolving pass at all.
        expect(prepareCalls).toEqual([])
    })

    it('reports an empty file rather than importing zero rows', async () => {
        renderModal()
        await selectFile('Name,Category\n', 'empty.csv')

        expect(apiPost).not.toHaveBeenCalled()
        expect(prepareCalls).toEqual([])
    })
})
