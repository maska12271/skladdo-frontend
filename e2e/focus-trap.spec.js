import { test, expect } from '@playwright/test'
import { login } from './helpers.js'

// Real browser Tab handling. The jsdom Modal tests assert the handler's own focus moves, but they cannot
// prove the browser doesn't move focus somewhere else first — userEvent's emulation ignores the
// preventDefault the trap relies on. Only a real browser settles that, so this spec is the one that
// actually establishes the modal keyboard contract.
test.describe('modal keyboard behaviour', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await page.goto('/products')
        await page.getByRole('button', { name: 'Add product' }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
    })

    test('moves focus into the dialog when it opens', async ({ page }) => {
        const focusInside = await page.evaluate(() =>
            document.querySelector('[role="dialog"]').contains(document.activeElement)
        )
        expect(focusInside).toBe(true)
    })

    test('Tab never escapes the dialog', async ({ page }) => {
        // Walk further than the dialog has focusable elements; every stop must still be inside it.
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Tab')
            const inside = await page.evaluate(() =>
                document.querySelector('[role="dialog"]').contains(document.activeElement)
            )
            expect(inside, `focus left the dialog after ${i + 1} Tab presses`).toBe(true)
        }
    })

    test('Shift+Tab never escapes the dialog', async ({ page }) => {
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Shift+Tab')
            const inside = await page.evaluate(() =>
                document.querySelector('[role="dialog"]').contains(document.activeElement)
            )
            expect(inside, `focus left the dialog after ${i + 1} Shift+Tab presses`).toBe(true)
        }
    })

    test('Escape closes the dialog', async ({ page }) => {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
    })

    test('returns focus to the trigger after closing', async ({ page }) => {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()

        const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim())
        expect(focusedText).toBe('Add product')
    })

    test('locks background scrolling while open and restores it after', async ({ page }) => {
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
        expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    })
})
