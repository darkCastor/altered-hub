<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { mode, setMode } from 'mode-watcher';
	import Header from '$components/layout/Header.svelte';
	import Footer from '$components/layout/Footer.svelte';
	import { Toaster } from 'svelte-sonner';

	onMount(() => {
		// Initialize dark mode based on system preference
		if (typeof window !== 'undefined') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			setMode(prefersDark ? 'dark' : 'light');
		}
	});
</script>

<svelte:head>
	<title>Altered TCG - Digital Card Game</title>
	<meta name="description" content="Altered TCG - Digital card game and deck builder" />
	<meta name="theme-color" content="#09090b" />
</svelte:head>

<div class="min-h-screen bg-background font-sans antialiased">
	<Header />
	<main class="flex-1">
		<slot />
	</main>
	<Footer />
</div>

<Toaster />

<style>
	:global(html) {
		color-scheme: light dark;
	}
</style>