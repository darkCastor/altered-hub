<script lang="ts">
	import { onMount, beforeUpdate } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { useMachine } from '@xstate/svelte';
	import { gameMachine } from '$lib/state/gameMachine';
	import { Loader2, ArrowLeft, Zap, BookOpen, Box } from 'lucide-svelte';
	import Button from '$components/ui/button/Button.svelte';
	import Card from '$components/ui/card/Card.svelte';

	$: deckId = $page.params.deckId;

	const { snapshot, send } = useMachine(gameMachine);

	let isLoading = true;
	let error: string | null = null;

	onMount(() => {
		if (deckId) {
			// Initialize game with player IDs
			send({ type: 'INITIALIZE_GAME', players: ['player1', 'player2'] });
			// Start game with deck
			send({ type: 'START_GAME', deckId });
			isLoading = false;
		} else {
			error = 'No deck ID provided';
			isLoading = false;
		}
	});

	function handleSurrender() {
		send({ type: 'END_GAME' });
		goto('/decks');
	}

	function handlePassTurn() {
		send({ type: 'PASS_TURN' });
	}

	function handleAdvancePhase() {
		send({ type: 'ADVANCE_PHASE' });
	}

	function handlePlayCard(cardId: string) {
		if ($snapshot.context.currentPlayer) {
			send({ type: 'PLAY_CARD', cardId, playerId: $snapshot.context.currentPlayer });
		}
	}

	function handleSelectCard(cardId: string) {
		send({ type: 'SELECT_CARD', cardId });
	}

	// Reactive variables
	$: currentPhase = $snapshot.context.currentPhase;
	$: currentPlayer = $snapshot.context.currentPlayer;
	$: currentDay = $snapshot.context.currentDay;
	$: selectedCard = $snapshot.context.selectedCard;
	$: gameError = $snapshot.context.error;
	$: isMyTurn = currentPlayer === 'player1'; // Assuming player1 is the user
</script>

<svelte:head>
	<title>Play Game - AlterDeck</title>
	<meta name="description" content="Play Altered TCG with your deck" />
</svelte:head>

