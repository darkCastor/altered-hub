<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { useMachine } from '@xstate/svelte';
	import { deckMachine } from '$lib/state/deckMachine';
	import { PlusCircle, Trash2, Edit3, Play } from 'lucide-svelte';
	import Button from '$components/ui/button/Button.svelte';
	import Card from '$components/ui/card/Card.svelte';
	import CardContent from '$components/ui/card/CardContent.svelte';
	import CardDescription from '$components/ui/card/CardDescription.svelte';
	import CardFooter from '$components/ui/card/CardFooter.svelte';
	import CardHeader from '$components/ui/card/CardHeader.svelte';
	import CardTitle from '$components/ui/card/CardTitle.svelte';

	const { snapshot, send } = useMachine(deckMachine);

	// No need for isMounted, machine's isLoading and state should suffice.
	onMount(() => {
		// If the machine is in a state where decks are already loaded (e.g. navigating back),
		// we might not need to send LOAD_DECKS. However, sending it is usually harmless
		// as the machine can decide if a reload is necessary or if it's already loading.
		// The machine now auto-loads on initialization. This dispatch might be for a manual refresh.
		if ($snapshot.matches('idle')) { // Only send if idle, otherwise it's already loading/initialized
        // send({ type: 'LOAD_DECKS' }); // Machine now loads on init. This could be for a manual refresh button.
    }
	});

	function handleCreateNewDeck() {
		goto('/decks/create');
	}

	function handleEditDeck(deckId: string) {
		goto(`/decks/edit/${deckId}`);
	}

	function handlePlayGame(deckId: string) {
		goto(`/play/${deckId}`);
	}

	function handleDeleteDeck(deckId: string) {
		send({ type: 'DELETE_DECK', deckId });
	}

	// Computed deck list items
	$: deckListItems = $snapshot.context.decks
		.map(deck => ({
			id: deck.id,
			name: deck.name,
			cardCount: deck.cards.reduce((sum, card) => sum + card.quantity, 0),
			updatedAt: deck.updatedAt,
			format: deck.format // Use actual deck format
		}))
		.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

	$: isLoading = $snapshot.matches('initializing') || $snapshot.matches('deleting') || $snapshot.context.isLoading;
	$: canDisplayDecks = $snapshot.matches('idle') || $snapshot.matches('editing'); // States where decks are loaded

</script>

<svelte:head>
	<title>Deck Builder - AlterDeck</title>
	<meta name="description" content="Create, manage, and refine your Altered TCG decks" />
</svelte:head>

<div class="space-y-8">
	<section class="flex flex-col sm:flex-row justify-between items-center gap-4">
		<div>
			<h1 class="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">
				Deck Builder
			</h1>
			<p class="mt-2 text-lg text-muted-foreground">
				Create, manage, and refine your Altered TCG decks.
			</p>
		</div>
		<Button 
			on:click={handleCreateNewDeck} 
			class="bg-accent text-accent-foreground hover:bg-accent/90"
		>
			<PlusCircle class="mr-2 h-5 w-5" /> Create New Deck
		</Button>
	</section>

	{#if isLoading}
		<div class="text-center p-10">Loading decks...</div>
	{:else if deckListItems.length === 0 && canDisplayDecks}
		<Card class="text-center py-12 shadow-lg">
			<CardHeader>
				<CardTitle class="text-2xl text-muted-foreground">No Decks Yet</CardTitle>
			</CardHeader>
			<CardContent>
				<p>Start building your first deck to see it here.</p>
				<Button 
					on:click={handleCreateNewDeck} 
					variant="outline" 
					class="mt-6 border-primary text-primary hover:bg-primary/10"
				>
					Create Your First Deck
				</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each deckListItems as deck (deck.id)}
				<Card class="flex flex-col shadow-lg hover:shadow-primary/30 transition-shadow duration-300">
					<CardHeader>
						<div class="flex justify-between items-start">
							<div>
								<CardTitle class="font-headline text-xl">{deck.name}</CardTitle>
								<CardDescription>{deck.cardCount} cards - Format: {deck.format}</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent class="flex-grow">
						<p class="text-xs text-muted-foreground">
							Last updated: {new Date(deck.updatedAt).toLocaleDateString()}
						</p>
					</CardContent>
					<CardFooter class="flex justify-end gap-2">
						<Button 
							on:click={() => handlePlayGame(deck.id)} 
							variant="default" 
							size="sm" 
							class="bg-primary text-primary-foreground hover:bg-primary/90"
						>
							<Play class="mr-1 h-4 w-4" /> Play
						</Button>
						<Button on:click={() => handleEditDeck(deck.id)} variant="outline" size="sm">
							<Edit3 class="mr-1 h-4 w-4" /> Edit
						</Button>
						<Button 
							on:click={() => {
								if (confirm(`Are you sure you want to delete "${deck.name}"? This action cannot be undone.`)) {
									handleDeleteDeck(deck.id);
								}
							}} 
							variant="destructive" 
							size="sm"
						>
							<Trash2 class="mr-1 h-4 w-4" /> Delete
						</Button>
					</CardFooter>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Error State -->
	<!-- Don't show general error during initial load if specific error UI exists or handled by errorLoading state -->
	{#if $snapshot.context.error && !$snapshot.matches('initializing')}
		<div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
			Error: {$snapshot.context.error}
		</div>
	{/if}

	{#if $snapshot.matches('errorLoading')}
		<div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
			Failed to load decks. Please try again. Message: {$snapshot.context.error}
		</div>
	{/if}
</div>