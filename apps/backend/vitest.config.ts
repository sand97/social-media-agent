import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['test/agent-real/**/*.test.ts'],
    setupFiles: ['test/setup-agent-real.ts'],
    reporters: 'default',
  },
});
