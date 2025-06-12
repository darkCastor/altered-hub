import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EffectProcessor } from '../../src/engine/EffectProcessor';
import { EventBus } from '../../src/engine/EventBus';
import { CardType, Faction, ZoneIdentifier } from '../../src/engine/types/enums';
import type { ICardDefinition, ICardInstance } from '../../src/engine/types/cards';
import type { IEffectStep } from '../../src/engine/types/abilities';
import type { IGameObject } from '../../src/engine/types/objects';
import { DeckZone } from '../../src/engine/Zone';
import { isGameObject } from '../../src/engine/types/objects';

// Helper to create mock Card Definitions
const createMockCardDef = (id: string, name: string): ICardDefinition => ({
	id,
	name,
	type: CardType.Character, // Default type, can be overridden in specific tests
	subTypes: [],
	faction: Faction.Neutral,
	handCost: { total: 1 },
	reserveCost: { total: 1 },
	statistics: { forest: 0, mountain: 0, water: 0 },
	abilities: [],
	rarity: 'Common',
	version: '1.0'
});

// Helper to create card instances
const createCard = (gsm: GameStateManager, defId: string, playerId: string): ICardInstance => {
	return gsm.objectFactory.createCardInstance(defId, playerId);
};


describe('EffectProcessor - Resupply Effect', () => {
	let gsm: GameStateManager;
	let effectProcessor: EffectProcessor;
	let eventBus: EventBus;
	let player1Id: string;
	let cardDef1: ICardDefinition;
	let cardDef2: ICardDefinition;
	let cardDef3: ICardDefinition;

	beforeEach(async () => {
		eventBus = new EventBus();
		player1Id = 'player1';

		cardDef1 = createMockCardDef('c1', 'Card 1');
		cardDef2 = createMockCardDef('c2', 'Card 2');
		cardDef3 = createMockCardDef('c3', 'Card 3');

		const mockCardDefinitions = [cardDef1, cardDef2, cardDef3];

		gsm = new GameStateManager([player1Id], mockCardDefinitions, eventBus);
		await gsm.initializeGame(); // Initializes player, zones, etc.
		effectProcessor = gsm.effectProcessor;

		// Clear zones for clean test states
		const player = gsm.getPlayer(player1Id)!;
		player.zones.deckZone.clear();
		player.zones.discardPileZone.clear();
		player.zones.reserveZone.clear();
	});

	test('Resupply from Deck: moves top card from Deck to Reserve', async () => {
		const player = gsm.getPlayer(player1Id)!;
		const deckZone = player.zones.deckZone as DeckZone;

		// Setup Deck: c1 (top), c2, c3 (bottom)
		deckZone.add(createCard(gsm, cardDef1.id, player1Id)); // c1 will be top if added last to a conceptual "top"
		deckZone.add(createCard(gsm, cardDef2.id, player1Id)); // c2
		deckZone.add(createCard(gsm, cardDef3.id, player1Id)); // c3
		// To ensure order for removeTop, let's re-add them in reverse for simple array-based zones
		// Or rely on DeckZone's specific implementation of removeTop.
		// For this test, let's assume current DeckZone.add puts at end, and removeTop takes from beginning (index 0).
		// So, to have c1 at top:
		deckZone.clear();
		const c1 = createCard(gsm, cardDef1.id, player1Id);
		const c2 = createCard(gsm, cardDef2.id, player1Id);
		const c3 = createCard(gsm, cardDef3.id, player1Id);
		// A real deck is shuffled, but for testing removeTop, order matters.
		// Assuming addBottom and then reversing or specific top/bottom methods.
		// Let's use addBottom (if it adds to "bottom" and removeTop takes from "top")
		// Or, more simply, if getAll() returns in added order and removeTop() takes from index 0:
		deckZone.add(c1); // Top
		deckZone.add(c2);
		deckZone.add(c3); // Bottom

		const resupplyEffectStep: IEffectStep = {
			verb: 'resupply',
			targets: [player1Id],
			parameters: { count: 1 }
		};

		await effectProcessor.resolveEffect({ steps: [resupplyEffectStep] });

		expect(player.zones.reserveZone.getCount()).toBe(1);
		const reserveCard = player.zones.reserveZone.getAll()[0];
		expect(isGameObject(reserveCard)).toBe(true);
		expect((reserveCard as IGameObject).definitionId).toBe(cardDef1.id);

		expect(deckZone.getCount()).toBe(2);
		const deckCards = deckZone.getAll();
		expect(deckCards[0].definitionId).toBe(cardDef2.id); // c2 should now be top
		expect(deckCards[1].definitionId).toBe(cardDef3.id);
		expect(player.zones.discardPileZone.getCount()).toBe(0);
	});

	test('Resupply multiple from Deck: moves top 2 cards from Deck to Reserve', async () => {
		const player = gsm.getPlayer(player1Id)!;
		const deckZone = player.zones.deckZone as DeckZone;

		const c1 = createCard(gsm, cardDef1.id, player1Id);
		const c2 = createCard(gsm, cardDef2.id, player1Id);
		const c3 = createCard(gsm, cardDef3.id, player1Id);
		deckZone.add(c1); // Top
		deckZone.add(c2); // Middle
		deckZone.add(c3); // Bottom

		const resupplyEffectStep: IEffectStep = {
			verb: 'resupply',
			targets: [player1Id],
			parameters: { count: 2 }
		};

		await effectProcessor.resolveEffect({ steps: [resupplyEffectStep] });

		expect(player.zones.reserveZone.getCount()).toBe(2);
		const reserveCards = player.zones.reserveZone.getAll();
		// Order in reserve might not be guaranteed, check for presence
		expect(reserveCards.some(rc => isGameObject(rc) && rc.definitionId === cardDef1.id)).toBe(true);
		expect(reserveCards.some(rc => isGameObject(rc) && rc.definitionId === cardDef2.id)).toBe(true);

		expect(deckZone.getCount()).toBe(1);
		expect(deckZone.getAll()[0].definitionId).toBe(cardDef3.id); // c3 should be left
	});

	test('Resupply from empty Deck: shuffles Discard into Deck, then resupplies', async () => {
		const player = gsm.getPlayer(player1Id)!;
		const deckZone = player.zones.deckZone as DeckZone;
		const discardPile = player.zones.discardPileZone;

		// Setup Discard: d1, d2
		// Note: discard pile objects are IGameObject. When reshuffled, they become ICardInstance.
		const d1Discard = gsm.objectFactory.createGameObject(createCard(gsm, cardDef1.id, player1Id), player1Id);
		const d2Discard = gsm.objectFactory.createGameObject(createCard(gsm, cardDef2.id, player1Id), player1Id);
		discardPile.add(d1Discard);
		discardPile.add(d2Discard);

		expect(deckZone.getCount()).toBe(0);
		expect(discardPile.getCount()).toBe(2);

		const resupplyEffectStep: IEffectStep = {
			verb: 'resupply',
			targets: [player1Id],
			parameters: { count: 1 }
		};

		// Spy on shuffle to ensure it's called
		const shuffleSpy = vi.spyOn(deckZone, 'shuffle');

		await effectProcessor.resolveEffect({ steps: [resupplyEffectStep] });

		expect(shuffleSpy).toHaveBeenCalled();
		expect(discardPile.getCount()).toBe(0); // Discard should be empty
		expect(deckZone.getCount()).toBe(1);    // 1 card left in deck
		expect(player.zones.reserveZone.getCount()).toBe(1); // 1 card resupplied

		const reserveCard = player.zones.reserveZone.getAll()[0] as IGameObject;
		// The specific card depends on the shuffle, but it must be one of d1 or d2
		expect([cardDef1.id, cardDef2.id]).toContain(reserveCard.definitionId);
		shuffleSpy.mockRestore();
	});

	test('Resupply with count greater than available (Deck + Discard)', async () => {
		const player = gsm.getPlayer(player1Id)!;
		const deckZone = player.zones.deckZone as DeckZone;
		const discardPile = player.zones.discardPileZone;

		// Setup Discard: d1
		const d1Discard = gsm.objectFactory.createGameObject(createCard(gsm, cardDef1.id, player1Id), player1Id);
		discardPile.add(d1Discard);

		const resupplyEffectStep: IEffectStep = {
			verb: 'resupply',
			targets: [player1Id],
			parameters: { count: 2 } // Request 2, only 1 available
		};

		await effectProcessor.resolveEffect({ steps: [resupplyEffectStep] });

		expect(player.zones.reserveZone.getCount()).toBe(1);
		const reserveCard = player.zones.reserveZone.getAll()[0] as IGameObject;
		expect(reserveCard.definitionId).toBe(cardDef1.id);
		expect(deckZone.getCount()).toBe(0);
		expect(discardPile.getCount()).toBe(0);
	});

	test('Resupply with empty Deck and Discard: does nothing', async () => {
		const player = gsm.getPlayer(player1Id)!;
		// Deck, Discard, Reserve are already empty from beforeEach

		const resupplyEffectStep: IEffectStep = {
			verb: 'resupply',
			targets: [player1Id],
			parameters: { count: 1 }
		};

		await effectProcessor.resolveEffect({ steps: [resupplyEffectStep] });

		expect(player.zones.reserveZone.getCount()).toBe(0);
		expect(player.zones.deckZone.getCount()).toBe(0);
		expect(player.zones.discardPileZone.getCount()).toBe(0);
	});
});

// TODO: Add tests for other effect verbs if they are part of the system and not yet tested.
// For now, focusing on resupply as per the subtask.
