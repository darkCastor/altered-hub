import { describe, it, expect, beforeEach } from 'bun:test';
import { DeckValidator, type DeckCard } from '../../src/lib/deckValidation';

describe('DeckValidator - Real Card Tests', () => {
  let validator: DeckValidator;

  // Real card IDs from altered_optimized.json
  const REAL_CARDS = {
    // Heroes from different factions
    HERO_AXIOM: 'ALT_ALIZE_B_AX_01_C',      // Sierra & Oddball (Axiom Hero)
    HERO_BRAVOS: 'ALT_ALIZE_B_BR_01_C',     // Kojo & Booda (Bravos Hero)
    HERO_LYRA: 'ALT_ALIZE_B_LY_02_C',       // Lyra Hero
    HERO_MUNA: 'ALT_ALIZE_B_MU_02_C',       // Muna Hero
    
    // Axiom cards (same faction as HERO_AXIOM)
    AX_CHAR_COMMON: 'ALT_ALIZE_A_AX_35_C',      // Vaike, l'Énergéticienne (Common)
    AX_CHAR_RARE: 'ALT_ALIZE_A_AX_35_R1',       // Vaike, l'Énergéticienne (Rare transformation)
    AX_LANDMARK_COMMON: 'ALT_ALIZE_A_AX_46_C',  // Galeries Saisies par les Glaces (Common)
    AX_LANDMARK_RARE: 'ALT_ALIZE_A_AX_46_R1',   // Galeries Saisies par les Glaces (Rare)
    
    // Bravos cards (different faction)
    BR_CHAR_COMMON: 'ALT_ALIZE_A_BR_37_C',      // Gericht, Bretteur Honoré (Common)
    BR_CHAR_RARE: 'ALT_ALIZE_A_BR_37_R1',       // Gericht, Bretteur Honoré (Rare)
    
    // Cards with same name but different transformations/factions
    VAIKE_AX_COMMON: 'ALT_ALIZE_A_AX_35_C',     // Vaike (Axiom Common)
    VAIKE_AX_RARE: 'ALT_ALIZE_A_AX_35_R1',      // Vaike (Axiom Rare)
    VAIKE_YZ_RARE: 'ALT_ALIZE_A_AX_35_R2',      // Vaike (Yzmir Rare - different faction!)
    
    // Unknown/invalid card IDs for testing
    UNKNOWN_CARD: 'INVALID_CARD_ID_12345',
    UNKNOWN_HERO: 'INVALID_HERO_ID_67890'
  };

  beforeEach(() => {
    validator = new DeckValidator('constructed');
  });

  describe('Constructed Format with Real Cards', () => {
    describe('Rule 1.1.4.b - Hero Requirements', () => {
      it('should require exactly 1 Hero', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 39 }
        ];

        // No hero provided
        const result = validator.validate(cards);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('A constructed deck must include exactly 1 Hero');
      });

      it('should accept deck with real Hero', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 39 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.stats.heroCount).toBe(1);
        expect(result.errors.filter(e => e.includes('Hero')).length).toBe(0);
      });

      it('should reject unknown Hero ID', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 39 }
        ];
        const heroId = REAL_CARDS.UNKNOWN_HERO;

        const result = validator.validate(cards, heroId);
        // Hero won't be found, so stats should show 0 heroes
        expect(result.stats.heroCount).toBe(0);
        expect(result.isValid).toBe(false);
      });
    });

    describe('Rule 1.1.4.c - Minimum Deck Size', () => {
      it('should require at least 39 non-Hero cards', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 30 } // Only 30 cards
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('A constructed deck must include at least 39 non-Hero cards (currently 30)');
      });

      it('should accept exactly 39 non-Hero cards + 1 Hero = 40 total', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 39 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.stats.totalCards).toBe(40); // 39 + 1 hero
        expect(result.errors.filter(e => e.includes('39 non-Hero cards')).length).toBe(0);
      });
    });

    describe('Rule 1.1.4.d - Faction Restrictions', () => {
      it('should reject cards from different faction than Hero', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 20 }, // Axiom cards
          { cardId: REAL_CARDS.BR_CHAR_COMMON, quantity: 19 }  // Bravos card - INVALID
        ];
        const heroId = REAL_CARDS.HERO_AXIOM; // Axiom Hero

        const result = validator.validate(cards, heroId);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('faction'))).toBe(true);
        expect(result.errors.some(e => e.includes('Axiom') && e.includes('Bravos'))).toBe(true);
      });

      it('should accept cards matching Hero faction', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 20 },    // Axiom character
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 19 } // Axiom landmark
        ];
        const heroId = REAL_CARDS.HERO_AXIOM; // Axiom Hero

        const result = validator.validate(cards, heroId);
        expect(result.errors.filter(e => e.includes('faction')).length).toBe(0);
      });
    });

    describe('Rule 1.1.4.e - Copy Restrictions (Same Name Cards)', () => {
      it('should limit to maximum 3 cards with same name', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 4 }, // 4 copies - INVALID
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 35 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('Maximum 3 copies'))).toBe(true);
        expect(result.stats.copyViolations.length).toBeGreaterThan(0);
      });

      it('should count cards with same name but different IDs/transformations', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.VAIKE_AX_COMMON, quantity: 2 }, // 2 common Vaike
          { cardId: REAL_CARDS.VAIKE_AX_RARE, quantity: 2 },   // 2 rare Vaike (same name)
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 35 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('Maximum 3 copies') && e.includes('Vaike'))).toBe(true);
      });

      it('should allow exactly 3 copies of same name', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.VAIKE_AX_COMMON, quantity: 2 }, // 2 common Vaike
          { cardId: REAL_CARDS.VAIKE_AX_RARE, quantity: 1 },   // 1 rare Vaike = 3 total
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 36 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.stats.copyViolations.length).toBe(0);
      });
    });

    describe('Complete Valid Constructed Deck', () => {
      it('should validate a perfectly legal constructed deck with real cards', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 3 },    // 3 Vaike common
          { cardId: REAL_CARDS.AX_CHAR_RARE, quantity: 3 },      // 3 Vaike rare (different rarity, same faction)
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 3 }, // 3 Landmark common
          { cardId: REAL_CARDS.AX_LANDMARK_RARE, quantity: 3 },   // 3 Landmark rare
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 27 }     // Fill remaining (different card)
        ];
        
        // Adjust to avoid copy violations
        const validCards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 3 },     // 3 Vaike
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 3 }, // 3 Landmark  
          { cardId: REAL_CARDS.AX_LANDMARK_RARE, quantity: 3 },   // 3 Landmark rare (need different card)
        ];
        
        // Actually, let's create a simpler valid deck
        const simpleValidCards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 3 },     // 3 Vaike common
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 36 } // 36 Landmark common
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(simpleValidCards, heroId);
        expect(result.isValid).toBe(true);
        expect(result.errors.length).toBe(0);
        expect(result.stats.totalCards).toBe(40); // 39 + 1 hero
        expect(result.stats.heroCount).toBe(1);
      });
    });
  });

  describe('Limited Format with Real Cards', () => {
    beforeEach(() => {
      validator.setFormat('limited');
    });

    describe('Rule 1.1.5.b - Hero Optional', () => {
      it('should allow deck without Hero in limited format', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 29 }
        ];

        const result = validator.validate(cards); // No hero
        expect(result.errors.filter(e => e.includes('Hero')).length).toBe(0);
        expect(result.stats.heroCount).toBe(0);
      });

      it('should allow deck with Hero in limited format', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 29 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.stats.heroCount).toBe(1);
        expect(result.stats.totalCards).toBe(30); // 29 + 1 hero
      });
    });

    describe('Rule 1.1.5.c - Minimum 29 non-Hero Cards', () => {
      it('should require at least 29 non-Hero cards', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 25 }
        ];
        const heroId = REAL_CARDS.HERO_AXIOM;

        const result = validator.validate(cards, heroId);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('A limited deck must include at least 29 non-Hero cards (currently 25)');
      });
    });

    describe('Rule 1.1.5.d - Maximum 3 Factions', () => {
      it('should allow cards from different factions in limited format', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 10 },  // Axiom
          { cardId: REAL_CARDS.BR_CHAR_COMMON, quantity: 10 }, // Bravos
          { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 9 } // More Axiom
        ];

        const result = validator.validate(cards);
        expect(result.errors.filter(e => e.includes('faction')).length).toBe(0);
        expect(Object.keys(result.stats.factionBreakdown).length).toBeLessThanOrEqual(3);
      });
    });

    describe('No Copy/Rarity Restrictions in Limited', () => {
      it('should allow more than 3 copies of same card', () => {
        const cards: DeckCard[] = [
          { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 29 } // 29 copies of same card
        ];

        const result = validator.validate(cards);
        expect(result.errors.filter(e => e.includes('copies')).length).toBe(0);
        expect(result.warnings.some(w => w.includes('Multiple copies'))).toBe(true);
      });
    });
  });

  describe('Unknown Card Handling', () => {
    it('should handle unknown card IDs gracefully', () => {
      const cards: DeckCard[] = [
        { cardId: REAL_CARDS.UNKNOWN_CARD, quantity: 39 }
      ];
      const heroId = REAL_CARDS.HERO_AXIOM;

      const result = validator.validate(cards, heroId);
      
      // Unknown cards should not contribute to totals
      expect(result.stats.totalCards).toBe(1); // Only hero counted
      expect(result.isValid).toBe(false); // Invalid due to insufficient cards
    });

    it('should reject unknown cards in canAddCard', () => {
      const cards: DeckCard[] = [];
      const heroId = REAL_CARDS.HERO_AXIOM;

      const result = validator.canAddCard(cards, REAL_CARDS.UNKNOWN_CARD, heroId);
      expect(result.canAdd).toBe(false);
      expect(result.reason).toBe('Card not found');
    });

    it('should allow adding known cards in canAddCard', () => {
      const cards: DeckCard[] = [];
      const heroId = REAL_CARDS.HERO_AXIOM;

      const result = validator.canAddCard(cards, REAL_CARDS.AX_CHAR_COMMON, heroId);
      expect(result.canAdd).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should prevent adding cards that violate faction rules', () => {
      const cards: DeckCard[] = [];
      const heroId = REAL_CARDS.HERO_AXIOM; // Axiom hero

      const result = validator.canAddCard(cards, REAL_CARDS.BR_CHAR_COMMON, heroId); // Bravos card
      expect(result.canAdd).toBe(false);
      expect(result.reason).toContain('faction');
      expect(result.reason).toContain('Axiom');
      expect(result.reason).toContain('Bravos');
    });
  });

  describe('Complex Real Card Scenarios', () => {
    it('should handle transformations with faction changes', () => {
      // Vaike has Axiom and Yzmir versions with same name
      const cards: DeckCard[] = [
        { cardId: REAL_CARDS.VAIKE_AX_COMMON, quantity: 2 }, // Axiom Vaike
        { cardId: REAL_CARDS.VAIKE_YZ_RARE, quantity: 1 },   // Yzmir Vaike (different faction!)
        { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 36 }
      ];
      const heroId = REAL_CARDS.HERO_AXIOM; // Axiom hero

      const result = validator.validate(cards, heroId);
      
      // Should fail both faction restriction AND copy limit
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('faction'))).toBe(true);
      expect(result.errors.some(e => e.includes('copies'))).toBe(true);
    });

    it('should correctly count statistics with real cards', () => {
      const cards: DeckCard[] = [
        { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 10 },   // 10 common characters
        { cardId: REAL_CARDS.AX_CHAR_RARE, quantity: 5 },     // 5 rare characters
        { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 24 } // 24 common landmarks
      ];
      const heroId = REAL_CARDS.HERO_AXIOM; // Common hero

      const result = validator.validate(cards, heroId);
      
      expect(result.stats.totalCards).toBe(40); // 39 + 1 hero
      expect(result.stats.heroCount).toBe(1);
      expect(result.stats.factionBreakdown['Axiom']).toBe(40); // All Axiom
      expect(result.stats.rarityBreakdown['Commun']).toBe(35); // 10 + 24 + 1 hero
      expect(result.stats.rarityBreakdown['Rare']).toBe(5);
    });

    it('should validate deck switching between formats with real cards', () => {
      const cards: DeckCard[] = [
        { cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 5 }, // 5 copies - invalid in constructed
        { cardId: REAL_CARDS.AX_LANDMARK_COMMON, quantity: 34 }
      ];
      const heroId = REAL_CARDS.HERO_AXIOM;

      // Constructed format - should fail copy limit
      validator.setFormat('constructed');
      const constructedResult = validator.validate(cards, heroId);
      expect(constructedResult.isValid).toBe(false);
      expect(constructedResult.errors.some(e => e.includes('copies'))).toBe(true);

      // Limited format - should pass (no copy restrictions)
      validator.setFormat('limited');
      const limitedResult = validator.validate(cards, heroId);
      expect(limitedResult.errors.filter(e => e.includes('copies')).length).toBe(0);
    });
  });

  describe('Exact Rule Compliance with Real Cards', () => {
    it('should enforce exact copy limits per Altered rules', () => {
      validator.setFormat('constructed');
      const cards: DeckCard[] = [];
      const heroId = REAL_CARDS.HERO_AXIOM;

      // Test adding up to 3 copies
      expect(validator.canAddCard(cards, REAL_CARDS.AX_CHAR_COMMON, heroId).canAdd).toBe(true);
      
      cards.push({ cardId: REAL_CARDS.AX_CHAR_COMMON, quantity: 3 });
      expect(validator.canAddCard(cards, REAL_CARDS.AX_CHAR_COMMON, heroId).canAdd).toBe(false);
    });

    it('should enforce exact faction restrictions per Altered rules', () => {
      validator.setFormat('constructed');
      const cards: DeckCard[] = [];
      
      // Axiom hero should only allow Axiom cards
      expect(validator.canAddCard(cards, REAL_CARDS.AX_CHAR_COMMON, REAL_CARDS.HERO_AXIOM).canAdd).toBe(true);
      expect(validator.canAddCard(cards, REAL_CARDS.BR_CHAR_COMMON, REAL_CARDS.HERO_AXIOM).canAdd).toBe(false);
      
      // Bravos hero should only allow Bravos cards  
      expect(validator.canAddCard(cards, REAL_CARDS.BR_CHAR_COMMON, REAL_CARDS.HERO_BRAVOS).canAdd).toBe(true);
      expect(validator.canAddCard(cards, REAL_CARDS.AX_CHAR_COMMON, REAL_CARDS.HERO_BRAVOS).canAdd).toBe(false);
    });
  });
});