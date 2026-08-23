// @vitest-environment jsdom
//
// The product detail gallery doubles as the image editor — adding or removing a picture used to mean
// opening the whole product form. What is pinned here is the part that is easy to break silently: the card
// only offers those controls to someone who may edit, and it hands the caller the complete new key list
// (which is what gets persisted), not a delta.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import i18n from '../i18n'

const apiGet = vi.fn()
const apiUpload = vi.fn()
vi.mock('../api/client', () => ({
    apiGet: (...args) => apiGet(...args),
    apiUpload: (...args) => apiUpload(...args),
}))

const { default: ProductGalleryCard } = await import('./ProductGalleryCard')

/** Lets the mocked promises settle inside act(), so state updates are flushed. */
const flush = () => act(async () => { await Promise.resolve() })

const renderCard = (props) => render(
    <ProductGalleryCard images={[]} alt="Widget" editable onChange={() => {}} {...props} />,
)

beforeEach(() => {
    apiGet.mockReset().mockResolvedValue({ url: 'https://example.test/signed.jpg' })
    apiUpload.mockReset().mockResolvedValue({ key: 'images/new.jpg' })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('ProductGalleryCard', () => {
    it('offers a dropzone when a product has no images yet', () => {
        renderCard()
        expect(screen.getByText(i18n.t('imageUpload.clickToUpload'))).toBeInTheDocument()
    })

    it('shows a plain placeholder instead when the user may not edit', () => {
        renderCard({ editable: false })
        expect(screen.getByText(i18n.t('productDetail.noImages'))).toBeInTheDocument()
        expect(screen.queryByText(i18n.t('imageUpload.clickToUpload'))).not.toBeInTheDocument()
    })

    it('uploads a picked file and reports the whole list back', async () => {
        const onChange = vi.fn()
        const { container } = renderCard({ images: ['images/a.jpg'], onChange })

        const file = new File(['x'], 'photo.png', { type: 'image/png' })
        await act(async () => {
            fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })
        })

        expect(apiUpload).toHaveBeenCalledOnce()
        expect(onChange).toHaveBeenCalledWith(['images/a.jpg', 'images/new.jpg'])
    })

    it('rejects a file the backend would not accept, without uploading it', async () => {
        const onChange = vi.fn()
        const { container } = renderCard({ onChange })

        const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' })
        await act(async () => {
            fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })
        })

        expect(apiUpload).not.toHaveBeenCalled()
        expect(onChange).not.toHaveBeenCalled()
    })

    it('removes only the picture whose button was pressed', async () => {
        const onChange = vi.fn()
        renderCard({ images: ['images/a.jpg', 'images/b.jpg'], onChange })
        await flush()

        // The main image's button comes first, then one per thumbnail — the second thumbnail is the last.
        const removeButtons = screen.getAllByLabelText(i18n.t('imageUpload.removeImage'))
        fireEvent.click(removeButtons[removeButtons.length - 1])

        expect(onChange).toHaveBeenCalledWith(['images/a.jpg'])
    })

    it('offers no remove or add controls to a read-only viewer', async () => {
        renderCard({ images: ['images/a.jpg'], editable: false })
        await flush()

        expect(screen.queryAllByLabelText(i18n.t('imageUpload.removeImage'))).toHaveLength(0)
        expect(screen.queryByLabelText(i18n.t('imageUpload.addImages'))).not.toBeInTheDocument()
    })
})
