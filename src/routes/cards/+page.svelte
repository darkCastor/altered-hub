<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { useMachine } from '@xstate/svelte';
	import { deckMachine } from '$lib/state/deckMachine';
	import Button from '$components/ui/button/Button.svelte';
	import Card from '$components/ui/card/Card.svelte';
	import CardContent from '$components/ui/card/CardContent.svelte';
	import CardHeader from '$components/ui/card/CardHeader.svelte';
	import CardTitle from '$components/ui/card/CardTitle.svelte';
	import CardDescription from '$components/ui/card/CardDescription.svelte';
	import { Search, Filter, Plus } from 'lucide-svelte';

	const { snapshot, send } = useMachine(deckMachine);

	let searchQuery = '';
	let selectedAction: string | null = null;
	let selectedDeckId: string | null = null;

	onMount(() => {
		// Load decks when component mounts
		send({ type: 'LOAD_DECKS' });

		// Check URL parameters for actions
		const action = $page.url.searchParams.get('action');
		const deckId = $page.url.searchParams.get('deckId');

		if (action === 'create') {
			selectedAction = 'create';
		} else if (action === 'edit' && deckId) {
			selectedAction = 'edit';
			selectedDeckId = deckId;
			send({ type: 'EDIT_DECK', deckId });
		}
	});

	function handleCreateDeck() {
		const deckName = prompt('Enter deck name:');
		if (deckName) {
			send({ type: 'CREATE_DECK', name: deckName });
			selectedAction = 'create';
		}
	}

	function handleSearch() {
		send({ type: 'SEARCH_CARDS', query: searchQuery });
	}

	// Mock card data for display
	const mockCards = [
		{
			id: 'card-1',
			name: 'Forest Guardian',
			type: 'Character',
			cost: { total: 3, forest: 2, mountain: 0, water: 1 },
			faction: 'Axiom',
			rarity: 'Common',
			statistics: { forest: 3, mountain: 1, water: 2 }
		},
		{
			id: 'card-2',
			name: 'Lightning Bolt',
			type: 'Spell',
			cost: { total: 2, forest: 0, mountain: 2, water: 0 },
			faction: 'Bravos',
			rarity: 'Rare',
			statistics: { forest: 0, mountain: 0, water: 0 }
		},
		{
			id: 'card-3',
			name: 'Ancient Library',
			type: 'Permanent',
			cost: { total: 4, forest: 1, mountain: 1, water: 2 },
			faction: 'Lyra',
			rarity: 'Unique',
			statistics: { forest: 1, mountain: 1, water: 3 }
		}
	];
</script>

<svelte:head>
	<title>Card Viewer - AlterDeck</title>
	<meta name="description" content="Browse and discover all Altered TCG cards" />
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="flex flex-col gap-6">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Card Viewer</h1>
				<p class="text-muted-foreground">
					Browse and discover all Altered TCG cards with detailed information
				</p>
			</div>
			{#if selectedAction === 'create'}
				<Button variant="outline" onclick={() => goto('/decks')}>
					Back to Decks
				</Button>
			{/if}
		</div>

		<!-- Search and Filters -->
		<div class="flex gap-4">
			<div class="flex-1 relative">
				<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search cards..."
					bind:value={searchQuery}
					on:input={handleSearch}
					class="w-full pl-10 pr-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>
			<Button variant="outline" size="icon">
				<Filter class="h-4 w-4" />
			</Button>
			{#if selectedAction === 'create'}
				<Button onclick={handleCreateDeck}>
					<Plus class="h-4 w-4 mr-2" />
					Create Deck
				</Button>
			{/if}
		</div>

		<!-- Deck Building Action Banner -->
		{#if selectedAction === 'create'}
			<div class="bg-primary/10 border border-primary/20 rounded-lg p-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="font-semibold text-primary">Creating New Deck</h2>
						<p class="text-sm text-muted-foreground">
							Click on cards to add them to your deck (max 3 copies per card)
						</p>
					</div>
					<div class="text-sm text-muted-foreground">
						{#if $snapshot.context.currentDeck}
							Cards: {$snapshot.context.currentDeck.cards.reduce((sum, card) => sum + card.quantity, 0)}/30
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- Cards Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each mockCards as card (card.id)}
				<Card class="hover:shadow-lg transition-shadow cursor-pointer">
					<CardHeader class="pb-3">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<CardTitle class="text-lg">{card.name}</CardTitle>
								<CardDescription>{card.type} • {card.faction}</CardDescription>
							</div>
							<div class="flex items-center gap-1 text-sm font-medium">
								<span class="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
									{card.cost.total}
								</span>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<div class="space-y-2">
							<!-- Cost breakdown -->
							<div class="flex items-center gap-2 text-sm">
								<span class="text-muted-foreground">Cost:</span>
								{#if card.cost.forest > 0}
									<span class="text-green-600">{card.cost.forest}🌲</span>
								{/if}
								{#if card.cost.mountain > 0}
									<span class="text-red-600">{card.cost.mountain}⛰️</span>
								{/if}
								{#if card.cost.water > 0}
									<span class="text-blue-600">{card.cost.water}💧</span>
								{/if}
							</div>

							<!-- Statistics -->
							{#if card.type === 'Character'}
								<div class="flex items-center gap-2 text-sm">
									<span class="text-muted-foreground">Stats:</span>
									<span class="text-green-600">{card.statistics.forest}</span>
									<span class="text-red-600">{card.statistics.mountain}</span>
									<span class="text-blue-600">{card.statistics.water}</span>
								</div>
							{/if}

							<!-- Rarity -->
							<div class="flex items-center justify-between">
								<span class="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
									{card.rarity}
								</span>
								{#if selectedAction === 'create'}
									<Button
										size="sm"
										variant="outline"
										onclick={() => send({ type: 'ADD_CARD', cardId: card.id })}
									>
										Add
									</Button>
								{/if}
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>

		<!-- Loading State -->
		{#if $snapshot.context.isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="text-muted-foreground">Loading cards...</div>
			</div>
		{/if}

		<!-- Error State -->
		{#if $snapshot.context.error}
			<div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
				{$snapshot.context.error}
			</div>
		{/if}
	</div>
</div>