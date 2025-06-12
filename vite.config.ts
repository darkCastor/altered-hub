import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path'; // Import path

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['**/*.{test,spec}.{js,ts}'],
		globals: true, // Optional: to use vi, expect etc. globally
		environment: 'jsdom', // Optional: if you need DOM for some server tests, though typically not
		// setupFiles: ['./tests/unit/setup.ts'], // If you have a setup file
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
		},
	},
	server: {
		port: 9002
	}
});
