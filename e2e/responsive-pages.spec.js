import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// The whole-app sweep: no page may scroll sideways at phone width, and nothing may be pushed out of the
// viewport with no way to reach it. Kept as a standing test rather than a one-off pass, because this is
// the property that quietly rots — a new column, a longer label or one un-prefixed `grid-cols-2` breaks
// it on a screen nobody develops on.
test.setTimeout(240000)

// Swept at all three tiers, not just the phone. The phone is where breakage was expected; the tablet and
// desktop runs are what actually substantiate "no desktop regressions", which is otherwise a claim rather
// than a measurement — every touch-sizing and card-view rule added in E0-E4 is scoped by a breakpoint,
// and a mis-scoped one shows up here.
const VIEWPORTS = [
    { name: 'phone', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 900 },
]

const LIST_PAGES = [
    '/dashboard', '/products', '/services', '/sales-orders', '/purchase-orders', '/warehouses', '/manufacturers',
    '/clients', '/tenders', '/emails', '/users', '/audit-log', '/settings', '/account',
]

// Detail pages are reached by opening the first record, so no seeded ids are baked into the test.
const DETAIL_FROM = ['/products', '/services', '/sales-orders', '/purchase-orders', '/clients', '/manufacturers', '/tenders', '/warehouses']

/**
 * Elements painted past the right edge with no scrollable ancestor to bring them back.
 *
 * The scrollable-ancestor walk is the whole point: a wide table inside `overflow-x-auto` is a deliberate
 * choice, not a defect. It also measures the *painted* box — an inline element inside a `truncate` parent
 * reports its full unclipped layout width while nothing of it is actually visible, which would otherwise
 * report false failures.
 */
const clippedOutOfReach = (page) => page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    const bad = []
    for (const el of document.querySelectorAll('main *')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.right <= limit + 1) continue

        let clippedByAncestor = false
        let scrollable = false
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const style = getComputedStyle(p)
            const box = p.getBoundingClientRect()
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
                if (p.scrollWidth > p.clientWidth + 1) { scrollable = true; break }
            }
            // Hidden and already inside the viewport: nothing of this element is painted out there.
            if (style.overflowX === 'hidden' && box.right <= limit + 1) { clippedByAncestor = true; break }
        }
        if (!scrollable && !clippedByAncestor) {
            bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 50)} @${Math.round(rect.right)}`)
        }
    }
    return bad.slice(0, 5)
})

const docOverflow = (page) => page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth - de.clientWidth
})

/**
 * That the page rendered at all.
 *
 * Checked alongside the overflow, because a page that has crashed into the error boundary trivially
 * passes every geometry assertion — it has no geometry. An earlier version of this sweep reported the
 * sales order detail page as clean while it was in fact rendering nothing.
 */
const renderFailure = async (page) => {
    const state = await page.evaluate(() => {
        const main = document.querySelector('main')
        return { hasMain: !!main, length: main ? main.innerText.trim().length : 0 }
    })
    if (!state.hasMain) return 'no <main> — the page did not render'
    if (state.length < 20) return `<main> is effectively empty (${state.length} chars)`
    return null
}

/**
 * Opens the first record of a list, whichever shape the list is in: cards below `md`, a table above it.
 * Written this way so the same sweep can walk detail pages at every tier.
 */
async function openFirstRecord(page) {
    const card = page.locator('dl').first()
    if (await card.count() > 0) { await card.click(); return true }
    const row = page.locator('tbody tr').first()
    if (await row.count() > 0) { await row.click(); return true }
    return false
}

for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } })

        test('no list or settings page scrolls sideways', async ({ page }) => {
            await login(page)
            const failures = {}

            for (const path of LIST_PAGES) {
                await page.goto(path)
                await page.waitForTimeout(1200)
                const [overflow, clipped, blank] = [await docOverflow(page), await clippedOutOfReach(page), await renderFailure(page)]
                if (overflow > 0 || clipped.length || blank) failures[path] = { overflow, clipped, blank }
            }

            expect(failures).toEqual({})
        })

        test('no detail page scrolls sideways', async ({ page }) => {
            await login(page)
            const failures = {}

            for (const list of DETAIL_FROM) {
                await page.goto(list)
                await page.waitForTimeout(1200)
                if (!await openFirstRecord(page)) continue // nothing seeded for this list
                await page.waitForTimeout(1500)

                const [overflow, clipped, blank] = [await docOverflow(page), await clippedOutOfReach(page), await renderFailure(page)]
                if (overflow > 0 || clipped.length || blank) failures[page.url()] = { overflow, clipped, blank }
            }

            expect(failures).toEqual({})
        })
    })
}

test.use({ viewport: { width: 375, height: 812 } })

test('the product fact list stacks rather than halving a 300px card', async ({ page }) => {
    await login(page)
    await page.goto('/products')
    await page.waitForTimeout(1200)
    await page.locator('dl').first().click()
    await page.waitForTimeout(1500)

    const columns = await page.evaluate(() => {
        const dl = [...document.querySelectorAll('main dl')].find((d) => getComputedStyle(d).display === 'grid')
        return dl ? getComputedStyle(dl).gridTemplateColumns.split(' ').length : 0
    })
    expect(columns).toBe(1)
})

test('the receivables tiles get a readable width instead of three 92px columns', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard')
    await page.waitForTimeout(2500)

    const tile = await page.evaluate(() => {
        const grid = [...document.querySelectorAll('main div')]
            .find((d) => (d.className || '').toString().includes('min-w-[260px]'))
        if (!grid) return null
        return Math.round(grid.firstElementChild.getBoundingClientRect().width)
    })

    // The dashboard is user-arrangeable, so the widget is not guaranteed to be on it.
    test.skip(tile === null, 'receivables widget is not on this dashboard layout')
    // A money value plus a label and a count needs more than a third of a phone.
    expect(tile).toBeGreaterThan(140)
})
