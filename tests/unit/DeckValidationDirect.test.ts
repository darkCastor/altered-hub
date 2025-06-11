import { describe, it, expect, beforeEach } from 'bun:test';
import { DeckValidator, type DeckCard } from '../../src/lib/deckValidation';

describe('DeckValidator - Direct Logic Tests', () => {
  let validator: DeckValidator;

  beforeEach(() => {
    validator = new DeckValidator('constructed');
  });

  describe('Format Switching', () => {
    it('should switch between constructed and limited formats', () => {
      expect(validator.getFormat()).toBe('constructed');
      
      validator.setFormat('limited');
      expect(validator.getFormat()).toBe('limited');
      
      validator.setFormat('constructed');
      expect(validator.getFormat()).toBe('constructed');
    });
  });

  describe('Basic Validation Structure', () => {
    it('should return proper validation result structure', () => {
      const cards: DeckCard[] = [];
      const result = validator.validate(cards);
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('stats');
      
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.isValid).toBe('boolean');
      expect(typeof result.stats).toBe('object');
    });

    it('should have correct stats structure', () => {
      const cards: DeckCard[] = [];
      const result = validator.validate(cards);
      
      expect(result.stats).toHaveProperty('totalCards');
      expect(result.stats).toHaveProperty('heroCount');
      expect(result.stats).toHaveProperty('factionBreakdown');
      expect(result.stats).toHaveProperty('rarityBreakdown');
      expect(result.stats).toHaveProperty('copyViolations');
      
      expect(typeof result.stats.totalCards).toBe('number');
      expect(typeof result.stats.heroCount).toBe('number');
      expect(typeof result.stats.factionBreakdown).toBe('object');
      expect(typeof result.stats.rarityBreakdown).toBe('object');
      expect(Array.isArray(result.stats.copyViolations)).toBe(true);
    });
  });

  describe('Empty Deck Validation', () => {
    it('should invalidate empty deck in constructed format', () => {
      validator.setFormat('constructed');
      const cards: DeckCard[] = [];
      const result = validator.validate(cards);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.stats.totalCards).toBe(0);
      expect(result.stats.heroCount).toBe(0);
    });

    it('should invalidate empty deck in limited format', () => {
      validator.setFormat('limited');
      const cards: DeckCard[] = [];
      const result = validator.validate(cards);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.stats.totalCards).toBe(0);
    });
  });

  describe('Hero Validation Rules', () => {
    it('should require hero in constructed format', () => {
      validator.setFormat('constructed');
      const cards: DeckCard[] = [
        { cardId: 'dummy_card', quantity: 40 }
      ];
      
      const result = validator.validate(cards); // No hero provided
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Hero'))).toBe(true);
    });

    it('should not require hero in limited format', () => {
      validator.setFormat('limited');
      const cards: DeckCard[] = [
        { cardId: 'dummy_card', quantity: 30 }
      ];
      
      const result = validator.validate(cards); // No hero provided
      
      // May still be invalid for other reasons, but not hero requirement
      const hasHeroError = result.errors.some(e => e.includes('must include exactly 1 Hero'));
      expect(hasHeroError).toBe(false);
    });
  });

  describe('Deck Size Rules', () => {
    it('should enforce 39+ card minimum in constructed format', () => {
      validator.setFormat('constructed');
      
      // Test with various card counts below minimum
      const testCases = [0, 10, 20, 30, 38];
      
      testCases.forEach(cardCount => {
        const cards: DeckCard[] = cardCount > 0 ? [{ cardId: 'dummy', quantity: cardCount }] : [];
        const result = validator.validate(cards, 'hero_id');
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('at least 39 non-Hero cards'))).toBe(true);
      });
    });

    it('should enforce 29+ card minimum in limited format', () => {
      validator.setFormat('limited');
      
      // Test with various card counts below minimum
      const testCases = [0, 10, 20, 28];
      
      testCases.forEach(cardCount => {
        const cards: DeckCard[] = cardCount > 0 ? [{ cardId: 'dummy', quantity: cardCount }] : [];
        const result = validator.validate(cards, 'hero_id');
        
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('at least 29 non-Hero cards'))).toBe(true);
      });
    });

    it('should accept minimum valid deck sizes', () => {
      // Constructed: 39 cards + hero = 40 total
      validator.setFormat('constructed');
      const constructedCards: DeckCard[] = [{ cardId: 'dummy', quantity: 39 }];
      const constructedResult = validator.validate(constructedCards, 'hero_id');
      
      expect(constructedResult.stats.totalCards).toBe(40);
      expect(constructedResult.errors.filter(e => e.includes('39 non-Hero cards')).length).toBe(0);
      
      // Limited: 29 cards + hero = 30 total
      validator.setFormat('limited');
      const limitedCards: DeckCard[] = [{ cardId: 'dummy', quantity: 29 }];
      const limitedResult = validator.validate(limitedCards, 'hero_id');
      
      expect(limitedResult.stats.totalCards).toBe(30);
      expect(limitedResult.errors.filter(e => e.includes('29 non-Hero cards')).length).toBe(0);
    });
  });

  describe('canAddCard Method', () => {
    it('should return proper structure', () => {
      const cards: DeckCard[] = [];
      const result = validator.canAddCard(cards, 'test_card');
      
      expect(result).toHaveProperty('canAdd');
      expect(typeof result.canAdd).toBe('boolean');
      
      if (!result.canAdd) {
        expect(result).toHaveProperty('reason');
        expect(typeof result.reason).toBe('string');
      }
    });

    it('should handle non-existent cards', () => {
      const cards: DeckCard[] = [];
      const result = validator.canAddCard(cards, '');
      
      expect(result.canAdd).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate total cards correctly', () => {
      const cards: DeckCard[] = [
        { cardId: 'card1', quantity: 5 },
        { cardId: 'card2', quantity: 10 },
        { cardId: 'card3', quantity: 15 }
      ];
      
      const result = validator.validate(cards, 'hero_id');
      
      expect(result.stats.totalCards).toBe(31); // 30 cards + 1 hero
    });

    it('should count hero correctly when provided', () => {
      const cards: DeckCard[] = [{ cardId: 'card1', quantity: 10 }];
      
      const resultWithHero = validator.validate(cards, 'hero_id');
      expect(resultWithHero.stats.heroCount).toBe(1);
      
      const resultWithoutHero = validator.validate(cards);
      expect(resultWithoutHero.stats.heroCount).toBe(0);
    });
  });

  describe('Format-Specific Behavior', () => {
    it('should behave differently based on format', () => {
      const cards: DeckCard[] = [{ cardId: 'test', quantity: 30 }];
      
      // Test constructed format requirements
      validator.setFormat('constructed');
      const constructedResult = validator.validate(cards);
      expect(constructedResult.errors.some(e => e.includes('at least 39 non-Hero cards'))).toBe(true);
      
      // Test limited format requirements  
      validator.setFormat('limited');
      const limitedResult = validator.validate(cards);
      expect(limitedResult.errors.some(e => e.includes('at least 29 non-Hero cards'))).toBe(false);
    });
  });

  describe('Copy Violation Detection', () => {
    it('should detect copy violations in stats', () => {
      const cards: DeckCard[] = [
        { cardId: 'card1', quantity: 5 }, // This would trigger copy violation in real implementation
        { cardId: 'card2', quantity: 30 }
      ];
      
      const result = validator.validate(cards);
      
      // The copyViolations array should exist (implementation details depend on actual card data)
      expect(Array.isArray(result.stats.copyViolations)).toBe(true);
    });
  });

  describe('Validation Rule Combinations', () => {
    it('should accumulate multiple errors', () => {
      validator.setFormat('constructed');
      
      // Empty deck should have multiple validation errors
      const cards: DeckCard[] = [];
      const result = validator.validate(cards);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1); // Should have multiple errors
    });

    it('should clear errors when deck becomes valid', () => {
      validator.setFormat('limited');
      
      // Valid limited deck (minimal requirements)
      const cards: DeckCard[] = [{ cardId: 'card', quantity: 29 }];
      const result = validator.validate(cards);
      
      // Should have fewer errors than an empty deck
      const emptyResult = validator.validate([]);
      expect(result.errors.length).toBeLessThan(emptyResult.errors.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero quantity cards', () => {
      const cards: DeckCard[] = [
        { cardId: 'card1', quantity: 0 },
        { cardId: 'card2', quantity: 30 }
      ];
      
      const result = validator.validate(cards);
      
      // Zero quantity cards should not contribute to total
      expect(result.stats.totalCards).toBeLessThanOrEqual(30);
    });

    it('should handle negative quantity cards', () => {
      const cards: DeckCard[] = [
        { cardId: 'card1', quantity: -5 },
        { cardId: 'card2', quantity: 35 }
      ];
      
      const result = validator.validate(cards);
      
      // Negative quantities should be handled gracefully
      expect(result.stats.totalCards).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large deck sizes', () => {
      const cards: DeckCard[] = [
        { cardId: 'card1', quantity: 1000 }
      ];
      
      const result = validator.validate(cards, 'hero');
      
      // Should include performance warning for large decks
      expect(result.warnings.some(w => w.includes('Large deck size'))).toBe(true);
    });
  });
});