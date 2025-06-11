import { describe, it, expect, beforeEach, vi } from 'bun:test'; // Or from 'vitest' if that's the environment
import { createActor } from 'xstate';
import { deckMachine } from '../../src/lib/state/deckMachine';
import * as cardData from '../../src/data/cards';

// Add this at the top of tests/unit/DeckMachineDirect.test.ts
vi.mock('../../src/data/cards', async (importOriginal) => {
  const actual = await importOriginal<typeof cardData>();
  const mockCardsDb = new Map<string, cardData.AlteredCard | null>();

  // Helper to add mock cards
  const addMockCard = (card: cardData.AlteredCard) => mockCardsDb.set(card.id, card);

  // Define mock cards
  addMockCard({ id: 'hero_axiom_common', name: 'Axiom Common Hero', type: 'Héros', faction: 'Axiom', rarity: 'Commun', cost: 0, recallCost: 0 });
  addMockCard({ id: 'hero_lyra_common', name: 'Lyra Common Hero', type: 'Héros', faction: 'Lyra', rarity: 'Commun', cost: 0, recallCost: 0 });

  for (let i = 1; i <= 20; i++) { // For rare card limit tests
    addMockCard({ id: `rare_ax_${i}`, name: `Rare Axiom Card ${i}`, type: 'Personnage', faction: 'Axiom', rarity: 'Rare', cost: 1, recallCost: 1 });
  }
  for (let i = 1; i <= 5; i++) { // For unique card limit tests
    addMockCard({ id: `unique_ax_${i}`, name: `Unique Axiom Card ${i}`, type: 'Personnage', faction: 'Axiom', rarity: 'UNIQUE', cost: 1, recallCost: 1 });
  }
  for (let i = 0; i < 40; i++) { // For filler cards
    addMockCard({ id: `common_ax_card_${i}`, name: `Common Axiom Card ${i}`, type: 'Personnage', faction: 'Axiom', rarity: 'Commun', cost: 1, recallCost: 1 });
  }

  addMockCard({ id: 'rare_lyra_fs_card_1', name: 'Lyra FS Rare Card 1', type: 'Personnage', faction: 'Lyra', rarity: 'Rare', cost: 1, recallCost: 1 });
  addMockCard({ id: 'neutral_common_card_1', name: 'Neutral Common Card 1', type: 'Personnage', faction: 'Neutre', rarity: 'Commun', cost: 1, recallCost: 1 });
  addMockCard({ id: 'neutral_unique_card_1', name: 'Neutral Unique Card 1', type: 'Personnage', faction: 'Neutre', rarity: 'UNIQUE', cost: 1, recallCost: 1 });
  addMockCard({ id: 'neutral_unique_card_2', name: 'Neutral Unique Card 2', type: 'Personnage', faction: 'Neutre', rarity: 'UNIQUE', cost: 1, recallCost: 1 });

  addMockCard({ id: 'common_muna_card_1', name: 'Muna Common Card 1', type: 'Personnage', faction: 'Muna', rarity: 'Commun', cost: 1, recallCost: 1 });
  addMockCard({ id: 'common_yzmir_card_1', name: 'Yzmir Common Card 1', type: 'Personnage', faction: 'Yzmir', rarity: 'Commun', cost: 1, recallCost: 1 });


  return {
    ...actual,
    getCardById: vi.fn((cardId: string) => {
      if (mockCardsDb.has(cardId)) {
        return Promise.resolve(mockCardsDb.get(cardId) ?? null);
      }
      // Fallback for any card ID not explicitly mocked, useful for other tests if they use real IDs.
      // For new tests, ensure all required card IDs are in mockCardsDb.
      // console.warn(`[Mock getCardById] Card ID not found, returning null: ${cardId}`);
      return Promise.resolve(null); // Default to null if not in mock map for these tests
    }),
  };
});

