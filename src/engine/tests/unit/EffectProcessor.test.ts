import { EffectProcessor } from '../../EffectProcessor';
import type { GameStateManager } from '../../GameStateManager';
import { Player } from '../../Player';
import type { PlayerActionHandler } from '../../PlayerActionHandler';
import { ObjectStore } from '../../ObjectStore';
import { EventBus } from '../../EventBus';
import { RuleAdjudicator } from '../../RuleAdjudicator';
import { TurnManager } from '../../TurnManager';
import { Zone } from '../../Zone';
import type { CardDefinition, IEffect, ICardInstance, IGameObject } from '../../types/objects';
import { CardType, GamePhase, ZoneIdentifier, StatusType } from '../../types/enums';
import { CardPlaySystem } from '../../CardPlaySystem';
import { StatusHandler } from '../../StatusHandler';

jest.mock('../../PlayerActionHandler');
jest.mock('../../RuleAdjudicator');
jest.mock('../../TurnManager');
jest.mock('../../CardPlaySystem');
jest.mock('../../StatusHandler');

const mockPlayerActionHandler = {
	playerChoosesObjectsToKeep: jest.fn(),
	promptForOptionalStepChoice: jest.fn(),
	promptForModeChoice: jest.fn(),
	promptForCardChoice: jest.fn(),
	promptForExpeditionChoice: jest.fn(),
	promptForPlayerChoice: jest.fn(),
	chooseTargetForEffect: jest.fn(),
	promptPlayerForExpandChoice: jest.fn(),
	promptPlayerForScoutChoice: jest.fn()
} as jest.Mocked<PlayerActionHandler>;

