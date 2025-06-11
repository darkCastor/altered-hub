import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		alias: {
			$components: 'src/components',
			$engine: 'src/engine',
			$types: 'src/types',
			$data: 'src/data',
			$lib: 'src/lib',
			$ai: 'src/ai'
		}
	}
};

export default config;