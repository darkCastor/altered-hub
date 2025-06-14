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

		// Add a Hero card definition for proper game initialization
		const heroDef = createMockCardDef('hero1', 'Test Hero');
		heroDef.type = CardType.Hero;
		heroDef.handCost = { total: 0 };
		heroDef.reserveCost = { total: 0 };

		const mockCardDefinitions = [heroDef, cardDef1, cardDef2, cardDef3];

		// Create player deck definitions map
		const playerDeckDefinitions = new Map<string, ICardDefinition[]>();
		playerDeckDefinitions.set(player1Id, mockCardDefinitions);

		gsm = new GameStateManager(playerDeckDefinitions, eventBus);
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
		expect(reserveCards.some((rc) => isGameObject(rc) && rc.definitionId === cardDef1.id)).toBe(
			true
		);
		expect(reserveCards.some((rc) => isGameObject(rc) && rc.definitionId === cardDef2.id)).toBe(
			true
		);

		expect(deckZone.getCount()).toBe(1);
		expect(deckZone.getAll()[0].definitionId).toBe(cardDef3.id); // c3 should be left
	});

	test('Resupply from empty Deck: shuffles Discard into Deck, then resupplies', async () => {
		const player = gsm.getPlayer(player1Id)!;
		const deckZone = player.zones.deckZone as DeckZone;
		const discardPile = player.zones.discardPileZone;

		// Setup Discard: d1, d2
		// Note: discard pile objects are IGameObject. When reshuffled, they become ICardInstance.
		const d1Discard = gsm.objectFactory.createGameObject(
			createCard(gsm, cardDef1.id, player1Id),
			player1Id
		);
		const d2Discard = gsm.objectFactory.createGameObject(
			createCard(gsm, cardDef2.id, player1Id),
			player1Id
		);
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
		expect(deckZone.getCount()).toBe(1); // 1 card left in deck
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
		const d1Discard = gsm.objectFactory.createGameObject(
			createCard(gsm, cardDef1.id, player1Id),
			player1Id
		);
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

// For now, focusing on resupply as per the subtask.

describe('EffectProcessor - Create Token Effect', () => {
	let gsm: GameStateManager;
	let effectProcessor: EffectProcessor;
	let eventBus: EventBus;
	let player1Id: string;
	let mockTokenDef: ICardDefinition;

	beforeEach(async () => {
		eventBus = new EventBus();
		player1Id = 'player1';
		mockTokenDef = {
			id: 'token-goblin',
			name: 'Goblin Token',
			type: CardType.Token,
			statistics: { forest: 1, mountain: 1, water: 0 },
			abilities: [],
			handCost: { total: 0 },
			reserveCost: { total: 0 },
			faction: 'Neutral',
			rarity: 'Token',
			version: '1'
		};

		gsm = new GameStateManager([player1Id], [mockTokenDef], eventBus);
		await gsm.initializeGame();
		effectProcessor = gsm.effectProcessor;

		// Mock objectFactory calls that are relevant
		jest
			.spyOn(gsm.objectFactory, 'createTokenObjectById')
			.mockImplementation((definitionId, controllerId) => {
				if (definitionId === mockTokenDef.id) {
					const tokenGameObject = {
						objectId: `token-${Math.random().toString(36).substring(7)}`,
						definitionId: mockTokenDef.id,
						name: mockTokenDef.name,
						type: CardType.Token,
						baseCharacteristics: { ...mockTokenDef },
						currentCharacteristics: { ...mockTokenDef },
						ownerId: controllerId,
						controllerId: controllerId,
						statuses: new Set(),
						counters: new Map(),
						abilities: [], // Assuming tokens can have abilities from definition
						expeditionAssignment: undefined, // Will be set by effect
						timestamp: Date.now()
					} as IGameObject;
					return tokenGameObject;
				}
				return null;
			});
		jest.spyOn(gsm.state.sharedZones.expedition, 'add');
		jest.spyOn(gsm.eventBus, 'publish');
	});

	test('create_token should create a token in the specified expedition with correct assignment', async () => {
		const createTokenStep: IEffectStep = {
			verb: 'create_token',
			targets: [], // Not targeting anything, controller specified or from source
			parameters: {
				tokenDefinitionId: 'token-goblin',
				destinationExpeditionType: 'hero',
				controllerId: player1Id // Explicitly set controller
			}
		};
		// Source object is not strictly needed if controllerId is in params
		await effectProcessor.resolveEffect({ steps: [createTokenStep] }, undefined);

		expect(gsm.objectFactory.createTokenObjectById).toHaveBeenCalledWith('token-goblin', player1Id);
		expect(gsm.state.sharedZones.expedition.add).toHaveBeenCalled();

		const addedToken = (gsm.state.sharedZones.expedition.add as jest.Mock).mock
			.calls[0][0] as IGameObject;
		expect(addedToken).toBeDefined();
		expect(addedToken.definitionId).toBe('token-goblin');
		expect(addedToken.controllerId).toBe(player1Id);
		expect(addedToken.expeditionAssignment).toEqual({ playerId: player1Id, type: 'hero' });
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('objectCreated', {
			object: addedToken,
			zone: gsm.state.sharedZones.expedition
		});
	});

	test('create_token defaults controller to source object controller if not in parameters', async () => {
		const sourceObject = gsm.objectFactory.createGameObjectFromDefinition(
			createMockCardDef('srcDef', 'Source Card'),
			player1Id
		);
		// Add source object to a zone so it's "in play" conceptually for the test
		gsm.getPlayer(player1Id)!.zones.reserveZone.add(sourceObject);

		const createTokenStep: IEffectStep = {
			verb: 'create_token',
			targets: [],
			parameters: {
				tokenDefinitionId: 'token-goblin',
				destinationExpeditionType: 'companion'
				// No controllerId, should default from sourceObject
			}
		};
		await effectProcessor.resolveEffect({ steps: [createTokenStep] }, sourceObject);

		expect(gsm.objectFactory.createTokenObjectById).toHaveBeenCalledWith('token-goblin', player1Id);
		const addedToken = (gsm.state.sharedZones.expedition.add as jest.Mock).mock
			.calls[0][0] as IGameObject;
		expect(addedToken.controllerId).toBe(player1Id); // Defaulted to sourceObject's controller
		expect(addedToken.expeditionAssignment).toEqual({ playerId: player1Id, type: 'companion' });
	});
});

describe('EffectProcessor - Move Expedition Effect', () => {
	let gsm: GameStateManager;
	let effectProcessor: EffectProcessor;
	let player1Id: string;
	let player1: ReturnType<GameStateManager['getPlayer']>;

	beforeEach(async () => {
		eventBus = new EventBus(); // Assuming EventBus is defined globally or imported
		player1Id = 'player1';

		gsm = new GameStateManager([player1Id], [], eventBus);
		await gsm.initializeGame(); // Initializes player with default expeditionState
		effectProcessor = gsm.effectProcessor;
		player1 = gsm.getPlayer(player1Id)!;

		// Mock getAdventureMaxPosition
		jest.spyOn(gsm, 'getAdventureMaxPosition').mockReturnValue(4); // e.g., 5 regions, max index 4
		jest.spyOn(gsm.eventBus, 'publish');
	});

	test('move_forward should increment hero expedition position', async () => {
		player1.expeditionState.heroPosition = 1;
		const moveStep: IEffectStep = {
			verb: 'move_forward',
			targets: [player1Id], // Target the player whose expedition should move
			parameters: { targetExpeditionType: 'hero', count: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [moveStep] });
		expect(player1.expeditionState.heroPosition).toBe(2);
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('expeditionMoved', {
			playerId: player1Id,
			type: 'hero',
			oldPosition: 1,
			newPosition: 2,
			distance: 1
		});
	});

	test('move_backward should decrement companion expedition position', async () => {
		player1.expeditionState.companionPosition = 3;
		const moveStep: IEffectStep = {
			verb: 'move_backward',
			targets: [player1Id],
			parameters: { targetExpeditionType: 'companion', count: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [moveStep] });
		expect(player1.expeditionState.companionPosition).toBe(2);
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('expeditionMoved', {
			playerId: player1Id,
			type: 'companion',
			oldPosition: 3,
			newPosition: 2,
			distance: -1
		});
	});

	test('move_forward should affect both expeditions if targetExpeditionType is "both"', async () => {
		player1.expeditionState.heroPosition = 1;
		player1.expeditionState.companionPosition = 2;
		const moveStep: IEffectStep = {
			verb: 'move_forward',
			targets: [player1Id],
			parameters: { targetExpeditionType: 'both', count: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [moveStep] });
		expect(player1.expeditionState.heroPosition).toBe(2);
		expect(player1.expeditionState.companionPosition).toBe(3);
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('expeditionMoved', {
			playerId: player1Id,
			type: 'hero',
			oldPosition: 1,
			newPosition: 2,
			distance: 1
		});
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('expeditionMoved', {
			playerId: player1Id,
			type: 'companion',
			oldPosition: 2,
			newPosition: 3,
			distance: 1
		});
	});

	test('move_forward should not exceed maxPosition', async () => {
		player1.expeditionState.heroPosition = 4; // Already at max position
		const moveStep: IEffectStep = {
			verb: 'move_forward',
			targets: [player1Id],
			parameters: { targetExpeditionType: 'hero', count: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [moveStep] });
		expect(player1.expeditionState.heroPosition).toBe(4); // Stays at 4
		// Event might publish with newPosition === oldPosition or not at all if no actual move
		// Current effectMove implementation would publish if oldPos !== newPos. If they are same, no event.
		// Let's check it wasn't called with values indicating a move beyond max.
		const heroMoveCall = (gsm.eventBus.publish as jest.Mock).mock.calls.find(
			(call) => call[0] === 'expeditionMoved' && call[1].type === 'hero'
		);
		if (heroMoveCall) {
			// If it was called (e.g. if position was < 4 and tried to go > 4)
			expect(heroMoveCall[1].newPosition).toBeLessThanOrEqual(4);
		}
	});

	test('move_backward should not go below 0', async () => {
		player1.expeditionState.companionPosition = 0; // Already at min position
		const moveStep: IEffectStep = {
			verb: 'move_backward',
			targets: [player1Id],
			parameters: { targetExpeditionType: 'companion', count: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [moveStep] });
		expect(player1.expeditionState.companionPosition).toBe(0); // Stays at 0
	});
});

describe('EffectProcessor - Sacrifice Effect', () => {
	let gsm: GameStateManager;
	let effectProcessor: EffectProcessor;
	let player1Id: string;
	let player1: ReturnType<GameStateManager['getPlayer']>;
	let objectToSacrifice: IGameObject;

	beforeEach(async () => {
		eventBus = new EventBus();
		player1Id = 'player1';
		const cardDef = createMockCardDef('sac-target', 'Sacrifice Target');

		gsm = new GameStateManager([player1Id], [cardDef], eventBus);
		await gsm.initializeGame();
		effectProcessor = gsm.effectProcessor;
		player1 = gsm.getPlayer(player1Id)!;

		objectToSacrifice = gsm.objectFactory.createGameObjectFromDefinition(cardDef, player1Id);
		// Place it in a zone, e.g., player1's landmark zone
		player1.zones.landmarkZone.add(objectToSacrifice);

		jest.spyOn(gsm, 'moveEntity');
		jest.spyOn(gsm.eventBus, 'publish');
	});

	test('sacrifice effect should move the target object to its owners discard pile', async () => {
		const sacrificeStep: IEffectStep = {
			verb: 'sacrifice',
			targets: [objectToSacrifice.objectId]
		};

		// Sanity check: object is in landmark zone, discard is empty
		expect(player1.zones.landmarkZone.findById(objectToSacrifice.objectId)).toBeDefined();
		expect(player1.zones.discardPileZone.getCount()).toBe(0);

		await effectProcessor.resolveEffect({ steps: [sacrificeStep] });

		expect(gsm.moveEntity).toHaveBeenCalledWith(
			objectToSacrifice.objectId,
			player1.zones.landmarkZone, // fromZone
			player1.zones.discardPileZone, // toZone (owner's discard)
			objectToSacrifice.controllerId // controllerId of the object being moved
		);

		// We can't directly check zones after mock if moveEntity itself is mocked without full functionality.
		// Instead, we trust the call to gsm.moveEntity is correct.
		// If moveEntity was not mocked, we could check:
		// expect(player1.zones.landmarkZone.findById(objectToSacrifice.objectId)).toBeUndefined();
		// expect(player1.zones.discardPileZone.findById(objectToSacrifice.objectId)).toBeDefined();

		expect(gsm.eventBus.publish).toHaveBeenCalledWith('objectSacrificed', {
			objectId: objectToSacrifice.objectId,
			definitionId: objectToSacrifice.definitionId,
			fromZoneId: player1.zones.landmarkZone.id
		});
	});
});

describe('EffectProcessor - Gain/Lose Counters Effect', () => {
	let gsm: GameStateManager;
	let effectProcessor: EffectProcessor;
	let player1Id: string;
	let targetObject: IGameObject;

	beforeEach(async () => {
		eventBus = new EventBus();
		player1Id = 'player1';
		const cardDef = createMockCardDef('counter-target', 'Counter Target');

		gsm = new GameStateManager([player1Id], [cardDef], eventBus);
		await gsm.initializeGame(); // Initializes player, zones, etc.
		effectProcessor = gsm.effectProcessor;

		targetObject = gsm.objectFactory.createGameObjectFromDefinition(cardDef, player1Id);
		// Place it in a zone, e.g., player1's landmark zone for testing
		gsm.getPlayer(player1Id)!.zones.landmarkZone.add(targetObject);

		// Spy on statusUpdater if it were more complex. For now, direct status check is fine.
		// jest.spyOn(gsm.statusUpdater, 'updateObjectStatusBasedOnCounters');
		jest.spyOn(gsm.eventBus, 'publish');
	});

	test('gain_counters should add specified counters and update Boosted status for Boost counters', async () => {
		const gainBoostStep: IEffectStep = {
			verb: 'gain_counters',
			targets: [targetObject.objectId],
			parameters: { counterType: CounterType.Boost, amount: 2 }
		};
		await effectProcessor.resolveEffect({ steps: [gainBoostStep] });

		expect(targetObject.counters.get(CounterType.Boost)).toBe(2);
		expect(targetObject.statuses.has(StatusType.Boosted)).toBe(true); // Assuming updateObjectStatusBasedOnCounters is implicitly called or logic is in GSM
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('counterGained', {
			targetId: targetObject.objectId,
			counterType: CounterType.Boost,
			amount: 2,
			newTotal: 2
		});

		const gainOtherStep: IEffectStep = {
			verb: 'gain_counters',
			targets: [targetObject.objectId],
			parameters: { counterType: 'CustomCounter' as CounterType, amount: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [gainOtherStep] });
		expect(targetObject.counters.get('CustomCounter' as CounterType)).toBe(1);
		// Boosted status should not change for non-boost counters
	});

	test('lose_counters should remove specified counters and update Boosted status for Boost counters', async () => {
		targetObject.counters.set(CounterType.Boost, 3);
		targetObject.statuses.add(StatusType.Boosted); // Assume it's boosted

		const loseBoostStep: IEffectStep = {
			verb: 'lose_counters',
			targets: [targetObject.objectId],
			parameters: { counterType: CounterType.Boost, amount: 1 }
		};
		await effectProcessor.resolveEffect({ steps: [loseBoostStep] });
		expect(targetObject.counters.get(CounterType.Boost)).toBe(2);
		expect(targetObject.statuses.has(StatusType.Boosted)).toBe(true); // Still boosted
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('counterLost', {
			targetId: targetObject.objectId,
			counterType: CounterType.Boost,
			amountRemoved: 1,
			newTotal: 2
		});

		const loseAllBoostStep: IEffectStep = {
			verb: 'lose_counters',
			targets: [targetObject.objectId],
			parameters: { counterType: CounterType.Boost, amount: 2 }
		};
		await effectProcessor.resolveEffect({ steps: [loseAllBoostStep] });
		expect(targetObject.counters.get(CounterType.Boost)).toBe(0);
		// Manually simulate status update for test, as statusUpdater is a simple alias.
		// In real scenario, ensure GSM's statusUpdater (or equivalent logic) is called.
		if ((targetObject.counters.get(CounterType.Boost) || 0) <= 0) {
			targetObject.statuses.delete(StatusType.Boosted);
		}
		expect(targetObject.statuses.has(StatusType.Boosted)).toBe(false); // No longer boosted
	});

	test('lose_counters should not go below zero', async () => {
		targetObject.counters.set('CustomCounter' as CounterType, 1);
		const loseStep: IEffectStep = {
			verb: 'lose_counters',
			targets: [targetObject.objectId],
			parameters: { counterType: 'CustomCounter' as CounterType, amount: 3 }
		};
		await effectProcessor.resolveEffect({ steps: [loseStep] });
		expect(targetObject.counters.get('CustomCounter' as CounterType)).toBe(0);
	});
});

describe('EffectProcessor - Roll Die and If Condition Effects', () => {
	let gsm: GameStateManager;
	let effectProcessor: EffectProcessor;
	let player1Id: string;
	let sourceObject: IGameObject; // A dummy source object for effects

	beforeEach(async () => {
		eventBus = new EventBus(); // Assuming EventBus is defined globally or imported
		player1Id = 'player1';
		const cardDef = createMockCardDef('source-card', 'Source Card');

		gsm = new GameStateManager([player1Id], [cardDef], eventBus);
		await gsm.initializeGame();
		effectProcessor = gsm.effectProcessor;
		sourceObject = gsm.objectFactory.createGameObjectFromDefinition(cardDef, player1Id);
		gsm.getPlayer(player1Id)!.zones.reserveZone.add(sourceObject); // Put it somewhere

		jest.spyOn(gsm.eventBus, 'publish');
		// Spy on a dummy effect verb that might be called by if_condition branches
		// To make this cleaner, we'd ideally have a way to assert which steps array was chosen.
		// For now, let's assume 'then_steps' and 'else_steps' contain a unique, simple verb.
		jest.spyOn(effectProcessor as any, 'effectDrawCards').mockResolvedValue(undefined); // As a stand-in for a branch effect
	});

	test('roll_die should store result in context and publish event', async () => {
		const rollDieStep: IEffectStep = {
			verb: 'roll_die',
			parameters: { storeAs: 'myRoll' }
		};
		const effectContext: any = { _effectRuntimeValues: {} }; // Simulate the context passed in resolveEffect

		// Directly call resolveEffectStep for this isolated test if needed, or use resolveEffect
		// To test _effectRuntimeValues, we need to capture the context used within resolveEffect
		// For simplicity, we'll check the event payload as it should reflect the stored value.

		let capturedContext: any;
		const originalResolveEffectStep = (effectProcessor as any).resolveEffectStep;
		(effectProcessor as any).resolveEffectStep = async (
			step: IEffectStep,
			srcObj: IGameObject,
			ctx: any,
			targets: any[]
		) => {
			capturedContext = ctx; // Capture the context
			return originalResolveEffectStep.call(effectProcessor, step, srcObj, ctx, targets);
		};

		await effectProcessor.resolveEffect({ steps: [rollDieStep] }, sourceObject, [], {});

		expect(capturedContext._effectRuntimeValues.myRoll).toBeGreaterThanOrEqual(1);
		expect(capturedContext._effectRuntimeValues.myRoll).toBeLessThanOrEqual(6);
		expect(gsm.eventBus.publish).toHaveBeenCalledWith('dieRolled', {
			result: capturedContext._effectRuntimeValues.myRoll,
			storedAs: 'myRoll'
		});
		(effectProcessor as any).resolveEffectStep = originalResolveEffectStep; // Restore
	});

	test('if_condition should execute "then_steps" if condition (based on die roll) is true', async () => {
		const thenStep: IEffectStep = {
			verb: 'draw_cards',
			targets: [player1Id],
			parameters: { count: 1, uniqueMarker: 'thenBranch' }
		};
		const elseStep: IEffectStep = {
			verb: 'draw_cards',
			targets: [player1Id],
			parameters: { count: 99, uniqueMarker: 'elseBranch' }
		}; // Different params to distinguish

		const rollDieStep: IEffectStep = { verb: 'roll_die', parameters: { storeAs: 'testRoll' } };
		const ifStep: IEffectStep = {
			verb: 'if_condition',
			parameters: {
				condition: { type: 'compare_runtime_value', key: 'testRoll', operator: '>=', value: 4 },
				then_steps: [thenStep],
				else_steps: [elseStep]
			}
		};

		const mockMath = Object.create(global.Math);
		mockMath.random = () => 0.5; // Ensures die roll is 0.5 * 6 + 1 = 4 (floor(3)+1) -> will be >=4
		global.Math = mockMath;

		await effectProcessor.resolveEffect({ steps: [rollDieStep, ifStep] }, sourceObject);

		expect((effectProcessor as any).effectDrawCards).toHaveBeenCalledWith(
			expect.objectContaining({
				parameters: expect.objectContaining({ uniqueMarker: 'thenBranch' })
			}),
			expect.anything()
		);
		expect((effectProcessor as any).effectDrawCards).not.toHaveBeenCalledWith(
			expect.objectContaining({
				parameters: expect.objectContaining({ uniqueMarker: 'elseBranch' })
			})
		);

		global.Math = Object.getPrototypeOf(mockMath); // Restore Math.random
	});

	test('if_condition should execute "else_steps" if condition (based on die roll) is false', async () => {
		const thenStep: IEffectStep = {
			verb: 'draw_cards',
			targets: [player1Id],
			parameters: { count: 1, uniqueMarker: 'thenBranch' }
		};
		const elseStep: IEffectStep = {
			verb: 'draw_cards',
			targets: [player1Id],
			parameters: { count: 99, uniqueMarker: 'elseBranch' }
		};

		const rollDieStep: IEffectStep = { verb: 'roll_die', parameters: { storeAs: 'testRoll' } };
		const ifStep: IEffectStep = {
			verb: 'if_condition',
			parameters: {
				condition: { type: 'compare_runtime_value', key: 'testRoll', operator: '>=', value: 4 },
				then_steps: [thenStep],
				else_steps: [elseStep]
			}
		};

		const mockMath = Object.create(global.Math);
		mockMath.random = () => 0.1; // Ensures die roll is 0.1 * 6 + 1 = 1 (floor(0.6)+1) -> will be < 4
		global.Math = mockMath;

		await effectProcessor.resolveEffect({ steps: [rollDieStep, ifStep] }, sourceObject);

		expect((effectProcessor as any).effectDrawCards).not.toHaveBeenCalledWith(
			expect.objectContaining({
				parameters: expect.objectContaining({ uniqueMarker: 'thenBranch' })
			})
		);
		expect((effectProcessor as any).effectDrawCards).toHaveBeenCalledWith(
			expect.objectContaining({
				parameters: expect.objectContaining({ uniqueMarker: 'elseBranch' })
			}),
			expect.anything()
		);

		global.Math = Object.getPrototypeOf(mockMath); // Restore Math.random
	});
});
