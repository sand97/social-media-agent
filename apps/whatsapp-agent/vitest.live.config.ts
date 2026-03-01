import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['_TESTS_/**/*.test.ts'],
    setupFiles: ['_TESTS_/setup-live.ts'],
    reporters: 'default',
    testTimeout: 180000,
  },
});
