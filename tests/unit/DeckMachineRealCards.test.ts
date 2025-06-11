import { describe, it, expect, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { deckMachine } from '../../src/lib/state/deckMachine';

describe('Deck State Machine - Real Cards Tests', () => {
  let actor: ReturnType<typeof createActor>;

  // Real card IDs from altered_optimized.json
  const REAL_CARDS = {
    // Heroes
    HERO_AXIOM: 'ALT_ALIZE_B_AX_01_C',      // Sierra & Oddball (Axiom)
    HERO_BRAVOS: 'ALT_ALIZE_B_BR_01_C',     // Kojo & Booda (Bravos)
    
    // Axiom cards
    AX_CHAR_COMMON: 'ALT_ALIZE_A_AX_35_C',      // Vaike, l'Énergéticienne (Common)
    AX_CHAR_RARE: 'ALT_ALIZE_A_AX_35_R1',       // Vaike, l'Énergéticienne (Rare)
    AX_LANDMARK_COMMON: 'ALT_ALIZE_A_AX_46_C',  // Galeries Saisies par les Glaces (Common)
    AX_LANDMARK_RARE: 'ALT_ALIZE_A_AX_46_R1',   // Galeries Saisies par les Glaces (Rare)
    AX_CHAR2_COMMON: 'ALT_ALIZE_B_AX_32_C',     // La Machine dans la Glace (Common)
    AX_CHAR3_COMMON: 'ALT_ALIZE_B_AX_33_C',     // Macareux à Roquettes (Common)
    AX_CHAR4_COMMON: 'ALT_ALIZE_B_AX_34_C',     // La Petite Fille aux Allumettes (Common)
    AX_CHAR5_COMMON: 'ALT_ALIZE_B_AX_36_C',     // Éclaireur Morse (Common)
    AX_CHAR6_COMMON: 'ALT_ALIZE_B_AX_37_C',     // Porteuse Intrépide (Common)
    AX_CHAR7_COMMON: 'ALT_ALIZE_B_AX_38_C',     // Prototype Défectueux (Common)
    
    // Bravos cards
    BR_CHAR_COMMON: 'ALT_ALIZE_A_BR_37_C',      // Gericht, Bretteur Honoré (Common)
    
    // Same name, different transformations
    VAIKE_AX_COMMON: 'ALT_ALIZE_A_AX_35_C',     // Vaike (Axiom Common)
    VAIKE_AX_RARE: 'ALT_ALIZE_A_AX_35_R1',      // Vaike (Axiom Rare)
    
    // Unknown cards
    UNKNOWN_CARD: 'INVALID_CARD_12345',
    UNKNOWN_HERO: 'INVALID_HERO_67890'
  };

  beforeEach(() => {
    actor = createActor(deckMachine);
    actor.start();
  });

  describe('Deck Creation with Real Cards', () => {
    it('should create deck and set real hero successfully', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Real Axiom Deck',
        format: 'constructed'
      });

      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.heroId).toBe(REAL_CARDS.HERO_AXIOM);
      expect(snapshot.context.validationResult).not.toBeNull();
      expect(snapshot.context.validationResult?.stats.heroCount).toBe(1);
    });

    it('should handle unknown hero gracefully', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Invalid Hero Deck'
      });

      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.UNKNOWN_HERO
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.heroId).toBe(REAL_CARDS.UNKNOWN_HERO);
      expect(snapshot.context.validationResult?.stats.heroCount).toBe(0); // Hero not found
    });
  });

  describe('Card Addition with Real Cards and Faction Rules', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Faction Test Deck',
        format: 'constructed'
      });
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });
    });

    it('should allow adding cards matching hero faction', () => {
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(1);
      expect(snapshot.context.currentDeck?.cards[0]).toEqual({
        cardId: REAL_CARDS.AX_CHAR_COMMON,
        quantity: 1
      });
      expect(snapshot.context.error).toBeNull();
    });

    it('should prevent adding cards from wrong faction', () => {
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.BR_CHAR_COMMON // Bravos card with Axiom hero
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
      expect(snapshot.context.error).not.toBeNull();
      expect(snapshot.context.error).toContain('faction');
    });

    it('should prevent adding unknown cards', () => {
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.UNKNOWN_CARD
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
      expect(snapshot.context.error).toContain('Card not found');
    });

    it('should enforce 3-copy limit with real cards', () => {
      // Add 3 copies successfully
      for (let i = 0; i < 3; i++) {
        actor.send({ 
          type: 'ADD_CARD', 
          cardId: REAL_CARDS.AX_CHAR_COMMON
        });
      }

      let snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(3);
      expect(snapshot.context.error).toBeNull();

      // Try to add 4th copy - should be prevented
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(3); // Still 3
      expect(snapshot.context.error).toContain('Maximum 3 copies');
    });

    it('should count same-name cards toward copy limit', () => {
      // Add 2 common Vaike
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.VAIKE_AX_COMMON
      });
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.VAIKE_AX_COMMON
      });

      // Add 1 rare Vaike (same name)
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.VAIKE_AX_RARE
      });

      let snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(2); // 2 different card IDs
      expect(snapshot.context.error).toBeNull();

      // Try to add another Vaike (4th total) - should be prevented
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.VAIKE_AX_COMMON
      });

      snapshot = actor.getSnapshot();
      expect(snapshot.context.error).toContain('Maximum 3 copies');
    });
  });

  describe('Format Switching with Real Cards', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Format Switch Test',
        format: 'constructed'
      });
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });
    });

    it('should allow mixed factions in limited but not constructed', () => {
      // Add Axiom card
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      // Try to add Bravos card in constructed - should fail
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.BR_CHAR_COMMON
      });

      let snapshot = actor.getSnapshot();
      expect(snapshot.context.error).toContain('faction');

      // Switch to limited format
      actor.send({ 
        type: 'SET_FORMAT', 
        format: 'limited'
      });

      // Now adding different faction should be allowed
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.BR_CHAR_COMMON
      });

      snapshot = actor.getSnapshot();
      expect(snapshot.context.error).toBeNull(); // Should clear faction error
      expect(snapshot.context.currentDeck?.cards).toHaveLength(2);
    });

    it('should allow more copies in limited than constructed', () => {
      // Add 3 copies (max for constructed)
      for (let i = 0; i < 3; i++) {
        actor.send({ 
          type: 'ADD_CARD', 
          cardId: REAL_CARDS.AX_CHAR_COMMON
        });
      }

      // Try to add 4th copy in constructed - should fail
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      let snapshot = actor.getSnapshot();
      expect(snapshot.context.error).toContain('Maximum 3 copies');

      // Switch to limited format
      actor.send({ 
        type: 'SET_FORMAT', 
        format: 'limited'
      });

      // Now adding 4th copy should be allowed
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      snapshot = actor.getSnapshot();
      expect(snapshot.context.error).toBeNull();
      expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(4);
    });
  });

  describe('Complete Deck Building Workflow', () => {
    it('should build a valid constructed deck with real cards', () => {
      // Create deck
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Complete Valid Deck',
        format: 'constructed'
      });

      // Set hero
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });

      // Add exactly 39 cards to meet minimum (using cards with unique names, max 3 each)
      const uniqueCards = [
        REAL_CARDS.AX_CHAR_COMMON,        // Vaike (3 max)
        REAL_CARDS.AX_CHAR2_COMMON,       // Machine dans la Glace (3 max)
        REAL_CARDS.AX_CHAR3_COMMON,       // Macareux (3 max)
        REAL_CARDS.AX_CHAR4_COMMON,       // Petite Fille (3 max)
        REAL_CARDS.AX_CHAR5_COMMON,       // Éclaireur (3 max)
        REAL_CARDS.AX_CHAR6_COMMON,       // Porteuse (3 max)
        REAL_CARDS.AX_CHAR7_COMMON,       // Prototype (3 max)
        REAL_CARDS.AX_LANDMARK_COMMON,    // Galeries Saisies par les Glaces (3 max)
        'ALT_ALIZE_B_AX_31_C',             // Scarabot (3 max)
        'ALT_ALIZE_B_AX_39_C',             // Vishvakarma (3 max)
        'ALT_ALIZE_B_AX_40_C',             // Gibil (3 max)
        'ALT_ALIZE_B_AX_41_C',             // Livraison Gelée (3 max)
        'ALT_ALIZE_B_AX_42_C'              // Avalanche (3 max) - 39 total
      ];

      // Add 3 copies of each unique card = 39 total
      uniqueCards.forEach(cardId => {
        for (let i = 0; i < 3; i++) {
          actor.send({ 
            type: 'ADD_CARD', 
            cardId
          });
        }
      });

      // Validate deck
      actor.send({ type: 'VALIDATE_DECK' });

      const snapshot = actor.getSnapshot();
      
      
      expect(snapshot.context.currentDeck?.isValid).toBe(true);
      expect(snapshot.context.validationResult?.isValid).toBe(true);
      expect(snapshot.context.validationResult?.stats.totalCards).toBe(40);
      expect(snapshot.context.validationResult?.errors).toHaveLength(0);
    });

    it('should handle hero switching with existing cards', () => {
      // Create deck with Axiom hero and cards
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Hero Switch Test'
      });
      
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });

      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      let snapshot = actor.getSnapshot();
      expect(snapshot.context.validationResult?.errors.filter(e => e.includes('faction')).length).toBe(0);

      // Switch to Bravos hero - should make existing Axiom cards invalid
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_BRAVOS
      });

      snapshot = actor.getSnapshot();
      expect(snapshot.context.validationResult?.errors.some(e => e.includes('faction'))).toBe(true);
    });
  });

  describe('Card Management Operations', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Card Management Test'
      });
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });
    });

    it('should update card quantities correctly', () => {
      actor.send({ 
        type: 'UPDATE_CARD_QUANTITY', 
        cardId: REAL_CARDS.AX_CHAR_COMMON,
        quantity: 3
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards[0].quantity).toBe(3);
    });

    it('should remove cards when quantity set to 0', () => {
      actor.send({ 
        type: 'UPDATE_CARD_QUANTITY', 
        cardId: REAL_CARDS.AX_CHAR_COMMON,
        quantity: 0
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
    });

    it('should remove cards by ID', () => {
      actor.send({ 
        type: 'REMOVE_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(0);
    });

    it('should trigger validation after card operations', () => {
      actor.send({ 
        type: 'UPDATE_CARD_QUANTITY', 
        cardId: REAL_CARDS.AX_CHAR_COMMON,
        quantity: 2
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.validationResult).not.toBeNull();
      expect(snapshot.context.validationResult?.stats.totalCards).toBe(3); // 2 cards + 1 hero
    });
  });

  describe('Error Recovery and State Consistency', () => {
    beforeEach(() => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Error Recovery Test'
      });
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });
    });

    it('should recover from errors when valid actions are performed', () => {
      // Cause an error by adding wrong faction card
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.BR_CHAR_COMMON
      });

      expect(actor.getSnapshot().context.error).not.toBeNull();

      // Perform valid action - should clear error
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.error).toBeNull();
      expect(snapshot.context.currentDeck?.cards).toHaveLength(1);
    });

    it('should maintain deck state consistency during errors', () => {
      const initialCards = actor.getSnapshot().context.currentDeck?.cards.length || 0;
      
      // Try invalid operations
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.UNKNOWN_CARD
      });
      
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.BR_CHAR_COMMON
      });

      const snapshot = actor.getSnapshot();
      
      // Deck should remain unchanged
      expect(snapshot.context.currentDeck?.cards).toHaveLength(initialCards);
      expect(snapshot.value).toBe('editing'); // Still in valid state
    });
  });

  describe('Real Card Statistics and Validation', () => {
    it('should correctly calculate faction breakdown with real cards', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Stats Test'
      });
      
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });

      // Add various Axiom cards
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });
      
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_LANDMARK_COMMON
      });

      const snapshot = actor.getSnapshot();
      const stats = snapshot.context.validationResult?.stats;
      
      expect(stats?.totalCards).toBe(3); // 2 cards + 1 hero
      expect(stats?.factionBreakdown['Axiom']).toBe(3); // All Axiom
      expect(stats?.heroCount).toBe(1);
    });

    it('should correctly track rarity breakdown with real cards', () => {
      actor.send({ 
        type: 'CREATE_DECK', 
        name: 'Rarity Test'
      });
      
      actor.send({ 
        type: 'SET_HERO', 
        cardId: REAL_CARDS.HERO_AXIOM
      });

      // Add common and rare cards
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_COMMON
      });
      
      actor.send({ 
        type: 'ADD_CARD', 
        cardId: REAL_CARDS.AX_CHAR_RARE
      });

      const snapshot = actor.getSnapshot();
      const stats = snapshot.context.validationResult?.stats;
      
      expect(stats?.rarityBreakdown['Commun']).toBe(2); // 1 common card + 1 common hero
      expect(stats?.rarityBreakdown['Rare']).toBe(1);
    });
  });
});