import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// useServerTable makes the URL the source of truth for page / size / sort / search, so that Back and a
// refresh restore the exact view. "Survives a reload" is the part that can only be proved by actually
// reloading, which is why it lives here rather than in a jsdom test of the hook.
/** The "Showing 11–20 of 88" line, which is the table's own report of what it is displaying. */
const summary = (page) => page.getByText(/Showing/)

test.describe('list URL sync', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await page.goto('/products')
        await expect(page.getByRole('table')).toBeVisible()
    })

    test('puts the page number in the URL and restores it on reload', async ({ page }) => {
        const next = page.getByRole('button', { name: 'Next page' })
        test.skip(!(await next.isVisible()), 'needs more than one page of products')

        await next.click()
        await expect(page).toHaveURL(/[?&]page=2/)
        // The URL updates synchronously but the page-2 fetch does not; wait for the range to catch up
        // before snapshotting, or the snapshot is still page 1.
        await expect(summary(page)).toContainText('11–20')
        const rowsBefore = await page.locator('tbody tr').allTextContents()

        await page.reload()
        await expect(page.getByRole('table')).toBeVisible()

        // Same URL, same page of data — not silently reset to page 1.
        await expect(page).toHaveURL(/[?&]page=2/)
        await expect(summary(page)).toContainText('11–20')
        expect(await page.locator('tbody tr').allTextContents()).toEqual(rowsBefore)
    })

    test('keeps the page size across a reload', async ({ page }) => {
        await page.getByRole('combobox').first().selectOption('25')
        await expect(page).toHaveURL(/[?&]size=25/)

        await page.reload()
        await expect(page.getByRole('table')).toBeVisible()
        await expect(page).toHaveURL(/[?&]size=25/)
        await expect(page.getByRole('combobox').first()).toHaveValue('25')
    })

    test('keeps the search text across a reload', async ({ page }) => {
        const search = page.getByPlaceholder('Search...')
        test.skip(!(await search.isVisible()), 'no search box on this list')

        await search.fill('zzz-no-such-product')
        await expect(page).toHaveURL(/[?&]q=zzz-no-such-product/)

        await page.reload()
        await expect(page).toHaveURL(/[?&]q=zzz-no-such-product/)
        // The input must be rehydrated from the URL, not left blank over filtered results.
        await expect(search).toHaveValue('zzz-no-such-product')
    })

    test('a filtered-empty list says "no results", not "no data"', async ({ page }) => {
        const search = page.getByPlaceholder('Search...')
        test.skip(!(await search.isVisible()), 'no search box on this list')

        await search.fill('zzz-no-such-product')

        // Telling someone with an active filter that they own no products at all hides the actual fix.
        await expect(page.getByText('No results match your filters.')).toBeVisible()
        await expect(page.getByText('No data found.')).toBeHidden()
    })

    test('resets to page 1 when the page size changes', async ({ page }) => {
        const next = page.getByRole('button', { name: 'Next page' })
        test.skip(!(await next.isVisible()), 'needs more than one page of products')

        await next.click()
        await expect(page).toHaveURL(/[?&]page=2/)

        await page.getByRole('combobox').first().selectOption('25')
        // Both halves matter: the size must actually apply *and* the page must drop back to 1. Asserting
        // only the latter passes even when the size change is silently discarded, since that wipes the
        // page param too — which is exactly how F-016 hid.
        await expect(page).toHaveURL(/[?&]size=25/)
        await expect(page).not.toHaveURL(/[?&]page=2/)
        await expect(summary(page)).toContainText('1–25')
    })

    test('Back returns to the previous list view', async ({ page }) => {
        const search = page.getByPlaceholder('Search...')
        test.skip(!(await search.isVisible()), 'no search box on this list')

        await page.getByRole('combobox').first().selectOption('25')
        await expect(page).toHaveURL(/[?&]size=25/)

        await page.goto('/dashboard')
        await page.goBack()
        await expect(page).toHaveURL(/[?&]size=25/)
    })
})

/**
 * Clearing filters writes several params in one user action, which is exactly the shape that used to
 * break: `setSearchParams((prev) => …)` resolves `prev` against the *last render*, so two calls in one
 * tick both started from the pre-click URL and the second discarded the first (F-016). The control was
 * added on the desktop filter bar and has always existed in the mobile filter sheet, and neither
 * actually cleared anything until `useServerTable` began composing same-tick writes.
 */
test.describe('clearing filters', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
    })

    test('is offered only once something is filtered', async ({ page }) => {
        await page.goto('/products')
        await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0)

        await page.goto('/products?manufacturer=1,2')
        await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()
    })

    test('removes every filter param, not just the last one written', async ({ page }) => {
        // Two filters at once is the case the old code got wrong: clearing them in a loop restored the
        // first from a stale snapshot, so the list stayed filtered while the controls read as empty.
        await page.goto('/products?manufacturer=1,2&status=active')
        await page.getByRole('button', { name: 'Clear filters' }).click()

        await expect(page).toHaveURL(/\/products$/)
        await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0)
    })

    test('widens from its icon to its label on hover, so the row stays compact', async ({ page }) => {
        await page.goto('/products?manufacturer=1,2')
        const clear = page.getByRole('button', { name: 'Clear filters' })
        const collapsed = await clear.boundingBox()
        await clear.hover()
        await page.waitForTimeout(350)
        const expanded = await clear.boundingBox()

        expect(collapsed.width).toBeLessThan(60)
        expect(expanded.width).toBeGreaterThan(collapsed.width + 30)
    })
})
