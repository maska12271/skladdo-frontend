import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

/** Runs a git command, or returns null where git cannot answer - see the note on `build` below. */
function git(command) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null
  } catch {
    return null
  }
}

// The commit the bundle was built from.
const commit = process.env.APP_COMMIT || git('git rev-parse --short HEAD') || 'unknown'

/**
 * The build number, which is the patch half of the displayed version.
 *
 * Counted commits, not a number anybody edits: every merge to master deploys, so every deploy has to
 * come out with a version that differs from the last one, and a hand-bumped file only gets bumped when
 * somebody remembers. package.json keeps the major and minor - those still say something a human
 * decided - and this supplies the rest.
 *
 * Passed in as `APP_BUILD_NUMBER` by the deploy job, because the production build runs inside a
 * `node:20-alpine` container over a mounted checkout and that image has no git in it. (That is also why
 * the commit was reading as "unknown" in production before this.) The git fallback covers a local build;
 * `0` covers a shallow CI checkout, whose bundle is never deployed.
 */
const build = process.env.APP_BUILD_NUMBER || git('git rev-list --count HEAD') || '0'

// Major and minor stay a deliberate choice in package.json; the patch is the build number.
const version = `${pkg.version.split('.').slice(0, 2).join('.')}.${build}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Baked in at build time so a deployed bundle can say which one it is - the whole point being that
  // "did my deploy actually land?" is answerable by looking at the app rather than at the server.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    // Node environment by default: the suite currently covers pure logic (spreadsheet import/export,
    // formatting) which needs no DOM. Component tests will need `environment: 'jsdom'` and jsdom
    // installed — switch it per-file with a `// @vitest-environment jsdom` docblock rather than
    // paying for a DOM in every test.
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    // Installs a `matchMedia` jsdom does not provide. Harmless in the node environment, where it finds
    // no `window` and does nothing.
    setupFiles: ['./vitest.setup.js'],
  },
})