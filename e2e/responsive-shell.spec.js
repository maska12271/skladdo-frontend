import { test, expect } from '@playwright/test'
import { login } from './helpers.js'
import en from '../src/i18n/locales/en.js'

// The app shell across the three device tiers `useBreakpoint` recognises. Below `lg` the sidebar stops
// being a column and becomes a drawer over the page, which is the only way the nav is reachable at all on
// a phone — before this it was `hidden md:flex`, so a narrow viewport had no navigation whatsoever.
const MOBILE = { width: 375, height: 812 }
const TABLET = { width: 768, height: 1024 }
const DESKTOP = { width: 1280, height: 900 }

const drawer = (page) => page.locator('aside[role="dialog"]')
const hamburger = (page) => page.getByRole('button', { name: en.nav.openMenu })
const headerLanguage = (page) => page.locator('header').getByRole('button', { name: en.header.language })

/**
 * Where the drawer's left edge sits relative to the viewport's: 0 once it has slid in, negative while it
 * is parked off-screen. Read as geometry rather than as a class so the assertion survives a change of
 * animation technique.
 */
const drawerX = (page) => drawer(page).evaluate((el) => el.getBoundingClientRect().x)

test.describe('mobile', () => {
    test.use({ viewport: MOBILE })

    test('the nav is reachable through the drawer, and navigating closes it', async ({ page }) => {
        await login(page)

        await expect(hamburger(page)).toBeVisible()
        await expect.poll(() => drawerX(page)).toBeLessThan(0)

        await hamburger(page).click()
        await expect.poll(() => drawerX(page)).toBe(0)

        // The drawer covers the page it is navigating away from, so arriving anywhere must dismiss it —
        // otherwise every click leaves the new page hidden behind the menu that opened it.
        await drawer(page).getByRole('link', { name: en.nav.products }).click()
        await expect(page).toHaveURL(/\/products/)
        await expect.poll(() => drawerX(page)).toBeLessThan(0)
    })

    test('escape and the backdrop both close it', async ({ page }) => {
        await login(page)

        await hamburger(page).click()
        await expect.poll(() => drawerX(page)).toBe(0)
        await page.keyboard.press('Escape')
        await expect.poll(() => drawerX(page)).toBeLessThan(0)

        await hamburger(page).click()
        await expect.poll(() => drawerX(page)).toBe(0)
        // The drawer is capped at 85vw, so the right-hand strip of a 375px screen is backdrop.
        await page.mouse.click(360, 400)
        await expect.poll(() => drawerX(page)).toBeLessThan(0)
    })

    test('language and theme move out of the header and share one drawer row', async ({ page }) => {
        await login(page)

        // Both are set once and rarely revisited, so a phone header is the wrong place to spend width on
        // them. The drawer carries the live copies.
        await expect(headerLanguage(page)).toBeHidden()

        await hamburger(page).click()
        // One picker, not one button per language: a row of buttons cost a whole row of the drawer and
        // would cost two the moment a fourth language ships. The panel is portalled and clamped to the
        // viewport, which is what lets it live at the left of the drawer at all.
        const language = drawer(page).getByRole('button', { name: en.header.language })
        const theme = drawer(page).getByRole('button', { name: new RegExp(en.nav.theme) })
        await expect(language).toBeVisible()
        await expect(theme).toBeVisible()

        // Side by side: same row, and between them no wider than the drawer.
        const [langBox, themeBox] = [await language.boundingBox(), await theme.boundingBox()]
        expect(Math.abs((langBox.y + langBox.height / 2) - (themeBox.y + themeBox.height / 2))).toBeLessThanOrEqual(4)
        expect(themeBox.x).toBeGreaterThan(langBox.x + langBox.width - 1)

        // Every language is still reachable, and the panel opens inside the screen rather than off it.
        await language.click()
        const options = page.getByRole('listbox')
        await expect(options.getByRole('option')).toHaveCount(3)
        const panel = await options.boundingBox()
        expect(panel.x).toBeGreaterThanOrEqual(0)
        expect(panel.x + panel.width).toBeLessThanOrEqual(MOBILE.width)
    })

    test('nothing in the drawer is positioned off the side of the screen', async ({ page }) => {
        await login(page)
        await hamburger(page).click()
        // The drawer is legitimately off-screen while it slides in; measure only once it has landed.
        await expect.poll(() => drawerX(page)).toBe(0)

        const offscreen = await page.evaluate(() => {
            const drawerEl = document.querySelector('aside[role="dialog"]')
            const limit = document.documentElement.clientWidth
            return [...drawerEl.querySelectorAll('button, [role="group"], [role="listbox"]')]
                .filter((el) => {
                    const r = el.getBoundingClientRect()
                    return r.width > 0 && (r.left < 0 || r.right > limit + 1)
                })
                .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30))
        })
        expect(offscreen).toEqual([])
    })

    test('the header fits without scrolling sideways', async ({ page }) => {
        await login(page)

        const overflow = await page.locator('header').evaluate((el) => el.scrollWidth - el.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
    })
})

test.describe('tablet', () => {
    test.use({ viewport: TABLET })

    // A deliberate call, not an oversight: a tablet is a touch device, and a permanent icon rail would
    // depend on hover tooltips it cannot show. It gets the labelled drawer and the full content width.
    test('gets the drawer too', async ({ page }) => {
        await login(page)

        await expect(hamburger(page)).toBeVisible()
        await expect.poll(() => drawerX(page)).toBeLessThan(0)

        await hamburger(page).click()
        await expect.poll(() => drawerX(page)).toBe(0)
    })
})

test.describe('desktop', () => {
    test.use({ viewport: DESKTOP })

    test('keeps the permanent sidebar and the full header', async ({ page }) => {
        await login(page)

        await expect(hamburger(page)).toBeHidden()
        // Not merely hidden — on a desktop the drawer is never built.
        await expect(drawer(page)).toHaveCount(0)
        await expect(page.locator('aside').first()).toBeVisible()
        await expect(headerLanguage(page)).toBeVisible()
    })
})

test('growing to desktop with the drawer open gives the page back its scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)

    await hamburger(page).click()
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    // The lock is held by the open drawer; widening past `lg` retires the drawer, so the lock has to go
    // with it or the desktop layout is left unable to scroll.
    await page.setViewportSize(DESKTOP)
    await expect(drawer(page)).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})