describe('EffectProcessor', () => {
	let effectProcessor: EffectProcessor;
	let gsm: GameStateManager;
	let player1: Player;
	let player2: Player;
	let objectStore: ObjectStore;
	let eventBus: EventBus;
	let ruleAdjudicator: RuleAdjudicator;
	let turnManager: TurnManager;
	let mockResolveReactions: jest.SpyInstance;
	let mockApplyAllPassiveAbilities: jest.SpyInstance;
	let cardPlaySystem: CardPlaySystem;
	let statusHandler: StatusHandler;

	const cardDefChar1: CardDefinition = { id: 'char1Def', name: 'Char1', type: CardType.Character };
	const cardDefChar2: CardDefinition = { id: 'char2Def', name: 'Char2', type: CardType.Character };
	const cardDefDeck1_P1: CardDefinition = {
		id: 'deck1_p1',
		name: 'P1Deck1',
		type: CardType.Character
	};
	const cardDefDeck2_P1: CardDefinition = {
		id: 'deck2_p1',
		name: 'P1Deck2',
		type: CardType.Character
	};
	const cardDefDeck1_P2: CardDefinition = {
		id: 'deck1_p2',
		name: 'P2Deck1',
		type: CardType.Character
	};
	const cardDefDeck2_P2: CardDefinition = {
		id: 'deck2_p2',
		name: 'P2Deck2',
		type: CardType.Character
	};

	beforeEach(() => {
		eventBus = new EventBus(); // Real EventBus
		objectStore = new ObjectStore(eventBus);
		statusHandler = new StatusHandler(objectStore, eventBus);
		ruleAdjudicator = new RuleAdjudicator(objectStore, eventBus, statusHandler);
		turnManager = new TurnManager(eventBus, ['p1', 'p2']);

		player1 = new Player('p1', 'Player 1', objectStore, eventBus);
		player2 = new Player('p2', 'Player 2', objectStore, eventBus);

		objectStore.addPlayer(player1);
		objectStore.addPlayer(player2);

		objectStore.registerCardDefinition(cardDefChar1);
		objectStore.registerCardDefinition(cardDefChar2);
		objectStore.registerCardDefinition(cardDefDeck1_P1);
		objectStore.registerCardDefinition(cardDefDeck2_P1);
		objectStore.registerCardDefinition(cardDefDeck1_P2);
		objectStore.registerCardDefinition(cardDefDeck2_P2);

		gsm = new GameStateManager(
			objectStore,
			eventBus,
			ruleAdjudicator,
			mockPlayerActionHandler as PlayerActionHandler,
			turnManager,
			statusHandler
		);
		cardPlaySystem = new CardPlaySystem(gsm);
		effectProcessor = new EffectProcessor(gsm);
		gsm.effectProcessor = effectProcessor;
		gsm.cardPlaySystem = cardPlaySystem;

		gsm.initializeGame(['p1', 'p2'], {});
		gsm.startGame();
		gsm.state.firstPlayerId = 'p1';
		gsm.state.currentPlayerId = 'p1';
		gsm.state.currentPhase = GamePhase.Morning; // Non-Afternoon phase

		mockResolveReactions = jest.spyOn(gsm, 'resolveReactions').mockResolvedValue(undefined);
		mockApplyAllPassiveAbilities = jest
			.spyOn(ruleAdjudicator, 'applyAllPassiveAbilities')
			.mockImplementation(() => {});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("'Each player...' effects", () => {
		it('processes "Each player draws 1 card" in initiative order with reactions', async () => {
			const p1_deck_card1 = objectStore.createCardInstance(
				'deck1_p1',
				'p1',
				ZoneIdentifier.Deck
			) as ICardInstance;
			const p1_deck_card2 = objectStore.createCardInstance(
				'deck2_p1',
				'p1',
				ZoneIdentifier.Deck
			) as ICardInstance;
			player1.zones.deckZone.addOrder(
				[p1_deck_card1.instanceId, p1_deck_card2.instanceId].map(
					(id) => objectStore.getObject(id) as IGameObject
				)
			);

			const p2_deck_card1 = objectStore.createCardInstance(
				'deck1_p2',
				'p2',
				ZoneIdentifier.Deck
			) as ICardInstance;
			const p2_deck_card2 = objectStore.createCardInstance(
				'deck2_p2',
				'p2',
				ZoneIdentifier.Deck
			) as ICardInstance;
			player2.zones.deckZone.addOrder(
				[p2_deck_card1.instanceId, p2_deck_card2.instanceId].map(
					(id) => objectStore.getObject(id) as IGameObject
				)
			);

			const drawEffect: IEffect = {
				sourceObjectId: 'testSource',
				steps: [{ verb: 'draw_cards', targets: 'all_players', parameters: { count: 1 } }]
			};

			const p1DrawOrder = { passives: 0, reaction: 0, handSize: 0 };
			const p2DrawOrder = { passives: 0, reaction: 0, handSize: 0 };
			let callSequence = 0;

			mockApplyAllPassiveAbilities.mockImplementation(() => {
				callSequence++;
				if (player1.zones.handZone.getAll().length === 1 && p1DrawOrder.passives === 0)
					p1DrawOrder.passives = callSequence;
				if (player2.zones.handZone.getAll().length === 1 && p2DrawOrder.passives === 0)
					p2DrawOrder.passives = callSequence;
			});
			mockResolveReactions.mockImplementation(async () => {
				callSequence++;
				if (player1.zones.handZone.getAll().length === 1 && p1DrawOrder.reaction === 0)
					p1DrawOrder.reaction = callSequence;
				if (player2.zones.handZone.getAll().length === 1 && p2DrawOrder.reaction === 0)
					p2DrawOrder.reaction = callSequence;
				return Promise.resolve();
			});

			jest.spyOn(gsm, 'drawCards').mockImplementation(async (playerId, count) => {
				const player = gsm.getPlayer(playerId);
				const card = player?.zones.deckZone.draw();
				if (card && player) {
					player.zones.handZone.add(card);
					eventBus.publish('cardDrawn', {
						playerId,
						cardId: card.objectId,
						definitionId: card.definitionId
					});
					if (playerId === 'p1') p1DrawOrder.handSize = player.zones.handZone.getAll().length;
					if (playerId === 'p2') p2DrawOrder.handSize = player.zones.handZone.getAll().length;
				}
				return !!card;
			});

			await effectProcessor.resolveEffect(drawEffect);

			expect(player1.zones.handZone.getAll().length).toBe(1);
			expect(player1.zones.handZone.contains(p1_deck_card1.instanceId)).toBe(true);
			expect(p1DrawOrder.passives).toBeLessThan(p1DrawOrder.reaction);

			expect(player2.zones.handZone.getAll().length).toBe(1);
			expect(player2.zones.handZone.contains(p2_deck_card1.instanceId)).toBe(true);
			expect(p2DrawOrder.passives).toBeLessThan(p2DrawOrder.reaction);

			expect(p1DrawOrder.reaction).toBeLessThan(p2DrawOrder.passives);
		});

		it('processes "Each player sacrifices 1 character" in initiative order with reactions and choices', async () => {
			const char1_P1 = objectStore.createCardInstance(
				'char1Def',
				'p1',
				ZoneIdentifier.Play
			) as ICardInstance;
			player1.zones.playZone.add(objectStore.getObject(char1_P1.instanceId) as IGameObject);
			const char2_P2 = objectStore.createCardInstance(
				'char2Def',
				'p2',
				ZoneIdentifier.Play
			) as ICardInstance;
			player2.zones.playZone.add(objectStore.getObject(char2_P2.instanceId) as IGameObject);

			const sacrificeEffect: IEffect = {
				sourceObjectId: 'testSource',
				steps: [
					{
						verb: 'sacrifice',
						targets: 'all_players',
						parameters: {
							choiceCriteria: { type: CardType.Character }
						}
					}
				]
			};

			const p1Order = { choice: 0, passives: 0, reaction: 0, cardInDiscard: false };
			const p2Order = { choice: 0, passives: 0, reaction: 0, cardInDiscard: false };
			let actionCallOrder = 0;

			mockPlayerActionHandler.promptForCardChoice.mockImplementation(
				async (playerId, prompt, cards, min, max) => {
					actionCallOrder++;
					if (playerId === 'p1') {
						p1Order.choice = actionCallOrder;
						return cards.filter((c) => c.definitionId === 'char1Def');
					}
					if (playerId === 'p2') {
						p2Order.choice = actionCallOrder;
						return cards.filter((c) => c.definitionId === 'char2Def');
					}
					return [];
				}
			);

			mockApplyAllPassiveAbilities.mockImplementation(() => {
				actionCallOrder++;
				if (
					p1Order.choice > 0 &&
					p1Order.passives === 0 &&
					player1.zones.discardPileZone.contains(char1_P1.instanceId)
				)
					p1Order.passives = actionCallOrder;
				if (
					p2Order.choice > 0 &&
					p2Order.passives === 0 &&
					player2.zones.discardPileZone.contains(char2_P2.instanceId)
				)
					p2Order.passives = actionCallOrder;
			});
			mockResolveReactions.mockImplementation(async () => {
				actionCallOrder++;
				if (
					p1Order.choice > 0 &&
					p1Order.reaction === 0 &&
					player1.zones.discardPileZone.contains(char1_P1.instanceId)
				)
					p1Order.reaction = actionCallOrder;
				if (
					p2Order.choice > 0 &&
					p2Order.reaction === 0 &&
					player2.zones.discardPileZone.contains(char2_P2.instanceId)
				)
					p2Order.reaction = actionCallOrder;
				return Promise.resolve();
			});

			await effectProcessor.resolveEffect(sacrificeEffect);

			expect(p1Order.choice).toBe(1);
			expect(player1.zones.discardPileZone.contains(char1_P1.instanceId)).toBe(true);
			expect(p1Order.passives).toBeGreaterThan(p1Order.choice);
			expect(p1Order.reaction).toBeGreaterThan(p1Order.passives);

			expect(p2Order.choice).toBeGreaterThan(p1Order.reaction);
			expect(player2.zones.discardPileZone.contains(char2_P2.instanceId)).toBe(true);
			expect(p2Order.passives).toBeGreaterThan(p2Order.choice);
			expect(p2Order.reaction).toBeGreaterThan(p2Order.passives);
		});
	});
});
