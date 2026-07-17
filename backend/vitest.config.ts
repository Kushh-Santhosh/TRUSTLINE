import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run TypeScript test files in src/ — exclude compiled dist/ artifacts
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
  },
});
