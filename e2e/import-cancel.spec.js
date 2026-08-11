import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// N-010 in a real browser. Stage 9 changed the import modal so that previewing a file resolves referenced
// categories read-only and creates nothing until the user confirms. That fix was code-reviewed and is
// covered by a jsdom test, but it had never actually been clicked through — this is the end-to-end proof,
// against the real backend, that a previewed-then-cancelled import leaves no categories behind.
const uniq = () => `QA Cancel ${Date.now()}`

/**
 * Category names currently on the server, via the app's own session.
 *
 * `size` is essential: /api/categories returns a Page, and with the default page size a newly created
 * category can simply be absent from page 1 — which made an earlier version of this helper report
 * "not created" for a category that had in fact just been created, hiding the very regression these
 * tests exist to catch.
 */
async function categoryNames(page) {
    return page.evaluate(async () => {
        const token = localStorage.getItem('token')
        const res = await fetch('http://localhost:8080/api/categories?size=2000', {
            headers: { Authorization: `Bearer ${token}` },
        })
        const body = await res.json()
        return (Array.isArray(body) ? body : body.content ?? []).map((c) => c.name)
    })
}

async function openImport(page) {
    await page.goto('/products')
    await expect(page.getByRole('table')).toBeVisible()
    await page.getByRole('button', { name: /import/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
}

/**
 * Selects a one-row product CSV. A product import requires Name, Manufacturer and Category; the
 * manufacturer must already exist (manufacturers are never auto-created, unlike categories — that
 * asymmetry is deliberate and was confirmed in Stage 9), so this uses a seeded one.
 */
async function choose(page, productName, categoryName) {
    await page.locator('input[type="file"]').setInputFiles({
        name: 'products.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`Name,Manufacturer,Category\n${productName},Bosch,${categoryName}\n`),
    })
}

test.describe('import preview and cancel (N-010)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
    })

    test('previewing a file creates no category, and cancelling leaves nothing behind', async ({ page }) => {
        const category = uniq()
        const product = `${category} Product`

        const before = await categoryNames(page)
        expect(before).not.toContain(category)

        await openImport(page)
        await choose(page, product, category)

        // The preview must show the row as importable even though the category does not exist yet.
        await expect(page.getByText(product)).toBeVisible()
        await expect(page.getByRole('button', { name: /import 1/i })).toBeEnabled()

        // Still nothing created at preview time.
        expect(await categoryNames(page)).not.toContain(category)

        await page.getByRole('button', { name: 'Close' }).click()
        await expect(page.getByRole('dialog')).toBeHidden()

        // And nothing created by walking away.
        expect(await categoryNames(page)).not.toContain(category)
    })

    test('Escape out of the preview also creates nothing', async ({ page }) => {
        const category = uniq()

        await openImport(page)
        await choose(page, `${category} Product`, category)
        await expect(page.getByRole('button', { name: /import 1/i })).toBeEnabled()

        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()

        expect(await categoryNames(page)).not.toContain(category)
    })

    test('confirming the import does create the category and the product', async ({ page }) => {
        const category = uniq()
        const product = `${category} Product`

        await openImport(page)
        await choose(page, product, category)
        await page.getByRole('button', { name: /import 1/i }).click()

        // The other half of the contract: confirming must still work end to end.
        await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 15000 })
        expect(await categoryNames(page)).toContain(category)

        await page.getByRole('button', { name: /done/i }).click()
        await page.getByPlaceholder('Search...').fill(product)
        await expect(page.getByText(product).first()).toBeVisible({ timeout: 15000 })
    })
})
