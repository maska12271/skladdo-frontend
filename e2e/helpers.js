import { expect } from '@playwright/test'

// The seeded demo owner. Documented in testing/README.md.
export const OWNER = { email: 'owner@demo.com', password: 'owner123' }

/** Signs in and waits for the app shell to be up. */
export async function login(page, user = OWNER) {
    await page.goto('/login')
    await page.locator('#login-email').fill(user.email)
    await page.locator('#login-password').fill(user.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/(dashboard|products|connections)/, { timeout: 15000 })
}

/** The current theme as the app records it: the class on <html> and the persisted preference. */
export async function readTheme(page) {
    return page.evaluate(() => ({
        htmlClass: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        stored: localStorage.getItem('theme'),
    }))
}
