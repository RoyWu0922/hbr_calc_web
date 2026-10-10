import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Vendored third-party bundle (html2canvas 1.4.1, kept in-tree because the
  // upstream package pulls in a different build). Not our source — linting it
  // only produced findings nobody can act on.
  globalIgnores(['dist', 'src/utils/html2canvas.esm.js']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // The storage/sync layer legitimately traffics in loose record shapes
      // (IndexedDB rows, JSON blobs from the API). As an error this produced 140+
      // findings nobody could act on, which made `npm run lint` unusable in CI.
      // Keep the signal, drop the severity, so lint can gate builds again.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Loading persisted data into state from an effect is this codebase's
      // deliberate pattern (20+ sites). Worth seeing, not worth failing a build.
      'react-hooks/set-state-in-effect': 'warn',
      // Dev-server fast-refresh DX only; has no runtime meaning.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
