import { test, expect } from '@playwright/test'
import { login, OWNER } from './helpers.js'
import en from '../src/i18n/locales/en.js'

// The three items earlier stages deferred into Stage 11 that need a browser, plus the locale leak scan.
const WAREHOUSE = { email: 'owner@balticlogistics.ee', password: 'logistics123' }

// Top-level namespaces in en.js. Used to recognise an i18next key that leaked to the screen: when a key
// is missing, i18next renders the key itself, which looks like "products.form.skuLabel". Matching only
// against real namespaces avoids flagging domain names and SKUs, which have the same shape.
const NAMESPACES = new Set(Object.keys(en))

/** Visible text on the page that looks like an untranslated i18next key. */
async function leakedKeys(page) {
    return page.evaluate((namespaces) => {
        const out = new Set()
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = n.textContent.trim()
            if (!text || text.includes(' ') || text.includes('@') || text.includes('/')) continue
            if (!/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(text)) continue
            if (namespaces.includes(text.split('.')[0])) out.add(text)
        }
        return [...out]
    }, [...NAMESPACES])
}

// A warehouse account logs straight into its first client, so it starts in a partner session where
// /settings is not its own. The sidebar's "own company settings" link switches back first — that is the
// only route a real user has, so it is the one under test.
async function ownCompanySettings(page) {
    await login(page, WAREHOUSE)
    await page.getByRole('link', { name: 'Settings' }).first().click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible()
}

/** The settings tab strip, by its button labels. */
async function tabLabels(page) {
    const known = ['General', 'Company', 'Connected companies', 'Taxes', 'Invoicing', 'Email', 'Defaults', 'Plan & Billing']
    const labels = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()))
    return known.filter((k) => labels.includes(k))
}

test.describe('warehouse account settings tabs', () => {
    test('shows only the four tabs that apply to a warehouse account', async ({ page }) => {
        await ownCompanySettings(page)
        // A warehouse account runs no company of its own: tax rates, invoicing and outbound email are all
        // about selling goods, and the default-permission template governs nothing for it.
        expect(await tabLabels(page)).toEqual(['General', 'Company', 'Connected companies', 'Plan & Billing'])
    })

    test('falls back to General when a trimmed tab is requested by URL', async ({ page }) => {
        await ownCompanySettings(page)
        await page.goto('/settings?tab=taxes')
        await page.waitForTimeout(800)

        // The tab list is filtered before the requested key is matched, so an out-of-set key cannot
        // render a tab this account has no business seeing.
        expect(await tabLabels(page)).toEqual(['General', 'Company', 'Connected companies', 'Plan & Billing'])
        await expect(page.getByRole('button', { name: 'Taxes' })).toBeHidden()
    })

    test('a business account still sees the full tab set', async ({ page }) => {
        await login(page, OWNER)
        await page.goto('/settings')
        await expect(page.getByRole('button', { name: 'General' })).toBeVisible()
        expect(await tabLabels(page)).toHaveLength(8)
    })
})

test.describe('locale parity on screen', () => {
    for (const lang of ['en', 'et', 'ru']) {
        test(`no untranslated keys leak on the main pages in ${lang}`, async ({ page }) => {
            await login(page)
            await page.evaluate((l) => localStorage.setItem('lang', l), lang)

            const found = {}
            for (const path of ['/dashboard', '/products', '/sales-orders', '/tenders', '/settings']) {
                await page.goto(path)
                await page.waitForTimeout(1200)
                const leaks = await leakedKeys(page)
                if (leaks.length) found[path] = leaks
            }
            expect(found).toEqual({})
        })
    }
})

test.describe('stored HTML email body (V-001)', () => {
    test('renders inside a fully restrictive sandboxed iframe', async ({ page }) => {
        await login(page)
        await page.goto('/emails')
        // /emails lists batches; an individual email's detail modal lives on the batch page.
        await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 })
        await page.locator('tbody tr').first().click()

        await expect(page).toHaveURL(/\/emails\/[\w-]+/)
        await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 })
        await page.locator('tbody tr').first().click()

        const frame = page.locator('iframe')
        await expect(frame.first()).toBeVisible({ timeout: 10000 })

        // The body is tenant-authored HTML. sandbox="" is the maximally restrictive value: no scripts,
        // no same-origin, no forms, no top-level navigation. This is what makes storing raw HTML safe.
        await expect(frame.first()).toHaveAttribute('sandbox', '')
        const usesSrcdoc = await frame.first().evaluate((el) => el.hasAttribute('srcdoc') && !el.src)
        expect(usesSrcdoc).toBe(true)
    })

    test('a script in a sandboxed srcdoc iframe cannot run', async ({ page }) => {
        await login(page)
        // Proves the sandbox value itself does what the app relies on, without needing a stored email
        // that happens to contain a script.
        const escaped = await page.evaluate(async () => {
            const iframe = document.createElement('iframe')
            iframe.sandbox = ''
            iframe.srcdoc = '<script>window.parent.__xss = true<\/script>hello'
            document.body.appendChild(iframe)
            await new Promise((r) => setTimeout(r, 600))
            const leaked = window.__xss === true
            iframe.remove()
            return leaked
        })
        expect(escaped).toBe(false)
    })
})
