<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { useMachine } from '@xstate/svelte';
	import { deckMachine } from '$lib/state/deckMachine';
	import { allCards, getCardById } from '$data/cards';
	import type { AlteredCard } from '$types';
	import { Search, Filter, Plus, X, AlertCircle, CheckCircle, Clock } from 'lucide-svelte';

	const { snapshot, send } = useMachine(deckMachine);

	let searchQuery = '';
	let filteredCards: AlteredCard[] = allCards;
	let selectedAction: string | null = null;
	let showHeroSelector = false;

	onMount(() => {
		// Check URL parameters for actions
		const action = $page.url.searchParams.get('action');
		if (action === 'create') {
			selectedAction = 'create';
			// Initialize a new deck
			const deckName = prompt('Enter deck name:') || 'New Deck';
			const format = confirm('Create a Constructed deck? (Cancel for Limited)') ? 'constructed' : 'limited';
			send({ type: 'CREATE_DECK', name: deckName, format });
		}
	});

	function handleSearch() {
		if (searchQuery.trim() === '') {
			filteredCards = allCards;
		} else {
			filteredCards = allCards.filter(card => 
				card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				card.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
				card.faction?.toLowerCase().includes(searchQuery.toLowerCase())
			);
		}
	}

	function handleAddCard(cardId: string) {
		if (selectedAction === 'create' && $snapshot.context.currentDeck) {
			send({ type: 'ADD_CARD', cardId });
		}
	}

	function handleSetHero(cardId: string) {
		if (selectedAction === 'create' && $snapshot.context.currentDeck) {
			send({ type: 'SET_HERO', cardId });
			showHeroSelector = false;
		}
	}

	function handleRemoveCard(cardId: string) {
		send({ type: 'REMOVE_CARD', cardId });
	}

	function handleChangeFormat(format: 'constructed' | 'limited') {
		send({ type: 'SET_FORMAT', format });
	}

	// Group cards by base name to show transformations together
	function groupCardsByBase(cards: AlteredCard[]) {
		const groups: { [key: string]: AlteredCard[] } = {};
		
		cards.forEach(card => {
			// Use the card name as the grouping key since transformations have the same name
			const baseName = card.name;
			if (!groups[baseName]) {
				groups[baseName] = [];
			}
			groups[baseName].push(card);
		});
		
		return Object.values(groups);
	}

	// Filter cards for hero selection (only CHARACTER types)
	function getHeroCards() {
		return allCards.filter(card => card.type === 'CHARACTER');
	}

	// Get card quantity in current deck
	function getCardQuantity(cardId: string): number {
		if (!$snapshot.context.currentDeck) return 0;
		const deckCard = $snapshot.context.currentDeck.cards.find(c => c.cardId === cardId);
		return deckCard ? deckCard.quantity : 0;
	}

	// Check if card can be added
	function canAddCard(cardId: string): boolean {
		const validator = deckMachine.config.guards?.canAddCard;
		if (!validator) return false;
		
		return validator({
			context: $snapshot.context,
			event: { type: 'ADD_CARD', cardId }
		} as any);
	}

	$: cardGroups = groupCardsByBase(filteredCards);
	$: heroCards = getHeroCards();
	$: currentDeck = $snapshot.context.currentDeck;
	$: validationResult = $snapshot.context.validationResult;
	$: error = $snapshot.context.error;
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
				<h1 class="text-3xl font-bold tracking-tight">
					{selectedAction === 'create' ? 'Deck Builder' : 'Card Viewer'}
				</h1>
				<p class="text-muted-foreground">
					{selectedAction === 'create' 
						? 'Build your deck with Altered TCG rules enforcement' 
						: `Browse all ${allCards.length} Altered TCG cards with their transformations`}
				</p>
			</div>
			{#if selectedAction === 'create'}
				<button
					onclick={() => goto('/decks')}
					class="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent"
				>
					Back to Decks
				</button>
			{/if}
		</div>

		<!-- Deck Building Panel -->
		{#if selectedAction === 'create' && currentDeck}
			<div class="bg-card border rounded-lg p-6 space-y-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">{currentDeck.name}</h2>
						<div class="flex items-center gap-4 text-sm text-muted-foreground">
							<span>Format: 
								<select 
									bind:value={currentDeck.format} 
									onchange={(e) => handleChangeFormat(e.target.value)}
									class="ml-1 px-2 py-1 border rounded"
								>
									<option value="constructed">Constructed</option>
									<option value="limited">Limited</option>
								</select>
							</span>
							<span>Cards: {validationResult?.stats.totalCards || 0}</span>
							{#if currentDeck.heroId}
								{@const hero = getCardById(currentDeck.heroId)}
								<span>Hero: {hero?.name}</span>
							{:else}
								<button
									onclick={() => showHeroSelector = true}
									class="text-blue-600 hover:text-blue-800 underline"
								>
									Select Hero
								</button>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						{#if validationResult?.isValid}
							<CheckCircle class="h-5 w-5 text-green-600" />
							<span class="text-green-600 text-sm">Valid</span>
						{:else}
							<AlertCircle class="h-5 w-5 text-red-600" />
							<span class="text-red-600 text-sm">Invalid</span>
						{/if}
					</div>
				</div>

				<!-- Validation Errors -->
				{#if validationResult?.errors && validationResult.errors.length > 0}
					<div class="bg-red-50 border border-red-200 rounded p-3">
						<h4 class="text-sm font-medium text-red-800 mb-2">Deck Issues:</h4>
						<ul class="text-sm text-red-700 space-y-1">
							{#each validationResult.errors as error}
								<li>• {error}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Validation Warnings -->
				{#if validationResult?.warnings && validationResult.warnings.length > 0}
					<div class="bg-yellow-50 border border-yellow-200 rounded p-3">
						<h4 class="text-sm font-medium text-yellow-800 mb-2">Suggestions:</h4>
						<ul class="text-sm text-yellow-700 space-y-1">
							{#each validationResult.warnings as warning}
								<li>• {warning}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Error Messages -->
				{#if error}
					<div class="bg-red-50 border border-red-200 rounded p-3">
						<p class="text-sm text-red-700">{error}</p>
					</div>
				{/if}

				<!-- Deck Stats -->
				{#if validationResult?.stats}
					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
						<div>
							<div class="font-medium">Total Cards</div>
							<div class="text-2xl">{validationResult.stats.totalCards}</div>
						</div>
						<div>
							<div class="font-medium">Heroes</div>
							<div class="text-2xl">{validationResult.stats.heroCount}</div>
						</div>
						{#if Object.keys(validationResult.stats.rarityBreakdown).length > 0}
							<div>
								<div class="font-medium">Rare Cards</div>
								<div class="text-2xl">{validationResult.stats.rarityBreakdown['Rare'] || 0}</div>
							</div>
							<div>
								<div class="font-medium">Unique Cards</div>
								<div class="text-2xl">{validationResult.stats.rarityBreakdown['Unique'] || 0}</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Hero Selector Modal -->
		{#if showHeroSelector}
			<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
				<div class="bg-white rounded-lg p-6 max-w-4xl max-h-96 overflow-y-auto">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold">Select Hero</h3>
						<button onclick={() => showHeroSelector = false}>
							<X class="h-5 w-5" />
						</button>
					</div>
					<div class="grid grid-cols-4 gap-4">
						{#each heroCards as hero}
							<button
								onclick={() => handleSetHero(hero.id)}
								class="p-2 border rounded hover:bg-gray-50"
							>
								{#if hero.imageUrl}
									<img src={hero.imageUrl} alt={hero.name} class="w-full h-auto rounded mb-2" />
								{/if}
								<div class="text-xs text-center">
									<div class="font-medium">{hero.name}</div>
									<div class="text-gray-600">{hero.faction}</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Search -->
		<div class="flex gap-4">
			<div class="flex-1 relative">
				<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search cards..."
					bind:value={searchQuery}
					oninput={handleSearch}
					class="w-full pl-10 pr-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>
		</div>

		<!-- Cards Grid by Group -->
		<div class="space-y-8">
			{#each cardGroups as cardGroup}
				<div class="space-y-2">
					<h3 class="text-xl font-semibold">{cardGroup[0].name}</h3>
					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
						{#each cardGroup as card (card.id)}
							<div class="relative group">
								{#if card.imageUrl}
									<img 
										src={card.imageUrl} 
										alt={card.name}
										class="w-full h-auto rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
										loading="lazy"
									/>
									
									<!-- Deck Building Overlay -->
									{#if selectedAction === 'create'}
										{@const quantity = getCardQuantity(card.id)}
										{@const canAdd = canAddCard(card.id)}
										<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
											
											<div class="opacity-0 group-hover:opacity-100 transition-opacity">
												{#if quantity > 0}
													<div class="bg-white rounded-full px-3 py-1 text-sm font-medium mb-2 text-center">
														{quantity} in deck
													</div>
												{/if}
												
												{#if canAdd}
													<button
														onclick={() => handleAddCard(card.id)}
														class="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2"
													>
														<Plus class="h-4 w-4" />
													</button>
												{:else}
													<div class="bg-gray-600 text-white rounded-full p-2">
														<X class="h-4 w-4" />
													</div>
												{/if}
												
												{#if quantity > 0}
													<button
														onclick={() => handleRemoveCard(card.id)}
														class="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 ml-2"
													>
														<X class="h-4 w-4" />
													</button>
												{/if}
											</div>
										</div>
									{/if}
									
									<!-- Card Info Overlay -->
									<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-end p-2">
										<div class="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
											{card.faction} • {card.rarity}
											{#if card.id.includes('_R1')}
												(Transform 1)
											{:else if card.id.includes('_R2')}
												(Transform 2)
											{:else}
												(Base)
											{/if}
										</div>
									</div>
								{:else}
									<div class="w-full aspect-[2.5/3.5] bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
										No Image
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		{#if filteredCards.length === 0}
			<div class="flex items-center justify-center py-12">
				<div class="text-muted-foreground">No cards found matching your search.</div>
			</div>
		{/if}
	</div>
</div>