import { setup, assign } from 'xstate';
import type { GameStateManager } from '$engine/GameStateManager';
import type { CardPlaySystem } from '$engine/CardPlaySystem';
import type { PhaseManager } from '$engine/PhaseManager';
import { GamePhase } from '$engine/types/enums';

interface GameContext {
	gameStateManager: GameStateManager | null;
	cardPlaySystem: CardPlaySystem | null;
	phaseManager: PhaseManager | null;
	players: string[];
	currentPlayer: string | null;
	currentPhase: GamePhase;
	currentDay: number;
	selectedCard: string | null;
	selectedDeck: string | null;
	error: string | null;
}

type GameEvents =
	| { type: 'INITIALIZE_GAME'; players: string[] }
	| { type: 'START_GAME'; deckId: string }
	| { type: 'PLAY_CARD'; cardId: string; playerId: string }
	| { type: 'ADVANCE_PHASE' }
	| { type: 'PASS_TURN' }
	| { type: 'SELECT_CARD'; cardId: string }
	| { type: 'END_GAME' }
	| { type: 'RESET_GAME' }
	| { type: 'ERROR'; message: string };

export const gameMachine = setup({
	types: {
		context: {} as GameContext,
		events: {} as GameEvents
	},
	actions: {
		initializeGameEngine: assign(({ context, event }) => {
			if (event.type !== 'INITIALIZE_GAME') return context;
			
			// Initialize game engine with players
			// This would create GameStateManager, CardPlaySystem, PhaseManager
			// For now, returning placeholder values
			return {
				...context,
				players: event.players,
				currentPlayer: event.players[0] || null,
				currentPhase: GamePhase.Setup,
				currentDay: 1,
				error: null
			};
		}),

		startGame: assign(({ context, event }) => {
			if (event.type !== 'START_GAME') return context;
			
			return {
				...context,
				selectedDeck: event.deckId,
				currentPhase: GamePhase.Morning,
				error: null
			};
		}),

		playCard: assign(({ context, event }) => {
			if (event.type !== 'PLAY_CARD') return context;
			
			// Here we would integrate with CardPlaySystem
			// For now, just update context
			return {
				...context,
				selectedCard: event.cardId,
				error: null
			};
		}),

		advancePhase: assign(({ context }) => {
			const phaseOrder = [
				GamePhase.Morning,
				GamePhase.Noon,
				GamePhase.Afternoon,
				GamePhase.Dusk,
				GamePhase.Night
			];
			
			const currentIndex = phaseOrder.indexOf(context.currentPhase);
			const nextPhase = currentIndex === phaseOrder.length - 1 
				? GamePhase.Morning 
				: phaseOrder[currentIndex + 1];
			
			const nextDay = nextPhase === GamePhase.Morning 
				? context.currentDay + 1 
				: context.currentDay;

			return {
				...context,
				currentPhase: nextPhase,
				currentDay: nextDay,
				error: null
			};
		}),

		passTurn: assign(({ context }) => {
			const currentIndex = context.players.indexOf(context.currentPlayer || '');
			const nextIndex = (currentIndex + 1) % context.players.length;
			
			return {
				...context,
				currentPlayer: context.players[nextIndex] || null,
				error: null
			};
		}),

		selectCard: assign(({ context, event }) => {
			if (event.type !== 'SELECT_CARD') return context;
			
			return {
				...context,
				selectedCard: event.cardId,
				error: null
			};
		}),

		setError: assign(({ context, event }) => {
			if (event.type !== 'ERROR') return context;
			
			return {
				...context,
				error: event.message
			};
		}),

		resetGame: assign(() => ({
			gameStateManager: null,
			cardPlaySystem: null,
			phaseManager: null,
			players: [],
			currentPlayer: null,
			currentPhase: GamePhase.Setup,
			currentDay: 1,
			selectedCard: null,
			selectedDeck: null,
			error: null
		}))
	},

	guards: {
		canPlayCard: ({ context }) => {
			return context.currentPhase === GamePhase.Afternoon && 
				   context.selectedCard !== null &&
				   context.currentPlayer !== null;
		},

		canAdvancePhase: ({ context }) => {
			// Check if phase can be advanced based on game rules
			return context.currentPhase !== GamePhase.Afternoon; // Afternoon requires player actions
		},

		isGameInitialized: ({ context }) => {
			return context.players.length > 0 && context.currentPlayer !== null;
		}
	}
}).createMachine({
	id: 'game',
	initial: 'idle',
	context: {
		gameStateManager: null,
		cardPlaySystem: null,
		phaseManager: null,
		players: [],
		currentPlayer: null,
		currentPhase: GamePhase.Setup,
		currentDay: 1,
		selectedCard: null,
		selectedDeck: null,
		error: null
	},
	states: {
		idle: {
			on: {
				INITIALIZE_GAME: {
					target: 'initializing',
					actions: 'initializeGameEngine'
				}
			}
		},
		initializing: {
			on: {
				START_GAME: {
					target: 'playing',
					actions: 'startGame',
					guard: 'isGameInitialized'
				},
				ERROR: {
					target: 'error',
					actions: 'setError'
				}
			}
		},
		playing: {
			initial: 'waitingForAction',
			states: {
				waitingForAction: {
					on: {
						PLAY_CARD: {
							target: 'processingCard',
							actions: 'playCard',
							guard: 'canPlayCard'
						},
						ADVANCE_PHASE: {
							target: 'advancingPhase',
							guard: 'canAdvancePhase'
						},
						PASS_TURN: {
							target: 'waitingForAction',
							actions: 'passTurn'
						},
						SELECT_CARD: {
							target: 'waitingForAction',
							actions: 'selectCard'
						}
					}
				},
				processingCard: {
					// Here we would integrate with the actual game engine
					after: {
						1000: 'waitingForAction' // Simulate card processing time
					}
				},
				advancingPhase: {
					entry: 'advancePhase',
					always: 'waitingForAction'
				}
			},
			on: {
				END_GAME: 'gameEnded',
				ERROR: {
					target: 'error',
					actions: 'setError'
				}
			}
		},
		gameEnded: {
			on: {
				RESET_GAME: {
					target: 'idle',
					actions: 'resetGame'
				}
			}
		},
		error: {
			on: {
				RESET_GAME: {
					target: 'idle',
					actions: 'resetGame'
				},
				INITIALIZE_GAME: {
					target: 'initializing',
					actions: 'initializeGameEngine'
				}
			}
		}
	}
});