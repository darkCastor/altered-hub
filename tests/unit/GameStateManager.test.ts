import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { ObjectFactory } from '../../src/engine/ObjectFactory'; // Added ObjectFactory import
import { HandZone, GenericZone, DiscardPileZone, LimboZone, DeckZone } from '../../src/engine/Zone'; // Added Zone imports
import { GamePhase, ZoneIdentifier, CardType, StatusType, CounterType, KeywordAbility, AbilityType } from '../../src/engine/types/enums'; // Explicitly ensuring AbilityType and KeywordAbility
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
	// mockCardDefinitions will be part of playerDecks map now
	// let mockCardDefinitions: ICardDefinition[];

	beforeEach(() => {
		eventBus = new EventBus();

		// Simplified and explicit deck definitions for testing
		const heroP1: ICardDefinition = { id: 'hero-001', name: 'Test Hero P1', type: CardType.Hero, subTypes: [], handCost: { total: 0, forest: 0, mountain: 0, water: 0 }, reserveCost: {total:0, forest: 0, mountain: 0, water: 0}, faction: 'Neutral', statistics: { forest: 1, mountain: 1, water: 1 }, abilities: [], rarity: 'Common', version: '1.0' };
		const cardP1_1: ICardDefinition = { id: 'card-p1-001', name: 'Test Card P1-1', type: CardType.Spell, subTypes: [], handCost: { total: 1, forest: 0, mountain: 0, water: 0 }, reserveCost: {total:1, forest: 0, mountain: 0, water: 0}, faction: 'Neutral', statistics: {}, abilities: [], rarity: 'Common', version: '1.0' };
		const heroP2: ICardDefinition = { id: 'hero-002', name: 'Test Hero P2', type: CardType.Hero, subTypes: [], handCost: { total: 0, forest: 0, mountain: 0, water: 0 }, reserveCost: {total:0, forest: 0, mountain: 0, water: 0}, faction: 'Neutral', statistics: { forest: 1, mountain: 1, water: 1 }, abilities: [], rarity: 'Common', version: '1.0' };
		const cardP2_1: ICardDefinition = { id: 'card-p2-001', name: 'Test Card P2-1', type: CardType.Spell, subTypes: [], handCost: { total: 1, forest: 0, mountain: 0, water: 0 }, reserveCost: {total:1, forest: 0, mountain: 0, water: 0}, faction: 'Neutral', statistics: {}, abilities: [], rarity: 'Common', version: '1.0' };

		// Add character cards that some tests expect
		const charP1Hero: ICardDefinition = { id: 'char-p1-hero', name: 'P1 Hero Character', type: CardType.Character, subTypes: [], handCost: { total: 2, forest: 1, mountain: 0, water: 0 }, reserveCost: {total:2, forest: 1, mountain: 0, water: 0}, faction: 'Neutral', statistics: { forest: 1, mountain: 0, water: 0 }, abilities: [], rarity: 'Common', version: '1.0' };
		const charP1Comp: ICardDefinition = { id: 'char-p1-comp', name: 'P1 Comp Character', type: CardType.Character, subTypes: [], handCost: { total: 2, forest: 0, mountain: 1, water: 0 }, reserveCost: {total:2, forest: 0, mountain: 1, water: 0}, faction: 'Neutral', statistics: { forest: 0, mountain: 1, water: 0 }, abilities: [], rarity: 'Common', version: '1.0' };
		const charP2Hero: ICardDefinition = { id: 'char-p2-hero', name: 'P2 Hero Character', type: CardType.Character, subTypes: [], handCost: { total: 2, forest: 0, mountain: 0, water: 1 }, reserveCost: {total:2, forest: 0, mountain: 0, water: 1}, faction: 'Neutral', statistics: { forest: 0, mountain: 0, water: 1 }, abilities: [], rarity: 'Common', version: '1.0' };
		const charP1HeroBoost: ICardDefinition = { id: 'char-p1-hero-boost', name: 'P1 Hero Boost Character', type: CardType.Character, subTypes: [], handCost: { total: 3, forest: 1, mountain: 1, water: 0 }, reserveCost: {total:3, forest: 1, mountain: 1, water: 0}, faction: 'Neutral', statistics: { forest: 1, mountain: 1, water: 0 }, abilities: [], rarity: 'Common', version: '1.0' };

		const player1Deck: ICardDefinition[] = [heroP1, cardP1_1, charP1Hero, charP1Comp, charP1HeroBoost];
		const player2Deck: ICardDefinition[] = [heroP2, cardP2_1, charP2Hero];

		// Add enough filler cards to meet minimum deck size if initializeGame requires it (e.g., for drawing cards)
		// Assuming a small number for tests to pass initialization, e.g., 6 cards to draw + some for mana.
		// Actual game rules are 39 non-hero + 1 hero. For testing GameStateManager construction and basic init, 10 might be enough.
		for(let i = player1Deck.length; i < 10; i++) { // Ensure enough cards
			player1Deck.push({id: `p1-filler-${i}`, name: `P1 Filler ${i}`, type: CardType.Spell, subTypes: [], handCost: {total:1, forest:0,mountain:0,water:0}, reserveCost: {total:1, forest:0,mountain:0,water:0}, faction:'Neutral', abilities:[], rarity:'Common', version:'1.0', statistics: {}});
		}
		for(let i = player2Deck.length; i < 10; i++) { // Ensure enough cards
			player2Deck.push({id: `p2-filler-${i}`, name: `P2 Filler ${i}`, type: CardType.Spell, subTypes: [], handCost: {total:1, forest:0,mountain:0,water:0}, reserveCost: {total:1, forest:0,mountain:0,water:0}, faction:'Neutral', abilities:[], rarity:'Common', version:'1.0', statistics: {}});
		}

		const playerDeckDefinitions = new Map<string, ICardDefinition[]>();
		playerDeckDefinitions.set('player1', player1Deck);
		playerDeckDefinitions.set('player2', player2Deck);

		gameStateManager = new GameStateManager(playerDeckDefinitions, eventBus);
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

			// After drawing 6 cards and selecting 3 for mana orbs, should have 3 cards left in hand
			expect(p1Hand.getAll().length).toBe(3);
			expect(p2Hand.getAll().length).toBe(3);

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

		test('Rule 4.1.g: First player should be determined randomly', async () => {
			const playerCounts: Record<string, number> = { player1: 0, player2: 0 };
			const iterations = 50; // Run multiple times to check for randomness
			for (let i = 0; i < iterations; i++) {
				// Re-initialize GSM with fresh state for each iteration for a clean firstPlayerId selection
				const p1Deck: ICardDefinition[] = [{ id: 'hero-p1', name: 'P1 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'}];
				const p2Deck: ICardDefinition[] = [{ id: 'hero-p2', name: 'P2 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'}];
				const playerDecks = new Map<string, ICardDefinition[]>();
				playerDecks.set('player1', p1Deck);
				playerDecks.set('player2', p2Deck);

				const localGsm = new GameStateManager(playerDecks, eventBus);
				await localGsm.initializeGame();
				playerCounts[localGsm.state.firstPlayerId!]++;
			}
			// Check if both players got to be first player at least once
			// This is probabilistic, might fail rarely for low iterations, but good enough for unit test.
			expect(playerCounts.player1).toBeGreaterThan(0);
			expect(playerCounts.player2).toBeGreaterThan(0);
			expect(playerCounts.player1 + playerCounts.player2).toBe(iterations);
			console.log(`[Test] First player distribution over ${iterations} initializations: P1: ${playerCounts.player1}, P2: ${playerCounts.player2}`);
		});

		test('Rule 4.1.h & 4.1.i: Hero is in Hero Zone (not deck), deck contains other cards and is shuffled', async () => {
			// Setup with specific decks for player1
			const heroDef = { id: 'hero-unique', name: 'My Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1' };
			const card1Def = { id: 'card1', name: 'Card 1', type: CardType.Spell, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1' };
			const card2Def = { id: 'card2', name: 'Card 2', type: CardType.Spell, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1' };
			const p1RealDeck: ICardDefinition[] = [heroDef, card1Def, card2Def];
			
			// Add enough cards for 6 draw + 3 mana orbs
			for (let i = 3; i < 12; i++) {
				p1RealDeck.push({ id: `extra-${i}`, name: `Extra ${i}`, type: CardType.Spell, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1' });
			}

			const playerDecks = new Map<string, ICardDefinition[]>();
			playerDecks.set('player1', p1RealDeck);
			const p2Deck = [{ id: 'hero-p2', name: 'P2 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'}];
			// Add enough cards for P2 too
			for (let i = 1; i < 12; i++) {
				p2Deck.push({ id: `p2-extra-${i}`, name: `P2 Extra ${i}`, type: CardType.Spell, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1' });
			}
			playerDecks.set('player2', p2Deck);

			gameStateManager = new GameStateManager(playerDecks, eventBus); // Re-initialize with specific decks
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const heroZoneCards = player1.zones.heroZone.getAll();
			expect(heroZoneCards.length).toBe(1);
			expect(heroZoneCards[0].definitionId).toBe(heroDef.id);

			const deckCards = player1.zones.deckZone.getAll();
			expect(deckCards.length).toBe(5); // Should be 12 - 1 (hero) - 6 (drawn) = 5 (mana orbs come from hand)
			expect(deckCards.some(c => c.definitionId === heroDef.id)).toBe(false); // Hero should not be in deck
			// Don't check for specific cards since they may have been drawn or used for mana

			// Check for shuffle (probabilistic, check if order is not always the same if we could run it multiple times,
			// or at least that it's not just the input order)
			// For simplicity here, we assume shuffle() works if called. More rigorous test would be on DeckZone itself.
			// We can check that the order isn't strictly [card1Def, card2Def] or [card2Def, card1Def] if we ran it enough times,
			// but for a single run, this is hard to assert beyond what's above.
		});

		test('Rule 4.1: Expedition counters should be placed in corresponding regions', async () => {
			// This test was here before, re-running with potentially new setup from playerDeckDefinitions
			const p1Deck: ICardDefinition[] = [{ id: 'hero-p1', name: 'P1 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'}];
			const p2Deck: ICardDefinition[] = [{ id: 'hero-p2', name: 'P2 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'}];
			const playerDecks = new Map<string, ICardDefinition[]>();
			playerDecks.set('player1', p1Deck);
			playerDecks.set('player2', p2Deck);
			gameStateManager = new GameStateManager(playerDecks, eventBus);
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
			const emptyDecks = new Map<string, ICardDefinition[]>();
			emptyDecks.set('player1', []);
			const emptyGameState = new GameStateManager(emptyDecks, eventBus);

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

			test('should count Gigantic character for BOTH hero and companion expeditions of its controller', () => {
				const p1GiganticChar = gameStateManager.objectFactory.createCard('char-p1-hero', 'player1'); // F:1
				p1GiganticChar.currentCharacteristics.isGigantic = true;
				// No specific expeditionAssignment, or could be assigned to one, should still count for both.
				// Let's test without specific assignment first, then with.
				gameStateManager.state.sharedZones.expedition.add(p1GiganticChar);

				// Remove other p1 chars for clarity for this test
				gameStateManager.state.sharedZones.expedition.remove(p1CharHero.objectId);
				gameStateManager.state.sharedZones.expedition.remove(p1CharComp.objectId);
				gameStateManager.state.sharedZones.expedition.remove(p1CharHeroBoost.objectId);

				const heroStats = gameStateManager.calculateExpeditionStats('player1', 'hero');
				expect(heroStats.forest).toBe(1); // Gigantic char F:1

				const compStats = gameStateManager.calculateExpeditionStats('player1', 'companion');
				expect(compStats.forest).toBe(1); // Gigantic char F:1 should also count here

				// Assign to hero expedition and re-test
				p1GiganticChar.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
				const heroStatsAssigned = gameStateManager.calculateExpeditionStats('player1', 'hero');
				expect(heroStatsAssigned.forest).toBe(1);
				const compStatsAssignedStillCounts = gameStateManager.calculateExpeditionStats('player1', 'companion');
				expect(compStatsAssignedStillCounts.forest).toBe(1);
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

	describe('progressPhase', () => {
		let p1: ReturnType<GameStateManager['getPlayer']>;
		let p2: ReturnType<GameStateManager['getPlayer']>;
		let p1HeroChar: IGameObject;
		let p2HeroCharOpposing: IGameObject;
		let p1CompanionChar: IGameObject;
		let p2CompanionCharOpposing: IGameObject;
		let sharedExpeditionZone: ReturnType<GameStateManager['state']['sharedZones']['expedition']>;
		let adventureZone: ReturnType<GameStateManager['state']['sharedZones']['adventure']>;

		beforeEach(async () => {
			// GSM constructor now expects Map<string, ICardDefinition[]>
			const p1Deck: ICardDefinition[] = [
				{ id: 'hero-p1', name: 'P1 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'c1', name: 'P1 Char Hero', type: CardType.Character, statistics: { forest: 5, mountain: 0, water: 0 }, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'c2', name: 'P1 Char Comp', type: CardType.Character, statistics: { mountain: 5, forest: 0, water: 0 }, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
			];
			const p2Deck: ICardDefinition[] = [
				{ id: 'hero-p2', name: 'P2 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'c3', name: 'P2 Char Hero Opp', type: CardType.Character, statistics: { forest: 3, mountain: 0, water: 0 }, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'c4', name: 'P2 Char Comp Opp', type: CardType.Character, statistics: { mountain: 3, forest: 0, water: 0 }, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
			];
			const playerDecks = new Map<string, ICardDefinition[]>();
			playerDecks.set('player1', p1Deck);
			playerDecks.set('player2', p2Deck);

			gameStateManager = new GameStateManager(playerDecks, eventBus);
			await gameStateManager.initializeGame();

			p1 = gameStateManager.getPlayer('player1')!;
			p2 = gameStateManager.getPlayer('player2')!;
			sharedExpeditionZone = gameStateManager.state.sharedZones.expedition;
			adventureZone = gameStateManager.state.sharedZones.adventure;

			// Clear existing adventure regions and set up a simple one for testing
			adventureZone.clear();
			adventureZone.add({ id: 'region1', instanceId: 'region1', type: 'NeutralRegion', faceDown:false, terrains: ['forest'], ownerId:'shared'});
			adventureZone.add({ id: 'region2', instanceId: 'region2', type: 'NeutralRegion', faceDown:false, terrains: ['mountain'], ownerId:'shared'});
			// Add more regions if needed for multi-step movement tests

			// Setup characters in expeditions
			p1HeroChar = gameStateManager.objectFactory.createCard(p1Deck[1].id, 'player1');
			p1HeroChar.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			sharedExpeditionZone.add(p1HeroChar);

			p1CompanionChar = gameStateManager.objectFactory.createCard(p1Deck[2].id, 'player1');
			p1CompanionChar.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
			sharedExpeditionZone.add(p1CompanionChar);

			p2HeroCharOpposing = gameStateManager.objectFactory.createCard(p2Deck[1].id, 'player2');
			p2HeroCharOpposing.expeditionAssignment = { playerId: 'player2', type: 'Hero' };
			sharedExpeditionZone.add(p2HeroCharOpposing);

			p2CompanionCharOpposing = gameStateManager.objectFactory.createCard(p2Deck[2].id, 'player2');
			p2CompanionCharOpposing.expeditionAssignment = { playerId: 'player2', type: 'Companion' };
			sharedExpeditionZone.add(p2CompanionCharOpposing);

			// Ensure current characteristics are set up for stat calculation
			[p1HeroChar, p1CompanionChar, p2HeroCharOpposing, p2CompanionCharOpposing].forEach(obj => {
				gameStateManager.ruleAdjudicator.applyAllPassiveAbilities(); // Applies base characteristics to current
			});
		});

		test('expedition moves if its stat is > 0 and > opponents stat in a relevant terrain', async () => {
			// P1 Hero (Forest 5) vs P2 Hero (Forest 3) in Region1 (Forest)
			// P1 Companion (Mountain 5) vs P2 Companion (Mountain 3) in Region2 (Mountain) - from P2's perspective

			// To make P1 Companion face P2 Companion in Region2 (index 1), P1 Comp pos=0, P2 Comp pos=0 (target index for P2 Comp is totalRegions-1-pos = 2-1-0 = 1)
			p1.companionExpedition.position = 0;
			p2.companionExpedition.position = 0;


			await gameStateManager.progressPhase();

			expect(p1.heroExpedition.hasMoved).toBe(true);
			expect(p1.heroExpedition.position).toBe(1);
			expect(p1.companionExpedition.hasMoved).toBe(true);
			expect(p1.companionExpedition.position).toBe(1);
		});

		test('expedition does not move if its stat is not greater than opponents', async () => {
			// Modify P1 Hero Char to have Forest 3, same as P2 Hero Opposing
			p1HeroChar.currentCharacteristics.statistics!.forest = 3;

			await gameStateManager.progressPhase();
			expect(p1.heroExpedition.hasMoved).toBe(false);
			expect(p1.heroExpedition.position).toBe(0);
		});

		test('expedition does not move if its relevant stat is 0', async () => {
			p1HeroChar.currentCharacteristics.statistics!.forest = 0; // P1 Hero has 0 Forest
			p2HeroCharOpposing.currentCharacteristics.statistics!.forest = 0; // P2 Hero also 0 Forest

			await gameStateManager.progressPhase();
			expect(p1.heroExpedition.hasMoved).toBe(false);
		});

		test('expedition with a Defender character does not move', async () => {
			p1HeroChar.currentCharacteristics.hasDefender = true; // Add Defender
			// Re-apply passives for the change to be recognized by KeywordAbilityHandler if it caches them
			// Or mock checkDefenderRestrictions directly
			spyOn(gameStateManager.keywordHandler, 'checkDefenderRestrictions').mockReturnValueOnce({
				hero: false, // Hero expedition cannot move
				companion: true
			});

			await gameStateManager.progressPhase();
			expect(p1.heroExpedition.hasMoved).toBe(false);
			expect(p1.heroExpedition.position).toBe(0);
			// Companion should still move if it can
			expect(p1.companionExpedition.hasMoved).toBe(true);
		});
	});

	describe('cleanupPhase', () => {
		let p1: ReturnType<GameStateManager['getPlayer']>;
		let hero: IGameObject;

		beforeEach(async () => {
			const p1Deck: ICardDefinition[] = [
				{ id: 'hero-p1', name: 'P1 Hero', type: CardType.Hero, statistics: {}, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1', reserveLimit: 2, landmarkLimit: 1},
				{ id: 'r1', name: 'ReserveItem1', type: CardType.Spell, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'r2', name: 'ReserveItem2', type: CardType.Spell, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'r3', name: 'ReserveItem3', type: CardType.Spell, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'l1', name: 'LandmarkItem1', type: CardType.LandmarkPermanent, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
				{ id: 'l2', name: 'LandmarkItem2', type: CardType.LandmarkPermanent, abilities:[], handCost:{total:0}, reserveCost:{total:0}, faction:'Neutral', rarity:'Common', version:'1'},
			];
			const playerDecks = new Map<string, ICardDefinition[]>();
			playerDecks.set('player1', p1Deck);

			gameStateManager = new GameStateManager(playerDecks, eventBus);
			await gameStateManager.initializeGame(); // This places the Hero

			p1 = gameStateManager.getPlayer('player1')!;
			hero = p1.zones.heroZone.getAll().find(obj => isGameObject(obj) && obj.type === CardType.Hero) as IGameObject;

			// Populate reserve and landmark zones
			for (let i = 0; i < 3; i++) {
				const item = gameStateManager.objectFactory.createCard(p1Deck[i+1].id, 'player1'); // r1, r2, r3
				item.timestamp = Date.now() + i; // Ensure unique timestamps for predictable discard if simulation relies on it
				p1.zones.reserveZone.add(item);
			}
			for (let i = 0; i < 2; i++) {
				const item = gameStateManager.objectFactory.createCard(p1Deck[i+4].id, 'player1'); // l1, l2
				item.timestamp = Date.now() + i + 10;
				p1.zones.landmarkZone.add(item);
			}
		});

		test('should call playerActionHandler.playerChoosesObjectsToKeep and discard/sacrifice extras', async () => {
			// Hero limits: Reserve 2, Landmark 1
			// Player has 3 in reserve, 2 in landmark

			// Mock actionHandler.playerChoosesObjectsToKeep
			// Simulate player chooses to keep r1, r2 (so r3 is discarded)
			// Simulate player chooses to keep l1 (so l2 is sacrificed)
			const mockPlayerChooses = mock()
				.mockImplementationOnce(async (_playerId, objects, _limit, zoneType) => { // Reserve
					expect(zoneType).toBe('reserve');
					expect(objects.length).toBe(3);
					// Simulate keeping the two with smallest timestamps if that's the sim logic, or specific ones.
					// Let's say our mock PAH keeps the first two it's given (which might be sorted by GSM or not)
					// For this test, let's be explicit: discard r3 (objectId: def-r3 if created that way)
					const r3 = objects.find((o:IGameObject) => o.definitionId === 'r3');
					return r3 ? [r3.objectId] : []; // Returns IDs of objects to discard
				})
				.mockImplementationOnce(async (_playerId, objects, _limit, zoneType) => { // Landmark
					expect(zoneType).toBe('landmark');
					expect(objects.length).toBe(2);
					const l2 = objects.find((o:IGameObject) => o.definitionId === 'l2');
					return l2 ? [l2.objectId] : []; // Returns IDs of objects to sacrifice
				});
			gameStateManager.actionHandler.playerChoosesObjectsToKeep = mockPlayerChooses;

			await gameStateManager.cleanupPhase();

			expect(mockPlayerChooses).toHaveBeenCalledTimes(2);
			expect(p1.zones.reserveZone.getCount()).toBe(2);
			expect(p1.zones.landmarkZone.getCount()).toBe(1);
			expect(p1.zones.discardPileZone.getCount()).toBe(2);

			// Verify specific cards
			expect(p1.zones.reserveZone.getAll().some(o => o.definitionId === 'r3')).toBe(false);
			expect(p1.zones.discardPileZone.getAll().some(o => o.definitionId === 'r3')).toBe(true);
			expect(p1.zones.landmarkZone.getAll().some(o => o.definitionId === 'l2')).toBe(false);
			expect(p1.zones.discardPileZone.getAll().some(o => o.definitionId === 'l2')).toBe(true);
		});

		test('should use hero currentCharacteristics for limits if available', async () => {
			// Modify hero's currentCharacteristics to have different limits
			if(hero) {
				hero.currentCharacteristics.reserveLimit = 1;
				// No need to applyAllPassiveAbilities as cleanupPhase reads directly
			}

			const mockPlayerChooses = mock()
				.mockImplementationOnce(async (_playerId, objects, limit, _zoneType) => { // Reserve
					expect(limit).toBe(1);
					// Player has 3, limit 1, should discard 2. Let's say r2, r3.
					const r2 = objects.find((o:IGameObject) => o.definitionId === 'r2');
					const r3 = objects.find((o:IGameObject) => o.definitionId === 'r3');
					return [r2?.objectId, r3?.objectId].filter(id => id) as string[];
				})
				.mockImplementationOnce(async (_playerId, objects, limit, _zoneType) => { // Landmark (limit still 1 from base)
					expect(limit).toBe(1);
					const l2 = objects.find((o:IGameObject) => o.definitionId === 'l2');
					return l2 ? [l2.objectId] : [];
				});
			gameStateManager.actionHandler.playerChoosesObjectsToKeep = mockPlayerChooses;

			await gameStateManager.cleanupPhase();

			expect(p1.zones.reserveZone.getCount()).toBe(1);
			expect(p1.zones.discardPileZone.getCount()).toBe(3); // r2, r3, l2
		});
	});
});

describe('moveEntity - Counter Handling (Rule 2.5.j & related)', () => {
	let gsm: GameStateManager;
	let eventBusLocal: EventBus;
	let testPlayerId: string;
	let testCardDefs: ICardDefinition[];

	const charDefId = 'test-char-counters';
	const seasonedCharDefId = 'seasoned-char-counters';
	const landmarkDefId = 'test-landmark-counters';
	const seasonedLandmarkDefId = 'seasoned-landmark-counters';

	beforeEach(() => { // Removed async
		eventBusLocal = new EventBus();
		testPlayerId = 'player1';

		// Define card definitions specifically for this test suite
		testCardDefs = [
			// No hero needed for these specific tests if not running full initializeGame
			{
				id: charDefId, name: 'Test Character', type: CardType.Character, subTypes: [],
				handCost: 1, // Keep simple handCost/reserveCost as numbers for ICardDefinition
				reserveCost: 1, faction: 'Neutral', statistics: { forest: 1, mountain: 1, water: 1 },
				abilities: [], rarity: 'Common', version: '1.0'
			},
			{
				id: seasonedCharDefId, name: 'Seasoned Character', type: CardType.Character, subTypes: [],
				handCost: 1, reserveCost: 1, faction: 'Neutral', statistics: { forest: 1, mountain: 1, water: 1 },
				abilities: [{ abilityId: 'seasonedAb', type: AbilityType.Passive, keyword: KeywordAbility.Seasoned, effect: {steps: []} }], // Using KeywordAbility directly
				rarity: 'Common', version: '1.0'
			},
			{
				id: landmarkDefId, name: 'Test Landmark', type: CardType.LandmarkPermanent, subTypes: [],
				handCost: 1, reserveCost: 1, faction: 'Neutral', statistics: {},
				abilities: [], rarity: 'Common', version: '1.0'
			},
			{
				id: seasonedLandmarkDefId, name: 'Seasoned Landmark', type: CardType.LandmarkPermanent, subTypes: [],
				handCost: 1, reserveCost: 1, faction: 'Neutral', statistics: {},
				abilities: [{ abilityId: 'seasonedLandAb',type: AbilityType.Passive, keyword: KeywordAbility.Seasoned, effect: {steps: []} }], // Using KeywordAbility directly
				rarity: 'Common', version: '1.0'
			},
		];

		// Minimal playerDeckDefinitions for GameStateManager constructor, may not be strictly needed if not calling initializeGame
		const playerDeckDefinitions = new Map<string, ICardDefinition[]>();
		playerDeckDefinitions.set(testPlayerId, []); // Empty deck for player1
		playerDeckDefinitions.set('player2', []);    // Empty deck for player2

		gsm = new GameStateManager(playerDeckDefinitions, eventBusLocal);

		// Manually setup ObjectFactory with definitions needed for these tests
		const cardDefinitionsForFactory = new Map<string, ICardDefinition>(testCardDefs.map(def => [def.id, def]));
		gsm.objectFactory = new ObjectFactory(cardDefinitionsForFactory);
		// Ensure allCardDefinitions is also set on gsm if other parts of GSM use it directly
		(gsm as any).allCardDefinitions = cardDefinitionsForFactory;


		// Manually setup basic player state and zones, bypassing full initializeGame
		const player1Zones = {
			handZone: new HandZone(`${testPlayerId}-hand`, testPlayerId),
			reserveZone: new GenericZone(`${testPlayerId}-reserve`, ZoneIdentifier.Reserve, 'visible', testPlayerId),
			discardPileZone: new DiscardPileZone(`${testPlayerId}-discard`, testPlayerId),
			landmarkZone: new GenericZone(`${testPlayerId}-landmark`, ZoneIdentifier.Landmark, 'visible', testPlayerId),
			// other zones as needed by tests
		};
		gsm.state.players.set(testPlayerId, {
			id: testPlayerId,
			zones: player1Zones,
			// ... other minimal player properties
		} as any);

		// Setup shared zones if they are used directly by moveEntity or createAndPlaceObject
		gsm.state.sharedZones.expedition = new GenericZone('shared-expedition', ZoneIdentifier.Expedition, 'visible', 'shared');
		gsm.state.sharedZones.limbo = new LimboZone(); // LimboZone might have specific logic

		// Ensure ruleAdjudicator is present if applyAllPassiveAbilities is called
		// gsm.ruleAdjudicator = new RuleAdjudicator(gsm); // Already created in GSM constructor

	});

	// Adjusted createAndPlaceObject to use the manually set up gsm and its objectFactory
	const createAndPlaceObject = (defId: string, zoneIdentifier: ZoneIdentifier, initialCounters?: Map<CounterType, number>): IGameObject => {
		const player = gsm.getPlayer(testPlayerId)!;
		expect(player).toBeDefined(); // Ensure player setup worked

		// Use the gsm.objectFactory that was manually set up
		const object = gsm.objectFactory.createCard(defId, testPlayerId);
		expect(object).toBeDefined();
		if(!object) throw new Error(`Failed to create object for defId: ${defId}`);


		if (initialCounters) {
			object.counters = new Map(initialCounters);
		}

		// Apply passives to ensure currentCharacteristics (like keywords) are populated
		// This is crucial for Seasoned keyword to be recognized by moveEntity
		gsm.ruleAdjudicator.applyAllPassiveAbilities();

		let targetZone;
		if (zoneIdentifier === ZoneIdentifier.Expedition) {
			targetZone = gsm.state.sharedZones.expedition;
		} else if (zoneIdentifier === ZoneIdentifier.Limbo) {
			targetZone = gsm.state.sharedZones.limbo;
		} else if (zoneIdentifier === ZoneIdentifier.Landmark) {
			targetZone = player.zones.landmarkZone;
		} else if (zoneIdentifier === ZoneIdentifier.Reserve) {
			targetZone = player.zones.reserveZone;
		} else if (zoneIdentifier === ZoneIdentifier.Hand) {
			targetZone = player.zones.handZone;
		} else if (zoneIdentifier === ZoneIdentifier.DiscardPile) {
			targetZone = player.zones.discardPileZone;
		} else {
			throw new Error(`Test setup: Target zone ${zoneIdentifier} not handled in createAndPlaceObject`);
		}

		expect(targetZone).toBeDefined();
		targetZone.add(object);
		return object;
	};

	test('a. Expedition to Reserve (Non-Seasoned): Loses all counters', () => {
		const initialCounters = new Map<CounterType, number>([
			[CounterType.Boost, 2],
			[CounterType.Kelon, 3]
		]);
		const char = createAndPlaceObject(charDefId, ZoneIdentifier.Expedition, initialCounters);

		const fromZone = gsm.state.sharedZones.expedition;
		const toZone = gsm.getPlayer(testPlayerId)!.zones.reserveZone;

		const movedChar = gsm.moveEntity(char.objectId, fromZone, toZone, testPlayerId) as IGameObject;

		expect(movedChar).toBeDefined();
		expect(isGameObject(movedChar)).toBe(true);
		expect(movedChar.counters.size).toBe(0);
		expect(movedChar.counters.get(CounterType.Boost)).toBeUndefined();
		expect(movedChar.counters.get(CounterType.Kelon)).toBeUndefined();
	});

	test('b. Expedition to Reserve (Seasoned): Keeps Boost, loses Kelon', () => {
		const initialCounters = new Map<CounterType, number>([
			[CounterType.Boost, 2],
			[CounterType.Kelon, 3]
		]);
		const char = createAndPlaceObject(seasonedCharDefId, ZoneIdentifier.Expedition, initialCounters);
		// Manually ensure the Seasoned keyword is on currentCharacteristics for the test
		// This should ideally be handled by RuleAdjudicator + ObjectFactory from card def abilities
		if (char.currentCharacteristics.keywords) char.currentCharacteristics.keywords.add(KeywordAbility.Seasoned);
		else char.currentCharacteristics.keywords = new Set([KeywordAbility.Seasoned]);


		const fromZone = gsm.state.sharedZones.expedition;
		const toZone = gsm.getPlayer(testPlayerId)!.zones.reserveZone;

		const movedChar = gsm.moveEntity(char.objectId, fromZone, toZone, testPlayerId) as IGameObject;

		expect(movedChar).toBeDefined();
		expect(isGameObject(movedChar)).toBe(true);
		expect(movedChar.counters.get(CounterType.Boost)).toBe(2);
		expect(movedChar.counters.has(CounterType.Kelon)).toBe(false);
		expect(movedChar.counters.size).toBe(1);
	});

	test('c. Landmark to Reserve (Seasoned Permanent): Keeps Boost, loses Kelon', () => {
		const initialCounters = new Map<CounterType, number>([
			[CounterType.Boost, 2],
			[CounterType.Kelon, 3]
		]);
		const landmark = createAndPlaceObject(seasonedLandmarkDefId, ZoneIdentifier.Landmark, initialCounters);
		// Manually ensure the Seasoned keyword
		if (landmark.currentCharacteristics.keywords) landmark.currentCharacteristics.keywords.add(KeywordAbility.Seasoned);
		else landmark.currentCharacteristics.keywords = new Set([KeywordAbility.Seasoned]);

		const fromZone = gsm.getPlayer(testPlayerId)!.zones.landmarkZone;
		const toZone = gsm.getPlayer(testPlayerId)!.zones.reserveZone;

		const movedLandmark = gsm.moveEntity(landmark.objectId, fromZone, toZone, testPlayerId) as IGameObject;

		expect(movedLandmark).toBeDefined();
		expect(isGameObject(movedLandmark)).toBe(true);
		expect(movedLandmark.counters.get(CounterType.Boost)).toBe(2);
		expect(movedLandmark.counters.has(CounterType.Kelon)).toBe(false);
		expect(movedLandmark.counters.size).toBe(1);
	});

	test('d. Expedition to Hand: Loses all counters (becomes CardInstance)', () => {
		const initialCounters = new Map<CounterType, number>([[CounterType.Boost, 2]]);
		const char = createAndPlaceObject(charDefId, ZoneIdentifier.Expedition, initialCounters);

		const fromZone = gsm.state.sharedZones.expedition;
		const toZone = gsm.getPlayer(testPlayerId)!.zones.handZone;

		const movedEntity = gsm.moveEntity(char.objectId, fromZone, toZone, testPlayerId);

		expect(movedEntity).toBeDefined();
		// Entity in hand should be an ICardInstance, which doesn't have a 'counters' property
		expect(isGameObject(movedEntity)).toBe(false);
		expect((movedEntity as any).counters).toBeUndefined();
	});

	test('e. Expedition to Limbo: Loses all counters', () => {
		const initialCounters = new Map<CounterType, number>([[CounterType.Boost, 2]]);
		const char = createAndPlaceObject(charDefId, ZoneIdentifier.Expedition, initialCounters);

		const fromZone = gsm.state.sharedZones.expedition;
		const toZone = gsm.state.sharedZones.limbo;

		const movedChar = gsm.moveEntity(char.objectId, fromZone, toZone, testPlayerId) as IGameObject;

		expect(movedChar).toBeDefined();
		expect(isGameObject(movedChar)).toBe(true);
		expect(movedChar.counters.size).toBe(0);
		expect(movedChar.counters.get(CounterType.Boost)).toBeUndefined();
	});

	test('f. Expedition to Discard: Loses all counters', () => {
		const initialCounters = new Map<CounterType, number>([[CounterType.Boost, 2]]);
		const char = createAndPlaceObject(charDefId, ZoneIdentifier.Expedition, initialCounters);

		const fromZone = gsm.state.sharedZones.expedition;
		const toZone = gsm.getPlayer(testPlayerId)!.zones.discardPileZone;

		const movedChar = gsm.moveEntity(char.objectId, fromZone, toZone, testPlayerId) as IGameObject;

		expect(movedChar).toBeDefined();
		expect(isGameObject(movedChar)).toBe(true);
		expect(movedChar.counters.size).toBe(0);
		expect(movedChar.counters.get(CounterType.Boost)).toBeUndefined();
	});
});
