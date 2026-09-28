import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  // Required, not a nicety: svelte's "." export maps `default` to its *server*
  // build and `browser` to its client build, and Vitest's node pipeline would
  // otherwise resolve the server one — where `mount()` throws.
  //
  // This file is separate from vite.config.ts on purpose, so the setting never
  // reaches the dev server or the production build.
  resolve: { conditions: ['browser'] },
  test: {
    include: ['tests/**/*.test.ts'],
    // Components need a DOM; the pure-logic files opt out with a
    // `// @vitest-environment node` docblock on their first line.
    environment: 'jsdom',
  },
});
