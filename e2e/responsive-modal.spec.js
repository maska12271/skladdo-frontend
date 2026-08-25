import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// Modal geometry, which only a real browser can settle — the jsdom tests cover the focus trap and the
// scroll lock, but jsdom performs no layout, so nothing there can tell a centred `max-w-lg` box apart
// from a full-width sheet. Below `sm` the dialog is anchored to the bottom edge and spans the screen;
// from `sm` up it is the centred dialog it has always been.
//
// Everything is measured against the backdrop rather than the viewport: emulated Chromium keeps a classic
// scrollbar, so the fixed overlay is ~10px narrower than `viewportSize()` reports, while a real phone's
// overlay scrollbar takes no width at all. The backdrop is the frame the dialog is actually laid out in,
// which makes it the honest reference either way.
const MOBILE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 900 }

// Not `getByRole('dialog')`: below `lg` the nav drawer is a dialog too (parked off-screen and inert), so
// the role alone is ambiguous. Every Modal labels itself by the same heading id, which is not.
const DIALOG = '[role="dialog"][aria-labelledby="modal-title"]'
const dialog = (page) => page.locator(DIALOG)

const openProductModal = async (page) => {
    await login(page)
    await page.goto('/products')
    await page.getByRole('button', { name: 'Add product' }).click()
    await expect(dialog(page)).toBeVisible()
    // The entry animation moves the dialog; measuring mid-slide reads a transform, not the resting box.
    await page.waitForTimeout(400)
}

/** The dialog's box and the backdrop's, in one read so they cannot drift between measurements. */
const boxes = (page, sel) => page.evaluate((s) => {
    const dlg = document.querySelector(s)
    const back = dlg.parentElement.getBoundingClientRect()
    const d = dlg.getBoundingClientRect()
    return {
        dialog: { x: d.x, y: d.y, width: d.width, height: d.height, bottom: d.bottom },
        backdrop: { x: back.x, y: back.y, width: back.width, height: back.height, bottom: back.bottom },
    }
}, sel)

test.describe('phone', () => {
    test.use({ viewport: MOBILE })

    test('the dialog is a sheet: full width, sitting on the bottom edge', async ({ page }) => {
        await openProductModal(page)
        const { dialog: d, backdrop } = await boxes(page, DIALOG)

        // No side gutters and no width cap — the sheet is the screen.
        expect(d.x).toBe(backdrop.x)
        expect(d.width).toBe(backdrop.width)
        expect(Math.round(d.bottom)).toBe(Math.round(backdrop.bottom))
    })

    test('the sheet leaves the top of the screen visible and scrolls internally', async ({ page }) => {
        await openProductModal(page)
        const { dialog: d, backdrop } = await boxes(page, DIALOG)

        // Capped at 92vh, so the backdrop still shows above it and the sheet reads as a layer.
        expect(d.height).toBeLessThan(backdrop.height)

        // The header stays put while the body moves — that is what the flex column buys.
        const bodyScrolls = await page.evaluate((s) => {
            const body = document.querySelector(`${s} > div:last-child`)
            return getComputedStyle(body).overflowY === 'auto'
        }, DIALOG)
        expect(bodyScrolls).toBe(true)
    })

    test('nothing inside the form overflows the sheet sideways', async ({ page }) => {
        await openProductModal(page)

        const overflow = await page.evaluate((s) => {
            const body = document.querySelector(`${s} > div:last-child`)
            return body.scrollWidth - body.clientWidth
        }, DIALOG)
        expect(overflow).toBeLessThanOrEqual(0)
    })

    test('the title stays clear of the close button', async ({ page }) => {
        await openProductModal(page)

        // Scoped to the dialog: the nav drawer carries a close button of its own.
        const title = await page.locator('#modal-title').boundingBox()
        const close = await dialog(page).getByRole('button', { name: 'Close' }).boundingBox()
        expect(title.x + title.width).toBeLessThanOrEqual(close.x + 1)
    })
})

test.describe('desktop', () => {
    test.use({ viewport: DESKTOP })

    test('is still a centred dialog honouring its width cap', async ({ page }) => {
        await openProductModal(page)
        const { dialog: d, backdrop } = await boxes(page, DIALOG)

        // The exact cap, not merely "narrower than the screen". `max-w-3xl` is 768px, and asserting the
        // number is what makes this test worth having: the cap used to be built as `sm:${width}` at
        // runtime, which Tailwind never emitted a rule for, so every modal filled the window. The old
        // assertion still passed, because the overlay's 16px padding left the dialog a hair narrower
        // than the backdrop.
        expect(Math.round(d.width)).toBe(768)
        expect(d.width).toBeLessThan(backdrop.width - 100)

        // Centred: the margins either side of it match.
        const left = d.x - backdrop.x
        const right = backdrop.width - (d.x - backdrop.x) - d.width
        expect(Math.round(left)).toBe(Math.round(right))
    })
})
