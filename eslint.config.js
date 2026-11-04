// ESLint flat config: TypeScript, React hook rules, and no-unsanitized against unsafe DOM sinks
// (feed HTML is untrusted: it may only reach the DOM through DOMPurify, see src/services/rss/sanitizer.ts)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nounsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', '.cache', '.superpowers', '.remember'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nounsanitized.configs.recommended,
  {
    rules: {
      // Parsed JSON from feeds, APIs and backups is typed `any` on purpose until a decoder has validated it
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // DOMPurify output is the one sanctioned way to put HTML into the DOM
      'no-unsanitized/property': ['error', { escape: { methods: ['DOMPurify.sanitize'] } }],
      'no-unsanitized/method': ['error', { escape: { methods: ['DOMPurify.sanitize'] } }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Tests build DOM fixtures from literal markup
    files: ['src/**/*.test.ts'],
    rules: { 'no-unsanitized/property': 'off', 'no-unsanitized/method': 'off' },
  },
  {
    files: ['scripts/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
