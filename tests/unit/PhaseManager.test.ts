import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PhaseManager } from '../../src/engine/PhaseManager';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { TurnManager } from '../../src/engine/TurnManager';
import { EventBus } from '../../src/engine/EventBus';
import { GamePhase, StatusType, CardType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for PhaseManager - Rules 4.2 (Day Structure and Phase Transitions)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('PhaseManager - Phase Transition Rules', () => {
  let phaseManager: PhaseManager;
  let gameStateManager: GameStateManager;
  let turnManager: TurnManager;
  let eventBus: EventBus;

  beforeEach(async () => {
    eventBus = new EventBus();
    const mockCardDefinitions: ICardDefinition[] = [
      {
        id: 'hero-001',
        name: 'Test Hero',
        type: CardType.Hero,
        subTypes: [],
        handCost: { total: 0, forest: 0, mountain: 0, water: 0 },
        reserveCost: { total: 0, forest: 0, mountain: 0, water: 0 },
        faction: 'Neutral',
        statistics: { forest: 2, mountain: 1, water: 1 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      },
      {
        id: 'test-card',
        name: 'Test Card',
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
    turnManager = new TurnManager(gameStateManager);
    phaseManager = new PhaseManager(gameStateManager, turnManager);
    
    // Initialize game state
    await gameStateManager.initializeGame();
  });

  describe('Rule 4.2: Day Structure - Five Phases', () => {
    test('Rule 4.2.a: Day should consist of exactly 5 phases in correct order', () => {
      const expectedPhases = [
        GamePhase.Morning,
        GamePhase.Noon, 
        GamePhase.Afternoon,
        GamePhase.Dusk,
        GamePhase.Night
      ];
      
      // Test phase progression through a complete day
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      expect(gameStateManager.state.currentPhase).toBe(GamePhase.Morning);
      
      // Should advance through each phase in order
      for (let i = 0; i < expectedPhases.length - 1; i++) {
        phaseManager.advancePhase();
        expect(gameStateManager.state.currentPhase).toBe(expectedPhases[i + 1]);
      }
    });

    test('Rule 4.2.g: Night phase should advance to next day and return to Morning', async () => {
      const initialDay = gameStateManager.state.currentDay;
      gameStateManager.setCurrentPhase(GamePhase.Night);
      
      await phaseManager.advancePhase();
      
      expect(gameStateManager.state.currentDay).toBe(initialDay + 1);
      expect(gameStateManager.state.currentPhase).toBe(GamePhase.Morning);
    });
  });

  describe('Rule 4.2.1: Morning Phase - Succeed → Prepare → Draw → Expand', () => {
    test('Rule 4.2.1.a: Morning phase should execute Succeed step', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      
      const successSpy = jest.spyOn(phaseManager as any, 'handleSucceedStep');
      await phaseManager.executeMorningPhase();
      
      expect(successSpy).toHaveBeenCalled();
    });

    test('Rule 4.2.1.b: Morning phase should execute Prepare step', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      
      // All Mana Orbs should become ready (not exhausted)
      const player1 = gameStateManager.getPlayer('player1');
      const manaOrbs = player1!.zones.manaZone.getAll();
      
      // First exhaust some mana orbs
      manaOrbs.forEach(orb => orb.statuses.add(StatusType.Exhausted));
      
      await phaseManager.executeMorningPhase();
      
      // After prepare step, all should be ready
      manaOrbs.forEach(orb => {
        expect(orb.statuses.has(StatusType.Exhausted)).toBe(false);
      });
    });

    test('Rule 4.2.1.c: Morning phase should execute Draw step', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      
      const player1 = gameStateManager.getPlayer('player1');
      const initialHandSize = player1!.zones.handZone.getAll().length;
      
      await phaseManager.executeMorningPhase();
      
      // Each player should draw one card
      const finalHandSize = player1!.zones.handZone.getAll().length;
      expect(finalHandSize).toBe(initialHandSize + 1);
    });

    test('Rule 4.2.1.e: Morning phase should offer Expand option', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      
      const player1 = gameStateManager.getPlayer('player1');
      const initialManaCount = player1!.zones.manaZone.getAll().length;
      const initialHandSize = player1!.zones.handZone.getAll().length;
      
      // Simulate player choosing to expand (add card from hand to mana)
      const expandSpy = jest.spyOn(phaseManager as any, 'handleExpandStep');
      await phaseManager.executeMorningPhase();
      
      expect(expandSpy).toHaveBeenCalled();
      
      // If player expands, hand decreases by 1, mana increases by 1
      if (gameStateManager.state.playerExpandChoices?.player1 === true) {
        expect(player1!.zones.handZone.getAll().length).toBe(initialHandSize - 1);
        expect(player1!.zones.manaZone.getAll().length).toBe(initialManaCount + 1);
      }
    });

    test('Rule 4.2.1.e: Expand should be once-per-turn and only in Morning phase', () => {
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      
      // Player should be able to expand
      expect(phaseManager.canPlayerExpand('player1')).toBe(true);
      
      // After expanding, should not be able to expand again
      phaseManager.playerExpand('player1', 'some-card-id');
      expect(phaseManager.canPlayerExpand('player1')).toBe(false);
      
      // In other phases, expand should not be available
      gameStateManager.setCurrentPhase(GamePhase.Afternoon);
      expect(phaseManager.canPlayerExpand('player1')).toBe(false);
    });

    test('Rule 4.1.l: First Morning phase should be skipped', async () => {
      // Reset to game start
      gameStateManager.state.currentDay = 1;
      gameStateManager.state.firstMorningSkipped = false;
      gameStateManager.setCurrentPhase(GamePhase.Morning);
      
      await phaseManager.handleFirstMorning();
      
      // Should skip to Noon phase
      expect(gameStateManager.state.currentPhase).toBe(GamePhase.Noon);
      expect(gameStateManager.state.firstMorningSkipped).toBe(true);
    });
  });

  describe('Rule 4.2.2: Noon Phase', () => {
    test('Rule 4.2.2: Noon phase should only handle "At Noon" reactions', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Noon);
      
      const reactionSpy = jest.spyOn(eventBus, 'emit');
      await phaseManager.executeNoonPhase();
      
      expect(reactionSpy).toHaveBeenCalledWith('phaseChanged', { 
        phase: GamePhase.Noon, 
        trigger: 'atNoon' 
      });
    });

    test('Noon phase should have no daily effects', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Noon);
      
      // Should not execute morning-style effects
      const morningEffectsSpy = jest.spyOn(phaseManager as any, 'executeMorningEffects');
      await phaseManager.executeNoonPhase();
      
      expect(morningEffectsSpy).not.toHaveBeenCalled();
    });
  });

  describe('Rule 4.2.3: Afternoon Phase - Player Turns', () => {
    test('Rule 4.2.3.c: First player should take first turn', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Afternoon);
      
      const firstPlayer = gameStateManager.state.firstPlayerId;
      await phaseManager.executeAfternoonPhase();
      
      expect(gameStateManager.state.currentPlayerId).toBe(firstPlayer);
    });

    test('Rule 4.2.3.d: Players should alternate turns', () => {
      gameStateManager.setCurrentPhase(GamePhase.Afternoon);
      
      const player1 = 'player1';
      const player2 = 'player2';
      
      gameStateManager.state.currentPlayerId = player1;
      phaseManager.passTurn();
      expect(gameStateManager.state.currentPlayerId).toBe(player2);
      
      phaseManager.passTurn();
      expect(gameStateManager.state.currentPlayerId).toBe(player1);
    });

    test('Rule 4.2.3.e: Players can play multiple quick actions per turn', () => {
      gameStateManager.setCurrentPhase(GamePhase.Afternoon);
      
      const currentPlayer = gameStateManager.state.currentPlayerId;
      
      // Player should be able to play multiple quick actions
      expect(phaseManager.canPlayerPlayQuickAction(currentPlayer!)).toBe(true);
      
      phaseManager.playQuickAction(currentPlayer!, 'quick-action-1');
      expect(phaseManager.canPlayerPlayQuickAction(currentPlayer!)).toBe(true);
      
      phaseManager.playQuickAction(currentPlayer!, 'quick-action-2');
      expect(phaseManager.canPlayerPlayQuickAction(currentPlayer!)).toBe(true);
    });

    test('Rule 4.2.3.e: Afternoon should end when all players pass consecutively', () => {
      gameStateManager.setCurrentPhase(GamePhase.Afternoon);
      
      // Both players pass
      phaseManager.passTurn();
      phaseManager.passTurn();
      
      // Should trigger afternoon ended event
      const eventSpy = jest.spyOn(eventBus, 'emit');
      phaseManager.checkAfternoonEnd();
      
      expect(eventSpy).toHaveBeenCalledWith('afternoonEnded');
    });
  });

  describe('Rule 4.2.4: Dusk Phase - Progress Calculation', () => {
    test('Rule 4.2.4.a: Should calculate expedition statistics by terrain', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Dusk);
      
      const progressSpy = jest.spyOn(phaseManager as any, 'calculateExpeditionProgress');
      await phaseManager.executeDuskPhase();
      
      expect(progressSpy).toHaveBeenCalled();
    });

    test('Rule 4.2.4.b: Expeditions with greater positive stats should move forward', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Dusk);
      
      // Mock expedition with winning stats
      const player1 = gameStateManager.getPlayer('player1');
      player1!.expeditionState.heroStats = { forest: 5, mountain: 3, water: 2 };
      
      const player2 = gameStateManager.getPlayer('player2');
      player2!.expeditionState.heroStats = { forest: 2, mountain: 2, water: 1 };
      
      const initialPosition = player1!.expeditionState.heroPosition;
      await phaseManager.executeDuskPhase();
      
      expect(player1!.expeditionState.heroPosition).toBe(initialPosition + 1);
    });

    test('Rule 4.2.4.e: Ties should not allow movement', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Dusk);
      
      // Set up tied expeditions
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      player1!.expeditionState.heroStats = { forest: 3, mountain: 2, water: 1 };
      player2!.expeditionState.heroStats = { forest: 3, mountain: 2, water: 1 };
      
      const initialPos1 = player1!.expeditionState.heroPosition;
      const initialPos2 = player2!.expeditionState.heroPosition;
      
      await phaseManager.executeDuskPhase();
      
      expect(player1!.expeditionState.heroPosition).toBe(initialPos1);
      expect(player2!.expeditionState.heroPosition).toBe(initialPos2);
    });

    test('Rule 4.2.4.h: All successful expeditions should move simultaneously', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Dusk);
      
      const movementSpy = jest.spyOn(phaseManager as any, 'moveExpeditionsSimultaneously');
      await phaseManager.executeDuskPhase();
      
      expect(movementSpy).toHaveBeenCalled();
    });
  });

  describe('Rule 4.2.5: Night Phase - Rest → Clean-up → Victory Check', () => {
    test('Rule 4.2.5.b: Characters in moved expeditions should go to Reserve', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Night);
      
      // Mock moved expedition
      const player1 = gameStateManager.getPlayer('player1');
      player1!.expeditionState.heroMovedThisTurn = true;
      
      // Add character to expedition
      const character = gameStateManager.objectFactory.createCard('character-001', 'player1');
      player1!.zones.expeditionZone.add(character);
      
      await phaseManager.executeNightPhase();
      
      // Character should move to reserve
      expect(player1!.zones.expeditionZone.contains(character.id)).toBe(false);
      expect(player1!.zones.reserveZone.contains(character.id)).toBe(true);
    });

    test('Rule 4.2.5.c: Anchored and Asleep statuses should be removed during Rest', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Night);
      
      const player1 = gameStateManager.getPlayer('player1');
      const character = gameStateManager.objectFactory.createCard('character-001', 'player1');
      
      character.statuses.add(StatusType.Anchored);
      character.statuses.add(StatusType.Asleep);
      
      await phaseManager.executeNightPhase();
      
      expect(character.statuses.has(StatusType.Anchored)).toBe(false);
      expect(character.statuses.has(StatusType.Asleep)).toBe(false);
    });

    test('Rule 4.2.5.d: Should check victory conditions', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Night);
      
      const victorySpy = jest.spyOn(phaseManager as any, 'checkVictoryConditions');
      await phaseManager.executeNightPhase();
      
      expect(victorySpy).toHaveBeenCalled();
    });

    test('Victory check should detect winner with sum ≥7 and highest sum', async () => {
      gameStateManager.setCurrentPhase(GamePhase.Night);
      
      // Set up winning condition
      const player1 = gameStateManager.getPlayer('player1');
      player1!.expeditionState.heroPosition = 4;
      player1!.expeditionState.companionPosition = 3; // Total: 7
      
      const player2 = gameStateManager.getPlayer('player2');
      player2!.expeditionState.heroPosition = 2;
      player2!.expeditionState.companionPosition = 2; // Total: 4
      
      await phaseManager.executeNightPhase();
      
      expect(gameStateManager.state.gameEnded).toBe(true);
      expect(gameStateManager.state.winner).toBe('player1');
    });
  });

  describe('Reaction Checking - Rule 4.4', () => {
    test('Rule 4.4.a: Should check reactions after each phase start', async () => {
      const reactionSpy = jest.spyOn(phaseManager as any, 'checkReactions');
      
      await phaseManager.advancePhase();
      
      expect(reactionSpy).toHaveBeenCalled();
    });

    test('Rule 4.4.b: First player should choose reactions first', async () => {
      const firstPlayer = gameStateManager.state.firstPlayerId;
      
      const reactionOrderSpy = jest.spyOn(phaseManager as any, 'processReactionsInInitiativeOrder');
      await phaseManager.checkReactions();
      
      expect(reactionOrderSpy).toHaveBeenCalledWith(firstPlayer);
    });
  });
});