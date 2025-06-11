import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		alias: {
			$components: 'src/components',
			$engine: 'src/engine',
			$types: 'src/types',
			$data: 'src/data',
			$lib: 'src/lib'
		}
	}
};

export default config;