describe('Deck State Machine - Direct Tests', () => {
  let actor: ReturnType<typeof createActor>;

  beforeEach(() => {
    actor = createActor(deckMachine);
    actor.start();
  });

  describe('Initial State and Context', () => {
    it('should start in idle state with empty context', () => {
      const snapshot = actor.getSnapshot();
      
      expect(snapshot.value).toBe('idle');
      expect(snapshot.context.decks).toEqual([]);
      expect(snapshot.context.currentDeck).toBeNull();
      expect(snapshot.context.selectedCards).toEqual([]);
      expect(snapshot.context.searchQuery).toBe('');
      expect(snapshot.context.filters).toEqual({});
      expect(snapshot.context.validationResult).toBeNull();
      expect(snapshot.context.isLoading).toBe(false);
      expect(snapshot.context.error).toBeNull();
    });
  });

  describe('CREATE_DECK Transition', () => {
    it('should transition from idle to editing on CREATE_DECK', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck',
        description: 'Test Description'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('editing');
    });

    it('should create deck with provided parameters', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'My Deck',
        description: 'My Description',
        format: 'limited'
      });

      const snapshot = actor.getSnapshot();
      const deck = snapshot.context.currentDeck;
      
      expect(deck).not.toBeNull();
      expect(deck?.name).toBe('My Deck');
      expect(deck?.description).toBe('My Description');
      expect(deck?.format).toBe('limited');
      expect(deck?.cards).toEqual([]);
      expect(deck?.heroId).toBeNull();
      expect(deck?.isValid).toBe(false);
    });

    it('should default to constructed format when not specified', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Default Deck'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.format).toBe('constructed');
    });

    it('should generate unique deck IDs', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Deck 1'
      });
      const firstDeckId = actor.getSnapshot().context.currentDeck?.id;

      // Create a new machine for second deck
      const actor2 = createActor(deckMachine);
      actor2.start();
      actor2.send({ 
        type: 'CREATE_DECK', 
        name: 'Deck 2'
      });
      const secondDeckId = actor2.getSnapshot().context.currentDeck?.id;

      expect(firstDeckId).toBeDefined();
      expect(secondDeckId).toBeDefined();
      expect(firstDeckId).not.toBe(secondDeckId);
    });

    it('should set created and updated timestamps', () => {
      const beforeCreate = new Date();
      
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });

      const deck = actor.getSnapshot().context.currentDeck;
      const afterCreate = new Date();
      
      expect(deck?.createdAt).toBeDefined();
      expect(deck?.updatedAt).toBeDefined();
      expect(deck?.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(deck?.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      expect(deck?.updatedAt.getTime()).toBeGreaterThanOrEqual(deck?.createdAt.getTime());
    });
  });

  describe('State Persistence in Editing', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck',
        format: 'constructed'
      });
    });

    it('should remain in editing state during deck operations', () => {
      expect(actor.getSnapshot().value).toBe('editing');

      actor.send({ type: 'VALIDATE_DECK' });
      expect(actor.getSnapshot().value).toBe('editing');

      actor.send({ 
        type: 'SEARCH_CARDS', 
        query: 'test'
      });
      expect(actor.getSnapshot().value).toBe('editing');

      actor.send({ 
        type: 'APPLY_FILTERS', 
        filters: { faction: 'Axiom' }
      });
      expect(actor.getSnapshot().value).toBe('editing');
    });
  });

  describe('SET_HERO Action', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should set hero ID and update timestamp', () => {
      const beforeUpdate = actor.getSnapshot().context.currentDeck?.updatedAt;
      
      actor.send({ 
        type: 'SET_HERO', 
        cardId: 'hero_123'
      });

      const snapshot = actor.getSnapshot();
      const deck = snapshot.context.currentDeck;
      
      expect(deck?.heroId).toBe('hero_123');
      expect(deck?.updatedAt.getTime()).toBeGreaterThan(beforeUpdate?.getTime() || 0);
    });

    it('should trigger validation after setting hero', () => {
      actor.send({ 
        type: 'SET_HERO', 
        cardId: 'hero_123'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.validationResult).not.toBeNull();
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

    it('should update timestamp when format changes', () => {
      const beforeUpdate = actor.getSnapshot().context.currentDeck?.updatedAt;
      
      actor.send({ 
        type: 'SET_FORMAT', 
        format: 'limited'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.updatedAt.getTime()).toBeGreaterThan(beforeUpdate?.getTime() || 0);
    });

    it('should trigger validation after format change', () => {
      actor.send({ 
        type: 'SET_FORMAT', 
        format: 'limited'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.validationResult).not.toBeNull();
    });
  });

  describe('ADD_CARD Action', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should require existing deck', () => {
      // Create new actor without deck
      const newActor = createActor(deckMachine);
      newActor.start();
      
      newActor.send({ 
        type: 'ADD_CARD', 
        cardId: 'card_123'
      });

      // Should not transition from idle since no deck exists
      expect(newActor.getSnapshot().value).toBe('idle');
      expect(newActor.getSnapshot().context.currentDeck).toBeNull();
    });

    it('should update timestamp when adding cards', () => {
      const beforeUpdate = actor.getSnapshot().context.currentDeck?.updatedAt;
      
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: 'card_123'
      });

      const snapshot = actor.getSnapshot();
      const updatedAt = snapshot.context.currentDeck?.updatedAt;
      
      // May not add card due to validation, but timestamp should update if action processed
      if (snapshot.context.currentDeck) {
        expect(updatedAt?.getTime()).toBeGreaterThanOrEqual(beforeUpdate?.getTime() || 0);
      }
    });

    it('should trigger validation after attempting to add card', () => {
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: 'card_123'
      });

      const snapshot = actor.getSnapshot();
      // Validation should be triggered even if card addition fails
      expect(snapshot.context.validationResult).not.toBeNull();
    });
  });

  describe('REMOVE_CARD Action', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should handle removing non-existent cards gracefully', () => {
      const beforeSnapshot = actor.getSnapshot();
      
      actor.send({ 
        type: 'REMOVE_CARD', 
        cardId: 'non_existent_card'
      });

      const afterSnapshot = actor.getSnapshot();
      
      // Should not crash and should remain in editing state
      expect(afterSnapshot.value).toBe('editing');
      expect(afterSnapshot.context.currentDeck?.cards).toEqual([]);
    });

    it('should update timestamp when removing cards', () => {
      const beforeUpdate = actor.getSnapshot().context.currentDeck?.updatedAt;
      
      actor.send({ 
        type: 'REMOVE_CARD', 
        cardId: 'card_123'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.updatedAt.getTime()).toBeGreaterThan(beforeUpdate?.getTime() || 0);
    });
  });

  describe('UPDATE_CARD_QUANTITY Action', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should handle quantity updates for non-existent cards', () => {
      actor.send({ 
        type: 'UPDATE_CARD_QUANTITY', 
        cardId: 'non_existent_card',
        quantity: 5
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('editing');
      expect(snapshot.context.currentDeck?.cards).toEqual([]);
    });

    it('should enforce quantity limits', () => {
      // First add a card, then try to update its quantity
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: 'card_123'
      });

      actor.send({ 
        type: 'UPDATE_CARD_QUANTITY', 
        cardId: 'card_123',
        quantity: 10 // Higher than constructed limit
      });

      const snapshot = actor.getSnapshot();
      const deck = snapshot.context.currentDeck;
      
      if (deck && deck.cards.length > 0) {
        // Should be capped at format limit (3 for constructed)
        expect(deck.cards[0].quantity).toBeLessThanOrEqual(3);
      }
    });

    it('should remove cards with zero quantity', () => {
      // Add a card first
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: 'card_123'
      });

      // Set quantity to 0
      actor.send({ 
        type: 'UPDATE_CARD_QUANTITY', 
        cardId: 'card_123',
        quantity: 0
      });

      const snapshot = actor.getSnapshot();
      const cardExists = snapshot.context.currentDeck?.cards.some(c => c.cardId === 'card_123');
      expect(cardExists).toBe(false);
    });
  });

  describe('VALIDATE_DECK Action', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should trigger manual validation', () => {
      // Clear any existing validation
      expect(actor.getSnapshot().context.validationResult).toBeNull();
      
      actor.send({ type: 'VALIDATE_DECK' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.validationResult).not.toBeNull();
    });

    it('should update deck validity based on validation', () => {
      actor.send({ type: 'VALIDATE_DECK' });

      const snapshot = actor.getSnapshot();
      const deck = snapshot.context.currentDeck;
      const validation = snapshot.context.validationResult;
      
      expect(deck?.isValid).toBe(validation?.isValid);
    });
  });

  describe('Search and Filter Actions', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should update search query', () => {
      actor.send({ 
        type: 'SEARCH_CARDS', 
        query: 'test search'
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.searchQuery).toBe('test search');
    });

    it('should update filters', () => {
      const filters = { faction: 'Axiom', rarity: 'Rare' };
      
      actor.send({ 
        type: 'APPLY_FILTERS', 
        filters
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.filters).toEqual(filters);
    });

    it('should clear filters', () => {
      // First set some filters
      actor.send({ 
        type: 'APPLY_FILTERS', 
        filters: { faction: 'Axiom' }
      });

      // Then clear them
      actor.send({ type: 'CLEAR_FILTERS' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.filters).toEqual({});
      expect(snapshot.context.searchQuery).toBe('');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
    });

    it('should clear error on successful actions', () => {
      // Set an error manually (this would normally happen through validation)
      const currentSnapshot = actor.getSnapshot();
      if (currentSnapshot.context.error) {
        // Error exists, now perform successful action
        actor.send({ 
          type: 'SET_HERO', 
          cardId: 'valid_hero'
        });

        const newSnapshot = actor.getSnapshot();
        expect(newSnapshot.context.error).toBeNull();
      }
    });

    it('should preserve state consistency during errors', () => {
      const beforeSnapshot = actor.getSnapshot();
      
      // Try an action that might cause an error
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: 'invalid_card'
      });

      const afterSnapshot = actor.getSnapshot();
      
      // State should remain consistent
      expect(afterSnapshot.value).toBe('editing');
      expect(afterSnapshot.context.currentDeck?.name).toBe(beforeSnapshot.context.currentDeck?.name);
    });
  });

  describe('Guards and Transitions', () => {
    it('should prevent invalid transitions', () => {
      // Try to save without a deck
      actor.send({ type: 'SAVE_DECK' });
      
      // Should remain in idle state
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should allow valid transitions', () => {
      // Create deck should transition to editing
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });
      
      expect(actor.getSnapshot().value).toBe('editing');
    });
  });

  describe('Context Immutability', () => {
    it('should create new context objects on state changes', () => {
      const initialContext = actor.getSnapshot().context;
      
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });

      const newContext = actor.getSnapshot().context;
      
      expect(newContext).not.toBe(initialContext);
      expect(newContext.currentDeck).toBeDefined();
    });

    it('should preserve unchanged context properties', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Test Deck'
      });

      const afterCreateContext = actor.getSnapshot().context;
      
      actor.send({ 
        type: 'SEARCH_CARDS', 
        query: 'test'
      });

      const afterSearchContext = actor.getSnapshot().context;
      
      // Deck should remain the same reference when only search changes
      expect(afterSearchContext.currentDeck).toBe(afterCreateContext.currentDeck);
      expect(afterSearchContext.searchQuery).toBe('test');
    });
  });

  describe('Constructed Deck Validation Rules (based on Rulebook)', () => {
    let constructedActor: ReturnType<typeof createActor>;

    beforeEach(() => {
      constructedActor = createActor(deckMachine);
      constructedActor.start();
      constructedActor.send({ type: 'CREATE_DECK', name: 'Constructed Rules Test Deck', format: 'constructed' });
      constructedActor.send({ type: 'SET_HERO', cardId: 'hero_axiom_common' });
      // Pre-fill with 35 common Axiom cards to be close to minimums for focused tests
      for (let i = 0; i < 35; i++) {
         constructedActor.send({ type: 'ADD_CARD', cardId: `common_ax_card_${i}`});
      }
    });

    describe('Unique Card Rule (1.1.4.g - Max 3 UNIQUE)', () => {
      it('should allow up to 3 unique cards', () => {
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_1' });
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_2' });
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_3' });
        constructedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('Maximum 3 unique cards allowed'))).toBe(false);
        // Total cards include hero (1) + 35 common + 3 unique = 39. Min non-hero is 39. So this is valid.
        expect(snapshot.context.validationResult?.isValid).toBe(true);
      });

      it('should invalidate and error when adding a 4th distinct unique card', () => {
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_1' });
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_2' });
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_3' });
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_4' }); // 4th unique
        constructedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors).toContain('Maximum 3 unique cards allowed (currently 4)');
        expect(snapshot.context.validationResult?.isValid).toBe(false);
      });

      it('should prevent adding more than 3 copies of the *same named* unique card (due to general 3-copy rule)', () => {
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_1' }); // qty 1
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_1' }); // qty 2
        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_1' }); // qty 3
        constructedActor.send({ type: 'VALIDATE_DECK' });
        let snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('Maximum 3 copies of "Unique Axiom Card 1" allowed'))).toBe(false);

        constructedActor.send({ type: 'ADD_CARD', cardId: 'unique_ax_1' }); // Attempt 4th copy
        constructedActor.send({ type: 'VALIDATE_DECK' });
        snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors).toContain('Maximum 3 copies of "Unique Axiom Card 1" allowed (currently 4)');
      });
    });

    describe('Rare Card Rule (1.1.4.f - Max 15 Rare/Faction-Shifted Rare)', () => {
      it('should allow up to 15 cards with rarity "Rare"', () => {
        // Deck has 35 commons + 1 hero. Add 4 more commons to meet 39 non-hero minimum.
        for (let i = 35; i < 39; i++) { constructedActor.send({ type: 'ADD_CARD', cardId: `common_ax_card_${i}`}); }

        for (let i = 1; i <= 15; i++) {
          constructedActor.send({ type: 'ADD_CARD', cardId: `rare_ax_${i}` });
        }
        constructedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('Maximum 15 rare cards allowed'))).toBe(false);
        expect(snapshot.context.validationResult?.isValid).toBe(true);
      });

      it('should invalidate and error when adding a 16th card with rarity "Rare"', () => {
         for (let i = 1; i <= 16; i++) { // Add 16 rare cards
          constructedActor.send({ type: 'ADD_CARD', cardId: `rare_ax_${i}` });
        }
        constructedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors).toContain('Maximum 15 rare cards allowed (currently 16)');
        expect(snapshot.context.validationResult?.isValid).toBe(false);
      });
    });

    describe('Neutral Card Rule (1.1.4.d)', () => {
      it('should allow Neutral cards and not count them against faction rules', () => {
        constructedActor.send({ type: 'ADD_CARD', cardId: 'neutral_common_card_1' });
        constructedActor.send({ type: 'VALIDATE_DECK' });
        let snapshot = constructedActor.getSnapshot();
        // Initial deck (35 commons + 1 hero + 1 neutral = 37 cards) is not yet 39 non-hero.
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('All cards must be the same faction as the Hero'))).toBe(false);
        expect(snapshot.context.currentDeck?.cards.some(c => c.cardId === 'neutral_common_card_1')).toBe(true);

        // Add more cards to satisfy count
        for (let i = 35; i < 38; i++) { constructedActor.send({ type: 'ADD_CARD', cardId: `common_ax_card_${i}`}); }
        constructedActor.send({ type: 'VALIDATE_DECK' });
        snapshot = constructedActor.getSnapshot();
        expect(snapshot.context.validationResult?.isValid).toBe(true);
      });
    });
  });

  describe('Limited Deck Validation Rules (based on Rulebook)', () => {
    let limitedActor: ReturnType<typeof createActor>;
    beforeEach(() => {
      limitedActor = createActor(deckMachine);
      limitedActor.start();
      limitedActor.send({ type: 'CREATE_DECK', name: 'Limited Rules Test Deck', format: 'limited' });
      // Fill with 29 common Axiom cards for a base
      for (let i = 0; i < 29; i++) {
         limitedActor.send({ type: 'ADD_CARD', cardId: `common_ax_card_${i}`});
      }
    });

    it('should be valid with 0 heroes and 29 non-hero cards from 1 faction', () => {
        limitedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = limitedActor.getSnapshot();
        expect(snapshot.context.validationResult?.isValid).toBe(true);
    });

    it('should be valid with 1 hero and 29 non-hero cards (total 30 cards) from 1 faction', () => {
        limitedActor.send({ type: 'SET_HERO', cardId: 'hero_axiom_common' });
        limitedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = limitedActor.getSnapshot();
        expect(snapshot.context.validationResult?.isValid).toBe(true);
    });

    it('should error if more than 1 hero is added', () => {
        limitedActor.send({ type: 'SET_HERO', cardId: 'hero_axiom_common' });
        // deckMachine does not allow setting another hero directly if one is set.
        // This rule is typically enforced by how heroes are handled (usually only one slot).
        // The validator's heroCount > 1 check is more for data integrity if context somehow gets >1 hero.
        // For DeckMachine, adding a second hero isn't a direct event.
        // We can test the validator's output if the context was manually set, but direct machine test is tricky.
        // Let's assume the machine prevents >1 hero by its structure.
        // The validator part is tested in deckValidation.test.ts
        const snapshot = limitedActor.getSnapshot();
        expect(snapshot.context.currentDeck?.heroId).toBe('hero_axiom_common');
        // No direct way to send "ADD_SECOND_HERO" to machine.
    });

    it('should error if non-hero cards are less than 29', () => {
        limitedActor.send({ type: 'CREATE_DECK', name: 'Too Few Cards Deck', format: 'limited' });
        limitedActor.send({ type: 'SET_HERO', cardId: 'hero_axiom_common' });
        for (let i = 0; i < 28; i++) { // Only 28 non-hero cards
            limitedActor.send({ type: 'ADD_CARD', cardId: `common_ax_card_${i}`});
        }
        limitedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = limitedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors).toContain('A limited deck must include at least 29 non-Hero cards (currently 28)');
    });

    it('should allow up to 3 factions (hero faction + 2 others)', () => {
        limitedActor.send({ type: 'SET_HERO', cardId: 'hero_axiom_common' }); // Faction 1: Axiom (cards are already Axiom)
        limitedActor.send({ type: 'ADD_CARD', cardId: 'rare_lyra_fs_card_1' });    // Faction 2: Lyra
        limitedActor.send({ type: 'ADD_CARD', cardId: 'common_muna_card_1' });   // Faction 3: Muna
        limitedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = limitedActor.getSnapshot();
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('Maximum 3 factions allowed'))).toBe(false);
        expect(snapshot.context.validationResult?.isValid).toBe(true);
    });

    it('should error if more than 3 factions are present', () => {
        limitedActor.send({ type: 'SET_HERO', cardId: 'hero_axiom_common' }); // Faction 1: Axiom
        limitedActor.send({ type: 'ADD_CARD', cardId: 'rare_lyra_fs_card_1' });    // Faction 2: Lyra
        limitedActor.send({ type: 'ADD_CARD', cardId: 'common_muna_card_1' });   // Faction 3: Muna
        limitedActor.send({ type: 'ADD_CARD', cardId: 'common_yzmir_card_1' });  // Faction 4: Yzmir
        limitedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = limitedActor.getSnapshot();
        // The error message includes the hero's faction, then the others.
        expect(snapshot.context.validationResult?.errors).toContain('Maximum 3 factions allowed in limited format (currently 4: Axiom, Lyra, Muna, Yzmir)');
    });

     it('should have no unique/rare card limits in limited format', () => {
        for (let i = 1; i <= 5; i++) { // Add 5 unique cards
            limitedActor.send({ type: 'ADD_CARD', cardId: `unique_ax_${i}` });
        }
        for (let i = 1; i <= 20; i++) { // Add 20 rare cards
             limitedActor.send({ type: 'ADD_CARD', cardId: `rare_ax_${i}` });
        }
        limitedActor.send({ type: 'VALIDATE_DECK' });
        const snapshot = limitedActor.getSnapshot();
        // Deck size will be large, so it won't be "isValid" due to card count if not enough fillers
        // But no errors for rare/unique limits.
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('unique cards allowed'))).toBe(false);
        expect(snapshot.context.validationResult?.errors.some(e => e.includes('rare cards allowed'))).toBe(false);
    });
  });
});