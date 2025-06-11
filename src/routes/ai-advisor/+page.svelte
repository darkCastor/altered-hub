<script lang="ts">
	import DeckAdvisorClient from '$components/ai/DeckAdvisorClient.svelte';
</script>

<svelte:head>
	<title>AI Deck Advisor - AlterDeck</title>
	<meta name="description" content="Leverage AI to get expert advice on completing your Altered TCG decks" />
</svelte:head>

<div class="space-y-8">
	<section class="text-center">
		<h1 class="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">
			AI Deck Advisor
		</h1>
		<p class="mt-4 text-lg text-muted-foreground">
			Leverage AI to get expert advice on completing your Altered TCG decks.
		</p>
	</section>
	<DeckAdvisorClient />
</div>