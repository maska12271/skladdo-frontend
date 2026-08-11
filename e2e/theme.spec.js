import { test, expect } from '@playwright/test'
import { login, readTheme } from './helpers.js'

// Theme is one of the few things that genuinely cannot be checked outside a browser: it is a class on
// <html>, a localStorage entry, and a media query, and the interesting case is whether it survives a real
// reload without flashing the wrong theme first.
test.describe('theme', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
    })

    test('toggles between light and dark and records both places', async ({ page }) => {
        const before = await readTheme(page)

        await page.getByRole('button', { name: /switch to (light|dark)/i }).click()

        const after = await readTheme(page)
        expect(after.htmlClass).not.toBe(before.htmlClass)
        // The class drives the styling and the stored value drives the next page load; they must agree.
        expect(after.stored).toBe(after.htmlClass)
    })

    test('survives a full page reload', async ({ page }) => {
        await page.getByRole('button', { name: /switch to (light|dark)/i }).click()
        const chosen = await readTheme(page)

        await page.reload()
        await expect(page.getByRole('button', { name: /switch to (light|dark)/i })).toBeVisible()

        const afterReload = await readTheme(page)
        expect(afterReload.htmlClass).toBe(chosen.htmlClass)
        expect(afterReload.stored).toBe(chosen.stored)
    })

    test('applies dark styling to the page surface, not just the html class', async ({ page }) => {
        // Guards against the class being set while the Tailwind dark: variants no longer resolve.
        await page.evaluate(() => localStorage.setItem('theme', 'light'))
        await page.reload()
        const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

        await page.evaluate(() => localStorage.setItem('theme', 'dark'))
        await page.reload()
        const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

        expect(darkBg).not.toBe(lightBg)
    })

    test('honours a stored preference over the OS setting', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' })
        await page.evaluate(() => localStorage.setItem('theme', 'light'))
        await page.reload()

        // An explicit choice must win: the OS preference is only the initial default.
        expect((await readTheme(page)).htmlClass).toBe('light')
    })
})
