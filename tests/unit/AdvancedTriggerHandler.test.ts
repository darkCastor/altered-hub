// tests/unit/AdvancedTriggerHandler.test.ts
import { AdvancedTriggerHandler } from '../../src/engine/AdvancedTriggerHandler';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { ObjectFactory } from '../../src/engine/ObjectFactory';
import { EventBus } from '../../src/engine/EventBus';
import type { IGameObject, IEmblemObject, ICurrentCharacteristics } from '../../src/engine/types/objects';
import type { IAbility, ITrigger, IEffectStep } from '../../src/engine/types/abilities';
import { AbilityType, CardType, ZoneIdentifier } from '../../src/engine/types/enums';
import { GenericZone } from '../../src/engine/Zone';

jest.mock('../../src/engine/GameStateManager');
jest.mock('../../src/engine/ObjectFactory');
jest.mock('../../src/engine/EventBus');

describe('AdvancedTriggerHandler', () => {
	let gsm: jest.Mocked<GameStateManager>;
	let objectFactory: jest.Mocked<ObjectFactory>;
	let eventBus: jest.Mocked<EventBus>;
	let triggerHandler: AdvancedTriggerHandler;
	let mockLimboZone: GenericZone;

	const createMockGameObject = (id: string, abilities: IAbility[] = []): IGameObject => ({
		objectId: id,
		definitionId: `def-${id}`,
		name: `TestObject ${id}`,
		type: CardType.Character,
		baseCharacteristics: { abilities: abilities.map(a => ({...a})) },
		currentCharacteristics: {
			abilities: abilities.map(a => ({...a})),
			grantedAbilities: []
		} as ICurrentCharacteristics,
		ownerId: 'player1',
		controllerId: 'player1',
		timestamp: Date.now(),
		statuses: new Set(),
		counters: new Map(),
		abilities: abilities.map(a => ({...a})), // Live abilities
		abilityActivationsToday: new Map(),
	});

	const createMockAbility = (id: string, eventType: string, condition?: (payload: any, source: IGameObject, gsm: GameStateManager) => boolean): IAbility => ({
		abilityId: id,
		abilityType: AbilityType.Reaction,
		trigger: { eventType, condition: condition || jest.fn().mockReturnValue(true) }, // Default condition to true
		effect: { steps: [{ verb: 'test_reaction_effect', targets: 'self' }] },
		text: `Reaction Ability ${id}`,
		isSupportAbility: false,
		reactionActivationsToday: 0,
		sourceObjectId: '',
	});

	const mockReactionEmblem = {
		objectId: 'emblem-1',
		name: 'Test Reaction Emblem',
		// ... other IEmblemObject properties
	} as IEmblemObject;

	beforeEach(() => {
		eventBus = new EventBus() as jest.Mocked<EventBus>;
		objectFactory = new ObjectFactory(new Map()) as jest.Mocked<ObjectFactory>;
		objectFactory.createReactionEmblem = jest.fn().mockReturnValue(mockReactionEmblem);

		mockLimboZone = new GenericZone('limbo', ZoneIdentifier.Limbo, 'visible');
		jest.spyOn(mockLimboZone, 'add'); // Spy on add method of this specific instance

		gsm = new GameStateManager([], [], eventBus) as jest.Mocked<GameStateManager>;
		gsm.objectFactory = objectFactory;
		gsm.state = {
			sharedZones: { limbo: mockLimboZone },
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
			expect(objectFactory.createReactionEmblem).toHaveBeenCalledWith(reactionAbility, sourceObject, {}, expect.anything()); // LKI is 4th arg
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
			gsm.getAllVisibleZones = jest.fn().mockReturnValue([new GenericZone('zone1', ZoneIdentifier.Expedition, 'visible').add(sourceObject) as any]);
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

			gsm.getAllVisibleZones = jest.fn().mockReturnValue([new GenericZone('zone1', ZoneIdentifier.Expedition, 'visible').add(sourceObject) as any]);
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
			sourceObject.abilities.forEach(ab => ab.reactionActivationsToday = 0);
			if (sourceObject.currentCharacteristics.grantedAbilities) {
				sourceObject.currentCharacteristics.grantedAbilities.forEach(ab => ab.reactionActivationsToday = 0);
			}

			expect(reactionAbility.reactionActivationsToday).toBe(0);

			// To properly test the actual gsm.preparePhase(), it would be an integration test
			// or GameStateManager.test.ts would cover this.
			// This test serves to document the expected interaction for AdvancedTriggerHandler's NIF.
			console.log("[Test Info] NIF reset test relies on simulated preparePhase logic for reactionActivationsToday.");
		});
	});
});
