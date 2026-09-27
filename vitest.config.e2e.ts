import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The same single Oracle container as the integration suite.
    globalSetup: ['./test/oracle/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 60_000,
    teardownTimeout: 60_000,
  },
});
