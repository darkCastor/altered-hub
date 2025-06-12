import { setup, assign, assertEvent } from 'xstate';
import { deckValidator, type DeckValidationResult, type DeckFormat } from '$lib/deckValidation';
import { dbPromise } from '$lib/rxdb';

// RxDB Deck type (dates as strings)
export interface DeckDoc {
	id: string;
	name: string;
	description: string;
	cards: DeckCard[];
	heroId: string | null;
	format: DeckFormat;
	isValid: boolean;
	createdAt: string; // ISO string
	updatedAt: string; // ISO string
}

interface DeckContext {
	decks: Deck[]; // This will store Deck with Date objects
	currentDeck: Deck | null;
	selectedCards: string[];
	searchQuery: string;
	filters: DeckFilters;
	validationResult: DeckValidationResult | null;
	isLoading: boolean;
	error: string | null;
}

// This is the Deck type used in the machine's context (dates as Date objects)
export interface Deck {
	id: string;
	name: string;
	description: string;
	cards: DeckCard[];
	heroId: string | null;
	format: DeckFormat;
	isValid: boolean;
	createdAt: Date; // Date object
	updatedAt: Date; // Date object
}

interface DeckCard {
	cardId: string;
	quantity: number;
}

interface DeckFilters {
	faction?: string;
	type?: string;
	rarity?: string;
	cost?: number;
}

type DeckEvents =
	| { type: 'LOAD_DECKS' }
	| { type: 'CREATE_DECK'; name: string; description?: string; format?: DeckFormat }
	| { type: 'EDIT_DECK'; deckId: string }
	| { type: 'DELETE_DECK'; deckId: string }
	| { type: 'ADD_CARD'; cardId: string; quantity?: number }
	| { type: 'REMOVE_CARD'; cardId: string }
	| { type: 'UPDATE_CARD_QUANTITY'; cardId: string; quantity: number }
	| { type: 'SET_HERO'; cardId: string }
	| { type: 'SET_FORMAT'; format: DeckFormat }
	| { type: 'VALIDATE_DECK' }
	| { type: 'SAVE_DECK' }
	| { type: 'SEARCH_CARDS'; query: string }
	| { type: 'APPLY_FILTERS'; filters: DeckFilters }
	| { type: 'CLEAR_FILTERS' }
	| { type: 'DECKS_LOADED'; decks: Deck[] } // from loadDecksFromDb
	| { type: 'DECK_LOAD_FAILED'; error: unknown }
	| { type: 'DECK_SAVED'; deck: Deck } // from saveDeckToDb
	| { type: 'DECK_SAVE_FAILED'; error: unknown }
	| { type: 'DECK_DELETED'; deckId: string } // from deleteDeckFromDb
	| { type: 'DECK_DELETE_FAILED'; error: unknown }
	| { type: 'ERROR'; message: string } // General error
	| { type: 'CLEAR_ERROR' };

// Helper to convert DB doc to Machine's Deck type
function fromDocToDeck(doc: DeckDoc): Deck {
	return {
		...doc,
		createdAt: new Date(doc.createdAt),
		updatedAt: new Date(doc.updatedAt)
	};
}

// Helper to convert Machine's Deck type to DB doc
function fromDeckToDoc(deck: Deck): DeckDoc {
	return {
		...deck,
		createdAt: deck.createdAt.toISOString(),
		updatedAt: deck.updatedAt.toISOString()
	};
}

