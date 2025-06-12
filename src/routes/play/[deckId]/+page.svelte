<script lang="ts">
	import { onMount } from 'svelte';
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

	// Reactive variables
	$: currentPhase = $snapshot.context.currentPhase;
	$: currentPlayer = $snapshot.context.currentPlayer;
	$: currentDay = $snapshot.context.currentDay;
	$: gameError = $snapshot.context.error;
	$: isMyTurn = currentPlayer === 'player1'; // Assuming player1 is the user
</script>

<svelte:head>
	<title>Play Game - AlterDeck</title>
	<meta name="description" content="Play Altered TCG with your deck" />
</svelte:head>

{#if isLoading}
	<div class="bg-background text-foreground flex h-screen flex-col items-center justify-center">
		<Loader2 class="text-primary mb-4 h-16 w-16 animate-spin" />
		<p class="text-xl">Loading Game...</p>
	</div>
{:else if error || gameError}
	<div class="bg-background text-foreground flex h-screen flex-col items-center justify-center p-4">
		<Card class="bg-card text-card-foreground w-full max-w-md p-6 shadow-lg">
			<h2 class="text-destructive mb-2 text-2xl font-bold">Game Error</h2>
			<p class="text-muted-foreground mb-4">{error || gameError}</p>
			<Button variant="outline" on:click={() => goto('/decks')}>
				<ArrowLeft class="mr-2 h-4 w-4" /> Back to Decks
			</Button>
		</Card>
	</div>
{:else}
	<div class="text-foreground flex h-screen flex-col overflow-hidden bg-zinc-800">
		<!-- Game Status Bar -->
		<div
			class="flex h-10 shrink-0 items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4 text-xs"
		>
			<div>Day: {currentDay} | Phase: {currentPhase}</div>
			<div class="font-bold {isMyTurn ? 'animate-pulse text-green-400' : 'text-red-400'}">
				{isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
			</div>
			<div class="w-1/3 truncate text-right">
				{#if gameError}
					<span class="text-destructive text-xs">{gameError}</span>
				{/if}
			</div>
		</div>

		<!-- Game Board -->
		<div class="flex min-h-0 flex-1 flex-col space-y-1 p-1">
			<!-- Opponent Area -->
			<div
				class="flex min-h-0 flex-1 flex-col space-y-1 rounded border border-zinc-700 bg-zinc-900/50 p-1"
			>
				<div class="flex h-24 shrink-0 items-center justify-center">
					<!-- Opponent Hero Spot -->
					<div
						class="flex h-20 w-16 items-center justify-center rounded border border-zinc-600 bg-zinc-800"
					>
						<span class="text-muted-foreground text-xs">Hero</span>
					</div>
				</div>
				<div class="flex flex-1 items-stretch space-x-1 p-1">
					<!-- Opponent Board Zones -->
					<div
						class="flex flex-1 flex-col items-center justify-center rounded border border-zinc-600 bg-zinc-800/50 p-2"
					>
						<span class="text-muted-foreground text-xs">Reserve</span>
					</div>
					<div
						class="flex flex-1 flex-col items-center justify-center rounded border border-zinc-600 bg-zinc-800/50 p-2"
					>
						<span class="text-muted-foreground text-xs">Expedition</span>
					</div>
					<div
						class="flex flex-1 flex-col items-center justify-center rounded border border-zinc-600 bg-zinc-800/50 p-2"
					>
						<span class="text-muted-foreground text-xs">Landmarks</span>
					</div>
				</div>
				<div class="flex h-28 shrink-0 items-center justify-between space-x-2 p-1">
					<!-- Opponent Stats -->
					<div
						class="flex h-full flex-1 flex-col items-center justify-center rounded bg-black/30 p-1 text-center"
					>
						<Zap class="h-4 w-4 text-yellow-400" />
						<p class="mt-1 text-sm font-semibold">0/0</p>
					</div>
					<!-- Opponent Hand -->
					<div
						class="flex h-full flex-[2_2_0%] items-center justify-center overflow-hidden rounded border border-zinc-600 bg-zinc-800/50"
					>
						<span class="text-muted-foreground text-xs">Opponent Hand</span>
					</div>
					<!-- Opponent Deck Info -->
					<div
						class="flex h-full flex-1 flex-col items-center justify-center rounded bg-black/30 p-1 text-center text-xs"
					>
						<div class="flex items-center">
							<BookOpen class="mr-1 h-4 w-4 text-blue-400" />Deck: 30
						</div>
						<div class="mt-1 flex items-center">
							<Box class="mr-1 h-4 w-4 text-gray-500" />Discard: 0
						</div>
					</div>
				</div>
			</div>

			<!-- Adventure Zone -->
			<div
				class="flex h-12 shrink-0 items-center justify-center rounded border border-zinc-600 bg-zinc-700/30 p-1"
			>
				<p class="text-muted-foreground text-xs">Adventure Zone</p>
			</div>

			<!-- Player Area (reversed layout) -->
			<div
				class="flex min-h-0 flex-1 flex-col-reverse space-y-1 space-y-reverse rounded border border-zinc-700 bg-zinc-900/50 p-1"
			>
				<div class="flex h-24 shrink-0 items-center justify-center">
					<!-- Player Hero Spot -->
					<div
						class="flex h-20 w-16 items-center justify-center rounded border border-zinc-600 bg-zinc-800"
					>
						<span class="text-muted-foreground text-xs">Hero</span>
					</div>
				</div>
				<div class="flex flex-1 items-stretch space-x-1 p-1">
					<!-- Player Board Zones -->
					<div
						class="flex flex-1 flex-col items-center justify-center rounded border border-zinc-600 bg-zinc-800/50 p-2"
					>
						<span class="text-muted-foreground text-xs">Reserve</span>
					</div>
					<div
						class="flex flex-1 cursor-pointer flex-col items-center justify-center rounded border border-zinc-600 bg-zinc-800/50 p-2 hover:bg-zinc-700/50"
					>
						<span class="text-muted-foreground text-xs">Expedition</span>
					</div>
					<div
						class="flex flex-1 cursor-pointer flex-col items-center justify-center rounded border border-zinc-600 bg-zinc-800/50 p-2 hover:bg-zinc-700/50"
					>
						<span class="text-muted-foreground text-xs">Landmarks</span>
					</div>
				</div>
				<div class="flex h-28 shrink-0 items-center justify-between space-x-2 p-1">
					<!-- Player Stats -->
					<div
						class="flex h-full flex-1 flex-col items-center justify-center rounded bg-black/30 p-1 text-center"
					>
						<Zap class="h-4 w-4 text-yellow-400" />
						<p class="mt-1 text-sm font-semibold">3/3</p>
					</div>
					<!-- Player Hand -->
					<div
						class="flex h-full flex-[2_2_0%] items-center justify-center overflow-hidden rounded border border-zinc-600 bg-zinc-800/50"
					>
						<span class="text-muted-foreground text-xs">Your Hand (6 cards)</span>
					</div>
					<!-- Player Deck Info -->
					<div
						class="flex h-full flex-1 flex-col items-center justify-center rounded bg-black/30 p-1 text-center text-xs"
					>
						<div class="flex items-center">
							<BookOpen class="mr-1 h-4 w-4 text-blue-400" />Deck: 24
						</div>
						<div class="mt-1 flex items-center">
							<Box class="mr-1 h-4 w-4 text-gray-500" />Discard: 0
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Action Bar -->
		<div
			class="flex h-12 shrink-0 items-center justify-center space-x-4 border-t border-zinc-700 bg-zinc-900 p-1"
		>
			<Button on:click={handlePassTurn} disabled={!isMyTurn} variant="destructive" size="sm">
				Pass Turn
			</Button>
			<Button on:click={handleAdvancePhase} variant="secondary" size="sm">Advance Phase</Button>
			<Button on:click={handleSurrender} variant="outline" size="sm">
				<ArrowLeft class="mr-2 h-4 w-4" /> Surrender
			</Button>
		</div>
	</div>
{/if}
