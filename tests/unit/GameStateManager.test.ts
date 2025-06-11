import { describe, test, expect, beforeEach } from '@jest/globals';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { GamePhase, ZoneIdentifier, CardType, StatusType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for GameStateManager - Rules 4.1 (Game Setup) and core game state management
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('GameStateManager - Rule Compliance Tests', () => {
  let gameStateManager: GameStateManager;
  let eventBus: EventBus;
  let mockCardDefinitions: ICardDefinition[];

  beforeEach(() => {
    eventBus = new EventBus();
    mockCardDefinitions = [
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
        id: 'companion-001',
        name: 'Test Companion',
        type: CardType.Character,
        subTypes: ['Companion'],
        handCost: { total: 2, forest: 1, mountain: 0, water: 1 },
        reserveCost: { total: 1, forest: 0, mountain: 0, water: 1 },
        faction: 'Neutral',
        statistics: { forest: 1, mountain: 2, water: 0 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      }
    ];

    // Add enough cards for deck construction (need at least 6 for drawing)
    for (let i = 2; i <= 10; i++) {
      mockCardDefinitions.push({
        id: `card-${i}`,
        name: `Test Card ${i}`,
        type: CardType.Spell,
        subTypes: [],
        handCost: { total: 1, forest: 0, mountain: 0, water: 0 },
        reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
        faction: 'Neutral',
        statistics: { forest: 0, mountain: 0, water: 0 },
        abilities: [],
        rarity: 'Common',
        version: '1.0'
      });
    }
    
    gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
  });

  describe('Rule 4.1: Game Setup Phase', () => {
    test('Rule 4.1.a: Each player should have all required zones created', () => {
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      expect(player1).toBeDefined();
      expect(player2).toBeDefined();
      
      // Rule 4.1.a: Players must have all required zones
      const requiredZones = [
        'deckZone', 'handZone', 'discardPileZone', 'expeditionZone',
        'manaZone', 'reserveZone', 'landmarkZone', 'heroZone'
      ];
      
      requiredZones.forEach(zoneName => {
        expect(player1!.zones[zoneName as keyof typeof player1.zones]).toBeDefined();
        expect(player2!.zones[zoneName as keyof typeof player2.zones]).toBeDefined();
      });
    });

    test('Rule 4.1.b: Adventure zone should be initialized with Hero and Companion regions', async () => {
      await gameStateManager.initializeGame();
      
      // Adventure zone should contain regions for Hero and Companion
      const adventureZone = gameStateManager.state.sharedZones.adventure;
      expect(adventureZone.getAll().length).toBeGreaterThanOrEqual(2); // Hero + Companion regions
      
      // Should contain 3 face-down Tumult cards between regions (Rule 4.1.c)
      const tumultCards = adventureZone.getAll().filter(entity => 
        entity.type === 'TumultCard' && entity.faceDown === true
      );
      expect(tumultCards).toHaveLength(3);
    });

    test('Rule 4.1.h: Heroes should be revealed and placed in Hero zones', async () => {
      // Test assumes game setup has been called
      await gameStateManager.initializeGame();
      
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      const p1HeroZone = player1!.zones.heroZone;
      const p2HeroZone = player2!.zones.heroZone;
      
      expect(p1HeroZone.getAll().length).toBe(1);
      expect(p2HeroZone.getAll().length).toBe(1);
      
      const p1Hero = p1HeroZone.getAll()[0];
      const p2Hero = p2HeroZone.getAll()[0];
      
      expect(p1Hero.type).toBe(CardType.Hero);
      expect(p2Hero.type).toBe(CardType.Hero);
      expect(p1Hero.faceDown).toBe(false); // Heroes are revealed
      expect(p2Hero.faceDown).toBe(false);
    });

    test('Rule 4.1.i: Each player deck should be shuffled and placed in Deck zone', async () => {
      await gameStateManager.initializeGame();
      
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      const p1Deck = player1!.zones.deckZone;
      const p2Deck = player2!.zones.deckZone;
      
      expect(p1Deck.getAll().length).toBeGreaterThan(0);
      expect(p2Deck.getAll().length).toBeGreaterThan(0);
      
      // Cards in deck are instances (hidden zone), not game objects
      p1Deck.getAll().forEach(card => {
        expect(card.ownerId).toBeDefined(); // Verify they are valid card instances
      });
    });

    test('Rule 4.1.j: Each player should draw 6 cards', async () => {
      await gameStateManager.initializeGame();
      
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      const p1Hand = player1!.zones.handZone;
      const p2Hand = player2!.zones.handZone;
      
      expect(p1Hand.getAll().length).toBe(6);
      expect(p2Hand.getAll().length).toBe(6);
      
      // Cards in hand should be face-up for the owner
      p1Hand.getAll().forEach(card => {
        expect(card.faceDown).toBe(false);
      });
    });

    test('Rule 4.1.k: Each player should start with 3 Mana Orbs face-down and ready', async () => {
      await gameStateManager.initializeGame();
      
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      const p1Mana = player1!.zones.manaZone;
      const p2Mana = player2!.zones.manaZone;
      
      expect(p1Mana.getAll().length).toBe(3);
      expect(p2Mana.getAll().length).toBe(3);
      
      // All mana orbs should be face-down and ready (not exhausted)
      p1Mana.getAll().forEach(orb => {
        expect(orb.faceDown).toBe(true);
        expect(orb.statuses.has(StatusType.Exhausted)).toBe(false);
        expect(orb.type).toBe(CardType.ManaOrb); // Should be converted to Mana Orb type
      });
    });

    test('Rule 4.1.l: Game should start on Day 1, first Morning phase should be skipped', async () => {
      await gameStateManager.initializeGame();
      
      expect(gameStateManager.state.currentDay).toBe(1);
      expect(gameStateManager.state.currentPhase).toBe(GamePhase.Noon); // First Morning skipped
      expect(gameStateManager.state.firstMorningSkipped).toBe(true);
    });

    test('Rule 4.1: Expedition counters should be placed in corresponding regions', async () => {
      await gameStateManager.initializeGame();
      
      const player1 = gameStateManager.getPlayer('player1');
      const player2 = gameStateManager.getPlayer('player2');
      
      // Each player should have expedition counters in Hero and Companion regions
      expect(player1!.expeditionState.heroPosition).toBe(0); // Starting position
      expect(player1!.expeditionState.companionPosition).toBe(0);
      expect(player2!.expeditionState.heroPosition).toBe(0);
      expect(player2!.expeditionState.companionPosition).toBe(0);
      
      // Expeditions should be active and tracking their regions
      expect(player1!.expeditionState.heroActive).toBe(true);
      expect(player1!.expeditionState.companionActive).toBe(true);
    });
  });

  describe('Core Game State Management', () => {
    test('should maintain proper turn order and initiative', async () => {
      await gameStateManager.initializeGame();
      
      // First player should be determined (Rule 1.4.5: Initiative Order)
      expect(gameStateManager.state.firstPlayerId).toBeDefined();
      expect(['player1', 'player2']).toContain(gameStateManager.state.firstPlayerId);
      
      // Current player should start as first player
      expect(gameStateManager.state.currentPlayerId).toBe(gameStateManager.state.firstPlayerId);
    });

    test('should handle phase transitions correctly', async () => {
      await gameStateManager.initializeGame();
      
      const initialPhase = gameStateManager.state.currentPhase;
      expect(initialPhase).toBe(GamePhase.Noon);
      
      // Should be able to advance to next phase
      gameStateManager.setCurrentPhase(GamePhase.Afternoon);
      expect(gameStateManager.state.currentPhase).toBe(GamePhase.Afternoon);
    });

    test('should track victory conditions', async () => {
      await gameStateManager.initializeGame();
      
      // Game should not be over initially
      expect(gameStateManager.state.gameEnded).toBe(false);
      expect(gameStateManager.state.winner).toBeUndefined();
      
      // Should be able to set winner
      gameStateManager.setGameWinner('player1');
      expect(gameStateManager.state.gameEnded).toBe(true);
      expect(gameStateManager.state.winner).toBe('player1');
    });

    test('should handle tiebreaker state correctly', async () => {
      await gameStateManager.initializeGame();
      
      // Should not be in tiebreaker initially
      expect(gameStateManager.state.tiebreakerMode).toBe(false);
      
      // Should be able to enter tiebreaker mode
      gameStateManager.enterTiebreakerMode();
      expect(gameStateManager.state.tiebreakerMode).toBe(true);
      
      // Adventure zone should be replaced with Arena
      const adventureZone = gameStateManager.state.sharedZones.adventure;
      
      // Arena should have all three terrain types (Rule 4.3.e)
      const arenaRegions = adventureZone.getAll().filter(entity => entity.type === 'ArenaRegion');
      expect(arenaRegions).toHaveLength(3); // V, M, O terrains
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid player IDs gracefully', () => {
      const invalidPlayer = gameStateManager.getPlayer('nonexistent');
      expect(invalidPlayer).toBeUndefined();
    });

    test('should validate zone operations', async () => {
      await gameStateManager.initializeGame();
      const player = gameStateManager.getPlayer('player1');
      
      // Should prevent invalid zone moves
      expect(() => {
        gameStateManager.moveCard('invalid-card-id', ZoneIdentifier.Hand, ZoneIdentifier.Discard, 'player1');
      }).toThrow();
    });

    test('should handle missing card definitions', async () => {
      const emptyDefinitions: ICardDefinition[] = [];
      const emptyGameState = new GameStateManager(['player1'], emptyDefinitions, eventBus);
      
      await expect(async () => {
        await emptyGameState.initializeGame();
      }).rejects.toThrow('No card definitions available');
    });
  });
});