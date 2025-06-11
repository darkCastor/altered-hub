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
			const format = confirm('Create a Constructed deck? (Cancel for Limited)')
				? 'constructed'
				: 'limited';
			send({ type: 'CREATE_DECK', name: deckName, format });
		}
	});

	function handleSearch() {
		if (searchQuery.trim() === '') {
			filteredCards = allCards;
		} else {
			filteredCards = allCards.filter(
				(card) =>
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

		cards.forEach((card) => {
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
		return allCards.filter((card) => card.type === 'CHARACTER');
	}

	// Get card quantity in current deck
	function getCardQuantity(cardId: string): number {
		if (!$snapshot.context.currentDeck) return 0;
		const deckCard = $snapshot.context.currentDeck.cards.find((c) => c.cardId === cardId);
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
					class="rounded-md border border-input bg-background px-4 py-2 hover:bg-accent"
				>
					Back to Decks
				</button>
			{/if}
		</div>

		<!-- Deck Building Panel -->
		{#if selectedAction === 'create' && currentDeck}
			<div class="space-y-4 rounded-lg border bg-card p-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">{currentDeck.name}</h2>
						<div class="flex items-center gap-4 text-sm text-muted-foreground">
							<span
								>Format:
								<select
									bind:value={currentDeck.format}
									on:change={(e) => handleChangeFormat(e.target.value)}
									class="ml-1 rounded border px-2 py-1"
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
									onclick={() => (showHeroSelector = true)}
									class="text-blue-600 underline hover:text-blue-800"
								>
									Select Hero
								</button>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						{#if validationResult?.isValid}
							<CheckCircle class="h-5 w-5 text-green-600" />
							<span class="text-sm text-green-600">Valid</span>
						{:else}
							<AlertCircle class="h-5 w-5 text-red-600" />
							<span class="text-sm text-red-600">Invalid</span>
						{/if}
					</div>
				</div>

				<!-- Validation Errors -->
				{#if validationResult?.errors && validationResult.errors.length > 0}
					<div class="rounded border border-red-200 bg-red-50 p-3">
						<h4 class="mb-2 text-sm font-medium text-red-800">Deck Issues:</h4>
						<ul class="space-y-1 text-sm text-red-700">
							{#each validationResult.errors as error}
								<li>• {error}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Validation Warnings -->
				{#if validationResult?.warnings && validationResult.warnings.length > 0}
					<div class="rounded border border-yellow-200 bg-yellow-50 p-3">
						<h4 class="mb-2 text-sm font-medium text-yellow-800">Suggestions:</h4>
						<ul class="space-y-1 text-sm text-yellow-700">
							{#each validationResult.warnings as warning}
								<li>• {warning}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Error Messages -->
				{#if error}
					<div class="rounded border border-red-200 bg-red-50 p-3">
						<p class="text-sm text-red-700">{error}</p>
					</div>
				{/if}

				<!-- Deck Stats -->
				{#if validationResult?.stats}
					<div class="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
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
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
				<div class="max-h-96 max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
					<div class="mb-4 flex items-center justify-between">
						<h3 class="text-lg font-semibold">Select Hero</h3>
						<button onclick={() => (showHeroSelector = false)}>
							<X class="h-5 w-5" />
						</button>
					</div>
					<div class="grid grid-cols-4 gap-4">
						{#each heroCards as hero}
							<button
								onclick={() => handleSetHero(hero.id)}
								class="rounded border p-2 hover:bg-gray-50"
							>
								{#if hero.imageUrl}
									<img src={hero.imageUrl} alt={hero.name} class="mb-2 h-auto w-full rounded" />
								{/if}
								<div class="text-center text-xs">
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
			<div class="relative flex-1">
				<Search
					class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground"
				/>
				<input
					type="text"
					placeholder="Search cards..."
					bind:value={searchQuery}
					on:input={handleSearch}
					class="w-full rounded-md border border-input bg-background py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>
		</div>

		<!-- Cards Grid by Group -->
		<div class="space-y-8">
			{#each cardGroups as cardGroup}
				<div class="space-y-2">
					<h3 class="text-xl font-semibold">{cardGroup[0].name}</h3>
					<div
						class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
					>
						{#each cardGroup as card (card.id)}
							<div class="group relative">
								{#if card.imageUrl}
									<img
										src={card.imageUrl}
										alt={card.name}
										class="h-auto w-full cursor-pointer rounded-lg shadow-md transition-shadow hover:shadow-lg"
										loading="lazy"
									/>

									<!-- Deck Building Overlay -->
									{#if selectedAction === 'create'}
										<div
											class="absolute inset-0 flex items-center justify-center rounded-lg bg-black bg-opacity-0 transition-all group-hover:bg-opacity-40"
										>
											{@const quantity = getCardQuantity(card.id)}
											{@const canAdd = canAddCard(card.id)}

											<div class="opacity-0 transition-opacity group-hover:opacity-100">
												{#if quantity > 0}
													<div
														class="mb-2 rounded-full bg-white px-3 py-1 text-center text-sm font-medium"
													>
														{quantity} in deck
													</div>
												{/if}

												{#if canAdd}
													<button
														onclick={() => handleAddCard(card.id)}
														class="rounded-full bg-blue-600 p-2 text-white hover:bg-blue-700"
													>
														<Plus class="h-4 w-4" />
													</button>
												{:else}
													<div class="rounded-full bg-gray-600 p-2 text-white">
														<X class="h-4 w-4" />
													</div>
												{/if}

												{#if quantity > 0}
													<button
														onclick={() => handleRemoveCard(card.id)}
														class="ml-2 rounded-full bg-red-600 p-2 text-white hover:bg-red-700"
													>
														<X class="h-4 w-4" />
													</button>
												{/if}
											</div>
										</div>
									{/if}

									<!-- Card Info Overlay -->
									<div
										class="absolute inset-0 flex items-end rounded-lg bg-black bg-opacity-0 p-2 transition-all group-hover:bg-opacity-20"
									>
										<div
											class="rounded bg-black bg-opacity-70 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
										>
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
									<div
										class="flex aspect-[2.5/3.5] w-full items-center justify-center rounded-lg bg-gray-200 text-gray-500"
									>
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
