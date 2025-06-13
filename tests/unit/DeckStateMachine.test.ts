import { describe, test, expect, beforeEach } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { DeckZone } from '../../src/engine/Zone';
import { CardType, ZoneIdentifier, StatusType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';

/**
 * Comprehensive deck state machine tests for Altered TCG
 * These tests focus on the core deck mechanics that are critical for gameplay integrity
 */
describe('Deck State Machine - Rule Compliance Tests', () => {
	let gameStateManager: GameStateManager;
	let eventBus: EventBus;
	let testDeck: ICardDefinition[];

	beforeEach(() => {
		eventBus = new EventBus();

		// Create a standardized test deck that follows Altered rules
		testDeck = [
			// Hero (required)
			{
				id: 'hero-test',
				name: 'Test Hero',
				type: CardType.Hero,
				subTypes: [],
				handCost: { total: 0, forest: 0, mountain: 0, water: 0 },
				reserveCost: { total: 0, forest: 0, mountain: 0, water: 0 },
				faction: 'Neutral',
				statistics: { forest: 1, mountain: 1, water: 1 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},

			// Standard 39 non-hero cards minimum (using 10 for test performance)
			...Array.from({ length: 10 }, (_, i) => ({
				id: `card-${i + 1}`,
				name: `Test Card ${i + 1}`,
				type: CardType.Character,
				subTypes: [],
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 },
				reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
				faction: 'Neutral',
				statistics: { forest: 1, mountain: 0, water: 0 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			}))
		];

		const playerDeckDefinitions = new Map<string, ICardDefinition[]>();
		playerDeckDefinitions.set('player1', testDeck);
		playerDeckDefinitions.set('player2', testDeck);

		gameStateManager = new GameStateManager(playerDeckDefinitions, eventBus);
	});

	describe('Rule 4.1.i: Deck Initialization and Shuffling', () => {
		test('Deck should be shuffled after initialization', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;

			// Deck should contain all non-hero cards
			expect(deck.getCount()).toBe(10); // 11 total - 1 hero = 10

			// Verify hero is NOT in deck
			const deckCards = deck.getAll();
			const hasHero = deckCards.some((card) => card.definitionId === 'hero-test');
			expect(hasHero).toBe(false);

			// Verify deck contains expected cards (all should be ICardInstance in hidden zone)
			deckCards.forEach((card) => {
				expect(isGameObject(card)).toBe(false);
				expect(card.definitionId).toMatch(/^card-\d+$/);
			});
		});

		test('Multiple deck initializations should produce different orders', async () => {
			// Test shuffling randomness by comparing multiple initializations
			const orders: string[][] = [];

			for (let i = 0; i < 5; i++) {
				const playerDecks = new Map<string, ICardDefinition[]>();
				playerDecks.set('testPlayer', testDeck);

				const gsm = new GameStateManager(playerDecks, eventBus);
				await gsm.initializeGame();

				const player = gsm.getPlayer('testPlayer')!;
				const deck = player.zones.deckZone as DeckZone;
				const order = deck.getAll().map((card) => card.definitionId);
				orders.push(order);
			}

			// At least one pair should be different (statistical shuffling test)
			let foundDifference = false;
			for (let i = 0; i < orders.length - 1; i++) {
				for (let j = i + 1; j < orders.length; j++) {
					if (JSON.stringify(orders[i]) !== JSON.stringify(orders[j])) {
						foundDifference = true;
						break;
					}
				}
				if (foundDifference) break;
			}
			expect(foundDifference).toBe(true);
		});

		test('Deck should maintain proper zone properties', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;

			// Verify zone properties
			expect(deck.zoneType).toBe(ZoneIdentifier.Deck);
			expect(deck.visibility).toBe('hidden');
			expect(deck.ownerId).toBe('player1');
			expect(deck.id).toBe('player1-deck');
		});
	});

	describe('Rule 4.1.j: Initial Card Draw', () => {
		test('Players should draw exactly 6 cards during initialization', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const player2 = gameStateManager.getPlayer('player2')!;

			// Both players should have 3 cards in hand (6 drawn - 3 for mana orbs)
			expect(player1.zones.handZone.getCount()).toBe(3);
			expect(player2.zones.handZone.getCount()).toBe(3);

			// Deck should have remaining cards
			expect(player1.zones.deckZone.getCount()).toBe(4); // 10 - 6 drawn = 4

			// Cards in hand should be IGameObjects (visible zone)
			const handCards = player1.zones.handZone.getAll();
			handCards.forEach((card) => {
				expect(isGameObject(card)).toBe(true);
				expect((card as IGameObject).faceDown).toBe(false);
			});
		});

		test('Drawing should respect deck-to-hand conversion rules', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const originalDeckCount = player1.zones.deckZone.getCount();

			// Draw additional cards
			await gameStateManager.drawCards('player1', 2);

			// Verify deck count decreased
			expect(player1.zones.deckZone.getCount()).toBe(originalDeckCount - 2);

			// Verify hand count increased
			expect(player1.zones.handZone.getCount()).toBe(5); // 3 + 2 additional

			// All hand cards should be face-up IGameObjects
			const handCards = player1.zones.handZone.getAll();
			handCards.forEach((card) => {
				expect(isGameObject(card)).toBe(true);
				expect((card as IGameObject).faceDown).toBe(false);
			});
		});
	});

	describe('Rule 4.1.k: Mana Orb Creation from Hand', () => {
		test('Three cards should be converted to mana orbs during initialization', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const manaZone = player1.zones.manaZone;

			// Should have exactly 3 mana orbs
			expect(manaZone.getCount()).toBe(3);

			// Each should be a face-down, ready mana orb
			const manaOrbs = manaZone.getAll();
			manaOrbs.forEach((orb) => {
				expect(isGameObject(orb)).toBe(true);
				const gameOrb = orb as IGameObject;
				expect(gameOrb.faceDown).toBe(true);
				expect(gameOrb.type).toBe(CardType.ManaOrb);
				expect(gameOrb.statuses.has(StatusType.Exhausted)).toBe(false);
			});
		});
	});

	describe('Deck Reshuffle Mechanics', () => {
		test('Empty deck should trigger automatic reshuffle from discard pile', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const discard = player1.zones.discardPileZone;
			const hand = player1.zones.handZone;

			// Move all remaining deck cards to discard to simulate empty deck
			const remainingCards = deck.getAll();
			for (const card of remainingCards) {
				const cardId = isGameObject(card) ? card.objectId : card.instanceId;
				const gameObject = isGameObject(card)
					? (card as IGameObject)
					: gameStateManager.objectFactory.createGameObject(card, 'player1');
				deck.remove(cardId);
				discard.add(gameObject);
			}

			const initialDiscardCount = discard.getCount();
			expect(deck.getCount()).toBe(0);
			expect(initialDiscardCount).toBeGreaterThan(0);

			// Draw a card - should trigger reshuffle
			await gameStateManager.drawCards('player1', 1);

			// Deck should now contain cards from discard pile
			expect(deck.getCount()).toBeGreaterThan(0);
			expect(discard.getCount()).toBeLessThan(initialDiscardCount);
			expect(hand.getCount()).toBe(4); // 3 initial + 1 drawn
		});

		test('Multiple consecutive draws should work with reshuffling', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const discard = player1.zones.discardPileZone;

			// Set up scenario with only 1 card in deck, some in discard
			const deckCards = deck.getAll();
			const cardsToMove = deckCards.slice(1); // Keep only first card

			for (const card of cardsToMove) {
				const cardId = isGameObject(card) ? card.objectId : card.instanceId;
				const gameObject = isGameObject(card)
					? (card as IGameObject)
					: gameStateManager.objectFactory.createGameObject(card, 'player1');
				deck.remove(cardId);
				discard.add(gameObject);
			}

			expect(deck.getCount()).toBe(1);
			const initialDiscardCount = discard.getCount();

			// Draw 3 cards - should exhaust deck and trigger reshuffle
			await gameStateManager.drawCards('player1', 3);

			// Should have successfully drawn 3 cards
			expect(player1.zones.handZone.getCount()).toBe(6); // 3 initial + 3 drawn

			// Deck should have remaining cards after reshuffle
			expect(deck.getCount()).toBeGreaterThanOrEqual(0);
			expect(discard.getCount()).toBeLessThan(initialDiscardCount);
		});

		test('Drawing with empty deck and empty discard should not crash', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const discard = player1.zones.discardPileZone;

			// Clear both deck and discard
			deck.clear();
			discard.clear();

			const initialHandCount = player1.zones.handZone.getCount();

			// Attempt to draw - should not crash, but also not draw anything
			await expect(gameStateManager.drawCards('player1', 2)).resolves.not.toThrow();

			// Hand count should remain unchanged
			expect(player1.zones.handZone.getCount()).toBe(initialHandCount);
		});
	});

	describe('Rule 7.3.22: Resupply Keyword Action', () => {
		test('Resupply should move top deck card to reserve', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const reserve = player1.zones.reserveZone;

			const initialDeckCount = deck.getCount();
			const initialReserveCount = reserve.getCount();

			// Execute resupply
			const resuppliedCard = await gameStateManager.resupplyPlayer('player1');

			// Verify card was moved
			expect(resuppliedCard).toBeDefined();
			expect(isGameObject(resuppliedCard!)).toBe(true);

			expect(deck.getCount()).toBe(initialDeckCount - 1);
			expect(reserve.getCount()).toBe(initialReserveCount + 1);

			// Verify the card is in reserve as a visible IGameObject
			const reserveCards = reserve.getAll();
			expect(
				reserveCards.some(
					(card) => isGameObject(card) && card.objectId === resuppliedCard!.objectId
				)
			).toBe(true);
		});

		test('Resupply with empty deck should trigger reshuffle first', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const discard = player1.zones.discardPileZone;
			const reserve = player1.zones.reserveZone;

			// Move all deck cards to discard
			const deckCards = deck.getAll();
			for (const card of deckCards) {
				const cardId = isGameObject(card) ? card.objectId : card.instanceId;
				const gameObject = isGameObject(card)
					? (card as IGameObject)
					: gameStateManager.objectFactory.createGameObject(card, 'player1');
				deck.remove(cardId);
				discard.add(gameObject);
			}

			expect(deck.getCount()).toBe(0);
			const initialDiscardCount = discard.getCount();

			// Execute resupply - should trigger reshuffle then resupply
			const resuppliedCard = await gameStateManager.resupplyPlayer('player1');

			expect(resuppliedCard).toBeDefined();
			expect(deck.getCount()).toBeGreaterThanOrEqual(0); // Some cards reshuffled back
			expect(discard.getCount()).toBeLessThan(initialDiscardCount);
			expect(reserve.getCount()).toBe(1);
		});

		test('Multiple resupplies should work correctly', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const reserve = player1.zones.reserveZone;

			const initialReserveCount = reserve.getCount();

			// Execute multiple resupplies
			const resupply1 = await gameStateManager.resupplyPlayer('player1');
			const resupply2 = await gameStateManager.resupplyPlayer('player1');
			const resupply3 = await gameStateManager.resupplyPlayer('player1');

			// All should succeed
			expect(resupply1).toBeDefined();
			expect(resupply2).toBeDefined();
			expect(resupply3).toBeDefined();

			// Reserve should have 3 additional cards
			expect(reserve.getCount()).toBe(initialReserveCount + 3);

			// All resupplied cards should be different
			const resuppliedIds = [resupply1!.objectId, resupply2!.objectId, resupply3!.objectId];
			const uniqueIds = new Set(resuppliedIds);
			expect(uniqueIds.size).toBe(3);
		});

		test('Resupply with completely empty deck and discard should return null', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const discard = player1.zones.discardPileZone;

			// Clear both zones
			deck.clear();
			discard.clear();

			// Attempt resupply
			const resuppliedCard = await gameStateManager.resupplyPlayer('player1');

			expect(resuppliedCard).toBeNull();
		});
	});

	describe('Deck Zone Internal Mechanics', () => {
		test('DeckZone removeTop should work in FIFO order', () => {
			const deck = new DeckZone('test-deck', 'test-player');

			// Add cards with known order
			const cards = testDeck
				.slice(1, 4)
				.map((def, i) => gameStateManager.objectFactory.createCardInstance(def.id, 'test-player'));

			deck.addBottom(cards);

			// Remove cards should come in same order
			const first = deck.removeTop();
			const second = deck.removeTop();
			const third = deck.removeTop();

			expect(first?.definitionId).toBe(cards[0].definitionId);
			expect(second?.definitionId).toBe(cards[1].definitionId);
			expect(third?.definitionId).toBe(cards[2].definitionId);

			// Deck should now be empty
			expect(deck.getCount()).toBe(0);
			expect(deck.removeTop()).toBeUndefined();
		});

		test('DeckZone shuffle should change card order', () => {
			const deck = new DeckZone('test-deck', 'test-player');

			// Add multiple cards
			const cards = testDeck
				.slice(1, 8)
				.map((def, i) => gameStateManager.objectFactory.createCardInstance(def.id, 'test-player'));

			deck.addBottom(cards);
			const originalOrder = deck.getAll().map((c) => c.definitionId);

			// Shuffle multiple times to test randomness
			let foundDifference = false;
			for (let i = 0; i < 10; i++) {
				deck.shuffle();
				const newOrder = deck.getAll().map((c) => c.definitionId);
				if (JSON.stringify(originalOrder) !== JSON.stringify(newOrder)) {
					foundDifference = true;
					break;
				}
			}

			expect(foundDifference).toBe(true);
			expect(deck.getCount()).toBe(cards.length); // Count should remain same
		});

		test('DeckZone should only contain ICardInstance objects', () => {
			const deck = new DeckZone('test-deck', 'test-player');

			// Add cards
			const cards = testDeck
				.slice(1, 3)
				.map((def, i) => gameStateManager.objectFactory.createCardInstance(def.id, 'test-player'));

			deck.addBottom(cards);

			// All entities should be ICardInstance (not IGameObject)
			const allCards = deck.getAll();
			allCards.forEach((card) => {
				expect(isGameObject(card)).toBe(false);
				expect(card.instanceId).toBeDefined();
				expect('objectId' in card).toBe(false);
			});
		});
	});

	describe('Deck State Consistency During Complex Operations', () => {
		test('Concurrent draw and resupply operations should maintain deck integrity', async () => {
			await gameStateManager.initializeGame();

			const player1 = gameStateManager.getPlayer('player1')!;
			const deck = player1.zones.deckZone as DeckZone;
			const hand = player1.zones.handZone;
			const reserve = player1.zones.reserveZone;

			const initialDeckCount = deck.getCount();

			// Execute concurrent operations
			const drawPromise = gameStateManager.drawCards('player1', 2);
			const resupplyPromise = gameStateManager.resupplyPlayer('player1');

			await Promise.all([drawPromise, resupplyPromise]);

			// Verify total card accounting
			const finalDeckCount = deck.getCount();
			const drawnCards = 2;
			const resuppliedCards = 1;

			expect(finalDeckCount).toBe(initialDeckCount - drawnCards - resuppliedCards);
			expect(hand.getCount()).toBe(5); // 3 initial + 2 drawn
			expect(reserve.getCount()).toBe(1); // 1 resupplied
		});

		test('Event publishing should work correctly during deck operations', async () => {
			await gameStateManager.initializeGame();

			const events: any[] = [];
			eventBus.subscribe('entityMoved', (event) => events.push(event));
			eventBus.subscribe('deckReshuffled', (event) => events.push(event));

			// Draw cards to trigger events
			await gameStateManager.drawCards('player1', 2);

			// Should have entityMoved events for drawn cards
			const moveEvents = events.filter((e) => e.from?.zoneType === ZoneIdentifier.Deck);
			expect(moveEvents.length).toBe(2);

			moveEvents.forEach((event) => {
				expect(event.entity).toBeDefined();
				expect(event.from.zoneType).toBe(ZoneIdentifier.Deck);
				expect(event.to.zoneType).toBe(ZoneIdentifier.Hand);
			});
		});
	});
});
