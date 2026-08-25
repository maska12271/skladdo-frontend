import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      // Replaced at build time by vite's `define`, so they exist in the bundle but not in any lib.
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly', __APP_BUILT_AT__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
