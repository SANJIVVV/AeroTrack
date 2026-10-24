import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/coverage/**', 'ml/**', 'client/vendor/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['client/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['client/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['client/js/theme-init.js', 'client/js/config.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['**/*.test.js', '**/tests/**/*.js', 'client/test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
