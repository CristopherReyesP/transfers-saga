import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.int-spec.ts'],
    // One Oracle container for the whole run, shared by every spec file.
    globalSetup: ['./test/oracle/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 60_000,
    teardownTimeout: 60_000,
  },
});
