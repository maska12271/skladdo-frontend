import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// Touch target sizing. Every standalone control has to be reachable with a fingertip on the devices the
// card view exists for — WCAG 2.5.5's 44x44 is the bar, and controls sized for a mouse land well under it
// (the row checkboxes were 16x16, the action menus 36x36).
//
// Sizes are restored to their original values at `lg`, so this is checked below that and the desktop
// layout is left exactly as it was. Tablets are included deliberately: 768 is a touch screen too, and it
// is where the table view (with its small header controls) comes back.
const TOUCH_VIEWPORTS = [
    { name: 'phone', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
]

const PAGES = ['/products', '/sales-orders', '/dashboard', '/warehouses', '/settings', '/users']

/**
 * Standalone controls smaller than 44x44.
 *
 * Inline links inside prose are excluded — the guidance exempts them, and enforcing it on them would mean
 * line-height gymnastics in body copy. A checkbox is measured by its `<label>` where it has one: the label
 * is what a finger actually hits, so a 16px box inside a 44px label is fine and is the pattern used.
 */
const undersizedControls = (page) => page.evaluate(() => {
    const found = []
    for (const el of document.querySelectorAll('button, select, input[type=checkbox], [role="button"]')) {
        let rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue

        const label = el.closest('label')
        if (label) {
            const labelRect = label.getBoundingClientRect()
            if (labelRect.width >= rect.width) rect = labelRect
        }
        if (rect.width >= 44 && rect.height >= 44) continue

        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)
        found.push(`${Math.round(rect.width)}x${Math.round(rect.height)} <${el.tagName.toLowerCase()}> "${name}"`)
    }
    return [...new Set(found)]
})

for (const viewport of TOUCH_VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } })

        test('every control is at least 44x44', async ({ page }) => {
            await login(page)
            const failures = {}

            for (const path of PAGES) {
                await page.goto(path)
                await page.waitForTimeout(1200)
                const undersized = await undersizedControls(page)
                if (undersized.length) failures[path] = undersized
            }

            expect(failures).toEqual({})
        })
    })
}

test.describe('desktop is left alone', () => {
    test.use({ viewport: { width: 1280, height: 900 } })

    test('controls keep their original compact sizing at lg', async ({ page }) => {
        await login(page)
        await page.goto('/products')
        await expect(page.getByText(/Showing/)).toBeVisible()

        // The row action menu is the clearest witness: 36px here, 44 below `lg`. If this ever reads 44,
        // a touch-sizing rule has leaked into the desktop layout.
        const actionMenu = await page.getByRole('button', { name: 'Actions' }).first().boundingBox()
        expect(Math.round(actionMenu.height)).toBe(36)
    })
})
