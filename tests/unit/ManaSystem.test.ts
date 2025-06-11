import { describe, test, expect, beforeEach } from '@jest/globals';
import { ManaSystem } from '../../src/engine/ManaSystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { TerrainType, StatusType, CardType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for ManaSystem - Rules 3.2.9 (Mana Zone) and 2.2.10 (Terrain Statistics)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('ManaSystem - Mana and Terrain Rules', () => {
  let manaSystem: ManaSystem;
  let gameStateManager: GameStateManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    const mockCardDefinitions: ICardDefinition[] = [
      {
        id: 'character-forest',
        name: 'Forest Character',
        type: CardType.Character,
        subTypes: [],
        handCost: { total: 2, forest: 2, mountain: 0, water: 0 },
        reserveCost: { total: 1, forest: 1, mountain: 0, water: 0 },
        faction: 'Forest',
        statistics: { forest: 3, mountain: 0, water: 1 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      },
      {
        id: 'character-mountain',
        name: 'Mountain Character',
        type: CardType.Character,
        subTypes: [],
        handCost: { total: 2, forest: 0, mountain: 2, water: 0 },
        reserveCost: { total: 1, forest: 0, mountain: 1, water: 0 },
        faction: 'Mountain',
        statistics: { forest: 0, mountain: 3, water: 1 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      },
      {
        id: 'basic-card',
        name: 'Basic Card',
        type: CardType.Spell,
        subTypes: [],
        handCost: { total: 1, forest: 0, mountain: 0, water: 0 },
        reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
        faction: 'Neutral',
        statistics: { forest: 0, mountain: 0, water: 0 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      }
    ];
    
    gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
    manaSystem = new ManaSystem(gameStateManager);
    gameStateManager.initializeGame();
  });

  describe('Rule 3.2.9: Mana Zone and Mana Orbs', () => {
    test('Rule 3.2.9.b: Cards should enter Mana zone face-down and exhausted', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('basic-card', 'player1');
      
      // Add card to hand first
      player!.zones.handZone.add(card);
      
      manaSystem.addCardToMana('player1', card.id);
      
      const manaZone = player!.zones.manaZone;
      const addedCard = manaZone.getAll().find(c => c.id === card.id);
      
      expect(addedCard!.faceDown).toBe(true);
      expect(addedCard!.statuses.has(StatusType.Exhausted)).toBe(true);
    });

    test('Rule 3.2.9.c: Cards in Mana zone should become type "Mana Orb"', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('basic-card', 'player1');
      
      expect(card.type).toBe(CardType.Spell); // Original type
      
      // Add card to hand first
      player!.zones.handZone.add(card);
      
      manaSystem.addCardToMana('player1', card.id);
      
      const manaZone = player!.zones.manaZone;
      const manaOrb = manaZone.getAll().find(c => c.id === card.id);
      
      expect(manaOrb!.type).toBe(CardType.ManaOrb); // Type changed
    });

    test('Rule 3.2.9.e: Should be able to exhaust one Mana Orb to ready another', () => {
      const player = gameStateManager.getPlayer('player1');
      const manaOrbs = player!.zones.manaZone.getAll();
      
      // Start with all orbs ready
      manaOrbs.forEach(orb => orb.statuses.delete(StatusType.Exhausted));
      
      // Exhaust second orb, then use conversion (first orb ready -> second orb ready)
      manaOrbs[1].statuses.add(StatusType.Exhausted);
      
      const conversionResult = manaSystem.convertMana('player1', manaOrbs[0].objectId, manaOrbs[1].objectId);
      
      expect(conversionResult).toBe(true);
      expect(manaOrbs[0].statuses.has(StatusType.Exhausted)).toBe(true); // Used for conversion
      expect(manaOrbs[1].statuses.has(StatusType.Exhausted)).toBe(false); // Now ready
    });

    test('Rule 3.2.9.f: Should pay X mana by exhausting X Mana Orbs', () => {
      const player = gameStateManager.getPlayer('player1');
      const manaOrbs = player!.zones.manaZone.getAll();
      
      // Start with all orbs ready
      manaOrbs.forEach(orb => orb.statuses.delete(StatusType.Exhausted));
      
      const paymentResult = manaSystem.payMana('player1', 2);
      
      expect(paymentResult.success).toBe(true);
      
      // Exactly 2 orbs should be exhausted
      const exhaustedCount = manaOrbs.filter(orb => orb.statuses.has(StatusType.Exhausted)).length;
      expect(exhaustedCount).toBe(2);
    });

    test('Should not be able to pay more mana than available', () => {
      const player = gameStateManager.getPlayer('player1');
      const manaOrbs = player!.zones.manaZone.getAll();
      
      // Start with all orbs ready (3 total)
      manaOrbs.forEach(orb => orb.statuses.delete(StatusType.Exhausted));
      
      const paymentResult = manaSystem.payMana('player1', 5); // More than available
      
      expect(paymentResult.success).toBe(false);
      expect(paymentResult.error).toBe('Insufficient mana');
      
      // No orbs should be exhausted
      const exhaustedCount = manaOrbs.filter(orb => orb.statuses.has(StatusType.Exhausted)).length;
      expect(exhaustedCount).toBe(0);
    });

    test('Should correctly calculate available mana from ready orbs', () => {
      const player = gameStateManager.getPlayer('player1');
      const manaOrbs = player!.zones.manaZone.getAll();
      
      // Start with all orbs ready
      manaOrbs.forEach(orb => orb.statuses.delete(StatusType.Exhausted));
      
      let availableMana = manaSystem.getManaFromOrbs('player1');
      expect(availableMana).toBe(3); // All 3 orbs ready
      
      // Exhaust one orb
      manaOrbs[0].statuses.add(StatusType.Exhausted);
      
      availableMana = manaSystem.getManaFromOrbs('player1');
      expect(availableMana).toBe(2); // Only 2 orbs ready
    });
  });

  describe('Rule 2.2.10: Character Statistics and Terrain Mana', () => {
    test('Rule 2.2.10: Characters should provide terrain-based mana through statistics', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add forest character to expedition
      const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      player!.zones.expeditionZone.add(forestChar);
      
      // Add mountain character to hero zone
      const mountainChar = gameStateManager.objectFactory.createCard('character-mountain', 'player1');
      player!.zones.heroZone.add(mountainChar);
      
      const manaPool = manaSystem.getAvailableMana('player1');
      
      expect(manaPool.forest).toBe(3); // From forest character
      expect(manaPool.mountain).toBe(3); // From mountain character
      expect(manaPool.water).toBe(2); // From both characters (1+1)
      expect(manaPool.orbs).toBe(3); // From mana orbs
      expect(manaPool.total).toBe(11); // 3+3+2+3
    });

    test('Should only count statistics from characters in expedition and hero zones', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add character to hand (shouldn't count)
      const handChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      player!.zones.handZone.add(handChar);
      
      // Add character to reserve (shouldn't count)
      const reserveChar = gameStateManager.objectFactory.createCard('character-mountain', 'player1');
      player!.zones.reserveZone.add(reserveChar);
      
      const manaPool = manaSystem.getAvailableMana('player1');
      
      expect(manaPool.forest).toBe(0); // Hand character doesn't count
      expect(manaPool.mountain).toBe(0); // Reserve character doesn't count
      expect(manaPool.water).toBe(0);
      expect(manaPool.orbs).toBe(3); // Only mana orbs
      expect(manaPool.total).toBe(3);
    });

    test('Should handle terrain restrictions correctly', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add forest character
      const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      player!.zones.expeditionZone.add(forestChar);
      
      // Should be able to pay forest cost
      const forestCost = { total: 2, forest: 2, mountain: 0, water: 0 };
      const canPayForest = manaSystem.canPayCost('player1', forestCost);
      expect(canPayForest).toBe(true);
      
      // Should not be able to pay mountain cost
      const mountainCost = { total: 2, forest: 0, mountain: 2, water: 0 };
      const canPayMountain = manaSystem.canPayCost('player1', mountainCost);
      expect(canPayMountain).toBe(false);
    });

    test('Should allow terrain mana to be used for generic costs', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add character with terrain stats
      const character = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      player!.zones.expeditionZone.add(character);
      
      // Should be able to pay generic cost with terrain mana
      const genericCost = { total: 2, forest: 0, mountain: 0, water: 0 };
      const canPayGeneric = manaSystem.canPayCost('player1', genericCost);
      expect(canPayGeneric).toBe(true);
      
      // Pay the cost
      const paymentResult = manaSystem.payGenericCost('player1', genericCost);
      expect(paymentResult.success).toBe(true);
    });
  });

  describe('Rule 4.2.1.e: Expand Mechanics', () => {
    test('Should allow adding card from hand to mana during Morning phase', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add card to hand (cards in hand should be game objects)
      const card = gameStateManager.objectFactory.createCard('basic-card', 'player1');
      player!.zones.handZone.add(card);
      
      const initialHandSize = player!.zones.handZone.getAll().length;
      const initialManaCount = player!.zones.manaZone.getAll().length;
      
      const expandResult = manaSystem.expandMana('player1', card.objectId);
      
      expect(expandResult.success).toBe(true);
      expect(player!.zones.handZone.getAll().length).toBe(initialHandSize - 1);
      expect(player!.zones.manaZone.getAll().length).toBe(initialManaCount + 1);
      
      // Card should be in mana zone and face-down
      const manaCard = player!.zones.manaZone.getAll().find(c => c.id === card.id);
      expect(manaCard).toBeDefined();
      expect(manaCard!.faceDown).toBe(true);
    });

    test('Should prevent expand if card not in hand', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Try to expand card not in hand
      const expandResult = manaSystem.expandMana('player1', 'nonexistent-card');
      
      expect(expandResult.success).toBe(false);
      expect(expandResult.error).toBe('Card not found in hand');
    });

    test('Should track expand usage per player per turn', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add two cards to hand
      const card1 = gameStateManager.objectFactory.createCard('basic-card', 'player1');
      const card2 = gameStateManager.objectFactory.createCard('basic-card', 'player1');
      player!.zones.handZone.add(card1);
      player!.zones.handZone.add(card2);
      
      // First expand should succeed
      const expand1 = manaSystem.expandMana('player1', card1.objectId);
      expect(expand1.success).toBe(true);
      
      // Second expand should fail (once per turn)
      const expand2 = manaSystem.expandMana('player1', card2.objectId);
      expect(expand2.success).toBe(false);
      expect(expand2.error).toBe('Already expanded this turn');
    });
  });

  describe('Mana Conversion and Complex Payments', () => {
    test('Should handle complex mana costs with terrain requirements', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add characters with different terrain stats
      const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      const mountainChar = gameStateManager.objectFactory.createCard('character-mountain', 'player1');
      
      player!.zones.expeditionZone.add(forestChar);
      player!.zones.heroZone.add(mountainChar);
      
      // Complex cost requiring specific terrains
      const complexCost = { total: 5, forest: 2, mountain: 2, water: 1 };
      
      const canPay = manaSystem.canPayCost('player1', complexCost);
      expect(canPay).toBe(true);
      
      const paymentResult = manaSystem.payComplexCost('player1', complexCost);
      expect(paymentResult.success).toBe(true);
      expect(paymentResult.payment).toEqual({
        forestUsed: 2,
        mountainUsed: 2,
        waterUsed: 1,
        orbsUsed: 0
      });
    });

    test('Should prioritize specific terrain mana over generic mana', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add forest character
      const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      player!.zones.expeditionZone.add(forestChar);
      
      // Cost with forest and generic components
      const cost = { total: 4, forest: 2, mountain: 0, water: 0 };
      
      const paymentResult = manaSystem.payComplexCost('player1', cost);
      
      expect(paymentResult.success).toBe(true);
      // Should use forest mana first, then generic
      expect(paymentResult.payment!.forestUsed).toBe(2);
      expect(paymentResult.payment!.orbsUsed).toBe(2); // Remaining generic cost
    });

    test('Should handle mana overflow correctly', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Add character with high stats
      const character = gameStateManager.objectFactory.createCard('character-forest', 'player1');
      player!.zones.expeditionZone.add(character);
      
      const manaPool = manaSystem.getAvailableMana('player1');
      
      // Should not have negative values
      expect(manaPool.forest).toBeGreaterThanOrEqual(0);
      expect(manaPool.mountain).toBeGreaterThanOrEqual(0);
      expect(manaPool.water).toBeGreaterThanOrEqual(0);
      expect(manaPool.orbs).toBeGreaterThanOrEqual(0);
      expect(manaPool.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    test('Should handle invalid player ID gracefully', () => {
      const manaPool = manaSystem.getAvailableMana('invalid-player');
      
      expect(manaPool).toEqual({
        total: 0,
        forest: 0,
        mountain: 0,
        water: 0,
        orbs: 0
      });
    });

    test('Should handle empty mana zone', () => {
      const player = gameStateManager.getPlayer('player1');
      
      // Clear mana zone
      player!.zones.manaZone.clear();
      
      const availableMana = manaSystem.getManaFromOrbs('player1');
      expect(availableMana).toBe(0);
      
      const paymentResult = manaSystem.payMana('player1', 1);
      expect(paymentResult.success).toBe(false);
      expect(paymentResult.error).toBe('Insufficient mana');
    });

    test('Should validate mana conversion parameters', () => {
      // Test with completely invalid IDs should return false
      const conversionResult = manaSystem.convertMana('invalid-player', 'invalid-source', 'invalid-target');
      
      expect(conversionResult).toBe(false);
    });
  });
});