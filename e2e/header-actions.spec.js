import { test, expect } from '@playwright/test'
import { login } from './helpers.js'
import en from '../src/i18n/locales/en.js'
import et from '../src/i18n/locales/et.js'
import ru from '../src/i18n/locales/ru.js'

// Reported on the product detail page in Russian: the header buttons wrapped onto a second line, and that
// line then sat against the LEFT edge of the header instead of staying under the first. Both halves are
// locale-driven — et/ru labels run 40-70% wider than en — so both are pinned here, in all three languages.
//
// The list pages had a worse version of the same thing through the shared PageHeader, whose action row was
// shrink-0: it could neither shrink nor wrap, so at tablet widths it overflowed the card entirely while
// squeezing the page title down to nothing. That is the `overflow`/`titleW` assertion below.
const LOCALES = { en, et, ru }

const label = (locale, key) => key.split('.').reduce((a, p) => a[p], LOCALES[locale])

/** The page header: the card that holds the h1. */
// Scoped to main: the sidebar brand sits outside it, so `h1` here is unambiguously the page title.
const headerCard = (page) => page.locator('main div.rounded-2xl').filter({ has: page.locator('h1') }).first()

/**
 * Geometry of the header's action row, grouped into the lines it actually renders on. Buttons are read out
 * of the last child of the header card, which is the action container on both the shared PageHeader and
 * the hand-rolled detail-page headers.
 */
async function actionRow(page) {
    return headerCard(page).evaluate((card) => {
        const container = card.lastElementChild
        const containerRect = container.getBoundingClientRect()
        const buttons = [...container.querySelectorAll('button, a')]
            .map((el) => ({ text: el.textContent.trim(), r: el.getBoundingClientRect() }))
            .filter((b) => b.r.width > 0 && b.r.height > 0)

        // Grouped by vertical centre, not by top: the row is items-center, so buttons of different heights
        // sit on one line with different tops.
        const rows = []
        for (const b of buttons.sort((x, y) => (x.r.top + x.r.height / 2) - (y.r.top + y.r.height / 2))) {
            const centre = b.r.top + b.r.height / 2
            const row = rows.find((l) => Math.abs(l.centre - centre) <= 8)
            if (row) row.items.push(b)
            else rows.push({ centre, items: [b] })
        }

        return {
            labels: buttons.map((b) => b.text),
            // Positive means the action row spills out past the card's right edge.
            overflow: Math.round(containerRect.right - card.getBoundingClientRect().right),
            titleWidth: Math.round(card.querySelector('h1').getBoundingClientRect().width),
            lines: rows.map((l) => ({
                texts: l.items.map((b) => b.text),
                // How far this line's last button stops short of the container's right edge.
                gapToRight: Math.round(containerRect.right - Math.max(...l.items.map((b) => b.r.right))),
            })),
        }
    })
}

/** Signs in, switches the UI language and opens the first product's detail page. */
async function firstProductDetail(page, locale) {
    await login(page)
    await page.evaluate((l) => localStorage.setItem('lang', l), locale)
    await page.goto('/products')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 })
    // The list settles into its final rows over a couple of fetches; a click landing on a row that is
    // about to be replaced is swallowed, so wait for quiet and retry rather than assume the first hit.
    await page.waitForLoadState('networkidle')
    await expect(async () => {
        // Second cell: the first is the selection checkbox, which would not navigate.
        await page.locator('tbody tr td').nth(1).click()
        await expect(page).toHaveURL(/\/products\/\d+/, { timeout: 5000 })
    }).toPass({ timeout: 30000 })
    // The detail page fans out into half a dozen requests before it renders its title.
    await expect(page.locator('main h1')).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(600)
}

test.describe('product detail header actions', () => {
    for (const locale of Object.keys(LOCALES)) {
        test(`fit on one line at 1280px in ${locale}`, async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 900 })
            await firstProductDetail(page, locale)

            const row = await actionRow(page)
            expect(row.labels, 'header shows the two primary actions').toEqual(
                expect.arrayContaining([label(locale, 'inventory.addStock'), label(locale, 'productDetail.edit')]),
            )
            expect(row.lines, `wrapped: ${JSON.stringify(row.lines)}`).toHaveLength(1)
            expect(row.lines[0].gapToRight).toBeLessThanOrEqual(2)
        })
    }

    test('the actions moved into the overflow menu are still reachable, and fit it (ru)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await firstProductDetail(page, 'ru')

        await headerCard(page).getByRole('button', { name: label('ru', 'common.actions') }).click()
        const menu = page.getByRole('menu')
        // Adjust stock is always offered; transfer only when the product has warehouse stock, so it is
        // not asserted here — and it is the shorter of the two labels anyway.
        await expect(menu.getByText(label('ru', 'inventory.adjustStock'))).toBeVisible()

        // Every item on one line: the menu has a fixed width, and Russian labels are what pushed past it.
        const wrapped = await menu.evaluate((el) =>
            [...el.querySelectorAll('span')].filter((s) => s.getBoundingClientRect().height > 24).map((s) => s.textContent))
        expect(wrapped).toEqual([])
    })

    test('stays right-aligned on every line when the width forces a wrap (ru)', async ({ page }) => {
        // 1024 is still the side-by-side layout, but too narrow for the row — the situation reported.
        await page.setViewportSize({ width: 1024, height: 900 })
        await firstProductDetail(page, 'ru')

        const row = await actionRow(page)
        expect(row.lines.length).toBeGreaterThan(1)
        for (const line of row.lines) {
            expect(line.gapToRight, `line ${JSON.stringify(line.texts)} is not flush right`).toBeLessThanOrEqual(2)
        }
    })
})

test.describe('list page header actions', () => {
    // Products carries the most header buttons of any list, so it is the first to run out of room.
    for (const width of [1440, 1280, 1100, 1024]) {
        test(`stay inside the card and flush right at ${width}px (ru)`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 })
            await login(page)
            await page.evaluate(() => localStorage.setItem('lang', 'ru'))
            await page.goto('/products')
            await expect(page.locator('main h1')).toBeVisible()
            await page.waitForTimeout(600)

            const row = await actionRow(page)
            expect(row.labels.length).toBeGreaterThan(2)
            expect(row.overflow, 'action row spills out of the header card').toBeLessThanOrEqual(0)
            expect(row.titleWidth, 'page title squeezed away').toBeGreaterThanOrEqual(150)
            for (const line of row.lines) {
                expect(line.gapToRight, `line ${JSON.stringify(line.texts)} is not flush right`).toBeLessThanOrEqual(2)
            }
        })
    }
})
