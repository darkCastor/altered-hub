import { describe, it, expect, beforeEach } from 'bun:test';
import { DeckValidator, type DeckCard } from '../../src/lib/deckValidation';
import { createActor } from 'xstate';
import { deckMachine } from '../../src/lib/state/deckMachine';

// Comprehensive mock card data covering edge cases
const mockCardData = {
	// Heroes from different factions
	ALT_CORE_H_AX_01_C: {
		id: 'ALT_CORE_H_AX_01_C',
		name: 'Teija, Mage Intuitif',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Common'
	},
	ALT_CORE_H_BR_01_C: {
		id: 'ALT_CORE_H_BR_01_C',
		name: 'Rin, Soldat Déterminé',
		type: 'CHARACTER',
		faction: 'Bravos',
		rarity: 'Common'
	},
	ALT_CORE_H_LY_01_C: {
		id: 'ALT_CORE_H_LY_01_C',
		name: 'Sigrid, Veilleuse de Mémoire',
		type: 'CHARACTER',
		faction: 'Lyra',
		rarity: 'Common'
	},
	ALT_CORE_H_MU_01_C: {
		id: 'ALT_CORE_H_MU_01_C',
		name: 'Kojo, Guide Spirituel',
		type: 'CHARACTER',
		faction: 'Muna',
		rarity: 'Common'
	},

	// Characters with same name but different transformations and factions (Rule 1.1.4 remark)
	ALT_CORE_C_AX_01_C: {
		id: 'ALT_CORE_C_AX_01_C',
		name: 'Polymorphe',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Common'
	},
	ALT_CORE_C_AX_01_R1: {
		id: 'ALT_CORE_C_AX_01_R1',
		name: 'Polymorphe',
		type: 'CHARACTER',
		faction: 'Bravos',
		rarity: 'Common' // Same name, different faction
	},
	ALT_CORE_C_AX_01_R2: {
		id: 'ALT_CORE_C_AX_01_R2',
		name: 'Polymorphe',
		type: 'CHARACTER',
		faction: 'Lyra',
		rarity: 'Rare' // Same name, different faction and rarity
	},

	// Multiple rarity versions of same card
	ALT_CORE_C_AX_02_C: {
		id: 'ALT_CORE_C_AX_02_C',
		name: 'Garde Versatile',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Common'
	},
	ALT_CORE_C_AX_02_R: {
		id: 'ALT_CORE_C_AX_02_R',
		name: 'Garde Versatile',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Rare' // Same name/faction, different rarity
	},
	ALT_CORE_C_AX_02_U: {
		id: 'ALT_CORE_C_AX_02_U',
		name: 'Garde Versatile',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Unique' // Same name/faction, unique rarity
	},

	// Regular cards for testing limits
	ALT_CORE_C_AX_03_C: {
		id: 'ALT_CORE_C_AX_03_C',
		name: 'Soldat Axiome',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Common'
	},
	ALT_CORE_C_AX_04_R: {
		id: 'ALT_CORE_C_AX_04_R',
		name: 'Elite Axiome',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Rare'
	},
	ALT_CORE_C_AX_05_U: {
		id: 'ALT_CORE_C_AX_05_U',
		name: 'Champion Axiome',
		type: 'CHARACTER',
		faction: 'Axiom',
		rarity: 'Unique'
	},

	// Bravos cards for faction mixing tests
	ALT_CORE_C_BR_01_C: {
		id: 'ALT_CORE_C_BR_01_C',
		name: 'Guerrier Bravos',
		type: 'CHARACTER',
		faction: 'Bravos',
		rarity: 'Common'
	},
	ALT_CORE_C_BR_02_R: {
		id: 'ALT_CORE_C_BR_02_R',
		name: 'Veteran Bravos',
		type: 'CHARACTER',
		faction: 'Bravos',
		rarity: 'Rare'
	},

	// Lyra cards
	ALT_CORE_C_LY_01_C: {
		id: 'ALT_CORE_C_LY_01_C',
		name: 'Sage Lyra',
		type: 'CHARACTER',
		faction: 'Lyra',
		rarity: 'Common'
	},

	// Muna cards
	ALT_CORE_C_MU_01_C: {
		id: 'ALT_CORE_C_MU_01_C',
		name: 'Druide Muna',
		type: 'CHARACTER',
		faction: 'Muna',
		rarity: 'Common'
	},

	// Cards without factions (edge case)
	ALT_CORE_N_01_C: {
		id: 'ALT_CORE_N_01_C',
		name: 'Artefact Neutre',
		type: 'PERMANENT',
		faction: null,
		rarity: 'Common'
	},

	// Non-character cards
	ALT_CORE_S_AX_01_C: {
		id: 'ALT_CORE_S_AX_01_C',
		name: 'Sort Axiome',
		type: 'SPELL',
		faction: 'Axiom',
		rarity: 'Common'
	},
	ALT_CORE_P_AX_01_R: {
		id: 'ALT_CORE_P_AX_01_R',
		name: 'Monument Axiome',
		type: 'PERMANENT',
		faction: 'Axiom',
		rarity: 'Rare'
	}
};

