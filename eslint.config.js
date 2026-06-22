// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const TENANTS = ['karen', 'kikwetu', 'xflora', 'mona', 'tambuzi'];

// For a given tenant, return import patterns it must not touch.
function forbiddenForTenant(tenant) {
  return [
    ...TENANTS.filter((t) => t !== tenant).map((t) => `@/src/tenants/${t}/*`),
    '@/src/composition/*', // composition imports tenants, never the reverse
  ];
}

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*'] },

  // Each tenant package may only import from itself + core.
  ...TENANTS.map((tenant) => ({
    files: [`src/tenants/${tenant}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', { patterns: forbiddenForTenant(tenant) }],
    },
  })),

  // core may never import from tenants/ or composition/.
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@/src/tenants/*', '@/src/composition/*'],
      }],
    },
  },
]);
