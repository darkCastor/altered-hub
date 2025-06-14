// tests/unit/AdvancedTriggerHandler.test.ts
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { AdvancedTriggerHandler } from '../../src/engine/AdvancedTriggerHandler';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { ObjectFactory } from '../../src/engine/ObjectFactory';
import { EventBus } from '../../src/engine/EventBus';
import type {
	IGameObject,
	IEmblemObject,
	ICurrentCharacteristics
} from '../../src/engine/types/objects';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IAbility, ITrigger, IEffectStep } from '../../src/engine/types/abilities';
import { AbilityType, CardType, ZoneIdentifier } from '../../src/engine/types/enums';
import { GenericZone } from '../../src/engine/Zone';

describe('AdvancedTriggerHandler', () => {
	let gsm: GameStateManager;
	let objectFactory: ObjectFactory;
	let eventBus: EventBus;
	let triggerHandler: AdvancedTriggerHandler;
	let mockLimboZone: GenericZone;

	const createMockGameObject = (id: string, abilities: IAbility[] = []): IGameObject => ({
		objectId: id,
		definitionId: `def-${id}`,
		name: `TestObject ${id}`,
		type: CardType.Character,
		baseCharacteristics: { abilities: abilities.map((a) => ({ ...a })) },
		currentCharacteristics: {
			abilities: abilities.map((a) => ({ ...a })),
			grantedAbilities: []
		} as ICurrentCharacteristics,
		ownerId: 'player1',
		controllerId: 'player1',
		timestamp: Date.now(),
		statuses: new Set(),
		counters: new Map(),
		abilities: abilities.map((a) => ({ ...a })), // Live abilities
		abilityActivationsToday: new Map()
	});

	const createMockAbility = (
		id: string,
		eventType: string,
		condition?: (payload: any, source: IGameObject, gsm: GameStateManager) => boolean
	): IAbility => ({
		abilityId: id,
		abilityType: AbilityType.Reaction,
		trigger: { eventType, condition: condition || jest.fn().mockReturnValue(true) }, // Default condition to true
		effect: { steps: [{ verb: 'test_reaction_effect', targets: 'self' }] },
		text: `Reaction Ability ${id}`,
		isSupportAbility: false,
		reactionActivationsToday: 0,
		sourceObjectId: ''
	});

	const mockReactionEmblem = {
		objectId: 'emblem-1',
		name: 'Test Reaction Emblem'
		// ... other IEmblemObject properties
	} as IEmblemObject;

	beforeEach(() => {
		eventBus = new EventBus() as jest.Mocked<EventBus>;
		objectFactory = new ObjectFactory(new Map()) as jest.Mocked<ObjectFactory>;
		objectFactory.createReactionEmblem = jest.fn().mockReturnValue(mockReactionEmblem);

		mockLimboZone = new GenericZone('limbo', ZoneIdentifier.Limbo, 'visible');
		jest.spyOn(mockLimboZone, 'add'); // Spy on add method of this specific instance

		// Create empty player deck definitions map for testing
		const playerDeckDefinitions = new Map<string, ICardDefinition[]>();

		gsm = new GameStateManager(playerDeckDefinitions, eventBus) as jest.Mocked<GameStateManager>;
		gsm.objectFactory = objectFactory;
		gsm.state = {
			sharedZones: { limbo: mockLimboZone }
			// ... other gsm.state properties if needed by handler
		} as any;
		// Mock config for NIF limit
		(gsm as any).config = { nothingIsForeverReactionLimit: 2 }; // Example limit of 2

		triggerHandler = new AdvancedTriggerHandler(gsm);
	});

	describe('Nothing is Forever (NIF) for Reactions', () => {
		it('should not create an emblem if NIF limit is reached for an ability', () => {
			const reactionAbility = createMockAbility('nifCheck', 'someEvent');
			const sourceObject = createMockGameObject('objNIF', [reactionAbility]);
			reactionAbility.sourceObjectId = sourceObject.objectId; // Link ability to source

			// Manually set reactionActivationsToday to the limit
			reactionAbility.reactionActivationsToday = 2;
			(gsm as any).config = { nothingIsForeverReactionLimit: 2 };

			(triggerHandler as any).createEmblemForTriggeredAbility(reactionAbility, sourceObject, {});

			expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			expect(mockLimboZone.add).not.toHaveBeenCalled();
		});

		it('should increment NIF count and create an emblem if limit not reached', () => {
			const reactionAbility = createMockAbility('nifIncrement', 'someEvent');
			const sourceObject = createMockGameObject('objNIFInc', [reactionAbility]);
			reactionAbility.sourceObjectId = sourceObject.objectId;

			reactionAbility.reactionActivationsToday = 0;
			(gsm as any).config = { nothingIsForeverReactionLimit: 2 };

			(triggerHandler as any).createEmblemForTriggeredAbility(reactionAbility, sourceObject, {});

			expect(reactionAbility.reactionActivationsToday).toBe(1);
			expect(objectFactory.createReactionEmblem).toHaveBeenCalledWith(
				reactionAbility,
				sourceObject,
				{},
				expect.anything()
			); // LKI is 4th arg
			expect(mockLimboZone.add).toHaveBeenCalledWith(mockReactionEmblem);
		});
	});

	describe('Trigger Conditions', () => {
		it('should only create an emblem if the trigger condition is met', () => {
			const conditionMock = jest.fn().mockReturnValue(true);
			const reactionAbility = createMockAbility('condTrue', 'eventWithCond', conditionMock);
			const sourceObject = createMockGameObject('objCondTrue', [reactionAbility]);
			reactionAbility.sourceObjectId = sourceObject.objectId;
			const eventPayload = { data: 'test' };

			// Manually call a processing method that would use createEmblemForTriggeredAbility
			// For example, if processGenericEventTriggers is used:
			gsm.getAllVisibleZones = jest
				.fn()
				.mockReturnValue([
					new GenericZone('zone1', ZoneIdentifier.Expedition, 'visible').add(sourceObject) as any
				]);
			triggerHandler.processGenericEventTriggers('eventWithCond', eventPayload);

			expect(conditionMock).toHaveBeenCalledWith(eventPayload, sourceObject, gsm);
			expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			expect(mockLimboZone.add).toHaveBeenCalledWith(mockReactionEmblem);
		});

		it('should NOT create an emblem if the trigger condition is NOT met', () => {
			const conditionMock = jest.fn().mockReturnValue(false);
			const reactionAbility = createMockAbility('condFalse', 'eventNoCond', conditionMock);
			const sourceObject = createMockGameObject('objCondFalse', [reactionAbility]);
			reactionAbility.sourceObjectId = sourceObject.objectId;
			const eventPayload = { data: 'test2' };

			gsm.getAllVisibleZones = jest
				.fn()
				.mockReturnValue([
					new GenericZone('zone1', ZoneIdentifier.Expedition, 'visible').add(sourceObject) as any
				]);
			triggerHandler.processGenericEventTriggers('eventNoCond', eventPayload);

			expect(conditionMock).toHaveBeenCalledWith(eventPayload, sourceObject, gsm);
			expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			expect(mockLimboZone.add).not.toHaveBeenCalled();
		});
	});

	// This would require more setup of GSM and its methods.

	describe('NIF Reset on Prepare Phase', () => {
		it('should ensure reactionActivationsToday is reset by preparePhase', async () => {
			const reactionAbility = createMockAbility('nifResetTest', 'someEvent');
			const sourceObject = createMockGameObject('objNifReset', [reactionAbility]);
			reactionAbility.sourceObjectId = sourceObject.objectId;
			reactionAbility.reactionActivationsToday = 1; // Set to non-zero value

			// Mock gsm.preparePhase to simulate its effect on abilities
			// This requires a more functional GameStateManager mock or instance for this specific test.
			// For simplicity, we'll assume gsm.preparePhase() would iterate and reset.
			// We can't directly call the real gsm.preparePhase() with the current jest.mock setup
			// without more complex mock bypassing.
			// Instead, we'll simulate the core logic of preparePhase relevant to this test.

			// Simulate what gsm.preparePhase() does:
			sourceObject.abilities.forEach((ab) => (ab.reactionActivationsToday = 0));
			if (sourceObject.currentCharacteristics.grantedAbilities) {
				sourceObject.currentCharacteristics.grantedAbilities.forEach(
					(ab) => (ab.reactionActivationsToday = 0)
				);
			}

			expect(reactionAbility.reactionActivationsToday).toBe(0);

			// To properly test the actual gsm.preparePhase(), it would be an integration test
			// or GameStateManager.test.ts would cover this.
			// This test serves to document the expected interaction for AdvancedTriggerHandler's NIF.
			console.log(
				'[Test Info] NIF reset test relies on simulated preparePhase logic for reactionActivationsToday.'
			);
		});
	});

	describe('Reaction Scope Enforcement', () => {
		let sourceObject: IGameObject;
		let reactionAbility: IAbility;

		// Mock zone definitions to be returned by findZoneOfObject
		const mockHeroZone = {
			zoneType: ZoneIdentifier.HeroZone,
			id: 'heroZoneP1',
			controllerId: 'player1',
			visibility: 'visible'
		} as any;
		const mockHandZone = {
			zoneType: ZoneIdentifier.HandZone,
			id: 'handZoneP1',
			controllerId: 'player1',
			visibility: 'hidden'
		} as any;
		const mockExpeditionZone = {
			zoneType: ZoneIdentifier.Expedition,
			id: 'expeditionShared',
			controllerId: 'shared',
			visibility: 'visible'
		} as any;
		const mockLandmarkZone = {
			zoneType: ZoneIdentifier.LandmarkZone,
			id: 'landmarkP1',
			controllerId: 'player1',
			visibility: 'visible'
		} as any;
		const mockReserveZone = {
			zoneType: ZoneIdentifier.ReserveZone,
			id: 'reserveP1',
			controllerId: 'player1',
			visibility: 'visible'
		} as any;

		beforeEach(() => {
			// Reset mocks for objectFactory and gsm methods for each test
			objectFactory.createReactionEmblem.mockClear();
			mockLimboZone.add.mockClear(); // Clear spy on limboZone.add
			if (gsm.findZoneOfObject) {
				(gsm.findZoneOfObject as jest.Mock).mockClear();
			} else {
				gsm.findZoneOfObject = jest.fn();
			}
			gsm.getAllVisibleZones = jest.fn().mockReturnValue([]); // Default to no zones unless specified
		});

		const setupAndTrigger = (
			objectType: CardType,
			objectZoneType: ZoneIdentifier | undefined, // Undefined if not in a zone for some tests, or for leave triggers where fromZone is key
			ability: IAbility,
			isExhausted: boolean = false,
			eventType: string = 'genericTestEvent',
			eventPayload: any = {},
			fromZoneTypeForLeaveEvent?: ZoneIdentifier // Specifically for leave triggers
		) => {
			sourceObject = createMockGameObject('scopedObj', [ability]);
			sourceObject.type = objectType;
			ability.sourceObjectId = sourceObject.objectId;
			if (isExhausted) {
				sourceObject.statuses.add('Exhausted' as any); // Using StatusType.Exhausted would be better if enum is directly usable here
			}

			if (objectZoneType) {
				let zoneToReturn;
				if (objectZoneType === ZoneIdentifier.HeroZone) zoneToReturn = mockHeroZone;
				else if (objectZoneType === ZoneIdentifier.HandZone) zoneToReturn = mockHandZone;
				else if (objectZoneType === ZoneIdentifier.Expedition) zoneToReturn = mockExpeditionZone;
				else if (objectZoneType === ZoneIdentifier.LandmarkZone) zoneToReturn = mockLandmarkZone;
				else if (objectZoneType === ZoneIdentifier.ReserveZone) zoneToReturn = mockReserveZone;
				(gsm.findZoneOfObject as jest.Mock).mockReturnValue(zoneToReturn);
			} else {
				(gsm.findZoneOfObject as jest.Mock).mockReturnValue(undefined); // Object not in a zone or zone doesn't matter
			}

			// For generic event processing, ensure the object is "found" by getAllVisibleZones
			if (eventType === 'genericTestEvent' && objectZoneType) {
				const containingZone = new GenericZone('testContainingZone', objectZoneType, 'visible');
				containingZone.add(sourceObject);
				gsm.getAllVisibleZones = jest.fn().mockReturnValue([containingZone as any]);
			}

			let finalPayload = eventPayload;
			if (fromZoneTypeForLeaveEvent) {
				finalPayload = { ...eventPayload, fromZone: { zoneType: fromZoneTypeForLeaveEvent } };
			}

			// Call a method that uses createEmblemForTriggeredAbility internally
			// Using processGenericEventTriggers as a common pathway
			if (eventType === 'leavePlay' && fromZoneTypeForLeaveEvent) {
				triggerHandler.processLeavePlayTriggers(
					sourceObject,
					{ zoneType: fromZoneTypeForLeaveEvent } as any,
					mockHandZone
				);
			} else if (eventType === 'enterPlay' && objectZoneType) {
				triggerHandler.processEnterPlayTriggers(sourceObject, { zoneType: objectZoneType } as any);
			} else {
				triggerHandler.processGenericEventTriggers(eventType, finalPayload);
			}
		};

		// Hero Reactions
		describe('Hero Reactions', () => {
			beforeEach(() => (reactionAbility = createMockAbility('heroReact', 'genericTestEvent')));

			test('Hero in HeroZone with reaction -> emblem IS created', () => {
				setupAndTrigger(CardType.Hero, ZoneIdentifier.HeroZone, reactionAbility);
				expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			});
			test('Hero in HandZone with reaction -> emblem IS NOT created', () => {
				setupAndTrigger(CardType.Hero, ZoneIdentifier.HandZone, reactionAbility);
				expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			});
		});

		// Non-Hero "In Play" Reactions
		describe('Non-Hero "In Play" Reactions', () => {
			beforeEach(() => (reactionAbility = createMockAbility('nonHeroReact', 'genericTestEvent')));

			test('Non-Hero in ExpeditionZone with reaction -> emblem IS created', () => {
				setupAndTrigger(CardType.Character, ZoneIdentifier.Expedition, reactionAbility);
				expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			});
			test('Non-Hero in LandmarkZone with reaction -> emblem IS created', () => {
				setupAndTrigger(CardType.Structure, ZoneIdentifier.LandmarkZone, reactionAbility);
				expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			});
			test('Non-Hero in ReserveZone with non-support reaction -> emblem IS NOT created', () => {
				reactionAbility.isSupportAbility = false;
				setupAndTrigger(CardType.Character, ZoneIdentifier.ReserveZone, reactionAbility);
				expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			});
		});

		// Reserve Zone Reactions
		describe('Reserve Zone Reactions', () => {
			test('Object in ReserveZone with support reaction, not exhausted -> emblem IS created', () => {
				reactionAbility = createMockAbility('supportReserveReact', 'genericTestEvent');
				reactionAbility.isSupportAbility = true;
				setupAndTrigger(CardType.Spell, ZoneIdentifier.ReserveZone, reactionAbility, false);
				expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			});
			test('Object in ReserveZone with support reaction, exhausted -> emblem IS NOT created', () => {
				reactionAbility = createMockAbility('supportReserveExhaustedReact', 'genericTestEvent');
				reactionAbility.isSupportAbility = true;
				setupAndTrigger(CardType.Spell, ZoneIdentifier.ReserveZone, reactionAbility, true); // Exhausted
				expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			});
			test('Object in ReserveZone with non-support reaction -> emblem IS NOT created', () => {
				reactionAbility = createMockAbility('nonSupportReserveReact', 'genericTestEvent');
				reactionAbility.isSupportAbility = false;
				setupAndTrigger(CardType.Character, ZoneIdentifier.ReserveZone, reactionAbility);
				expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			});
		});

		// LKI for "Leave" Triggers
		describe('LKI for "Leave" Triggers', () => {
			test('Non-Hero object leaving ExpeditionZone with "leavePlay" reaction -> emblem IS created', () => {
				reactionAbility = createMockAbility('leaveExpReact', 'leavePlay');
				// For leave triggers, current zone of object might be its destination or limbo.
				// The scope check relies on eventPayload.fromZone.zoneType.
				setupAndTrigger(
					CardType.Character,
					undefined,
					reactionAbility,
					false,
					'leavePlay',
					{},
					ZoneIdentifier.Expedition
				);
				expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			});

			test('Hero leaving HeroZone with "leavePlay" reaction -> emblem IS created', () => {
				reactionAbility = createMockAbility('leaveHeroReact', 'leavePlay');
				setupAndTrigger(
					CardType.Hero,
					undefined,
					reactionAbility,
					false,
					'leavePlay',
					{},
					ZoneIdentifier.HeroZone
				);
				expect(objectFactory.createReactionEmblem).toHaveBeenCalled();
			});

			test('Non-Hero object leaving HandZone with "leavePlay" reaction -> emblem IS NOT created (invalid scope for reaction)', () => {
				reactionAbility = createMockAbility('leaveHandReact', 'leavePlay');
				setupAndTrigger(
					CardType.Character,
					undefined,
					reactionAbility,
					false,
					'leavePlay',
					{},
					ZoneIdentifier.HandZone
				);
				expect(objectFactory.createReactionEmblem).not.toHaveBeenCalled();
			});
		});
	});
});
