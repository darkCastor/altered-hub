<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Header from '$components/layout/Header.svelte';
	import Footer from '$components/layout/Footer.svelte';

	onMount(() => {
		console.log('Layout mounted successfully!');
	});
</script>

<svelte:head>
	<title>Altered TCG - Digital Card Game</title>
	<meta name="description" content="Altered TCG - Digital card game and deck builder" />
	<meta name="theme-color" content="#09090b" />
</svelte:head>

<div class="bg-background min-h-screen font-sans antialiased">
	<Header />
	<main class="flex-1">
		<slot />
	</main>
	<Footer />
</div>

<style>
	:global(html) {
		color-scheme: light dark;
	}
</style>
