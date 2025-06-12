<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { useMachine } from '@xstate/svelte';
	import { deckMachine } from '$lib/state/deckMachine';
	import { getAllCards, getCardById, cardsReadyPromise } from '$data/cards'; // Updated imports
	import type { AlteredCard } from '$types';
	import { Search, Filter, Plus, X, AlertCircle, CheckCircle, Clock } from 'lucide-svelte';

	const { snapshot, send } = useMachine(deckMachine);

	let searchQuery = '';
	let localLoadedCards: AlteredCard[] = []; // To store cards once loaded
	let filteredCards: AlteredCard[] = []; // Derived from localLoadedCards and searchQuery
	let selectedAction: string | null = null;
	let showHeroSelector = false;

	// Promise for loading cards
	let cardsPromise: Promise<AlteredCard[]>;

	onMount(async () => {
		// It's important cardsReadyPromise resolves before we attempt to getAllCards
		// cardsReadyPromise itself ensures DB is initialized and seeded if necessary.
		cardsPromise = cardsReadyPromise.then(() => getAllCards());

		// Check URL parameters for actions after cards are potentially being loaded
		const urlParams = $page.url.searchParams;
		const action = urlParams.get('action');

		if (action === 'create') {
			selectedAction = 'create';
			const deckName = prompt('Enter deck name:') || 'New Deck';
			const format = confirm('Create a Constructed deck? (Cancel for Limited)')
				? 'constructed'
				: 'limited';
			send({ type: 'CREATE_DECK', name: deckName, format });
		} else if (action === 'edit') {
			selectedAction = 'edit'; // Or some indicator that we are in edit mode
			const deckId = urlParams.get('deckId');
			if (deckId) {
				// Ensure decks are loaded before trying to edit.
				// The machine loads decks on init. If it's idle, decks should be loaded.
				if ($snapshot.matches('idle') || $snapshot.context.decks.length > 0) {
					send({ type: 'EDIT_DECK', deckId });
				} else {
					// If decks aren't loaded yet (e.g., deep link directly to edit page),
					// wait for the machine to finish initializing.
					const unsubscribe = snapshot.subscribe((s) => {
						if (s.matches('idle')) {
							send({ type: 'EDIT_DECK', deckId });
							unsubscribe(); // Clean up subscription
						}
					});
				}
			} else {
				console.error('Deck ID missing for edit action');
				goto('/decks'); // Or show an error
			}
		}
	});

	function handleSearch() {
		if (!localLoadedCards) return; // Guard against search before load
		if (searchQuery.trim() === '') {
			filteredCards = localLoadedCards;
		} else {
			filteredCards = localLoadedCards.filter(
				(card) =>
					card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					card.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
					card.faction?.toLowerCase().includes(searchQuery.toLowerCase())
			);
		}
	}

	$: if (searchQuery && localLoadedCards.length > 0) {
		// Trigger search when searchQuery changes
		handleSearch();
	} else if (localLoadedCards.length > 0) {
		// Reset if search query is cleared
		filteredCards = localLoadedCards;
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
	// This will be reactive based on localLoadedCards once available
	$: heroCards = localLoadedCards.filter((card) => card.type === 'CHARACTER');

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
		});
	}

	$: cardGroups = groupCardsByBase(filteredCards);
	// heroCards is now reactive
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
					{selectedAction === 'create'
						? 'Deck Builder'
						: selectedAction === 'edit'
							? 'Edit Deck'
							: 'Card Viewer'}
				</h1>
				<p class="text-muted-foreground">
					{selectedAction === 'create'
						? 'Build your deck with Altered TCG rules enforcement.'
						: selectedAction === 'edit'
							? 'Edit your existing deck.'
							: `Browse all ${localLoadedCards.length > 0 ? localLoadedCards.length : '...'} Altered TCG cards with their transformations.`}
				</p>
			</div>
			{#if selectedAction === 'create' || selectedAction === 'edit'}
				{#if $snapshot.matches('saving')}
					<Button disabled class="bg-blue-500 text-white">
						<Clock class="mr-2 h-4 w-4 animate-spin" />
						Saving...
					</Button>
				{:else}
					<Button
						on:click={() => send({ type: 'SAVE_DECK' })}
						disabled={!currentDeck ||
							!$snapshot.context.validationResult?.isValid ||
							$snapshot.matches('saving')}
						class="bg-green-600 text-white hover:bg-green-700"
					>
						Save Deck
					</Button>
				{/if}
				<Button on:click={() => goto('/decks')} variant="outline">Back to Decks</Button>
			{/if}
		</div>

		<!-- Deck Building Panel -->
		{#if (selectedAction === 'create' || selectedAction === 'edit') && currentDeck}
			<div class="bg-card space-y-4 rounded-lg border p-6">
				<div class="flex items-center justify-between">
					<div>
						<!-- Deck Name - TODO: Make editable for currentDeck.name -->
						<h2 class="text-xl font-semibold">{currentDeck.name}</h2>
						<div class="text-muted-foreground flex items-center gap-4 text-sm">
							<span
								>Format:
								<select
									bind:value={currentDeck.format}
									onchange={(e) => handleChangeFormat((e.target as HTMLSelectElement).value)}
									class="ml-1 rounded border px-2 py-1"
								>
									<option value="constructed">Constructed</option>
									<option value="limited">Limited</option>
								</select>
							</span>
							<span>Cards: {validationResult?.stats.totalCards || 0}</span>
							{#if currentDeck.heroId}
								{#await getCardById(currentDeck.heroId)}
									<span>Loading hero...</span>
								{:then hero}
									<span>Hero: {hero?.name || 'Unknown'}</span>
								{:catch error}
									<span class="text-red-500">Error loading hero</span>
								{/await}
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
			<div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
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
					class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform"
				/>
				<input
					type="text"
					placeholder="Search cards..."
					bind:value={searchQuery}
					oninput={handleSearch}
					class="border-input bg-background focus:ring-ring w-full rounded-md border py-2 pr-4 pl-10 focus:ring-2 focus:outline-none"
				/>
			</div>
		</div>

		<!-- Cards Grid by Group -->
		{#await cardsPromise}
			<div class="flex items-center justify-center py-12">
				<Clock class="text-primary h-8 w-8 animate-spin" />
				<p class="text-muted-foreground ml-2">Loading cards...</p>
			</div>
		{:then loadedSuccessfullyCards}
			{@const _ =
				((localLoadedCards = loadedSuccessfullyCards),
				(filteredCards = loadedSuccessfullyCards),
				handleSearch())}
			<!-- Assign and initialize filter -->
			<div class="space-y-8">
				{#each cardGroups as cardGroup (cardGroup[0].name)}
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
											{@const quantity = getCardQuantity(card.id)}
											{@const canAdd = canAddCard(card.id)}
											<div
												class="bg-opacity-0 group-hover:bg-opacity-40 absolute inset-0 flex items-center justify-center rounded-lg bg-black transition-all"
											>
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
											class="bg-opacity-0 group-hover:bg-opacity-20 absolute inset-0 flex items-end rounded-lg bg-black p-2 transition-all"
										>
											<div
												class="bg-opacity-70 rounded bg-black px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
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

			{#if filteredCards.length === 0 && localLoadedCards.length > 0}
				<div class="flex items-center justify-center py-12">
					<div class="text-muted-foreground">No cards found matching your search.</div>
				</div>
			{/if}
		{:catch error}
			<div class="flex items-center justify-center py-12 text-red-500">
				<AlertCircle class="mr-2 h-8 w-8" />
				<p>Error loading cards: {error.message}</p>
			</div>
		{/await}
	</div>
</div>
