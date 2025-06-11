import { describe, test, expect, beforeEach } from 'bun:test';
import { CardPlaySystem } from '../../src/engine/CardPlaySystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { CardType, StatusType, ZoneIdentifier, GamePhase } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for CardPlaySystem - Rules 5.1 (Card Playing Process) and 5.2 (Playing from Reserve)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('CardPlaySystem - Card Playing Rules', () => {
  let cardPlaySystem: CardPlaySystem;
  let gameStateManager: GameStateManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    const mockCardDefinitions: ICardDefinition[] = [
      {
        id: 'character-001',
        name: 'Test Character',
        type: CardType.Character,
        subTypes: [],
        handCost: { total: 3, forest: 1, mountain: 1, water: 1 },
        reserveCost: { total: 2, forest: 0, mountain: 1, water: 1 },
        faction: 'Neutral',
        statistics: { forest: 2, mountain: 1, water: 1 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      },
      {
        id: 'spell-001',
        name: 'Test Spell',
        type: CardType.Spell,
        subTypes: [],
        handCost: { total: 2, forest: 1, mountain: 0, water: 1 },
        reserveCost: { total: 1, forest: 0, mountain: 0, water: 1 },
        faction: 'Neutral',
        statistics: { forest: 0, mountain: 0, water: 0 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      },
      {
        id: 'permanent-001',
        name: 'Test Permanent',
        type: CardType.Permanent,
        subTypes: [],
        handCost: { total: 2, forest: 0, mountain: 2, water: 0 },
        reserveCost: { total: 1, forest: 0, mountain: 1, water: 0 },
        faction: 'Neutral',
        statistics: { forest: 0, mountain: 0, water: 0 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      }
    ];
    
    gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
    cardPlaySystem = new CardPlaySystem(gameStateManager);
    gameStateManager.initializeGame();
  });

  describe('Rule 5.1.2: Card Playing Process (4 Parts)', () => {
    test('Rule 5.1.2.c: Part 1 - Declare Intent (reveal, choose modes, declare payment)', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card);
      
      const intent = cardPlaySystem.declarePlayIntent('player1', card.id, {
        paymentMethod: 'hand',
        chosenModes: [],
        targetChoices: []
      });
      
      expect(intent.success).toBe(true);
      expect(intent.declaredCard).toBe(card.id);
      expect(intent.revealedToAll).toBe(true);
      expect(intent.paymentMethod).toBe('hand');
    });

    test('Rule 5.1.2.g: Part 2 - Move to Limbo', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card);
      
      cardPlaySystem.declarePlayIntent('player1', card.id, { paymentMethod: 'hand' });
      const moveResult = cardPlaySystem.moveToLimbo('player1', card.id);
      
      expect(moveResult.success).toBe(true);
      expect(player!.zones.handZone.contains(card.id)).toBe(false);
      expect(player!.zones.limboZone.contains(card.id)).toBe(true);
    });

    test('Rule 5.1.2.h: Part 3 - Pay Costs (all costs paid simultaneously)', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      
      // Setup mana
      player!.zones.manaZone.getAll().forEach(orb => orb.statuses.delete(StatusType.Exhausted));
      
      player!.zones.limboZone.add(card);
      
      const paymentResult = cardPlaySystem.payCosts('player1', card.id);
      
      expect(paymentResult.success).toBe(true);
      expect(paymentResult.costsDetail).toBeDefined();
      
      // Verify mana was spent
      const exhaustedOrbs = player!.zones.manaZone.getAll().filter(orb => 
        orb.statuses.has(StatusType.Exhausted)
      );
      expect(exhaustedOrbs.length).toBeGreaterThan(0);
    });

    test('Rule 5.1.2.i: Part 4 - Resolution (effect resolves, move to final zone)', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.limboZone.add(card);
      
      const resolutionResult = cardPlaySystem.resolveCard('player1', card.id);
      
      expect(resolutionResult.success).toBe(true);
      expect(player!.zones.limboZone.contains(card.id)).toBe(false);
      
      // Character should go to expedition zone
      expect(player!.zones.expeditionZone.contains(card.id)).toBe(true);
    });

    test('Complete card playing process should work end-to-end', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card);
      
      // Setup sufficient mana
      player!.zones.manaZone.getAll().forEach(orb => orb.statuses.delete(StatusType.Exhausted));
      
      const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
        paymentMethod: 'hand',
        chosenModes: [],
        targetChoices: []
      });
      
      expect(playResult.success).toBe(true);
      expect(player!.zones.handZone.contains(card.id)).toBe(false);
      expect(player!.zones.expeditionZone.contains(card.id)).toBe(true);
    });
  });

  describe('Rule 5.1.2.d: Hand Cost vs Reserve Cost', () => {
    test('Should use Hand Cost when playing from Hand', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      console.log("[Test LOG] Created card object:", JSON.stringify(card, null, 2)); // Log the whole card
      player!.zones.handZone.add(card);
      const idToPass = String(card?.id); // Use optional chaining for safety if id is indeed missing
      
      const costCheck = cardPlaySystem.getPlayingCost('player1', idToPass, 'hand');
      
      const expectedCost = gameStateManager.getCardDefinition('character-001')!.handCost;
      expect(costCheck.cost).toEqual(expectedCost);
      expect(costCheck.source).toBe('hand');
    });

    test('Should use Reserve Cost when playing from Reserve', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.reserveZone.add(card);
      const idToPass = String(card.id); // Explicitly cast to string
      
      const costCheck = cardPlaySystem.getPlayingCost('player1', idToPass, 'reserve');
      
      const expectedCost = gameStateManager.getCardDefinition('character-001')!.reserveCost;
      expect(costCheck.cost).toEqual(expectedCost);
      expect(costCheck.source).toBe('reserve');
    });

    test('Reserve cost should be lower than hand cost', () => {
      const cardDefinition = gameStateManager.getCardDefinition('character-001')!; // Get definition for direct comparison
      
      expect(cardDefinition.reserveCost.total).toBeLessThan(cardDefinition.handCost.total);
    });
  });

  describe('Rule 5.1.2.e: Cost Alterations (Increases → Decreases → Restrictions)', () => {
    test('Should apply cost increases first', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card); // ADDED THIS LINE
      
      // Add cost increase effect
      cardPlaySystem.addCostModifier('player1', {
        type: 'increase',
        amount: { total: 1, forest: 0, mountain: 0, water: 0 },
        applies: () => true
      });
      const idToPassForIncrease = String(card.id); // Explicitly cast to string
      
      const modifiedCostIncrease = cardPlaySystem.calculateModifiedCost('player1', idToPassForIncrease, 'hand');
      const cardDefinitionIncrease = gameStateManager.getCardDefinition('character-001')!;
      
      expect(modifiedCostIncrease.total).toBe(cardDefinitionIncrease.handCost.total + 1);
    });

    test('Should apply cost decreases after increases', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card); // ADDED THIS LINE
      
      // Add both increase and decrease
      cardPlaySystem.addCostModifier('player1', {
        type: 'increase',
        amount: { total: 2, forest: 0, mountain: 0, water: 0 },
        applies: () => true
      });
      
      cardPlaySystem.addCostModifier('player1', {
        type: 'decrease',
        amount: { total: 1, forest: 0, mountain: 0, water: 0 },
        applies: () => true
      });
      const idToPassForDecrease = String(card.id); // Explicitly cast to string
      
      const modifiedCostDecrease = cardPlaySystem.calculateModifiedCost('player1', idToPassForDecrease, 'hand');
      const cardDefinitionDecrease = gameStateManager.getCardDefinition('character-001')!;
      
      // Should be original + 2 - 1 = original + 1
      expect(modifiedCostDecrease.total).toBe(cardDefinitionDecrease.handCost.total + 1);
    });

    test('Should apply restrictions last', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card); // ADDED THIS LINE
      
      // Add restriction (e.g., can't be reduced below certain cost)
      cardPlaySystem.addCostModifier('player1', {
        type: 'restriction',
        restriction: 'minimum',
        minimumCost: { total: 2, forest: 1, mountain: 1, water: 0 },
        applies: () => true
      });
      
      // Try to reduce cost below minimum
      cardPlaySystem.addCostModifier('player1', {
        type: 'decrease',
        amount: { total: 10, forest: 10, mountain: 10, water: 10 },
        applies: () => true
      });
      const idToPass = String(card.id); // Explicitly cast to string
      
      const modifiedCost = cardPlaySystem.calculateModifiedCost('player1', idToPass, 'hand');
      
      expect(modifiedCost.total).toBeGreaterThanOrEqual(2);
      expect(modifiedCost.forest).toBeGreaterThanOrEqual(1);
      expect(modifiedCost.mountain).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Rule 5.1.3: Character Card Placement', () => {
    test('Characters should be placed in Expedition zone by default', () => {
      const player = gameStateManager.getPlayer('player1');
      const character = gameStateManager.objectFactory.createCard('character-001', 'player1');
      
      const placementResult = cardPlaySystem.placeCharacter('player1', character.id);
      
      expect(placementResult.success).toBe(true);
      expect(placementResult.zone).toBe(ZoneIdentifier.Expedition);
      expect(player!.zones.expeditionZone.contains(character.id)).toBe(true);
    });

    test('Should handle zone placement restrictions', () => {
      const player = gameStateManager.getPlayer('player1');
      const character = gameStateManager.objectFactory.createCard('character-001', 'player1');
      
      // Mock zone full condition
      const expeditionZone = player!.zones.expeditionZone;
      // expeditionZone.setCapacity(0); // Force placement failure - BaseZone has no setCapacity
      
      const placementResult = cardPlaySystem.placeCharacter('player1', character.id);
      
      expect(placementResult.success).toBe(false);
      expect(placementResult.error).toContain('zone full');
    });
  });

  describe('Rule 5.1.4: Permanent Card Placement', () => {
    test('Permanents should be placed in Landmark zone', () => {
      const player = gameStateManager.getPlayer('player1');
      const permanent = gameStateManager.objectFactory.createCard('permanent-001', 'player1');
      
      const placementResult = cardPlaySystem.placePermanent('player1', permanent.id);
      
      expect(placementResult.success).toBe(true);
      expect(placementResult.zone).toBe(ZoneIdentifier.Landmark);
      expect(player!.zones.landmarkZone.contains(permanent.id)).toBe(true);
    });
  });

  describe('Rule 5.1.5: Spell Card Resolution', () => {
    test('Spells should resolve and go to Discard pile', () => {
      const player = gameStateManager.getPlayer('player1');
      const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');
      
      const resolutionResult = cardPlaySystem.resolveSpell('player1', spell.id);
      
      expect(resolutionResult.success).toBe(true);
      expect(resolutionResult.finalZone).toBe(ZoneIdentifier.Discard);
      expect(player!.zones.discardPileZone.contains(spell.id)).toBe(true);
    });

    test('Spells with Cooldown should go to Reserve instead of Discard', () => {
      const player = gameStateManager.getPlayer('player1');
      const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');
      
      // Add Cooldown keyword
      spell.keywords = ['Cooldown'];
      
      const resolutionResult = cardPlaySystem.resolveSpell('player1', spell.id);
      
      expect(resolutionResult.success).toBe(true);
      expect(resolutionResult.finalZone).toBe(ZoneIdentifier.Reserve);
      expect(player!.zones.reserveZone.contains(spell.id)).toBe(true);
      
      // Spell should be exhausted in Reserve
      const cardInReserve = player!.zones.reserveZone.getAll().find(c => c.id === spell.id);
      expect(cardInReserve!.statuses.has(StatusType.Exhausted)).toBe(true);
    });
  });

  describe('Rule 5.2.1.b: Playing from Reserve - Fleeting', () => {
    test('Cards played from Reserve should gain Fleeting in Limbo', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.reserveZone.add(card);
      
      cardPlaySystem.moveToLimbo('player1', card.id, 'reserve');
      
      const cardInLimbo = player!.zones.limboZone.getAll().find(c => c.id === card.id);
      expect(cardInLimbo!.statuses.has(StatusType.Fleeting)).toBe(true);
    });

    test('Cards with Fleeting should go to Discard when leaving play', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      card.statuses.add(StatusType.Fleeting);
      player!.zones.expeditionZone.add(card);
      
      // Simulate card leaving play
      cardPlaySystem.removeFromPlay('player1', card.id);
      
      expect(player!.zones.expeditionZone.contains(card.id)).toBe(false);
      expect(player!.zones.discardPileZone.contains(card.id)).toBe(true);
      expect(player!.zones.reserveZone.contains(card.id)).toBe(false); // Not to Reserve
    });
  });

  describe('Targeting and Validation', () => {
    test('Should validate legal targets for card abilities', () => {
      const player = gameStateManager.getPlayer('player1');
      const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');
      
      // Mock spell with targeting requirement
      spell.abilities = [{
        type: 'triggered',
        trigger: 'play',
        effect: 'deal_damage',
        targets: ['character'],
        amount: 2
      }];
      
      const targetValidation = cardPlaySystem.validateTargets('player1', spell.id, ['invalid-target']);
      
      expect(targetValidation.valid).toBe(false);
      expect(targetValidation.errors).toContain('Invalid target');
    });

    test('Should handle cards with no targeting requirements', () => {
      const player = gameStateManager.getPlayer('player1');
      const character = gameStateManager.objectFactory.createCard('character-001', 'player1');
      
      const targetValidation = cardPlaySystem.validateTargets('player1', character.id, []);
      
      expect(targetValidation.valid).toBe(true);
      expect(targetValidation.errors).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('Should prevent playing cards not in valid zones', () => {
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      // Card not in any zone
      
      const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, { paymentMethod: 'hand' });
      
      expect(playResult.success).toBe(false);
      expect(playResult.error).toBe('Card not found in playable zone');
    });

    test('Should prevent playing with insufficient mana', () => {
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card);
      
      // Exhaust all mana orbs
      player!.zones.manaZone.getAll().forEach(orb => orb.statuses.add(StatusType.Exhausted));
      
      const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, { paymentMethod: 'hand' });
      
      expect(playResult.success).toBe(false);
      expect(playResult.error).toBe('Insufficient mana');
    });

    test('Should handle invalid player IDs', () => {
      const playResult = cardPlaySystem._playCardForTestSteps('invalid-player', 'some-card', { paymentMethod: 'hand' });
      
      expect(playResult.success).toBe(false);
      expect(playResult.error).toBe('Invalid player');
    });

    test('Should prevent playing during incorrect phases', () => {
      // gameStateManager.setCurrentPhase(GamePhase.Dusk); // Cards can't be played during Dusk
      
      const player = gameStateManager.getPlayer('player1');
      const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player!.zones.handZone.add(card);
      
      const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, { paymentMethod: 'hand' });
      
      expect(playResult.success).toBe(false);
      expect(playResult.error).toBe('Cannot play cards during current phase');
    });
  });
});