import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path'; // Import path
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			manifest: {
				name: 'AlterDeck',
				short_name: 'AlterDeck',
				description: 'Play, create decks, and look cards online and offline for Altered TCG.',
				start_url: '/',
				display: 'standalone',
				background_color: '#262033',
				theme_color: '#9F5AFF',
				icons: [
					{
						src: '/icon-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any maskable'
					},
					{ src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				runtimeCaching: [
					{
						handler: 'CacheFirst',
						urlPattern: ({ request }) => request.destination === 'font',
						options: {
							cacheName: 'google-fonts',
							expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1 year
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					{
						handler: 'CacheFirst',
						urlPattern: ({ request }) => request.destination === 'image',
						options: {
							cacheName: 'images',
							expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
							cacheableResponse: { statuses: [0, 200] }
						}
					}
				]
			}
		})
	],
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
		},
	},
	server: {
		port: 9002
	}
});
