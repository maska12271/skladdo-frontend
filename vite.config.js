import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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