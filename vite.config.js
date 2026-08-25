import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// The commit the bundle was built from. Best-effort: a production build runs inside a container over a
// mounted checkout and may not have git at all, in which case the version alone still identifies it.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
})()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Baked in at build time so a deployed bundle can say which one it is - the whole point being that
  // "did my deploy actually land?" is answerable by looking at the app rather than at the server.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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