// Mock the card functions
vi.mock('../../src/data/cards', () => ({
	getCardById: (id: string) => mockCardData[id as keyof typeof mockCardData] || null,
	allCards: Object.values(mockCardData)
}));

describe('Deck Rules Edge Cases', () => {
	let validator: DeckValidator;

	beforeEach(() => {
		validator = new DeckValidator('constructed');
	});

	describe('Same Name, Different Characteristics (Rule 1.1.4 remark)', () => {
		it('should count cards with same name but different factions toward copy limit', () => {
			const cards: DeckCard[] = [
				{ cardId: 'ALT_CORE_C_AX_01_C', quantity: 2 }, // Polymorphe (Axiom)
				{ cardId: 'ALT_CORE_C_AX_01_R1', quantity: 2 }, // Polymorphe (Bravos) - same name
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 35 } // Fill remaining
			];
			const heroId = 'ALT_CORE_H_AX_01_C'; // Axiom Hero

			const result = validator.validate(cards, heroId);

			// Should fail because we have 4 total "Polymorphe" cards (exceeds 3 copy limit)
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Maximum 3 copies of "Polymorphe" allowed (currently 4)');

			// Should also fail faction restriction (Bravos cards with Axiom hero)
			expect(result.errors.some((e) => e.includes('faction'))).toBe(true);
		});

		it('should count cards with same name but different rarities toward copy limit', () => {
			const cards: DeckCard[] = [
				{ cardId: 'ALT_CORE_C_AX_02_C', quantity: 2 }, // Garde Versatile (Common)
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 2 }, // Garde Versatile (Rare) - same name
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 35 } // Fill remaining
			];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.validate(cards, heroId);

			// Should fail copy limit (4 total "Garde Versatile")
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain(
				'Maximum 3 copies of "Garde Versatile" allowed (currently 4)'
			);
		});

		it('should respect rarity limits even with same-name cards', () => {
			const cards: DeckCard[] = [
				{ cardId: 'ALT_CORE_C_AX_02_C', quantity: 1 }, // Garde Versatile (Common)
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 1 }, // Garde Versatile (Rare)
				{ cardId: 'ALT_CORE_C_AX_02_U', quantity: 1 }, // Garde Versatile (Unique)
				{ cardId: 'ALT_CORE_C_AX_04_R', quantity: 14 }, // 14 more rares
				{ cardId: 'ALT_CORE_C_AX_05_U', quantity: 3 }, // 3 more uniques (total 4)
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 19 } // Fill remaining
			];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.validate(cards, heroId);

			// Should pass copy limit (3 total "Garde Versatile")
			expect(result.stats.copyViolations.length).toBe(0);

			// Should pass rare limit (15 total rares)
			expect(result.stats.rarityBreakdown['Rare']).toBe(15);

			// Should fail unique limit (4 total uniques, max 3)
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('Maximum 3 unique cards allowed (currently 4)');
		});
	});

	describe('Boundary Conditions', () => {
		describe('Exact Limits', () => {
			it('should accept deck with exactly 39 non-Hero cards in constructed', () => {
				const cards: DeckCard[] = [{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 39 }];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.stats.totalCards).toBe(40); // 39 + 1 hero
				expect(result.errors.filter((e) => e.includes('39 non-Hero cards')).length).toBe(0);
			});

			it('should accept deck with exactly 15 rare cards in constructed', () => {
				const cards: DeckCard[] = [
					{ cardId: 'ALT_CORE_C_AX_04_R', quantity: 15 },
					{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 24 }
				];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.stats.rarityBreakdown['Rare']).toBe(15);
				expect(result.errors.filter((e) => e.includes('rare cards')).length).toBe(0);
			});

			it('should accept deck with exactly 3 unique cards in constructed', () => {
				const cards: DeckCard[] = [
					{ cardId: 'ALT_CORE_C_AX_05_U', quantity: 3 },
					{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 36 }
				];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.stats.rarityBreakdown['Unique']).toBe(3);
				expect(result.errors.filter((e) => e.includes('unique cards')).length).toBe(0);
			});

			it('should accept deck with exactly 29 non-Hero cards in limited', () => {
				validator.setFormat('limited');
				const cards: DeckCard[] = [{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 29 }];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.stats.totalCards).toBe(30); // 29 + 1 hero
				expect(result.errors.filter((e) => e.includes('29 non-Hero cards')).length).toBe(0);
			});

			it('should accept limited deck with exactly 3 factions', () => {
				validator.setFormat('limited');
				const cards: DeckCard[] = [
					{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 10 }, // Axiom
					{ cardId: 'ALT_CORE_C_BR_01_C', quantity: 10 }, // Bravos
					{ cardId: 'ALT_CORE_C_LY_01_C', quantity: 9 } // Lyra
				];

				const result = validator.validate(cards);
				expect(Object.keys(result.stats.factionBreakdown).length).toBe(3);
				expect(result.errors.filter((e) => e.includes('faction')).length).toBe(0);
			});
		});

		describe('Off-by-One Errors', () => {
			it('should reject deck with 38 non-Hero cards in constructed', () => {
				const cards: DeckCard[] = [{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 38 }];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain(
					'A constructed deck must include at least 39 non-Hero cards (currently 38)'
				);
			});

			it('should reject deck with 16 rare cards in constructed', () => {
				const cards: DeckCard[] = [
					{ cardId: 'ALT_CORE_C_AX_04_R', quantity: 16 },
					{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 23 }
				];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain('Maximum 15 rare cards allowed (currently 16)');
			});

			it('should reject deck with 4 unique cards in constructed', () => {
				const cards: DeckCard[] = [
					{ cardId: 'ALT_CORE_C_AX_05_U', quantity: 4 },
					{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 35 }
				];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain('Maximum 3 unique cards allowed (currently 4)');
			});

			it('should reject deck with 28 non-Hero cards in limited', () => {
				validator.setFormat('limited');
				const cards: DeckCard[] = [{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 28 }];
				const heroId = 'ALT_CORE_H_AX_01_C';

				const result = validator.validate(cards, heroId);
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain(
					'A limited deck must include at least 29 non-Hero cards (currently 28)'
				);
			});

			it('should reject limited deck with 4 factions', () => {
				validator.setFormat('limited');
				const cards: DeckCard[] = [
					{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 8 }, // Axiom
					{ cardId: 'ALT_CORE_C_BR_01_C', quantity: 7 }, // Bravos
					{ cardId: 'ALT_CORE_C_LY_01_C', quantity: 7 }, // Lyra
					{ cardId: 'ALT_CORE_C_MU_01_C', quantity: 7 } // Muna (4th faction)
				];

				const result = validator.validate(cards);
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain(
					'Maximum 3 factions allowed in limited format (currently 4: Axiom, Bravos, Lyra, Muna)'
				);
			});
		});
	});

	describe('Complex Combinations', () => {
		it('should handle deck with maximum everything in constructed', () => {
			const cards: DeckCard[] = [
				// 15 rare cards (maximum)
				{ cardId: 'ALT_CORE_C_AX_04_R', quantity: 3 },
				{ cardId: 'ALT_CORE_P_AX_01_R', quantity: 3 },
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 3 },
				{ cardId: 'ALT_CORE_C_BR_02_R', quantity: 3 }, // This will cause faction error but test rarity counting
				{ cardId: 'ALT_CORE_C_BR_02_R', quantity: 3 }, // Duplicate to reach 15

				// 3 unique cards (maximum)
				{ cardId: 'ALT_CORE_C_AX_05_U', quantity: 3 },

				// Fill remaining 21 cards with commons
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 21 }
			];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.validate(cards, heroId);

			// Should have correct stats even if invalid due to factions
			expect(result.stats.totalCards).toBe(40); // 39 + 1 hero
			expect(result.stats.rarityBreakdown['Rare']).toBe(15);
			expect(result.stats.rarityBreakdown['Unique']).toBe(3);

			// Should fail faction restriction
			expect(result.isValid).toBe(false);
			expect(result.errors.some((e) => e.includes('faction'))).toBe(true);
		});

		it('should handle valid constructed deck with mixed rarities and exact limits', () => {
			const cards: DeckCard[] = [
				// 15 rare cards exactly
				{ cardId: 'ALT_CORE_C_AX_04_R', quantity: 3 },
				{ cardId: 'ALT_CORE_P_AX_01_R', quantity: 3 },
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 3 },
				{ cardId: 'ALT_CORE_S_AX_01_C', quantity: 6 }, // This should be common, let's adjust

				// 3 unique cards exactly
				{ cardId: 'ALT_CORE_C_AX_05_U', quantity: 3 },

				// Remaining commons to reach exactly 39
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 30 }
			];
			const heroId = 'ALT_CORE_H_AX_01_C';

			// Recalculate to ensure we have exactly 15 rares
			const validCards: DeckCard[] = [
				{ cardId: 'ALT_CORE_C_AX_04_R', quantity: 3 }, // 3 rares
				{ cardId: 'ALT_CORE_P_AX_01_R', quantity: 3 }, // 3 rares
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 3 }, // 3 rares
				{ cardId: 'ALT_CORE_C_AX_02_C', quantity: 3 }, // 3 commons (same name as rare is allowed)
				{ cardId: 'ALT_CORE_C_AX_02_U', quantity: 3 }, // 3 uniques (same name)
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 24 } // 24 commons
			];

			const result = validator.validate(validCards, heroId);

			expect(result.stats.totalCards).toBe(40);
			expect(result.stats.rarityBreakdown['Rare']).toBe(9); // Only 9 rares in this config
			expect(result.stats.rarityBreakdown['Unique']).toBe(3);
			expect(result.stats.copyViolations.length).toBe(0); // No copy violations
			expect(result.isValid).toBe(true);
		});

		it('should handle complex limited deck with multiple factions and no restrictions', () => {
			validator.setFormat('limited');
			const cards: DeckCard[] = [
				// Mix of factions (allowed in limited)
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 10 }, // Axiom commons
				{ cardId: 'ALT_CORE_C_BR_01_C', quantity: 10 }, // Bravos commons
				{ cardId: 'ALT_CORE_C_LY_01_C', quantity: 9 } // Lyra commons

				// Many copies of same card (allowed in limited)
				// No restrictions on rarity or copies
			];

			const result = validator.validate(cards);

			expect(result.stats.totalCards).toBe(29);
			expect(Object.keys(result.stats.factionBreakdown).length).toBe(3);
			expect(result.isValid).toBe(true);
			expect(result.errors.length).toBe(0);
		});
	});

	describe('State Machine Integration Edge Cases', () => {
		let actor: ReturnType<typeof createActor>;

		beforeEach(() => {
			actor = createActor(deckMachine);
			actor.start();
		});

		it('should handle rapid format switching with validation', () => {
			// Create deck in constructed format
			actor.send({
				type: 'CREATE_DECK',
				name: 'Switch Test',
				format: 'constructed'
			});

			// Add cards that are invalid in constructed but valid in limited
			for (let i = 0; i < 5; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_03_C'
				});
			}

			let snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult?.errors.some((e) => e.includes('copies'))).toBe(
				true
			);

			// Switch to limited
			actor.send({
				type: 'SET_FORMAT',
				format: 'limited'
			});

			snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.format).toBe('limited');
			expect(
				snapshot.context.validationResult?.errors.filter((e) => e.includes('copies')).length
			).toBe(0);

			// Switch back to constructed
			actor.send({
				type: 'SET_FORMAT',
				format: 'constructed'
			});

			snapshot = actor.getSnapshot();
			expect(snapshot.context.currentDeck?.format).toBe('constructed');
			expect(snapshot.context.validationResult?.errors.some((e) => e.includes('copies'))).toBe(
				true
			);
		});

		it('should prevent adding cards that would exceed rare limit', () => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Rare Limit Test',
				format: 'constructed'
			});

			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			// Add 15 rare cards (maximum)
			for (let i = 0; i < 15; i++) {
				actor.send({
					type: 'ADD_CARD',
					cardId: 'ALT_CORE_C_AX_04_R'
				});
			}

			// Try to add 16th rare card - should be prevented by guard
			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_P_AX_01_R'
			});

			const snapshot = actor.getSnapshot();
			expect(snapshot.context.error).toContain('Maximum 15 rare cards allowed');

			// Verify that 16th rare card was not added
			const rareCount = snapshot.context.validationResult?.stats.rarityBreakdown['Rare'] || 0;
			expect(rareCount).toBe(15);
		});

		it('should handle edge case of hero changing with existing cards', () => {
			actor.send({
				type: 'CREATE_DECK',
				name: 'Hero Change Test',
				format: 'constructed'
			});

			// Set Axiom hero and add Axiom cards
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_AX_01_C'
			});

			actor.send({
				type: 'ADD_CARD',
				cardId: 'ALT_CORE_C_AX_03_C'
			});

			let snapshot = actor.getSnapshot();
			expect(
				snapshot.context.validationResult?.errors.filter((e) => e.includes('faction')).length
			).toBe(0);

			// Change to Bravos hero - should make existing Axiom cards invalid
			actor.send({
				type: 'SET_HERO',
				cardId: 'ALT_CORE_H_BR_01_C'
			});

			snapshot = actor.getSnapshot();
			expect(snapshot.context.validationResult?.errors.some((e) => e.includes('faction'))).toBe(
				true
			);
			expect(
				snapshot.context.validationResult?.errors.some(
					(e) => e.includes('Axiom') && e.includes('Bravos')
				)
			).toBe(true);
		});
	});

	describe('canAddCard Edge Cases', () => {
		beforeEach(() => {
			validator.setFormat('constructed');
		});

		it('should handle cards with null faction', () => {
			const existingCards: DeckCard[] = [];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.canAddCard(existingCards, 'ALT_CORE_N_01_C', heroId);
			// Cards without faction should be addable regardless of hero faction
			expect(result.canAdd).toBe(true);
		});

		it('should handle hero with null faction', () => {
			const existingCards: DeckCard[] = [];

			// Test with undefined hero (edge case)
			const result = validator.canAddCard(existingCards, 'ALT_CORE_C_AX_03_C', undefined);
			expect(result.canAdd).toBe(true); // Should allow when no hero restrictions
		});

		it('should handle non-existent card ID', () => {
			const existingCards: DeckCard[] = [];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.canAddCard(existingCards, 'NON_EXISTENT_CARD', heroId);
			expect(result.canAdd).toBe(false);
			expect(result.reason).toBe('Card not found');
		});

		it('should correctly calculate quantity for same-name cards with different IDs', () => {
			const existingCards: DeckCard[] = [
				{ cardId: 'ALT_CORE_C_AX_02_C', quantity: 2 }, // Garde Versatile (Common)
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 1 } // Garde Versatile (Rare)
			];
			const heroId = 'ALT_CORE_H_AX_01_C';

			// Try to add another copy (would be 4 total "Garde Versatile")
			const result = validator.canAddCard(existingCards, 'ALT_CORE_C_AX_02_U', heroId);
			expect(result.canAdd).toBe(false);
			expect(result.reason).toBe('Maximum 3 copies per card in constructed format');
		});
	});

	describe('Statistical Edge Cases', () => {
		it('should correctly count statistics with complex deck composition', () => {
			const cards: DeckCard[] = [
				// Same name, different rarities
				{ cardId: 'ALT_CORE_C_AX_02_C', quantity: 1 }, // Common
				{ cardId: 'ALT_CORE_C_AX_02_R', quantity: 1 }, // Rare (same name)
				{ cardId: 'ALT_CORE_C_AX_02_U', quantity: 1 }, // Unique (same name)

				// Regular cards
				{ cardId: 'ALT_CORE_C_AX_03_C', quantity: 36 }
			];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.validate(cards, heroId);

			expect(result.stats.totalCards).toBe(40); // 39 + 1 hero
			expect(result.stats.rarityBreakdown['Common']).toBe(38); // 1 + 36 + 1 hero
			expect(result.stats.rarityBreakdown['Rare']).toBe(1);
			expect(result.stats.rarityBreakdown['Unique']).toBe(1);
			expect(result.stats.factionBreakdown['Axiom']).toBe(40); // All Axiom including hero
			expect(result.stats.copyViolations.length).toBe(0); // 3 total of same name is ok
			expect(result.isValid).toBe(true);
		});

		it('should handle empty deck statistics', () => {
			const cards: DeckCard[] = [];

			const result = validator.validate(cards);

			expect(result.stats.totalCards).toBe(0);
			expect(result.stats.heroCount).toBe(0);
			expect(Object.keys(result.stats.factionBreakdown).length).toBe(0);
			expect(Object.keys(result.stats.rarityBreakdown).length).toBe(0);
			expect(result.stats.copyViolations.length).toBe(0);
			expect(result.isValid).toBe(false); // Invalid due to missing requirements
		});

		it('should handle deck with only hero', () => {
			const cards: DeckCard[] = [];
			const heroId = 'ALT_CORE_H_AX_01_C';

			const result = validator.validate(cards, heroId);

			expect(result.stats.totalCards).toBe(1); // Only hero
			expect(result.stats.heroCount).toBe(1);
			expect(result.stats.factionBreakdown['Axiom']).toBe(1);
			expect(result.stats.rarityBreakdown['Common']).toBe(1);
			expect(result.isValid).toBe(false); // Invalid due to insufficient cards
		});
	});
});
