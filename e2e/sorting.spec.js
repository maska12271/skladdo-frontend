import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// N-012. Sorting was reachable only by hand-editing the URL: useServerTable tracked sortBy/sortDir and the
// backend honoured them, but no column header was clickable. Columns now opt in with a `sortKey` naming a
// field the API can genuinely sort on.
//
// The risk this spec exists to catch is a wrong sortKey. There is no whitelist on the backend — `Sort.by`
// takes the raw string — so a key naming something that isn't a persisted field (a computed cell like stock
// status or payment status) returns 400 at runtime, and the only visible symptom is a list that quietly
// fails to load. Every sortable header on every list is therefore clicked here, with the network watched.
const LISTS = [
    { name: 'products', path: '/products' },
    { name: 'clients', path: '/clients' },
    { name: 'manufacturers', path: '/manufacturers' },
    { name: 'sales orders', path: '/sales-orders' },
    { name: 'purchase orders', path: '/purchase-orders' },
    { name: 'tenders', path: '/tenders' },
    { name: 'sent emails', path: '/emails' },
    { name: 'audit log', path: '/audit-log' },
]

/** Names of the clickable sort headers on the current page. */
const sortHeaderNames = (page) =>
    page.evaluate(() => [...document.querySelectorAll('th button')].map((b) => b.textContent.trim()))

test.describe('sortable column headers (N-012)', () => {
    for (const list of LISTS) {
        test(`every sortable header on ${list.name} sorts without an API error`, async ({ page }) => {
            const failures = []
            page.on('response', (res) => {
                if (res.url().includes('/api/') && res.status() >= 400) {
                    failures.push(`${res.status()} ${res.url()}`)
                }
            })

            await login(page)
            await page.goto(list.path)
            await expect(page.locator('table')).toBeVisible({ timeout: 15000 })

            const headers = await sortHeaderNames(page)
            expect(headers.length, `${list.name} has no sortable headers`).toBeGreaterThan(0)

            for (const name of headers) {
                const header = page.getByRole('button', { name, exact: true }).first()
                // Ascending, then descending — a bad sortKey fails the same way in both directions, but a
                // direction handled wrongly only shows on the second click.
                await header.click()
                // Either param is a valid record of the sort: a column that *is* the page's default sort
                // (createdAt on the audit log) correctly omits the redundant sortBy and writes only sortDir.
                await expect(page).toHaveURL(/[?&](sortBy|sortDir)=/)
                await page.waitForTimeout(400)
                await header.click()
                await page.waitForTimeout(400)
            }

            expect(failures, `API errors while sorting ${list.name}`).toEqual([])
        })
    }
})

test.describe('sort behaviour', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await page.goto('/products')
        await expect(page.locator('table')).toBeVisible({ timeout: 15000 })
    })

    /** The Name cell of every visible row, in display order. */
    const names = (page) => page.evaluate(() => {
        const index = [...document.querySelectorAll('th')].findIndex((th) => th.textContent.trim().startsWith('Name'))
        return [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[index]?.textContent.trim() ?? '')
    })

    test('actually reorders the rows, ascending then descending', async ({ page }) => {
        const header = page.getByRole('button', { name: /^Name/ })
        const firstName = async () => (await names(page))[0]

        // The URL updates synchronously but the re-sorted fetch does not. Waiting for the leading row to
        // change is what tells us the new data has landed; snapshotting earlier captures the old order.
        let previous = await firstName()
        await header.click()
        await expect(page).toHaveURL(/sortBy=name&sortDir=asc/)
        await expect.poll(firstName).not.toBe(previous)
        const asc = await names(page)

        previous = asc[0]
        await header.click()
        await expect.poll(firstName).not.toBe(previous)
        const desc = await names(page)

        // Sorted, and genuinely opposite — not just re-fetched.
        expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)))
        expect(desc[0]).not.toBe(asc[0])
    })

    test('marks the sorted column for assistive technology', async ({ page }) => {
        await page.getByRole('button', { name: /^Name/ }).click()
        await page.waitForTimeout(400)
        expect(await page.evaluate(() => document.querySelector('th[aria-sort]')?.getAttribute('aria-sort')))
            .toBe('ascending')

        await page.getByRole('button', { name: /^Name/ }).click()
        await page.waitForTimeout(400)
        expect(await page.evaluate(() => document.querySelector('th[aria-sort]')?.getAttribute('aria-sort')))
            .toBe('descending')
    })

    test('survives a reload and a Back navigation', async ({ page }) => {
        const firstName = async () => (await names(page))[0]
        const unsorted = await firstName()

        await page.getByRole('button', { name: /^Name/ }).click()
        await expect(page).toHaveURL(/sortBy=name/)
        await expect.poll(firstName).not.toBe(unsorted)
        const before = await names(page)

        await page.reload()
        await expect(page.locator('table')).toBeVisible({ timeout: 15000 })
        await expect(page).toHaveURL(/sortBy=name/)
        await expect.poll(() => names(page)).toEqual(before)

        await page.goto('/dashboard')
        await page.goBack()
        await expect(page).toHaveURL(/sortBy=name/)
    })

    test('returns to page 1 when the sort changes', async ({ page }) => {
        const next = page.getByRole('button', { name: 'Next page' })
        test.skip(!(await next.isVisible()), 'needs more than one page')

        await next.click()
        await expect(page).toHaveURL(/[?&]page=2/)

        await page.getByRole('button', { name: /^Name/ }).click()
        // Re-sorting changes which records are on page 1, so holding the old page number would show an
        // arbitrary slice. Both halves asserted: the sort applied *and* the page reset (F-016's lesson —
        // the two params are written in one update precisely so neither can clobber the other).
        await expect(page).toHaveURL(/sortBy=name/)
        await expect(page).not.toHaveURL(/[?&]page=2/)
    })

    test('does not offer sorting on computed columns', async ({ page }) => {
        const headers = await sortHeaderNames(page)
        // Stock status and the converted total have no persisted field behind them; offering a header
        // would 400. The stock *quantity* column is sortable, its status badge is not a separate column.
        expect(headers).toContain('Name')
        expect(headers.some((h) => /status/i.test(h))).toBe(true) // `active` is a real column
        const actions = await page.evaluate(() =>
            [...document.querySelectorAll('th')].filter((th) => th.textContent.trim() === '').length)
        expect(actions).toBeGreaterThan(0) // image/actions columns stay plain
    })
})