{#if isLoading}
	<div class="flex flex-col items-center justify-center h-screen bg-background text-foreground">
		<Loader2 class="h-16 w-16 animate-spin text-primary mb-4" />
		<p class="text-xl">Loading Game...</p>
	</div>
{:else if error || gameError}
	<div class="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
		<Card class="w-full max-w-md shadow-lg bg-card text-card-foreground p-6">
			<h2 class="text-destructive text-2xl font-bold mb-2">Game Error</h2>
			<p class="text-muted-foreground mb-4">{error || gameError}</p>
			<Button variant="outline" on:click={() => goto('/decks')}>
				<ArrowLeft class="mr-2 h-4 w-4" /> Back to Decks
			</Button>
		</Card>
	</div>
{:else}
	<div class="flex flex-col h-screen bg-zinc-800 text-foreground overflow-hidden">
		<!-- Game Status Bar -->
		<div class="h-10 bg-zinc-900 text-xs flex items-center justify-between px-4 border-b border-zinc-700 shrink-0">
			<div>Day: {currentDay} | Phase: {currentPhase}</div>
			<div class="font-bold {isMyTurn ? 'text-green-400 animate-pulse' : 'text-red-400'}">
				{isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
			</div>
			<div class="text-right w-1/3 truncate">
				{#if gameError}
					<span class="text-destructive text-xs">{gameError}</span>
				{/if}
			</div>
		</div>

		<!-- Game Board -->
		<div class="flex-1 flex flex-col p-1 space-y-1 min-h-0">
			<!-- Opponent Area -->
			<div class="flex-1 flex flex-col bg-zinc-900/50 p-1 rounded border border-zinc-700 space-y-1 min-h-0">
				<div class="flex items-center justify-center h-24 shrink-0">
					<!-- Opponent Hero Spot -->
					<div class="w-16 h-20 bg-zinc-800 border border-zinc-600 rounded flex items-center justify-center">
						<span class="text-xs text-muted-foreground">Hero</span>
					</div>
				</div>
				<div class="flex-1 flex items-stretch p-1 space-x-1">
					<!-- Opponent Board Zones -->
					<div class="flex-1 bg-zinc-800/50 border border-zinc-600 rounded p-2 flex flex-col items-center justify-center">
						<span class="text-xs text-muted-foreground">Reserve</span>
					</div>
					<div class="flex-1 bg-zinc-800/50 border border-zinc-600 rounded p-2 flex flex-col items-center justify-center">
						<span class="text-xs text-muted-foreground">Expedition</span>
					</div>
					<div class="flex-1 bg-zinc-800/50 border border-zinc-600 rounded p-2 flex flex-col items-center justify-center">
						<span class="text-xs text-muted-foreground">Landmarks</span>
					</div>
				</div>
				<div class="flex items-center justify-between p-1 space-x-2 h-28 shrink-0">
					<!-- Opponent Stats -->
					<div class="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center">
						<Zap class="h-4 w-4 text-yellow-400" />
						<p class="text-sm font-semibold mt-1">0/0</p>
					</div>
					<!-- Opponent Hand -->
					<div class="flex-[2_2_0%] h-full flex items-center justify-center rounded overflow-hidden bg-zinc-800/50 border border-zinc-600">
						<span class="text-xs text-muted-foreground">Opponent Hand</span>
					</div>
					<!-- Opponent Deck Info -->
					<div class="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center text-xs">
						<div class="flex items-center">
							<BookOpen class="h-4 w-4 text-blue-400 mr-1" />Deck: 30
						</div>
						<div class="flex items-center mt-1">
							<Box class="h-4 w-4 text-gray-500 mr-1" />Discard: 0
						</div>
					</div>
				</div>
			</div>

			<!-- Adventure Zone -->
			<div class="h-12 bg-zinc-700/30 rounded border border-zinc-600 p-1 flex items-center justify-center shrink-0">
				<p class="text-xs text-muted-foreground">Adventure Zone</p>
			</div>

			<!-- Player Area (reversed layout) -->
			<div class="flex-1 flex flex-col-reverse bg-zinc-900/50 p-1 rounded border border-zinc-700 space-y-1 space-y-reverse min-h-0">
				<div class="flex items-center justify-center h-24 shrink-0">
					<!-- Player Hero Spot -->
					<div class="w-16 h-20 bg-zinc-800 border border-zinc-600 rounded flex items-center justify-center">
						<span class="text-xs text-muted-foreground">Hero</span>
					</div>
				</div>
				<div class="flex-1 flex items-stretch p-1 space-x-1">
					<!-- Player Board Zones -->
					<div class="flex-1 bg-zinc-800/50 border border-zinc-600 rounded p-2 flex flex-col items-center justify-center">
						<span class="text-xs text-muted-foreground">Reserve</span>
					</div>
					<div class="flex-1 bg-zinc-800/50 border border-zinc-600 rounded p-2 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-700/50">
						<span class="text-xs text-muted-foreground">Expedition</span>
					</div>
					<div class="flex-1 bg-zinc-800/50 border border-zinc-600 rounded p-2 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-700/50">
						<span class="text-xs text-muted-foreground">Landmarks</span>
					</div>
				</div>
				<div class="flex items-center justify-between p-1 space-x-2 h-28 shrink-0">
					<!-- Player Stats -->
					<div class="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center">
						<Zap class="h-4 w-4 text-yellow-400" />
						<p class="text-sm font-semibold mt-1">3/3</p>
					</div>
					<!-- Player Hand -->
					<div class="flex-[2_2_0%] h-full flex items-center justify-center rounded overflow-hidden bg-zinc-800/50 border border-zinc-600">
						<span class="text-xs text-muted-foreground">Your Hand (6 cards)</span>
					</div>
					<!-- Player Deck Info -->
					<div class="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center text-xs">
						<div class="flex items-center">
							<BookOpen class="h-4 w-4 text-blue-400 mr-1" />Deck: 24
						</div>
						<div class="flex items-center mt-1">
							<Box class="h-4 w-4 text-gray-500 mr-1" />Discard: 0
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Action Bar -->
		<div class="h-12 flex items-center justify-center space-x-4 p-1 bg-zinc-900 border-t border-zinc-700 shrink-0">
			<Button 
				on:click={handlePassTurn} 
				disabled={!isMyTurn} 
				variant="destructive" 
				size="sm"
			>
				Pass Turn
			</Button>
			<Button 
				on:click={handleAdvancePhase} 
				variant="secondary" 
				size="sm"
			>
				Advance Phase
			</Button>
			<Button 
				on:click={handleSurrender} 
				variant="outline" 
				size="sm"
			>
				<ArrowLeft class="mr-2 h-4 w-4" /> Surrender
			</Button>
		</div>
	</div>
{/if}