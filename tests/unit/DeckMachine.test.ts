import { describe, it, expect, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { deckMachine } from '../../src/lib/state/deckMachine';

// TODO: Mock card data for future mock implementation
/* const mockCardData = {
	// Axiom Hero
	ALT_CORE_H_AX_01_C: {
		id: 'ALT_CORE_H_AX_01_C',
		name: 'Teija, Mage Intuitif',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Common',
		imageUrl: 'test-url'
	},
	// Bravos Hero
	ALT_CORE_H_BR_01_C: {
		id: 'ALT_CORE_H_BR_01_C',
		name: 'Rin, Soldat Déterminé',
		type: 'CHARACTER',
		faction: 'Bravos',
		rarity: 'Common',
		imageUrl: 'test-url'
	},
	// Axiom Common Character
	ALT_CORE_C_AX_01_C: {
		id: 'ALT_CORE_C_AX_01_C',
		name: 'Garde Axiome',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Common',
		imageUrl: 'test-url'
	},
	// Axiom Rare Character
	ALT_CORE_C_AX_02_R: {
		id: 'ALT_CORE_C_AX_02_R',
		name: 'Archiviste Axiome',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Rare',
		imageUrl: 'test-url'
	},
	// Bravos Character (different faction)
	ALT_CORE_C_BR_01_C: {
		id: 'ALT_CORE_C_BR_01_C',
		name: 'Guerrier Bravos',
		type: 'CHARACTER',
		faction: 'Bravos',
		rarity: 'Common',
		imageUrl: 'test-url'
	}
}; */

// Note: Mock setup would need to be configured for Bun test runner
// For now, the test assumes card data is available

describe('Deck State Machine', () => {
	let actor: ReturnType<typeof createActor>;

	beforeEach(() => {
		actor = createActor(deckMachine);
		actor.start();
	});

	describe('Initial State', () => {
		it('should start in idle state', () => {
			expect(actor.getSnapshot().value).toBe('idle');
		});

		it('should have empty initial context', () => {
			const snapshot = actor.getSnapshot();
			expect(snapshot.context.decks).toEqual([]);
			expect(snapshot.context.currentDeck).toBeNull();
			expect(snapshot.context.validationResult).toBeNull();
			expect(snapshot.context.error).toBeNull();
		});
	});

	describe('CREATE_DECK Action', () => {
		it('should create a new deck and transition to editing state', () => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				description: 'A test deck',
				format: 'constructed'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.value).toBe('editing');
			expect(snapshot.context.currentDeck).not.toBeNull();
			expect(snapshot.context.currentDeck?.name).toBe('Test Deck');
			expect(snapshot.context.currentDeck?.description).toBe('A test deck');
			expect(snapshot.context.currentDeck?.format).toBe('constructed');
			expect(snapshot.context.currentDeck?.cards).toEqual([]);
			expect(snapshot.context.currentDeck?.heroId).toBeNull();
			expect(snapshot.context.currentDeck?.isValid).toBe(false);
		});

		it('should default to constructed format if not specified', () => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.format).toBe('constructed');
		});

		it('should create limited format deck when specified', () => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Limited Deck',
				format: 'limited'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.format).toBe('limited');
		});
	});

	describe('SET_HERO Action', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
		});

		it('should set hero and trigger validation', () => {
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.heroId).toBe('ALT_CORE_H_AX_01_C');
			expect(snapshot.context.validationResult).not.toBeNull();
			expect(snapshot.context.validationResult?.stats.heroCount).toBe(1);
		});

		it('should update deck validity based on validation', () => {
			// Add 39 cards to make deck valid
			for (let i = 0; i < 39; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_01_C'
				});
			}

			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.isValid).toBe(true);
			expect(snapshot.context.validationResult?.isValid).toBe(true);
		});
	});

	describe('ADD_CARD Action', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});
		});

		it('should add valid card to deck', () => {
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards).toHaveLength(1);
			expect(snapshot.context.currentDeck?.cards[0]).toEqual({
				cardId: 'ALT_CORE_C_AX_01_C',
				quantity: 1
			});
			expect(snapshot.context.error).toBeNull();
		});

		it('should increment quantity for existing card', () => {
			// Add first copy
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			// Add second copy
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards).toHaveLength(1);
			expect(snapshot.context.currentDeck?.cards[0]).toEqual({
				cardId: 'ALT_CORE_C_AX_01_C',
				quantity: 2
			});
		});

		it('should prevent adding more than 3 copies in constructed format', () => {
			// Add 3 copies
			for (let i = 0; i < 3; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_01_C'
				});
			}

			// Try to add 4th copy
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(3);
			expect(snapshot.context.error).toContain('Maximum 3 copies per card');
		});

		it('should prevent adding cards of wrong faction', () => {
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_BR_01_C' // Bravos card with Axiom hero
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
			expect(snapshot.context.error).toContain(
				'Card faction (Bravos) must match Hero faction (Axiom)'
			);
		});

		it('should trigger validation after adding card', () => {
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult).not.toBeNull();
			expect(snapshot.context.validationResult?.stats.totalCards).toBe(2); // 1 card + 1 hero
		});

		it('should respect guard - canAddCard', () => {
			// Fill deck to limit for rare cards (15)
			for (let i = 0; i < 15; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_02_R'
				});
			}

			// This should be blocked by the guard before reaching the action
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_02_R'
			});

			const snapshot = actor.getSnapshot();
			// The guard should prevent this action from executing
			// The error should be set explaining why
			expect(snapshot.context.error).toContain('Maximum 15 rare cards allowed');
		});
	});

	describe('REMOVE_CARD Action', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});
		});

		it('should remove card from deck', () => {
			actor.send({
				type: 'REMOVE_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
		});

		it('should trigger validation after removing card', () => {
			actor.send({
				type: 'REMOVE_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult).not.toBeNull();
			expect(snapshot.context.validationResult?.stats.totalCards).toBe(1); // Only hero left
		});
	});

	describe('UPDATE_CARD_QUANTITY Action', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});
		});

		it('should update card quantity', () => {
			actor.send({
				type: 'UPDATE_CARD_QUANTITY',
				cardId: 'ALT_CORE_C_AX_01_C',
				quantity: 3
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(3);
		});

		it('should enforce maximum 3 copies in constructed format', () => {
			actor.send({
				type: 'UPDATE_CARD_QUANTITY',
				cardId: 'ALT_CORE_C_AX_01_C',
				quantity: 5
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(3); // Capped at 3
		});

		it('should remove card if quantity is 0', () => {
			actor.send({
				type: 'UPDATE_CARD_QUANTITY',
				cardId: 'ALT_CORE_C_AX_01_C',
				quantity: 0
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
		});

		it('should trigger validation after updating quantity', () => {
			actor.send({
				type: 'UPDATE_CARD_QUANTITY',
				cardId: 'ALT_CORE_C_AX_01_C',
				quantity: 2
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult).not.toBeNull();
			expect(snapshot.context.validationResult?.stats.totalCards).toBe(3); // 2 cards + 1 hero
		});
	});

	describe('SET_FORMAT Action', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
		});

		it('should change deck format', () => {
			actor.send({
				type: 'SET_FORMAT',
				format: 'limited'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.format).toBe('limited');
		});

		it('should trigger validation after format change', () => {
			// Add 5 copies of same card (invalid in constructed, valid in limited)
			for (let i = 0; i < 5; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_01_C'
				});
			}

			// Should be invalid in constructed due to copy limit
			let snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult?.isValid).toBe(false);

			// Switch to limited format
			actor.send({
				type: 'SET_FORMAT',
				format: 'limited'
			});

			snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult).not.toBeNull();
			// Should now be valid in limited format (no copy restrictions)
			const hasValidQuantity = !snapshot.context.validationResult?.errors.some((e) =>
				e.includes('copies')
			);
			expect(hasValidQuantity).toBe(true);
		});
	});

	describe('VALIDATE_DECK Action', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
		});

		it('should manually trigger validation', () => {
			actor.send({ type: 'VALIDATE_DECK' });

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult).not.toBeNull();
			expect(snapshot.context.validationResult?.isValid).toBe(false); // Missing hero and cards
		});

		it('should update deck validity based on validation result', () => {
			// Create a valid deck
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			for (let i = 0; i < 39; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_01_C'
				});
			}

			actor.send({ type: 'VALIDATE_DECK' });

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.isValid).toBe(true);
			expect(snapshot.context.validationResult?.isValid).toBe(true);
		});
	});

	describe('Format-Specific Behavior', () => {
		describe('Constructed Format', () => {
			beforeEach(() => {
				actor.send({
					type: 'CREATE_DECK',
					name: 'Constructed Deck',
					format: 'constructed'
				});
				actor.send({
					type: 'SET_HERO',
					cardId: 'ALT_CORE_H_AX_01_C'
				});
			});

			it('should create a valid constructed deck following all rules', () => {
				// Add exactly 39 cards to meet minimum requirement
				for (let i = 0; i < 39; i++) {
					actor.send({
						type: 'ADD_CARD',
						cardId: 'ALT_CORE_C_AX_01_C'
					});
				}

				const snapshot = actor.getSnapshot();
				expect(snapshot.context.currentDeck?.isValid).toBe(true);
				expect(snapshot.context.validationResult?.isValid).toBe(true);
				expect(snapshot.context.validationResult?.stats.totalCards).toBe(40); // 39 + 1 hero
				expect(snapshot.context.validationResult?.errors).toHaveLength(0);
			});

			it('should reject deck below minimum size', () => {
				// Add only 30 cards (below 39 minimum)
				for (let i = 0; i < 30; i++) {
					actor.send({
						type: 'ADD_CARD',
						cardId: 'ALT_CORE_C_AX_01_C'
					});
				}

				const snapshot = actor.getSnapshot();
				expect(snapshot.context.currentDeck?.isValid).toBe(false);
				expect(snapshot.context.validationResult?.errors).toContain(
					'A constructed deck must include at least 39 non-Hero cards (currently 30)'
				);
			});
		});

		describe('Limited Format', () => {
			beforeEach(() => {
				actor.send({
					type: 'CREATE_DECK',
					name: 'Limited Deck',
					format: 'limited'
				});
			});

			it('should create valid limited deck without hero', () => {
				// Add 29 cards (minimum for limited)
				for (let i = 0; i < 29; i++) {
					actor.send({
						type: 'ADD_CARD',
						cardId: 'ALT_CORE_C_AX_01_C'
					});
				}

				const snapshot = actor.getSnapshot();
				expect(snapshot.context.currentDeck?.isValid).toBe(true);
				expect(snapshot.context.validationResult?.isValid).toBe(true);
				expect(snapshot.context.validationResult?.stats.totalCards).toBe(29);
				expect(snapshot.context.validationResult?.stats.heroCount).toBe(0);
			});

			it('should create valid limited deck with hero', () => {
				actor.send({
					type: 'SET_HERO',
					cardId: 'ALT_CORE_H_AX_01_C'
				});

				// Add 29 cards (minimum for limited with hero)
				for (let i = 0; i < 29; i++) {
					actor.send({
						type: 'ADD_CARD',
						cardId: 'ALT_CORE_C_AX_01_C'
					});
				}

				const snapshot = actor.getSnapshot();
				expect(snapshot.context.currentDeck?.isValid).toBe(true);
				expect(snapshot.context.validationResult?.stats.totalCards).toBe(30); // 29 + 1 hero
			});

			it('should allow multiple copies beyond constructed limits', () => {
				// Add 10 copies of same card (would be invalid in constructed)
				for (let i = 0; i < 29; i++) {
					actor.send({
						type: 'ADD_CARD',
						cardId: 'ALT_CORE_C_AX_01_C'
					});
				}

				const snapshot = actor.getSnapshot();
				const hasValidQuantity = !snapshot.context.validationResult?.errors.some((e) =>
					e.includes('copies')
				);
				expect(hasValidQuantity).toBe(true);
				expect(snapshot.context.validationResult?.warnings).toContain(
					'Multiple copies of the same card - consider deck diversity'
				);
			});
		});
	});

	describe('Error Handling', () => {
		beforeEach(() => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck',
				format: 'constructed'
			});
		});

		it('should handle attempts to add non-existent cards', () => {
			actor.send({
				type: 'ADD_CARD',
				cardId: 'NON_EXISTENT_CARD'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.error).toContain('Card not found');
		});

		it('should clear errors when valid actions are performed', () => {
			// Cause an error
			actor.send({
				type: 'ADD_CARD',
				cardId: 'NON_EXISTENT_CARD'
			});

			expect(actor.getSnapshot().context.error).not.toBeNull();

			// Perform valid action
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.error).toBeNull();
		});
	});

	describe('State Transitions', () => {
		it('should stay in editing state during deck building', () => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Test Deck'
			});

			expect(actor.getSnapshot().value).toBe('editing');

			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			expect(actor.getSnapshot().value).toBe('editing');

			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			expect(actor.getSnapshot().value).toBe('editing');

			actor.send({ type: 'VALIDATE_DECK' });

			expect(actor.getSnapshot().value).toBe('editing');
		});

		it('should require deck to exist before deck actions', () => {
			// Try to add card without creating deck
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_01_C'
			});

			// Should not have transitioned or added card
			expect(actor.getSnapshot().value).toBe('idle');
			expect(actor.getSnapshot().context.currentDeck).toBeNull();
		});
	});
});
