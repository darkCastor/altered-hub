import { setup, assign } from 'xstate';
import type { GameStateManager } from '$engine/GameStateManager';
import { EventBus } from '$engine/EventBus';
import type { ICardDefinition } from '$engine/types/cards';
import { GamePhase } from '$engine/types/enums';
import type { PhaseManager } from '$engine/PhaseManager';
import type { TurnManager } from '$engine/TurnManager';
import type { CardPlaySystem } from '$engine/CardPlaySystem';

interface GameContext {
	gameStateManager: GameStateManager | null;
	eventBus: EventBus | null;
	phaseManager: PhaseManager | null;
	turnManager: TurnManager | null;
	cardPlaySystem: CardPlaySystem | null;
	cardDefinitions: Map<string, ICardDefinition> | null;
	players: string[];
	currentPlayer: string | null;
	currentPhase: GamePhase;
	currentDay: number;
	selectedCard: string | null;
	selectedDeck: string | null;
	error: string | null;
	// Reaction loop context
	pendingReactionsCount: number;
	initiativePlayerReactions: any[]; // Should be IEmblemObject[], using any for now
	nextReactionToResolve: any | null; // Should be IEmblemObject | null
	reactionInitiativePlayerId: string | null;
	reactionInitiativePassCount: number;
}

type GameEvents =
	| { type: 'INITIALIZE_GAME'; players: string[] }
	| { type: 'START_GAME'; deckId: string }
	| { type: 'LOAD_CARD_DEFINITIONS'; cardDefs: ICardDefinition[] }
	| { type: 'PLAY_CARD'; cardId: string; playerId: string; targetId?: string }
	| { type: 'CHOOSE_REACTION_TO_PLAY'; chosenReactionId: string }
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
		evaluateLimbo: assign(({ context }) => {
			if (!context.gameStateManager) return {};
			const limbo = context.gameStateManager.state.sharedZones.limbo;
			const allReactions = limbo.getAll().filter((obj) => obj.type === 'EMBLEM-REACTION'); // Ensure 'type' and 'controllerId' exist

			let currentReactionInitiativePlayerId = context.reactionInitiativePlayerId;
			let currentPassCount = context.reactionInitiativePassCount;

			// Initialize reactionInitiativePlayerId and passCount if this is the start of a new reaction cycle
			if (currentReactionInitiativePlayerId === null) {
				if (context.currentPhase === GamePhase.Afternoon) {
					currentReactionInitiativePlayerId = context.gameStateManager.state.currentPlayerId;
				} else {
					currentReactionInitiativePlayerId = context.gameStateManager.state.firstPlayerId;
				}
				currentPassCount = 0; // Reset pass count for the new cycle
			}

			const initiativePlayerReactions = allReactions.filter(
				(r) => r.controllerId === currentReactionInitiativePlayerId
			); // Assuming 'controllerId'

			return {
				pendingReactionsCount: allReactions.length,
				initiativePlayerReactions: initiativePlayerReactions,
				// Set nextReactionToResolve only if there's exactly one, or for auto-processing.
				// If multiple, player choice will set it.
				nextReactionToResolve:
					initiativePlayerReactions.length === 1 ? initiativePlayerReactions[0] : null,
				reactionInitiativePlayerId: currentReactionInitiativePlayerId,
				reactionInitiativePassCount: currentPassCount
			};
		}),
		setChosenReaction: assign(({ context, event }) => {
			if (event.type !== 'CHOOSE_REACTION_TO_PLAY') return {};
			const chosenReaction = context.initiativePlayerReactions.find(
				(r) => r.id === event.chosenReactionId
			); // Assuming reaction has 'id'
			if (chosenReaction) {
				return { nextReactionToResolve: chosenReaction };
			} else {
				console.warn(
					`Chosen reaction ID ${event.chosenReactionId} not found in initiativePlayerReactions.`
				);
				return {}; // Or set an error
			}
		}),
		passReactionInitiative: assign(({ context }) => {
			if (!context.gameStateManager || !context.reactionInitiativePlayerId) return {};
			const playerIds = context.gameStateManager.getPlayerIds();
			if (playerIds.length === 0) return {};

			const currentIndex = playerIds.indexOf(context.reactionInitiativePlayerId);
			const nextIndex = (currentIndex + 1) % playerIds.length;

			return {
				reactionInitiativePlayerId: playerIds[nextIndex],
				reactionInitiativePassCount: context.reactionInitiativePassCount + 1,
				nextReactionToResolve: null // Clear previous player's reaction
			};
		}),
		resolveNextReaction: assign(({ context }) => {
			if (!context.nextReactionToResolve || !context.gameStateManager) return {};

			const reaction = context.nextReactionToResolve;
			// Assuming effectProcessor.resolveEffect is synchronous for now or handles its own async
			context.gameStateManager.effectProcessor.resolveEffect(
				reaction.boundEffect,
				reaction.controllerId
			);
			context.gameStateManager.state.sharedZones.limbo.remove(reaction.id); // Assuming reaction has an id

			return {
				nextReactionToResolve: null
				// pendingReactionsCount and initiativePlayerReactions will be re-evaluated in evaluateLimbo
			};
		}),
		clearReactionContext: assign(() => {
			return {
				pendingReactionsCount: 0,
				initiativePlayerReactions: [],
				nextReactionToResolve: null,
				reactionInitiativePlayerId: null,
				reactionInitiativePassCount: 0
			};
		}),
		initializeCoreEngine: assign(({ context, event }) => {
			if (event.type !== 'INITIALIZE_GAME') return context;
			const eventBus = new EventBus();
			const gameStateManager = new GameStateManager(eventBus, event.players, []);
			const phaseManager = new PhaseManager(gameStateManager, eventBus);
			const turnManager = new TurnManager(gameStateManager, eventBus);
			const cardPlaySystem = new CardPlaySystem(gameStateManager, eventBus);
			return {
				...context,
				eventBus,
				gameStateManager,
				phaseManager,
				turnManager,
				cardPlaySystem,
				players: gameStateManager.state.players,
				currentPlayer: gameStateManager.state.currentPlayer,
				currentPhase: gameStateManager.state.currentPhase,
				currentDay: gameStateManager.state.currentDay,
				error: null
			};
		}),

		triggerGameStartInitialization: assign(({ context, event }) => {
			if (event.type !== 'START_GAME') return context;
			context.gameStateManager?.initializeGame();
			return {
				...context,
				selectedDeck: event.deckId,
				currentPhase: context.gameStateManager?.state.currentPhase || GamePhase.Morning,
				error: null
			};
		}),

		loadCardDefinitions: assign(({ context, event }) => {
			if (event.type !== 'LOAD_CARD_DEFINITIONS') return context;
			const cardDefinitions = new Map<string, ICardDefinition>();
			for (const cardDef of event.cardDefs) {
				cardDefinitions.set(cardDef.id, cardDef);
			}
			context.gameStateManager?.loadCardDefinitions(event.cardDefs);
			return {
				...context,
				cardDefinitions
			};
		}),

		playCard: assign(({ context, event }) => {
			if (event.type !== 'PLAY_CARD' || !context.cardPlaySystem) return context;
			context.cardPlaySystem.playCard(event.playerId, event.cardId, event.targetId);
			// The actual state change (selectedCard, etc.) should ideally come from events
			// published by CardPlaySystem and handled by GameStateManager, then reflected here.
			// For now, we keep it simple and don't assume immediate state changes in XState context
			// directly from this action, other than perhaps an error if playCard failed synchronously.
			return {
				...context,
				// selectedCard: event.cardId, // Potentially remove if CPS handles this via events
				error: null // Reset error, or set if playCard throws/returns error
			};
		}),

		advancePhase: assign(({ context }) => {
			if (!context.phaseManager || !context.gameStateManager) return context;
			context.phaseManager.advancePhase();
			return {
				...context,
				currentPhase: context.gameStateManager.state.currentPhase,
				currentDay: context.gameStateManager.state.currentDay,
				error: null
			};
		}),

		startAfternoonPhase: assign(({ context }) => {
			if (!context.turnManager || !context.gameStateManager) return context;
			context.turnManager.startAfternoon();
			return {
				...context,
				currentPlayer: context.gameStateManager.state.currentPlayerId
			};
		}),

		passTurn: assign(({ context }) => {
			if (!context.turnManager || !context.gameStateManager || !context.currentPlayer)
				return context;
			context.turnManager.playerPasses(context.currentPlayer);
			// currentPlayer and currentPhase might change as a result of playerPasses (if phase ends)
			return {
				...context,
				currentPlayer: context.gameStateManager.state.currentPlayerId,
				currentPhase: context.gameStateManager.state.currentPhase, // Reflect potential phase change
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
			eventBus: null,
			phaseManager: null,
			turnManager: null,
			cardPlaySystem: null,
			cardDefinitions: null,
			players: [],
			currentPlayer: null,
			currentPhase: GamePhase.Setup,
			currentDay: 1,
			selectedCard: null,
			selectedDeck: null,
			error: null,
			pendingReactionsCount: 0,
			initiativePlayerReactions: [],
			nextReactionToResolve: null,
			reactionInitiativePlayerId: null,
			reactionInitiativePassCount: 0
		}))
	},

	guards: {
		multipleReactionsAvailable: ({ context }) => {
			return context.initiativePlayerReactions.length > 1;
		},
		hasSingleReactionForInitiativePlayer: ({ context }) => {
			// evaluateLimbo sets nextReactionToResolve if length is 1.
			return (
				context.initiativePlayerReactions.length === 1 && context.nextReactionToResolve !== null
			);
		},
		// Renaming for clarity, effectively the same as old hasReactionsForInitiativePlayer after multiple check
		hasNextReactionToResolve: ({ context }) => {
			return context.nextReactionToResolve !== null;
		},
		canPassReactionInitiative: ({ context }) => {
			// True if there are pending reactions, current initiative player has no chosen/single reaction, and we haven't cycled through all players
			return (
				context.pendingReactionsCount > 0 &&
				context.nextReactionToResolve === null && // No single auto-selected reaction
				context.initiativePlayerReactions.length === 0 && // And no reactions for them to choose from (or they chose none)
				context.reactionInitiativePassCount < (context.players?.length || 0)
			);
		},
		noReactionsAtAllOrAllPassed: ({ context }) => {
			// True if no reactions pending globally, OR
			// if current initiative player has no reactions (nextReactionToResolve is null AND initiativePlayerReactions is empty) AND we've already tried passing to everyone
			return (
				context.pendingReactionsCount === 0 ||
				(context.nextReactionToResolve === null &&
					context.initiativePlayerReactions.length === 0 &&
					context.reactionInitiativePassCount >= (context.players?.length || 0))
			);
		},
		canPlayCard: ({ context, event }) => {
			// Basic guard, will need refinement with GameStateManager
			// Ensure it's the correct player's turn and the correct phase.
			// The actual check for card in hand, mana, etc., would be inside CardPlaySystem
			// or checked via gsm.canPlayCard(event.playerId, event.cardId).
			// For XState guard, we ensure basic conditions are met for the event to proceed.
			if (event.type !== 'PLAY_CARD') return false;
			return (
				context.currentPhase === GamePhase.Afternoon && context.currentPlayer === event.playerId
			);
			// context.selectedCard !== null was here, but event.cardId is more direct.
			// We assume event.cardId is provided.
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
		eventBus: null,
		phaseManager: null,
		turnManager: null,
		cardPlaySystem: null,
		cardDefinitions: null,
		players: [],
		currentPlayer: null,
		currentPhase: GamePhase.Setup,
		currentDay: 1,
		selectedCard: null,
		selectedDeck: null,
		error: null,
		pendingReactionsCount: 0,
		initiativePlayerReactions: [],
		nextReactionToResolve: null,
		reactionInitiativePlayerId: null,
		reactionInitiativePassCount: 0
	},
	states: {
		idle: {
			on: {
				INITIALIZE_GAME: {
					target: 'initializing',
					actions: 'initializeCoreEngine'
				}
			}
		},
		initializing: {
			on: {
				START_GAME: {
					target: 'playing',
					actions: 'triggerGameStartInitialization',
					guard: 'isGameInitialized'
				},
				LOAD_CARD_DEFINITIONS: {
					actions: 'loadCardDefinitions'
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
							target: 'checkingReactions',
							actions: 'passTurn'
						},
						SELECT_CARD: {
							target: 'waitingForAction',
							actions: 'selectCard'
						}
					}
				},
				processingCard: {
					after: {
						// Assuming playCard action is synchronous for now.
						// If it becomes async, this would be handled by onDone/onError from an invoked service.
						1: 'checkingReactions' // Short delay then check reactions
					}
				},
				advancingPhase: {
					entry: 'advancePhase',
					always: [
						{
							target: 'checkingReactions', // Check reactions after phase advance logic
							guard: ({ context }) => context.currentPhase !== GamePhase.Afternoon
						},
						{
							target: 'checkingReactions', // Check reactions after starting afternoon
							actions: 'startAfternoonPhase',
							guard: ({ context }) => context.currentPhase === GamePhase.Afternoon
						}
					]
				},
				checkingReactions: {
					initial: 'evaluatingLimbo',
					states: {
						evaluatingLimbo: {
							entry: 'evaluateLimbo',
							always: [
								{ target: 'awaitingReactionChoice', guard: 'multipleReactionsAvailable' },
								{ target: 'resolvingReaction', guard: 'hasSingleReactionForInitiativePlayer' }, // True if exactly one
								{
									target: 'evaluatingLimbo',
									actions: 'passReactionInitiative',
									guard: 'canPassReactionInitiative' // No reactions for current player, can pass
								},
								// Default: No reactions for current initiative player, and cannot pass initiative further
								{
									target: '#game.playing.gameFlowContinuationPoint',
									guard: 'noReactionsAtAllOrAllPassed'
								}
							]
						},
						awaitingReactionChoice: {
							on: {
								CHOOSE_REACTION_TO_PLAY: {
									target: 'resolvingReaction',
									actions: 'setChosenReaction'
								}
								// TODO: Add timeout or auto-pass/auto-resolve default if player doesn't choose?
							}
						},
						resolvingReaction: {
							entry: 'resolveNextReaction',
							always: { target: 'evaluatingLimbo' }
						}
					}
				},
				gameFlowContinuationPoint: {
					entry: 'clearReactionContext',
					always: { target: 'waitingForAction' } // Simplified: always go back to waitingForAction
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
					actions: 'initializeCoreEngine'
				}
			}
		}
	}
});
