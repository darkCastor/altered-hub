<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	// Get deck ID from URL parameters
	$: deckId = $page.params.deckId;

	// Redirect to cards page with edit action
	onMount(() => {
		if (deckId) {
			goto(`/cards?action=edit&deckId=${deckId}`);
		} else {
			goto('/decks');
		}
	});
</script>

<svelte:head>
	<title>Edit Deck - AlterDeck</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[50vh]">
	<div class="text-center">
		<h1 class="text-2xl font-semibold mb-2">Redirecting to Card Viewer...</h1>
		<p class="text-muted-foreground">You'll be able to edit your deck there.</p>
	</div>
</div>