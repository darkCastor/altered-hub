import { AdvancedTriggerHandler } from '../AdvancedTriggerHandler';
import { GameStateManager } from '../GameStateManager';
import { ObjectFactory } from '../ObjectFactory';
import { ReactionManager } from '../ReactionManager';
import { EffectProcessor } from '../EffectProcessor';
import { EventBus } from '../EventBus';
import type { IGameState, IPlayer } from '../types/gameState';
import type { IGameObject, IEmblemObject, ICardInstance } from '../types/objects';
import type { IAbility, IEffect, IAbilityTrigger } from '../types/abilities';
import { Zone } from '../Zone';
import { ZoneIdentifier, CardType, GamePhase, AbilityType } from '../types/enums';

jest.mock('../GameStateManager');
jest.mock('../ObjectFactory');
jest.mock('../ReactionManager');
jest.mock('../EffectProcessor');
jest.mock('../EventBus');

describe('AdvancedTriggerHandler', () => {
	let advancedTriggerHandler: AdvancedTriggerHandler;
	let mockGameStateManager: jest.Mocked<GameStateManager>;
	let mockObjectFactory: jest.Mocked<ObjectFactory>;
	let mockReactionManager: jest.Mocked<ReactionManager>;
	let mockEffectProcessor: jest.Mocked<EffectProcessor>;
	let mockEventBus: jest.Mocked<EventBus>;
	let gameState: IGameState;
	let player1: IPlayer;

	const createMockPlayerForAdvTriggers = (id: string): IPlayer =>
		({
			id,
			zones: {
				handZone: new Zone(`${id}-hand`, ZoneIdentifier.Hand, 'hidden', id),
				reserveZone: new Zone(`${id}-reserve`, ZoneIdentifier.Reserve, 'visible', id),
				landmarkZone: new Zone(`${id}-landmark`, ZoneIdentifier.Landmark, 'visible', id),
				heroZone: new Zone(`${id}-hero`, ZoneIdentifier.Hero, 'visible', id),
				deckZone: new Zone(`${id}-deck`, ZoneIdentifier.Deck, 'hidden', id),
				discardPileZone: new Zone(`${id}-discard`, ZoneIdentifier.DiscardPile, 'visible', id),
				manaZone: new Zone(`${id}-mana`, ZoneIdentifier.Mana, 'visible', id)
			}
		}) as IPlayer;

	const createTestGameObject = (
		id: string,
		controllerId: string,
		abilities: IAbility[] = [],
		characteristics: any = {}
	): IGameObject => ({
		objectId: id,
		definitionId: `def-${id}`,
		name: `Test Object ${id}`,
		type: CardType.Character,
		controllerId: controllerId,
		ownerId: controllerId,
		abilities: abilities.map((ab) => ({ ...ab, sourceObjectId: id })), // Ensure abilities are bound
		baseCharacteristics: { ...characteristics },
		currentCharacteristics: { ...characteristics, abilities: [] /* granted abilities */ },
		statuses: new Set(),
		counters: new Map(),
		timestamp: Date.now(),
		expeditionAssignment: undefined,
		abilityActivationsToday: new Map()
	});

	const createTestReactionEmblem = (
		id: string,
		controllerId: string,
		sourceObj: IGameObject,
		sourceAbil: IAbility
	): IEmblemObject => ({
		objectId: `emblem-${id}`,
		definitionId: 'REACTION_EMBLEM_DEF',
		name: `Reaction Emblem ${id}`,
		type: CardType.Emblem,
		emblemSubType: 'Reaction',
		controllerId,
		ownerId: controllerId,
		sourceObject: sourceObj, // LKI of source object
		boundEffect: { ...sourceAbil.effect, sourceObjectId: sourceObj.objectId },
		timestamp: Date.now(),
		baseCharacteristics: {},
		currentCharacteristics: {},
		statuses: new Set(),
		counters: new Map(),
		abilities: []
	});

	beforeEach(() => {
		jest.clearAllMocks();
		mockEventBus = new EventBus() as jest.Mocked<EventBus>;
		mockGameStateManager = new GameStateManager(
			new Map(),
			mockEventBus
		) as jest.Mocked<GameStateManager>;
		mockObjectFactory = new ObjectFactory(new Map()) as jest.Mocked<ObjectFactory>;
		mockEffectProcessor = new EffectProcessor(mockGameStateManager) as jest.Mocked<EffectProcessor>;
		// ReactionManager needs GSM, EP, OF
		mockReactionManager = new ReactionManager(
			mockGameStateManager,
			mockObjectFactory,
			mockEffectProcessor
		) as jest.Mocked<ReactionManager>;

		advancedTriggerHandler = new AdvancedTriggerHandler(mockGameStateManager);

		player1 = createMockPlayerForAdvTriggers('player1');
		gameState = {
			players: [player1],
			sharedZones: {
				expedition: new Zone('expedition', ZoneIdentifier.Expedition, 'visible', 'shared'),
				limbo: new Zone('limbo', ZoneIdentifier.Limbo, 'visible', 'shared'),
				adventure: new Zone('adventure', ZoneIdentifier.Adventure, 'visible', 'shared')
			},
			currentPhase: GamePhase.Noon,
			currentPlayerId: 'player1',
			firstPlayerId: 'player1',
			currentDay: 1
		} as IGameState;
		mockGameStateManager.state = gameState;
		mockGameStateManager.objectFactory = mockObjectFactory; // Ensure GSM uses the mocked OF
		mockGameStateManager.eventBus = mockEventBus;
		mockGameStateManager.getAllVisibleZones = jest.fn(function* () {
			// Use function keyword for 'this' if needed by Zone
			yield player1.zones.reserveZone;
			yield player1.zones.landmarkZone;
			yield player1.zones.heroZone;
			yield gameState.sharedZones.expedition;
			// Add other zones if they become relevant for tests
		});
		mockObjectFactory.createReactionEmblem = jest
			.fn()
			.mockImplementation((ability, sourceObj) =>
				createTestReactionEmblem(ability.abilityId, sourceObj.controllerId, sourceObj, ability)
			);
	});

	describe('LKI for Trigger Condition (Rule 6.3.k)', () => {
		it('should use current object power for condition when damage is taken', () => {
			const damageEffect: IEffect = {
				effectType: 'dealDamage',
				value: 1,
				sourceObjectId: 'external'
			};
			const reactionAbility: IAbility = {
				abilityId: 'damagereact',
				abilityType: AbilityType.Reaction,
				trigger: {
					eventType: 'objectDamaged', // Assuming a specific eventType
					condition: (payload, sourceObj, gsm) => {
						// sourceObj is Object B, check its current power
						return sourceObj.currentCharacteristics.power! > 3;
					}
				},
				effect: { effectType: 'buffSelf', value: 1, sourceObjectId: 'objB' } // Placeholder effect
			};
			const objectB = createTestGameObject('objB', 'player1', [reactionAbility], { power: 2 });
			gameState.sharedZones.expedition.add(objectB);

			// Action 1: Increase Object B's power to 4 (simulated directly)
			objectB.currentCharacteristics.power = 4;

			// Action 2: Object B takes damage (event payload)
			const damagePayload = { target: objectB, damage: 1, source: { objectId: 'external_source' } };
			advancedTriggerHandler.processGenericEventTriggers('objectDamaged', damagePayload);

			// Verification: Check if createReactionEmblem was called
			expect(mockObjectFactory.createReactionEmblem).toHaveBeenCalledTimes(1);
			expect(mockObjectFactory.createReactionEmblem).toHaveBeenCalledWith(
				expect.objectContaining({ abilityId: 'damagereact' }),
				objectB, // Live objectB passed to OF, OF will make LKI
				damagePayload
			);
		});

		it('should not trigger if condition (power > 3) is not met at time of damage', () => {
			const reactionAbility: IAbility = {
				abilityId: 'damagereact2',
				abilityType: AbilityType.Reaction,
				trigger: {
					eventType: 'objectDamaged',
					condition: (payload, sourceObj, gsm) => {
						return sourceObj.currentCharacteristics.power! > 3;
					}
				},
				effect: { effectType: 'buffSelf', value: 1, sourceObjectId: 'objB2' }
			};
			const objectB2 = createTestGameObject('objB2', 'player1', [reactionAbility], { power: 2 });
			gameState.sharedZones.expedition.add(objectB2);

			// Object B2 takes damage, power is still 2
			const damagePayload = {
				target: objectB2,
				damage: 1,
				source: { objectId: 'external_source' }
			};
			advancedTriggerHandler.processGenericEventTriggers('objectDamaged', damagePayload);

			expect(mockObjectFactory.createReactionEmblem).not.toHaveBeenCalled();
		});

		it('should use LKI from event payload for condition if available and designed for it', () => {
			// This test assumes the event payload is structured with LKI
			const reactionAbility: IAbility = {
				abilityId: 'destroyedWithLKIPower',
				abilityType: AbilityType.Reaction,
				trigger: {
					eventType: 'objectDestroyed',
					// Condition uses LKI from payload
					condition: (payload, sourceObj, gsm) => {
						return payload.destroyedObjectLKI.power > 5;
					}
				},
				effect: { effectType: 'spawnToken', value: 1, sourceObjectId: 'objC' }
			};
			const objectC = createTestGameObject('objC', 'player1', [reactionAbility], { power: 10 }); // Current power is 10
			gameState.sharedZones.expedition.add(objectC);

			// Simulate event where Object C is destroyed.
			// The event emitter (e.g. EffectProcessor) is responsible for creating this LKI.
			const destroyedObjectLKI = {
				// LKI provided in the event payload
				objectId: 'objC',
				type: CardType.Character,
				power: 6 // Power at the time of targeting or a relevant past state
			};
			const destructionPayload = { destroyedObjectLKI, destroyedBy: 'someEffect' };

			advancedTriggerHandler.processGenericEventTriggers('objectDestroyed', destructionPayload);

			expect(mockObjectFactory.createReactionEmblem).toHaveBeenCalledTimes(1);
			expect(mockObjectFactory.createReactionEmblem).toHaveBeenCalledWith(
				expect.objectContaining({ abilityId: 'destroyedWithLKIPower' }),
				objectC,
				destructionPayload
			);
		});
	});

	describe('"At [Phase]" Reaction Sequencing (Rule 4.2.b Confirmation)', () => {
		it('should not trigger "At Phase X" on an object brought by another "At Phase X" reaction in the same phase event', async () => {
			const phaseForTest = GamePhase.Morning;
			gameState.currentPhase = phaseForTest; // Ensure correct phase for trigger

			const objectBDefinitionId = 'objectBDef';
			const objectB_CardData = {
				// Simplified card data for Object B
				id: objectBDefinitionId,
				name: 'Object B',
				type: CardType.Character,
				abilities: [
					{
						abilityId: 'objB_AtMorning',
						abilityType: AbilityType.Reaction,
						trigger: { eventType: `at${phaseForTest}` }, // e.g. atMorning
						effect: { effectType: 'doSomethingOnB', sourceObjectId: 'objB' }
					}
				]
			};
			// Mock getCardDefinition to return Object B's data when ObjectFactory might need it
			mockGameStateManager.getCardDefinition = jest.fn((defId) => {
				if (defId === objectBDefinitionId) return objectB_CardData as any;
				return undefined;
			});

			const effectForA: IEffect = {
				effectType: 'putObjectInPlay',
				cardDefinitionId: objectBDefinitionId, // Object B's definition
				destinationZone: ZoneIdentifier.Expedition,
				controllerId: 'player1',
				sourceObjectId: 'objA'
			};
			const abilityA: IAbility = {
				abilityId: 'objA_AtMorning',
				abilityType: AbilityType.Reaction,
				trigger: { eventType: `at${phaseForTest}` },
				effect: effectForA
			};
			const objectA = createTestGameObject('objA', 'player1', [abilityA], { power: 1 });

			player1.zones.reserveZone.add(objectA); // Object A starts in play

			// Mock ObjectFactory behavior for when 'putObjectInPlay' effect resolves
			// This is a bit complex as it involves mocking the result of an effect resolution.
			// For this test, the key is that AdvancedTriggerHandler processes phase triggers *once*.
			// So, when objectA's emblem is created, objectB is not yet in play.

			// Spy on createEmblemForTriggeredAbility to track calls precisely for this test
			const createEmblemSpy = jest.spyOn(
				advancedTriggerHandler as any,
				'createEmblemForTriggeredAbility'
			);

			advancedTriggerHandler.processPhaseTriggersForPhase(phaseForTest);

			// Expected: Only Object A's "atMorning" ability should create an emblem.
			expect(createEmblemSpy).toHaveBeenCalledTimes(1);
			expect(createEmblemSpy).toHaveBeenCalledWith(
				expect.objectContaining({ abilityId: 'objA_AtMorning' }), // The ability object
				objectA, // Source object
				expect.objectContaining({ phase: phaseForTest }) // Payload
			);

			// Now, simulate the resolution of Object A's reaction which brings Object B into play.
			// This would happen inside ReactionManager.resolveReactions.
			// For this ATH test, we assume that if Object B came into play,
			// ATH's processPhaseTriggersForPhase (for this *same execution*) would not pick it up.
			// The test above confirms only objA's ability was processed by this call to processPhaseTriggersForPhase.
			createEmblemSpy.mockRestore();
		});
	});
});
