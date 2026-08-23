import { test, expect } from '@playwright/test'
import { login } from './helpers.js'
import en from '../src/i18n/locales/en.js'

// DataTable against a real page with real columns. The unit tests drive it with two synthetic columns;
// Products is the hard case — a thumbnail, nine data columns and an action menu — and the one that used
// to force a phone to pan sideways through every record.
const MOBILE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 900 }

const gotoProducts = async (page) => {
    await login(page)
    await page.goto('/products')
    // The heading renders before the list does, and the skeleton carries neither cards nor rows — so the
    // "showing 1-N of M" line is the mode-agnostic signal that real data has actually landed.
    await expect(page.getByText(/Showing/)).toBeVisible()
}

test.describe('products at phone width', () => {
    test.use({ viewport: MOBILE })

    test('renders records as cards instead of a table', async ({ page }) => {
        await gotoProducts(page)

        await expect(page.locator('table')).toHaveCount(0)
        expect(await page.locator('dl').count()).toBeGreaterThan(0)
    })

    test('the record list does not scroll sideways', async ({ page }) => {
        await gotoProducts(page)

        // The whole point of the rebuild: the card list has to fit the viewport it is drawn for.
        const cards = page.locator('dl').first()
        const overflow = await cards.evaluate((el) => {
            const container = el.closest('div.grid')
            return container.scrollWidth - container.clientWidth
        })
        expect(overflow).toBeLessThanOrEqual(0)
    })

    test('sorting still round-trips through the server and the URL', async ({ page }) => {
        await gotoProducts(page)

        // Sorting lives in the filter sheet on the list pages now — cards have no headers to click, and
        // putting it beside the filters makes one surface for "which records, in what order" rather than
        // two controls in two places. The card toolbar no longer offers its own copy.
        await expect(page.getByLabel(en.table.sortBy)).toHaveCount(0)

        await page.getByRole('button', { name: new RegExp(en.common.filters) }).click()
        const sheet = page.locator('[role="dialog"][aria-labelledby="modal-title"]')
        await expect(sheet).toBeVisible()

        await sheet.getByRole('button', { name: en.table.sortAsc }).click()
        await expect(page).toHaveURL(/sortDir=asc/)

        await sheet.getByRole('button', { name: en.table.sortDesc }).click()
        // `desc` is this list's default, so useServerTable drops the parameter rather than spelling it out.
        await expect(page).not.toHaveURL(/sortDir=asc/)
    })

    test('paging is a readout, and it still moves', async ({ page }) => {
        await gotoProducts(page)

        await expect(page.getByText(/Page 1 of \d+/)).toBeVisible()
        await page.getByLabel(en.table.nextPage).click()
        await expect(page.getByText(/Page 2 of \d+/)).toBeVisible()
        await expect(page).toHaveURL(/page=2/)
    })

    test('the column picker still governs what a card shows', async ({ page }) => {
        await gotoProducts(page)

        const firstCard = page.locator('dl').first()
        await expect(firstCard).toContainText(en.common.sku)

        // The picker deliberately closes on a page scroll, so the scroll that brings it into view has to
        // finish before it is opened — otherwise it is dismissed by the very scroll that reached it.
        const trigger = page.getByRole('button', { name: en.table.columns })
        await trigger.scrollIntoViewIfNeeded()
        await page.waitForTimeout(400)
        await trigger.click()
        await page.getByRole('menu').getByText(en.common.sku, { exact: true }).click()
        await expect(firstCard).not.toContainText(en.common.sku)
    })
})

test.describe('products at desktop width', () => {
    test.use({ viewport: DESKTOP })

    test('is still a table, with clickable headers', async ({ page }) => {
        await gotoProducts(page)

        await expect(page.locator('table')).toBeVisible()
        await expect(page.locator('dl')).toHaveCount(0)
        // The card-view controls belong to the card view only.
        await expect(page.getByLabel(en.table.sortBy)).toHaveCount(0)
    })
})
