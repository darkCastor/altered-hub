import { describe, test, expect, beforeEach } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { GamePhase, ZoneIdentifier, CardType, StatusType, CounterType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';

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
			},
			// Expedition Test Characters
			{
				id: 'char-p1-hero', name: 'P1 Hero Char', type: CardType.Character, subTypes: [], faction: 'Neutral',
				statistics: { forest: 1, mountain: 0, water: 0 }, abilities: [], rarity: 'Common', version: '1.0',
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 }, reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
			},
			{
				id: 'char-p1-comp', name: 'P1 Comp Char', type: CardType.Character, subTypes: [], faction: 'Neutral',
				statistics: { forest: 0, mountain: 1, water: 0 }, abilities: [], rarity: 'Common', version: '1.0',
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 }, reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
			},
			{
				id: 'char-p2-hero', name: 'P2 Hero Char', type: CardType.Character, subTypes: [], faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 1 }, abilities: [], rarity: 'Common', version: '1.0',
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 }, reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
			},
			{
				id: 'char-p1-hero-boost', name: 'P1 Hero Boost Char', type: CardType.Character, subTypes: [], faction: 'Neutral',
				statistics: { forest: 1, mountain: 1, water: 0 }, abilities: [], rarity: 'Common', version: '1.0',
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 }, reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
			}
		];

		// Add enough cards for deck construction (need at least 6 for drawing)
		// Ensure we have enough unique IDs if we add more specific test cards above.
		for (let i = mockCardDefinitions.length; i <= 10; i++) { // Start i from current length
			mockCardDefinitions.push({
				id: `spell-card-${i}`, // Differentiate from other test cards
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
			// ExpeditionZone is now shared, so not checking per player here.
			const requiredPlayerZones = [
				'deckZone',
				'handZone',
				'discardPileZone',
				// 'expeditionZone', // Removed: now shared
				'manaZone',
				'reserveZone',
				'landmarkZone',
				'heroZone'
			];

			requiredPlayerZones.forEach((zoneName) => {
				expect(player1!.zones[zoneName as keyof typeof player1.zones]).toBeDefined();
				expect(player2!.zones[zoneName as keyof typeof player2.zones]).toBeDefined();
			});

			// Check for shared expedition zone
			expect(gameStateManager.state.sharedZones.expedition).toBeDefined();
			expect(gameStateManager.state.sharedZones.expedition.id).toBe('shared-expedition');
		});

		test('Rule 4.1.b: Adventure zone should be initialized with Hero and Companion regions', async () => {
			await gameStateManager.initializeGame();

			// Adventure zone should contain regions for Hero and Companion
			const adventureZone = gameStateManager.state.sharedZones.adventure;
			expect(adventureZone.getAll().length).toBeGreaterThanOrEqual(2); // Hero + Companion regions

			// Should contain 3 face-down Tumult cards between regions (Rule 4.1.c)
			const tumultCards = adventureZone
				.getAll()
				.filter((entity) => entity.type === 'TumultCard' && entity.faceDown === true);
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
			p1Deck.getAll().forEach((card) => {
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
			p1Hand.getAll().forEach((card) => {
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
			p1Mana.getAll().forEach((orb) => {
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
			const arenaRegions = adventureZone.getAll().filter((entity) => entity.type === 'ArenaRegion');
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

			// Should prevent invalid zone moves
			expect(() => {
				gameStateManager.moveCard(
					'invalid-card-id',
					ZoneIdentifier.Hand,
					ZoneIdentifier.Discard,
					'player1'
				);
			}).toThrow();
		});

		test('should handle missing card definitions', async () => {
			const emptyDefinitions: ICardDefinition[] = [];
			const emptyGameState = new GameStateManager(['player1'], emptyDefinitions, eventBus);

			await expect(emptyGameState.initializeGame()).rejects.toThrow(
				'No card definitions available'
			);
		});
	});

	describe('Shared Expedition Zone Logic', () => {
		describe('calculateExpeditionStats', () => {
			let p1CharHero: IGameObject;
			let p1CharComp: IGameObject;
			let p2CharHero: IGameObject;
			let p1CharHeroBoost: IGameObject;

			beforeEach(async () => {
				await gameStateManager.initializeGame(); // Initialize game to have players and zones ready

				p1CharHero = gameStateManager.objectFactory.createCard('char-p1-hero', 'player1');
				p1CharComp = gameStateManager.objectFactory.createCard('char-p1-comp', 'player1');
				p2CharHero = gameStateManager.objectFactory.createCard('char-p2-hero', 'player2');
				p1CharHeroBoost = gameStateManager.objectFactory.createCard('char-p1-hero-boost', 'player1');

				// Assign to expeditions
				p1CharHero.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
				p1CharComp.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
				p2CharHero.expeditionAssignment = { playerId: 'player2', type: 'Hero' };
				p1CharHeroBoost.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
				p1CharHeroBoost.counters.set(CounterType.Boost, 1);


				// Add to shared expedition zone
				const sharedExpeditionZone = gameStateManager.state.sharedZones.expedition;
				sharedExpeditionZone.add(p1CharHero);
				sharedExpeditionZone.add(p1CharComp);
				sharedExpeditionZone.add(p2CharHero);
				sharedExpeditionZone.add(p1CharHeroBoost);
			});

			test('should correctly calculate stats for Player 1 Hero expedition', () => {
				const stats = gameStateManager.calculateExpeditionStats('player1', 'hero');
				// p1CharHero (F:1) + p1CharHeroBoost (F:1 + Boost:1 = F:2, M:1 + Boost:1 = M:2)
				// Expected: Forest: 1 (p1CharHero) + 2 (p1CharHeroBoost) = 3
				//           Mountain: 0 (p1CharHero) + 2 (p1CharHeroBoost) = 2
				//           Water: 0
				expect(stats.forest).toBe(1 + 2); // p1CharHero.F + p1CharHeroBoost.F + p1CharHeroBoost.Boost
				expect(stats.mountain).toBe(0 + 2); // p1CharHero.M + p1CharHeroBoost.M + p1CharHeroBoost.Boost
				expect(stats.water).toBe(0);
			});

			test('should correctly calculate stats for Player 1 Companion expedition', () => {
				const stats = gameStateManager.calculateExpeditionStats('player1', 'companion');
				// p1CharComp (M:1)
				expect(stats.forest).toBe(0);
				expect(stats.mountain).toBe(1);
				expect(stats.water).toBe(0);
			});

			test('should correctly calculate stats for Player 2 Hero expedition', () => {
				const stats = gameStateManager.calculateExpeditionStats('player2', 'hero');
				// p2CharHero (W:1)
				expect(stats.forest).toBe(0);
				expect(stats.mountain).toBe(0);
				expect(stats.water).toBe(1);
			});

			test('should return zero stats for an empty expedition (e.g., Player 2 Companion)', () => {
				const stats = gameStateManager.calculateExpeditionStats('player2', 'companion');
				expect(stats.forest).toBe(0);
				expect(stats.mountain).toBe(0);
				expect(stats.water).toBe(0);
			});

			test('should not count characters with Asleep status', () => {
				p1CharHero.statuses.add(StatusType.Asleep);
				const stats = gameStateManager.calculateExpeditionStats('player1', 'hero');
				// p1CharHero is Asleep (F:1), p1CharHeroBoost (F:1 + Boost:1 = F:2, M:1 + Boost:1 = M:2)
				// Expected: Forest: 0 (p1CharHero is asleep) + 2 (p1CharHeroBoost) = 2
				//           Mountain: 0 (p1CharHero is asleep) + 2 (p1CharHeroBoost) = 2
				expect(stats.forest).toBe(2);
				expect(stats.mountain).toBe(2);
				expect(stats.water).toBe(0);
			});
		});

		describe('restPhase', () => {
			let p1: ReturnType<GameStateManager['getPlayer']>;
			let p2: ReturnType<GameStateManager['getPlayer']>;
			let p1CharHero: IGameObject;
			let p1CharComp: IGameObject;
			let p2CharHero: IGameObject;
			let sharedExpeditionZone: ReturnType<GameStateManager['state']['sharedZones']['expedition']>;

			beforeEach(async () => {
				await gameStateManager.initializeGame();
				p1 = gameStateManager.getPlayer('player1')!;
				p2 = gameStateManager.getPlayer('player2')!;
				sharedExpeditionZone = gameStateManager.state.sharedZones.expedition;

				// Clear expedition zone and player zones for clean test states
				sharedExpeditionZone.clear();
				p1.zones.reserveZone.clear();
				p1.zones.discardPileZone.clear();
				p2.zones.reserveZone.clear();

				p1CharHero = gameStateManager.objectFactory.createCard('char-p1-hero', 'player1'); // Stats F:1
				p1CharComp = gameStateManager.objectFactory.createCard('char-p1-comp', 'player1'); // Stats M:1
				p2CharHero = gameStateManager.objectFactory.createCard('char-p2-hero', 'player2'); // Stats W:1

				p1CharHero.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
				p1CharComp.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
				p2CharHero.expeditionAssignment = { playerId: 'player2', type: 'Hero' };

				sharedExpeditionZone.add(p1CharHero);
				sharedExpeditionZone.add(p1CharComp);
				sharedExpeditionZone.add(p2CharHero);

				// Reset movement flags
				p1.heroExpedition.hasMoved = false;
				p1.companionExpedition.hasMoved = false;
				p2.heroExpedition.hasMoved = false;
				p2.companionExpedition.hasMoved = false;
			});

			test('P1 Hero moved, P1 Comp not: p1CharHero to Reserve, p1CharComp stays', async () => {
				p1.heroExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(p1.zones.reserveZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeUndefined();
				expect(sharedExpeditionZone.findById(p1CharComp.objectId)).toBeDefined();
				expect(sharedExpeditionZone.findById(p2CharHero.objectId)).toBeDefined();
			});

			test('P1 Comp moved, P1 Hero not: p1CharComp to Reserve, p1CharHero stays', async () => {
				p1.companionExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(p1.zones.reserveZone.findById(p1CharComp.objectId)).toBeDefined();
				expect(sharedExpeditionZone.findById(p1CharComp.objectId)).toBeUndefined();
				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeDefined();
			});

			test('Neither P1 expedition moved: Both P1 characters stay', async () => {
				await gameStateManager.restPhase();
				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(sharedExpeditionZone.findById(p1CharComp.objectId)).toBeDefined();
			});

			test('P2 Hero moved: p2CharHero to P2 Reserve', async () => {
				p2.heroExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(p2.zones.reserveZone.findById(p2CharHero.objectId)).toBeDefined();
				expect(sharedExpeditionZone.findById(p2CharHero.objectId)).toBeUndefined();
				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeDefined(); // P1 chars unaffected
			});

			test('Gigantic entity (assigned to Hero) moves if Companion expedition moved', async () => {
				p1CharHero.currentCharacteristics.isGigantic = true; // Make it gigantic
				p1.companionExpedition.hasMoved = true; // Hero did not move, but companion did

				await gameStateManager.restPhase();

				expect(p1.zones.reserveZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeUndefined();
			});

			test('Fleeting entity moves to Discard instead of Reserve', async () => {
				p1CharHero.statuses.add(StatusType.Fleeting);
				p1.heroExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(p1.zones.discardPileZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(p1.zones.reserveZone.findById(p1CharHero.objectId)).toBeUndefined();
				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeUndefined();
			});

			test('Eternal entity stays in expedition even if its expedition moved', async () => {
				// Mock isEternal to return true for p1CharHero
				const originalIsEternal = gameStateManager.keywordHandler.isEternal;
				gameStateManager.keywordHandler.isEternal = (obj) => obj.objectId === p1CharHero.objectId || originalIsEternal(obj);

				p1.heroExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(p1.zones.reserveZone.findById(p1CharHero.objectId)).toBeUndefined();

				gameStateManager.keywordHandler.isEternal = originalIsEternal; // Restore original
			});

			test('Anchored entity stays in expedition even if its expedition moved', async () => {
				p1CharHero.statuses.add(StatusType.Anchored);
				p1.heroExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(p1.zones.reserveZone.findById(p1CharHero.objectId)).toBeUndefined();
			});

			test('Asleep entity stays in expedition even if its expedition moved', async () => {
				p1CharHero.statuses.add(StatusType.Asleep);
				p1.heroExpedition.hasMoved = true;
				await gameStateManager.restPhase();

				expect(sharedExpeditionZone.findById(p1CharHero.objectId)).toBeDefined();
				expect(p1.zones.reserveZone.findById(p1CharHero.objectId)).toBeUndefined();
			});
		});
	});
});
