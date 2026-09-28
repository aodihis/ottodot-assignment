import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv } from 'vite';

/**
 * The port the browser opens and the address the proxy forwards to both come
 * from `web/.env` — see `.env.example`. Nothing here is baked in.
 *
 * `loadEnv`'s third argument is `''` rather than the usual `'VITE_'`: these are
 * read by Vite itself and never shipped to the browser, so they have no reason to
 * carry the prefix that would put them in the bundle.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');

  const port = Number(env.WEB_PORT ?? 4173);
  const apiTarget = env.API_TARGET ?? 'http://127.0.0.1:3000';
  const apiBase = env.VITE_API_BASE ?? '/api';

  return {
    plugins: [svelte()],
    server: {
      // Pinned to IPv4 rather than the default `localhost`, which binds both
      // stacks and can be refused on `::1` on Windows.
      host: '127.0.0.1',
      port,
      // The proxy is what makes the dev server's origin the API's origin, so the
      // session cookie works with no CORS middleware. It only applies while
      // `VITE_API_BASE` is a path on this origin: a full URL there means the
      // browser calls the API directly, and then CORS and the cookie both need
      // attention (see the deployment note in CLAUDE.md).
      proxy: apiBase.startsWith('/') ? { [apiBase]: { target: apiTarget } } : undefined,
    },
  };
});