export const deckMachine = setup({
	types: {
		context: {} as DeckContext,
		events: {} as DeckEvents,
		actors: {} as {
			loadDecksFromDb: { data: Deck[] };
			saveDeckToDb: { data: Deck; input: { deckToSave: Deck } };
			deleteDeckFromDb: { data: { id: string }; input: { deckId: string } };
		}
	},
	actors: {
		loadDecksFromDb: async () => {
			const db = await dbPromise;
			const deckDocs = await db.decks.find().exec();
			return deckDocs.map((doc) => fromDocToDeck(doc.toJSON()));
		},
		saveDeckToDb: async ({ input }: { input: { deckToSave: Deck } }) => {
			const db = await dbPromise;
			if (!input.deckToSave) throw new Error('No deck to save');
			const deckDoc = fromDeckToDoc(input.deckToSave);
			await db.decks.upsert(deckDoc);
			return input.deckToSave; // Return the original deck with Date objects
		},
		deleteDeckFromDb: async ({ input }: { input: { deckId: string } }) => {
			const db = await dbPromise;
			const doc = await db.decks.findOne(input.deckId).exec();
			if (doc) {
				await doc.remove();
				return { id: input.deckId };
			}
			throw new Error('Deck not found for deletion');
		}
	},
	actions: {
		// loadDecks action is removed, handled by invoke
		assignDecksToContext: assign(({ event }) => {
			assertEvent(event, 'DECKS_LOADED');
			return {
				decks: event.decks,
				isLoading: false,
				error: null
			};
		}),
		assignLoadErrorToContext: assign(({ event }) => {
			assertEvent(event, 'DECK_LOAD_FAILED');
			return {
				isLoading: false,
				error: event.error instanceof Error ? event.error.message : 'Failed to load decks'
			};
		}),
		createDeck: assign(({ event }) => {
			assertEvent(event, 'CREATE_DECK');

			const format = event.format || 'constructed';
			deckValidator.setFormat(format);
			// Removed redundant declaration of 'format'

			const newDeck: Deck = {
				id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Ensure more unique ID
				name: event.name,
				description: event.description || '',
				cards: [],
				heroId: null,
				format,
				isValid: false, // Will be updated by validation
				createdAt: new Date(),
				updatedAt: new Date()
			};
			// Initial validation for the new deck
			const validationResult = deckValidator.validate(newDeck.cards, newDeck.heroId || undefined);
			newDeck.isValid = validationResult.isValid;

			return {
				currentDeck: newDeck,
				validationResult: validationResult, // Store initial validation
				error: null
			};
		}),

		assignCurrentDeckFromLoaded: assign(({ context, event }) => {
			assertEvent(event, 'EDIT_DECK');
			const deckToEdit = context.decks.find((d) => d.id === event.deckId);
			if (deckToEdit) {
				deckValidator.setFormat(deckToEdit.format);
				const validationResult = deckValidator.validate(
					deckToEdit.cards,
					deckToEdit.heroId || undefined
				);
				return {
					currentDeck: deckToEdit,
					validationResult: validationResult,
					error: null
				};
			}
			return {
				currentDeck: null, // Should not happen if UI is correct
				validationResult: null,
				error: 'Deck not found for editing'
			};
		}),

		// deleteDeck action is removed, handled by invoke

		assignDeletedDeckToContext: assign(({ context, event }) => {
			assertEvent(event, 'DECK_DELETED');
			return {
				decks: context.decks.filter((d) => d.id !== event.deckId),
				currentDeck: context.currentDeck?.id === event.deckId ? null : context.currentDeck,
				isLoading: false,
				error: null
			};
		}),
		assignDeleteErrorToContext: assign(({ event }) => {
			assertEvent(event, 'DECK_DELETE_FAILED');
			return {
				isLoading: false,
				error: event.error instanceof Error ? event.error.message : 'Failed to delete deck'
			};
		}),

		addCard: assign(({ context, event }) => {
			assertEvent(event, 'ADD_CARD');
			if (!context.currentDeck) return {};

			// Check if card can be added according to deck building rules
			deckValidator.setFormat(context.currentDeck.format);
			const canAddResult = deckValidator.canAddCard(
				context.currentDeck.cards,
				event.cardId,
				context.currentDeck.heroId || undefined
			);

			if (!canAddResult.canAdd) {
				return {
					...context,
					error: canAddResult.reason || 'Cannot add card'
				};
			}

			const existingCard = context.currentDeck.cards.find((c) => c.cardId === event.cardId);
			let updatedCards;

			if (existingCard) {
				const maxCopies =
					context.currentDeck.format === 'constructed' ? 3 : Number.MAX_SAFE_INTEGER;
				updatedCards = context.currentDeck.cards.map((c) =>
					c.cardId === event.cardId
						? { ...c, quantity: Math.min(maxCopies, c.quantity + (event.quantity || 1)) }
						: c
				);
			} else {
				updatedCards = [
					...context.currentDeck.cards,
					{
						cardId: event.cardId,
						quantity: event.quantity || 1
					}
				];
			}

			const updatedDeck = {
				...context.currentDeck,
				cards: updatedCards,
				updatedAt: new Date()
			};
			const validationResult = deckValidator.validate(
				updatedDeck.cards,
				updatedDeck.heroId || undefined
			);
			return {
				currentDeck: { ...updatedDeck, isValid: validationResult.isValid },
				validationResult,
				error: null
			};
		}),

		removeCard: assign(({ context, event }) => {
			assertEvent(event, 'REMOVE_CARD');
			if (!context.currentDeck) return {};

			const updatedDeck = {
				...context.currentDeck,
				cards: context.currentDeck.cards.filter((c) => c.cardId !== event.cardId),
				updatedAt: new Date()
			};
			const validationResult = deckValidator.validate(
				updatedDeck.cards,
				updatedDeck.heroId || undefined
			);
			return {
				currentDeck: { ...updatedDeck, isValid: validationResult.isValid },
				validationResult,
				error: null
			};
		}),

		updateCardQuantity: assign(({ context, event }) => {
			assertEvent(event, 'UPDATE_CARD_QUANTITY');
			if (!context.currentDeck) return {};

			const updatedCards = context.currentDeck.cards
				.map((c) =>
					c.cardId === event.cardId
						? { ...c, quantity: Math.max(0, Math.min(3, event.quantity)) }
						: c
				)
				.filter((c) => c.quantity > 0);

			const updatedDeck = {
				...context.currentDeck,
				cards: updatedCards,
				updatedAt: new Date()
			};
			const validationResult = deckValidator.validate(
				updatedDeck.cards,
				updatedDeck.heroId || undefined
			);
			return {
				currentDeck: { ...updatedDeck, isValid: validationResult.isValid },
				validationResult,
				error: null
			};
		}),

		setHero: assign(({ context, event }) => {
			assertEvent(event, 'SET_HERO');
			if (!context.currentDeck) return {};

			const updatedDeck = {
				...context.currentDeck,
				heroId: event.cardId,
				updatedAt: new Date()
			};
			const validationResult = deckValidator.validate(
				updatedDeck.cards,
				updatedDeck.heroId || undefined
			);
			return {
				currentDeck: { ...updatedDeck, isValid: validationResult.isValid },
				validationResult,
				error: null
			};
		}),

		setFormat: assign(({ context, event }) => {
			assertEvent(event, 'SET_FORMAT');
			if (!context.currentDeck) return {};

			deckValidator.setFormat(event.format);
			const updatedDeck = {
				...context.currentDeck,
				format: event.format,
				updatedAt: new Date()
			};
			const validationResult = deckValidator.validate(
				updatedDeck.cards,
				updatedDeck.heroId || undefined
			);
			return {
				currentDeck: { ...updatedDeck, isValid: validationResult.isValid },
				validationResult,
				error: null
			};
		}),

		validateCurrentDeck: assign(({ context }) => {
			if (!context.currentDeck) return {};
			deckValidator.setFormat(context.currentDeck.format);
			const validationResult = deckValidator.validate(
				context.currentDeck.cards,
				context.currentDeck.heroId || undefined
			);
			return {
				currentDeck: { ...context.currentDeck, isValid: validationResult.isValid },
				validationResult
			};
		}),

		assignSavedDeckToContext: assign(({ context, event }) => {
			assertEvent(event, 'DECK_SAVED');
			// Update the deck in the list of decks, or add if new
			const newDecks = context.decks.filter((d) => d.id !== event.deck.id);
			newDecks.push(event.deck);
			return {
				decks: newDecks,
				currentDeck: event.deck, // Update currentDeck to the saved one
				isLoading: false,
				error: null
			};
		}),
		assignSaveErrorToContext: assign(({ event }) => {
			assertEvent(event, 'DECK_SAVE_FAILED');
			return {
				isLoading: false,
				error: event.error instanceof Error ? event.error.message : 'Failed to save deck'
			};
		}),

		setSearchQuery: assign(({ event }) => {
			assertEvent(event, 'SEARCH_CARDS');
			return { searchQuery: event.query };
		}),

		applyDeckFilters: assign(({ event }) => {
			assertEvent(event, 'APPLY_FILTERS');
			return { filters: event.filters };
		}),

		clearDeckFilters: assign(() => ({
			filters: {},
			searchQuery: ''
		})),

		assignErrorToContext: assign(({ event }) => {
			assertEvent(event, 'ERROR');
			return {
				error: event.message,
				isLoading: false
			};
		}),

		clearErrorFromContext: assign(() => ({
			error: null
		}))
	},

	guards: {
		hasDeckToSave: ({ context }) => context.currentDeck !== null,
		isCurrentDeckValid: ({ context }) => context.currentDeck?.isValid === true,
		// canAddCard guard remains the same
		canAddCard: ({ context, event }) => {
			assertEvent(event, 'ADD_CARD');
			if (!context.currentDeck) return false;
			deckValidator.setFormat(context.currentDeck.format);
			const result = deckValidator.canAddCard(
				context.currentDeck.cards,
				event.cardId,
				context.currentDeck.heroId || undefined
			);
			return result.canAdd;
		}
	}
}).createMachine({
	id: 'deck',
	initial: 'initializing',
	context: {
		decks: [],
		currentDeck: null,
		selectedCards: [], // This might need to be reviewed if it's actively used
		searchQuery: '',
		filters: {},
		validationResult: null,
		isLoading: true, // Start with loading true
		error: null
	},
	states: {
		initializing: {
			invoke: {
				id: 'loadDecksFromDb',
				src: 'loadDecksFromDb',
				onDone: {
					target: 'idle',
					actions: 'assignDecksToContext'
				},
				onError: {
					target: 'errorLoading',
					actions: 'assignLoadErrorToContext'
				}
			}
		},
		idle: {
			entry: assign({ isLoading: false }),
			on: {
				LOAD_DECKS: 'initializing', // Re-load
				CREATE_DECK: {
					target: 'editing',
					actions: 'createDeck'
				},
				EDIT_DECK: {
					target: 'editing',
					actions: 'assignCurrentDeckFromLoaded'
				},
				DELETE_DECK: {
					target: 'deleting'
					// Guard: check if deckId is valid or exists?
				}
			}
		},
		// loading state is effectively 'initializing' now
		// loaded state is effectively 'idle' now

		editing: {
			entry: assign({ isLoading: false }),
			on: {
				ADD_CARD: { actions: 'addCard' },
				REMOVE_CARD: { actions: 'removeCard' },
				UPDATE_CARD_QUANTITY: { actions: 'updateCardQuantity' },
				SET_HERO: { actions: 'setHero' },
				SET_FORMAT: { actions: 'setFormat' },
				VALIDATE_DECK: { actions: 'validateCurrentDeck' },
				SAVE_DECK: {
					target: 'saving',
					guard: 'hasDeckToSave'
					// Consider adding guard: 'isCurrentDeckValid' if saving should only happen for valid decks
				},
				SEARCH_CARDS: { actions: 'setSearchQuery' },
				APPLY_FILTERS: { actions: 'applyDeckFilters' },
				CLEAR_FILTERS: { actions: 'clearDeckFilters' },
				LOAD_DECKS: 'initializing', // Go back to loading if requested
				EDIT_DECK: {
					// If user clicks edit on another deck while already editing
					target: 'editing',
					actions: 'assignCurrentDeckFromLoaded'
				}
			}
		},
		saving: {
			entry: assign({ isLoading: true }),
			invoke: {
				id: 'saveDeckToDb',
				src: 'saveDeckToDb',
				input: ({ context }) => ({ deckToSave: context.currentDeck! }), // currentDeck is guarded by hasDeckToSave
				onDone: {
					target: 'idle', // Or 'editing' if staying on the page
					actions: 'assignSavedDeckToContext'
				},
				onError: {
					target: 'editing', // Stay in editing mode on save failure
					actions: 'assignSaveErrorToContext'
				}
			}
		},
		deleting: {
			entry: assign({ isLoading: true }),
			invoke: {
				id: 'deleteDeckFromDb',
				src: 'deleteDeckFromDb',
				input: ({ event }) => {
					// Assuming DELETE_DECK event carries the deckId
					assertEvent(event, 'DELETE_DECK');
					return { deckId: event.deckId };
				},
				onDone: {
					target: 'idle',
					actions: 'assignDeletedDeckToContext'
				},
				onError: {
					target: 'idle', // Or a specific error state for deletion
					actions: 'assignDeleteErrorToContext'
				}
			}
		},
		errorLoading: {
			// Specific error state for initial load
			on: {
				LOAD_DECKS: 'initializing',
				CLEAR_ERROR: {
					target: 'idle',
					actions: 'clearErrorFromContext'
				}
			}
		},
		error: {
			// General error state (can be merged with errorLoading or kept separate)
			on: {
				CLEAR_ERROR: {
					target: 'idle', // Or previous state if known
					actions: 'clearErrorFromContext'
				},
				LOAD_DECKS: 'initializing' // Allow reloading
			}
		}
	}
});
