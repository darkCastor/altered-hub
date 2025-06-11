import { setup, assign } from 'xstate';
import { deckValidator, type DeckValidationResult, type DeckFormat } from '$lib/deckValidation';
import type { AlteredCard } from '$types';

interface DeckContext {
	decks: Deck[];
	currentDeck: Deck | null;
	selectedCards: string[];
	searchQuery: string;
	filters: DeckFilters;
	validationResult: DeckValidationResult | null;
	isLoading: boolean;
	error: string | null;
}

interface Deck {
	id: string;
	name: string;
	description: string;
	cards: DeckCard[];
	heroId: string | null;
	format: DeckFormat;
	isValid: boolean;
	createdAt: Date;
	updatedAt: Date;
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
	| { type: 'DECKS_LOADED'; decks: Deck[] }
	| { type: 'DECK_SAVED'; deck: Deck }
	| { type: 'ERROR'; message: string }
	| { type: 'CLEAR_ERROR' };

export const deckMachine = setup({
	types: {
		context: {} as DeckContext,
		events: {} as DeckEvents
	},
	actions: {
		loadDecks: assign(({ context }) => ({
			...context,
			isLoading: true,
			error: null
		})),

		setDecks: assign(({ context, event }) => {
			if (event.type !== 'DECKS_LOADED') return context;
			return {
				...context,
				decks: event.decks,
				isLoading: false,
				error: null
			};
		}),

		createDeck: assign(({ context, event }) => {
			if (event.type !== 'CREATE_DECK') return context;
			
			const format = event.format || 'constructed';
			deckValidator.setFormat(format);
			
			const newDeck: Deck = {
				id: `deck-${Date.now()}`,
				name: event.name,
				description: event.description || '',
				cards: [],
				heroId: null,
				format,
				isValid: false,
				createdAt: new Date(),
				updatedAt: new Date()
			};

			return {
				...context,
				currentDeck: newDeck,
				validationResult: null,
				error: null
			};
		}),

		editDeck: assign(({ context, event }) => {
			if (event.type !== 'EDIT_DECK') return context;
			
			const deck = context.decks.find(d => d.id === event.deckId);
			if (deck) {
				deckValidator.setFormat(deck.format);
			}
			
			return {
				...context,
				currentDeck: deck || null,
				validationResult: null,
				error: null
			};
		}),

		deleteDeck: assign(({ context, event }) => {
			if (event.type !== 'DELETE_DECK') return context;
			
			return {
				...context,
				decks: context.decks.filter(d => d.id !== event.deckId),
				currentDeck: context.currentDeck?.id === event.deckId ? null : context.currentDeck,
				error: null
			};
		}),

		addCard: assign(({ context, event }) => {
			if (event.type !== 'ADD_CARD' || !context.currentDeck) return context;
			
			// Check if card can be added according to deck building rules
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
			
			const existingCard = context.currentDeck.cards.find(c => c.cardId === event.cardId);
			let updatedCards;
			
			if (existingCard) {
				const maxCopies = context.currentDeck.format === 'constructed' ? 3 : Number.MAX_SAFE_INTEGER;
				updatedCards = context.currentDeck.cards.map(c =>
					c.cardId === event.cardId
						? { ...c, quantity: Math.min(maxCopies, c.quantity + (event.quantity || 1)) }
						: c
				);
			} else {
				updatedCards = [...context.currentDeck.cards, {
					cardId: event.cardId,
					quantity: event.quantity || 1
				}];
			}

			const updatedDeck = {
				...context.currentDeck,
				cards: updatedCards,
				updatedAt: new Date()
			};

			// Auto-validate after adding card
			const validationResult = deckValidator.validate(updatedDeck.cards, updatedDeck.heroId || undefined);

			return {
				...context,
				currentDeck: {
					...updatedDeck,
					isValid: validationResult.isValid
				},
				validationResult,
				error: null
			};
		}),

		removeCard: assign(({ context, event }) => {
			if (event.type !== 'REMOVE_CARD' || !context.currentDeck) return context;
			
			return {
				...context,
				currentDeck: {
					...context.currentDeck,
					cards: context.currentDeck.cards.filter(c => c.cardId !== event.cardId),
					updatedAt: new Date()
				},
				error: null
			};
		}),

		updateCardQuantity: assign(({ context, event }) => {
			if (event.type !== 'UPDATE_CARD_QUANTITY' || !context.currentDeck) return context;
			
			const updatedCards = context.currentDeck.cards.map(c =>
				c.cardId === event.cardId
					? { ...c, quantity: Math.max(0, Math.min(3, event.quantity)) }
					: c
			).filter(c => c.quantity > 0);

			return {
				...context,
				currentDeck: {
					...context.currentDeck,
					cards: updatedCards,
					updatedAt: new Date()
				},
				error: null
			};
		}),

		setHero: assign(({ context, event }) => {
			if (event.type !== 'SET_HERO' || !context.currentDeck) return context;
			
			const updatedDeck = {
				...context.currentDeck,
				heroId: event.cardId,
				updatedAt: new Date()
			};

			// Auto-validate after setting hero
			const validationResult = deckValidator.validate(updatedDeck.cards, updatedDeck.heroId || undefined);
			
			return {
				...context,
				currentDeck: {
					...updatedDeck,
					isValid: validationResult.isValid
				},
				validationResult,
				error: null
			};
		}),

		setFormat: assign(({ context, event }) => {
			if (event.type !== 'SET_FORMAT' || !context.currentDeck) return context;
			
			deckValidator.setFormat(event.format);
			
			const updatedDeck = {
				...context.currentDeck,
				format: event.format,
				updatedAt: new Date()
			};

			// Auto-validate after changing format
			const validationResult = deckValidator.validate(updatedDeck.cards, updatedDeck.heroId || undefined);
			
			return {
				...context,
				currentDeck: {
					...updatedDeck,
					isValid: validationResult.isValid
				},
				validationResult,
				error: null
			};
		}),

		validateDeck: assign(({ context }) => {
			if (!context.currentDeck) return context;
			
			deckValidator.setFormat(context.currentDeck.format);
			const validationResult = deckValidator.validate(
				context.currentDeck.cards, 
				context.currentDeck.heroId || undefined
			);
			
			return {
				...context,
				currentDeck: {
					...context.currentDeck,
					isValid: validationResult.isValid
				},
				validationResult,
				error: null
			};
		}),

		saveDeck: assign(({ context, event }) => {
			if (event.type !== 'DECK_SAVED' || !context.currentDeck) return context;
			
			const updatedDecks = context.decks.some(d => d.id === event.deck.id)
				? context.decks.map(d => d.id === event.deck.id ? event.deck : d)
				: [...context.decks, event.deck];

			return {
				...context,
				decks: updatedDecks,
				currentDeck: event.deck,
				error: null
			};
		}),

		searchCards: assign(({ context, event }) => {
			if (event.type !== 'SEARCH_CARDS') return context;
			
			return {
				...context,
				searchQuery: event.query,
				error: null
			};
		}),

		applyFilters: assign(({ context, event }) => {
			if (event.type !== 'APPLY_FILTERS') return context;
			
			return {
				...context,
				filters: { ...context.filters, ...event.filters },
				error: null
			};
		}),

		clearFilters: assign(({ context }) => ({
			...context,
			filters: {},
			searchQuery: '',
			error: null
		})),

		setError: assign(({ context, event }) => {
			if (event.type !== 'ERROR') return context;
			
			return {
				...context,
				error: event.message,
				isLoading: false
			};
		}),

		clearError: assign(({ context }) => ({
			...context,
			error: null
		}))
	},

	guards: {
		hasDeck: ({ context }) => context.currentDeck !== null,
		isDeckValid: ({ context }) => context.currentDeck?.isValid === true,
		canAddCard: ({ context, event }) => {
			if (event.type !== 'ADD_CARD' || !context.currentDeck) return false;
			
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
	initial: 'idle',
	context: {
		decks: [],
		currentDeck: null,
		selectedCards: [],
		searchQuery: '',
		filters: {},
		validationResult: null,
		isLoading: false,
		error: null
	},
	states: {
		idle: {
			on: {
				LOAD_DECKS: 'loading',
				CREATE_DECK: {
					target: 'editing',
					actions: 'createDeck'
				},
				EDIT_DECK: {
					target: 'editing',
					actions: 'editDeck'
				}
			}
		},
		loading: {
			entry: 'loadDecks',
			on: {
				DECKS_LOADED: {
					target: 'loaded',
					actions: 'setDecks'
				},
				ERROR: {
					target: 'error',
					actions: 'setError'
				}
			}
		},
		loaded: {
			on: {
				CREATE_DECK: {
					target: 'editing',
					actions: 'createDeck'
				},
				EDIT_DECK: {
					target: 'editing',
					actions: 'editDeck'
				},
				DELETE_DECK: {
					target: 'loaded',
					actions: 'deleteDeck'
				},
				SEARCH_CARDS: {
					target: 'loaded',
					actions: 'searchCards'
				},
				APPLY_FILTERS: {
					target: 'loaded',
					actions: 'applyFilters'
				},
				CLEAR_FILTERS: {
					target: 'loaded',
					actions: 'clearFilters'
				}
			}
		},
		editing: {
			on: {
				ADD_CARD: {
					target: 'editing',
					actions: 'addCard',
					guard: 'canAddCard'
				},
				REMOVE_CARD: {
					target: 'editing',
					actions: 'removeCard'
				},
				UPDATE_CARD_QUANTITY: {
					target: 'editing',
					actions: 'updateCardQuantity'
				},
				SET_HERO: {
					target: 'editing',
					actions: 'setHero'
				},
				SET_FORMAT: {
					target: 'editing',
					actions: 'setFormat'
				},
				VALIDATE_DECK: {
					target: 'editing',
					actions: 'validateDeck'
				},
				SAVE_DECK: {
					target: 'saving',
					guard: 'hasDeck'
				},
				SEARCH_CARDS: {
					target: 'editing',
					actions: 'searchCards'
				},
				APPLY_FILTERS: {
					target: 'editing',
					actions: 'applyFilters'
				},
				CLEAR_FILTERS: {
					target: 'editing',
					actions: 'clearFilters'
				}
			}
		},
		saving: {
			on: {
				DECK_SAVED: {
					target: 'loaded',
					actions: 'saveDeck'
				},
				ERROR: {
					target: 'editing',
					actions: 'setError'
				}
			}
		},
		error: {
			on: {
				CLEAR_ERROR: {
					target: 'idle',
					actions: 'clearError'
				},
				LOAD_DECKS: 'loading'
			}
		}
	}
});