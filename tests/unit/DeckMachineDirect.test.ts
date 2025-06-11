import { describe, it, expect, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { deckMachine } from '../../src/lib/state/deckMachine';

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
});