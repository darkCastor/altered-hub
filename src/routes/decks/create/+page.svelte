<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to cards page with create action
	onMount(() => {
		goto('/cards?action=create');
	});
</script>

<svelte:head>
	<title>Create Deck - AlterDeck</title>
</svelte:head>

<div class="flex min-h-[50vh] items-center justify-center">
	<div class="text-center">
		<h1 class="mb-2 text-2xl font-semibold">Redirecting to Card Viewer...</h1>
		<p class="text-muted-foreground">You'll be able to create your deck there.</p>
	</div>
</div>
