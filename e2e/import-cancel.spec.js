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

/**
 * What this file has created on the server, removed again after each test.
 *
 * The confirming test below genuinely imports a product and a category — that is the half of the contract
 * it exists to prove — but nothing used to take them away again, so every run left one of each behind.
 * They accumulate, and because they sort to the top of the products list they quietly destabilise
 * unrelated specs: `sorting.spec.js` in particular compares row order against a list that keeps growing.
 *
 * Registered by name rather than id: the import happens inside the browser, so the ids never reach the
 * test. Only what this file created is removed — see the note in the suite output about older residue.
 */
const created = { products: [], categories: [] }

test.describe('import preview and cancel (N-010)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
    })

    test.afterEach(async ({ page }) => {
        if (created.products.length === 0 && created.categories.length === 0) return
        await page.evaluate(async ({ products, categories }) => {
            const token = localStorage.getItem('token')
            const headers = { Authorization: `Bearer ${token}` }
            const removeByName = async (kind, names) => {
                if (names.length === 0) return
                const res = await fetch(`http://localhost:8080/api/${kind}?size=3000`, { headers })
                const body = await res.json()
                const list = Array.isArray(body) ? body : body.content ?? []
                for (const item of list.filter((i) => names.includes(i.name))) {
                    await fetch(`http://localhost:8080/api/${kind}/${item.id}`, { method: 'DELETE', headers })
                }
            }
            // Products first: they reference the categories.
            await removeByName('products', products)
            await removeByName('categories', categories)
        }, created)
        created.products.length = 0
        created.categories.length = 0
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
        // Registered before the import rather than after the assertions, so a failure part-way through
        // still hands them to the cleanup instead of leaking them.
        created.categories.push(category)
        created.products.push(product)

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
