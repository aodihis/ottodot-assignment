import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Required for `<script lang="ts">` in a component: without it the TypeScript in
// a `.svelte` file is a syntax error.
export default { preprocess: vitePreprocess() };
