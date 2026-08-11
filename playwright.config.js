import { defineConfig, devices } from '@playwright/test'

// Both dev servers are expected to be running already (backend :8080, frontend :5173) — the same way the
// manual pass works. Playwright deliberately does not start them: the backend holds a lock on the shared
// H2 file, so a runner that started and stopped it would fight with the app the tester has open.
export default defineConfig({
    testDir: './e2e',
    // These specs share one dev backend and one seeded database, so they must not race each other.
    fullyParallel: false,
    workers: 1,
    reporter: process.env.CI ? 'line' : [['list']],
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
})
