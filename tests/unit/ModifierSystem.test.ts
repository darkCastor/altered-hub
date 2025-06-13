// tests/unit/ModifierSystem.test.ts
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { RuleAdjudicator } from '../../src/engine/RuleAdjudicator';
import { EffectProcessor } from '../../src/engine/EffectProcessor';
import { PlayerActionHandler } from '../../src/engine/PlayerActionHandler';
import { ObjectFactory } from '../../src/engine/ObjectFactory';
import { EventBus } from '../../src/engine/EventBus';
import type { IGameObject, IEmblemObject, ICardInstance, ICurrentCharacteristics } from '../../src/engine/types/objects';
import type { IAbility, IEffectStep, IModifier } from '../../src/engine/types/abilities';
import { ModifierType, AbilityType, CardType, ZoneIdentifier } from '../../src/engine/types/enums';

// Mock a simple deepClone for test data
const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj));


describe('Modifier System', () => {
	let gsm: GameStateManager;
	let ruleAdjudicator: RuleAdjudicator;
	let effectProcessor: EffectProcessor;
	let mockPlayerActionHandler: PlayerActionHandler;
	let mockObjectFactory: ObjectFactory;
	let mockEventBus: EventBus;
    let mockExecuteStepLogic: any;

	const createMockGameObject = (id: string, timestamp: number, abilities: IAbility[] = [], name?: string, definitionId?: string): IGameObject => ({
		objectId: id,
		name: name || `MockObject-${id}`,
		timestamp,
		controllerId: 'p1',
		definitionId: definitionId || `def-${id}`,
		type: CardType.Character, // Default type
		abilities,
		currentCharacteristics: {
			grantedAbilities: [],
			negatedAbilityIds: [],
			statistics: { power: 1, health: 1, forest: 0, mountain: 0, water: 0},
			keywords: {}
		} as ICurrentCharacteristics,
		statuses: new Set(),
		counters: new Map(),
	} as IGameObject);


	beforeEach(() => {
		mockEventBus = mock(() => new EventBus())();
		mockObjectFactory = mock(() => ({
			createAbility: mock((abilityDef: any, sourceObjId: string) => ({...abilityDef, abilityId: abilityDef.id || `ability-${Date.now()}`, sourceObjectId: sourceObjId}))
		}))();

		// Create minimal player deck definitions for GameStateManager
		const playerDeckDefinitions = new Map();
		playerDeckDefinitions.set('p1', []);
		playerDeckDefinitions.set('p2', []);

		gsm = mock(() => new GameStateManager(playerDeckDefinitions, mockEventBus))();
		gsm.objectFactory = mockObjectFactory;

		const mockPlayerP1 = { id: 'p1', zones: {}, name: 'Player 1' } as any;
		const mockPlayerP2 = { id: 'p2', zones: {}, name: 'Player 2' } as any;
		(gsm as any).players = new Map([['p1', mockPlayerP1], ['p2', mockPlayerP2]]);
		gsm.getPlayer = mock((id: string) => (gsm as any).players.get(id));
		gsm.getObject = mock(() => undefined); // Will be set per test or group
		gsm.getCardDefinition = mock((defId: string) => ({ id: defId, name: `Def-${defId}`}));
		(gsm.state as any) = { sharedZones: { emblems: { getAll: mock().mockReturnValue([]) } } }; // Mock emblems zone

		ruleAdjudicator = new RuleAdjudicator(gsm);
        gsm.ruleAdjudicator = ruleAdjudicator;

		mockPlayerActionHandler = mock(() => new PlayerActionHandler(gsm))();
		gsm.actionHandler = mockPlayerActionHandler;
		mockPlayerActionHandler.promptForOptionalStepChoice = mock().mockResolvedValue(true); // Default to 'yes' for optional steps

		effectProcessor = new EffectProcessor(gsm);
        mockExecuteStepLogic = spyOn(effectProcessor as any, 'executeStepLogic').mockResolvedValue(true); // Assume successful execution by default
        (gsm as any).effectProcessor = effectProcessor;
	});

	afterEach(() => {
		// Bun automatically clears mocks between tests
	});

	describe('RuleAdjudicator.getActiveModifiers', () => {
		const sourceObjectOfStep = createMockGameObject('stepSourceObj', 0, [], 'Step Source', 'defStepSource');
		const mockContextBase = {
			type: 'EFFECT_STEP' as const,
			step: { verb: 'draw_cards', targets: 'self' } as IEffectStep,
			sourceObjectOfStep: sourceObjectOfStep,
			effectContext: { resolvedTargets: [], currentPlayerId: 'p1' }
		};

		it('should create a Replacement Modifier correctly', () => {
			const replacementStep: IEffectStep = { verb: 'discard_cards', parameters: { count: 1 }, canBeModified: false };
			const sourceObject = createMockGameObject('sourceObj1', 100, [
				{
					abilityId: 'ability1', abilityType: AbilityType.Passive, effect: {
						steps: [{
							verb: 'DEFINE_REPLACEMENT_MODIFIER',
							parameters: { priority: 5, applicationCriteria: { verb: 'draw_cards' }, replacementEffectStep: deepClone(replacementStep) }
						}]
					}
				}
			]);
			gsm.getAllPlayObjects = mock().mockReturnValue([sourceObject]);
            gsm.getObject = mock().mockImplementation((id: string) => id === 'sourceObj1' ? sourceObject : sourceObjectOfStep);

			const modifiers = ruleAdjudicator.getActiveModifiers(mockContextBase);
			expect(modifiers).toHaveLength(1);
			const mod = modifiers[0];
			expect(mod.modifierType).toBe(ModifierType.ReplaceStep);
			expect(mod.priority).toBe(5);
			expect(mod.sourceObjectId).toBe('sourceObj1');
			expect(mod.replacementEffectStep).toEqual(replacementStep);
			expect(mod.replacementEffectStep?.canBeModified).toBe(false);
			expect(mod.applicationCriteria.verb).toBe('draw_cards');
		});

		it('should create AddStepBefore and AddStepAfter modifiers with correct types and steps', () => {
			const beforeStep: IEffectStep = { verb: 'gain_mana', parameters: { count: 1 } };
			const afterStep: IEffectStep = { verb: 'lose_life', parameters: { count: 1 } };
			const sourceObject = createMockGameObject('sourceObj1', 100, [
				{ abilityId: 'abBefore', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_ADD_STEP_BEFORE_MODIFIER', parameters: { priority: 1, applicationCriteria: { verb: 'draw_cards' }, additionalEffectStep: deepClone(beforeStep) }}]}},
				{ abilityId: 'abAfter', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_ADD_STEP_AFTER_MODIFIER', parameters: { priority: 20, applicationCriteria: { verb: 'draw_cards' }, additionalEffectStep: deepClone(afterStep) }}]}}
			]);
			gsm.getAllPlayObjects = mock().mockReturnValue([sourceObject]);
            gsm.getObject = mock().mockImplementation((id: string) => id === 'sourceObj1' ? sourceObject : sourceObjectOfStep);

			const modifiers = ruleAdjudicator.getActiveModifiers(mockContextBase);
			expect(modifiers).toHaveLength(2);
			expect(modifiers[0].modifierType).toBe(ModifierType.AddStepBefore);
			expect(modifiers[0].additionalEffectStep).toEqual(beforeStep);
			expect(modifiers[1].modifierType).toBe(ModifierType.AddStepAfter);
			expect(modifiers[1].additionalEffectStep).toEqual(afterStep);
		});

		it('should not return modifier if criteria.verb does not match', () => {
			const sourceObject = createMockGameObject('sourceObj1', 100, [
                { abilityId: 'ab1', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_REPLACEMENT_MODIFIER', parameters: { applicationCriteria: { verb: 'non_matching_verb' }, replacementEffectStep: { verb: 'test' } }}]}}
            ]);
			gsm.getAllPlayObjects = mock().mockReturnValue([sourceObject]);
            gsm.getObject = mock().mockImplementation((id: string) => id === 'sourceObj1' ? sourceObject : sourceObjectOfStep);
			const modifiers = ruleAdjudicator.getActiveModifiers(mockContextBase);
			expect(modifiers).toHaveLength(0);
		});

		it('should evaluate customCondition and include modifier if it returns true', () => {
			const mockCondition = mock(() => true);
			const sourceObject = createMockGameObject('sourceObj1', 100, [
                { abilityId: 'ab1', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_REPLACEMENT_MODIFIER', parameters: { applicationCriteria: { verb: 'draw_cards', customCondition: mockCondition }, replacementEffectStep: { verb: 'test' } }}]}}
            ]);
			gsm.getAllPlayObjects = mock().mockReturnValue([sourceObject]);
            gsm.getObject = mock().mockImplementation((id: string) => id === 'sourceObj1' ? sourceObject : sourceObjectOfStep);
			const modifiers = ruleAdjudicator.getActiveModifiers(mockContextBase);
			expect(mockCondition).toHaveBeenCalledWith(mockContextBase.effectContext, gsm);
			expect(modifiers).toHaveLength(1);
		});

        it('should not include modifier if customCondition returns false', () => {
			const mockCondition = mock(() => false);
			const sourceObject = createMockGameObject('sourceObj1', 100, [
                { abilityId: 'ab1', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_REPLACEMENT_MODIFIER', parameters: { applicationCriteria: { verb: 'draw_cards', customCondition: mockCondition }, replacementEffectStep: { verb: 'test' } }}]}}
            ]);
			gsm.getAllPlayObjects = mock().mockReturnValue([sourceObject]);
            gsm.getObject = mock().mockImplementation((id: string) => id === 'sourceObj1' ? sourceObject : sourceObjectOfStep);
			const modifiers = ruleAdjudicator.getActiveModifiers(mockContextBase);
			expect(mockCondition).toHaveBeenCalledWith(mockContextBase.effectContext, gsm);
			expect(modifiers).toHaveLength(0);
		});

		it('should sort modifiers by priority (ascending), then sourceObject.timestamp (ascending)', () => {
			const source1 = createMockGameObject('src1', 200, [{abilityId: 'ab1', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_ADD_STEP_BEFORE_MODIFIER', parameters: { priority: 10, applicationCriteria: { verb: 'draw_cards' }, additionalEffectStep: {verb: 's1'} }}]}}]);
			const source2 = createMockGameObject('src2', 100, [{abilityId: 'ab2', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_ADD_STEP_BEFORE_MODIFIER', parameters: { priority: 5,  applicationCriteria: { verb: 'draw_cards' }, additionalEffectStep: {verb: 's2'} }}]}}]);
			const source3 = createMockGameObject('src3', 50,  [{abilityId: 'ab3', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'DEFINE_ADD_STEP_BEFORE_MODIFIER', parameters: { priority: 10, applicationCriteria: { verb: 'draw_cards' }, additionalEffectStep: {verb: 's3'} }}]}}]); // Same priority as source1, earlier timestamp

			(gsm.getAllPlayObjects as jest.Mock) = jest.fn().mockReturnValue([source1, source2, source3]);
            (gsm.getObject as jest.Mock).mockImplementation(id => {
                if(id === 'src1') return source1;
                if(id === 'src2') return source2;
                if(id === 'src3') return source3;
                return sourceObjectOfStep;
            });

			const modifiers = ruleAdjudicator.getActiveModifiers(mockContextBase);
			expect(modifiers).toHaveLength(3);
			expect(modifiers[0].sourceObjectId).toBe('src2'); // Priority 5
			expect(modifiers[1].sourceObjectId).toBe('src3'); // Priority 10, Timestamp 50
			expect(modifiers[2].sourceObjectId).toBe('src1'); // Priority 10, Timestamp 200
		});
	});

	describe('EffectProcessor.resolveSingleStep - Modifier Application', () => {
		const effectSource = createMockGameObject('effectSource', 1, [], 'Effect Source');
		const originalStep: IEffectStep = { verb: 'original_verb', targets: 'self', canBeModified: true };
		const currentContext = { _effectRuntimeValues: {} };

		beforeEach(() => {
			// getActiveModifiers is mocked for EffectProcessor tests
			gsm.ruleAdjudicator = { getActiveModifiers: mock() } as any;
		});

		it('executes original step if no modifiers', async () => {
			gsm.ruleAdjudicator.getActiveModifiers = mock().mockReturnValue([]);
			await effectProcessor['resolveSingleStep'](originalStep, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).toHaveBeenCalledWith(originalStep, effectSource, currentContext, []);
		});

		it('applies a replacement modifier, skipping original step', async () => {
			const replacementStep: IEffectStep = { verb: 'replacement_verb', targets: 'self' };
			const modifier = { modifierType: ModifierType.ReplaceStep, replacementEffectStep: replacementStep, priority: 1 } as IModifier;
			gsm.ruleAdjudicator.getActiveModifiers = mock().mockReturnValue([modifier]);

			await effectProcessor['resolveSingleStep'](originalStep, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).toHaveBeenCalledWith(replacementStep, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).not.toHaveBeenCalledWith(originalStep, effectSource, currentContext, []);
		});

		it('applies highest priority replacement if multiple apply', async () => {
			const higherPriorityStep: IEffectStep = { verb: 'higher_priority_replace', targets: 'self' };
			const lowerPriorityStep: IEffectStep = { verb: 'lower_priority_replace', targets: 'self' };
			const mod1 = { modifierType: ModifierType.ReplaceStep, replacementEffectStep: lowerPriorityStep, priority: 10 } as IModifier;
			const mod2 = { modifierType: ModifierType.ReplaceStep, replacementEffectStep: higherPriorityStep, priority: 1 } as IModifier;
			gsm.ruleAdjudicator.getActiveModifiers = mock().mockReturnValue([mod2, mod1]); // Simulating RA pre-sorting

			await effectProcessor['resolveSingleStep'](originalStep, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).toHaveBeenCalledWith(higherPriorityStep, effectSource, currentContext, []);
		});

		it('executes AddStepBefore, main, then AddStepAfter, in priority order', async () => {
			const before1: IEffectStep = { verb: 'before_1_p5', targets: 'self' };
			const before2: IEffectStep = { verb: 'before_2_p1', targets: 'self' }; // Higher priority
			const after1: IEffectStep = { verb: 'after_1_p5', targets: 'self' };
			const after2: IEffectStep = { verb: 'after_2_p1', targets: 'self' }; // Higher priority

			const modB1 = { modifierType: ModifierType.AddStepBefore, additionalEffectStep: before1, priority: 5 } as IModifier;
			const modB2 = { modifierType: ModifierType.AddStepBefore, additionalEffectStep: before2, priority: 1 } as IModifier;
			const modA1 = { modifierType: ModifierType.AddStepAfter, additionalEffectStep: after1, priority: 5 } as IModifier;
			const modA2 = { modifierType: ModifierType.AddStepAfter, additionalEffectStep: after2, priority: 1 } as IModifier;

			gsm.ruleAdjudicator.getActiveModifiers = mock().mockReturnValue([modB2, modB1, modA2, modA1]); // Simulating RA pre-sorting

			const executedVerbs: string[] = [];
			mockExecuteStepLogic.mockImplementation(async (step: IEffectStep) => {
				executedVerbs.push(step.verb);
				return true;
			});
			gsm.actionHandler.promptForOptionalStepChoice = mock().mockResolvedValue(true);


			await effectProcessor['resolveSingleStep'](originalStep, effectSource, currentContext, []);
			expect(executedVerbs).toEqual(['before_2_p1', 'before_1_p5', 'original_verb', 'after_2_p1', 'after_1_p5']);
		});

		it('skips additive modifiers if step was replaced (Rule 6.2.i)', async () => {
			const replacementS: IEffectStep = { verb: 'replacement_verb', targets: 'self' };
			const beforeS: IEffectStep = { verb: 'before_verb', targets: 'self' };
			const afterS: IEffectStep = { verb: 'after_verb', targets: 'self' };

			const replaceM = { modifierType: ModifierType.ReplaceStep, replacementEffectStep: replacementS, priority: 1 } as IModifier;
			const beforeM = { modifierType: ModifierType.AddStepBefore, additionalEffectStep: beforeS, priority: 5 } as IModifier;
			const afterM = { modifierType: ModifierType.AddStepAfter, additionalEffectStep: afterS, priority: 5 } as IModifier;
			gsm.ruleAdjudicator.getActiveModifiers = mock().mockReturnValue([replaceM, beforeM, afterM]);

			const executedVerbs: string[] = [];
			mockExecuteStepLogic.mockImplementation(async (step: IEffectStep) => {
				executedVerbs.push(step.verb);
				return true;
			});

			await effectProcessor['resolveSingleStep'](originalStep, effectSource, currentContext, []);
			expect(executedVerbs).toEqual(['replacement_verb']);
		});

		it('does not apply any modifiers if originalStep.canBeModified is false', async () => {
			const unmodifiableStep: IEffectStep = { ...originalStep, canBeModified: false };
			const replacementS: IEffectStep = { verb: 'replacement_verb', targets: 'self' };
			const replaceM = { modifierType: ModifierType.ReplaceStep, replacementEffectStep: replacementS, priority: 1 } as IModifier;
			gsm.ruleAdjudicator.getActiveModifiers = mock().mockReturnValue([replaceM]); // This should not be called effectively

			await effectProcessor['resolveSingleStep'](unmodifiableStep, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).toHaveBeenCalledWith(unmodifiableStep, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).toHaveBeenCalledTimes(1);
			// getActiveModifiers is called outside the canBeModified check in the current EffectProcessor structure,
			// but its results are ignored if originalStep.canBeModified is false.
		});

		it('an additionalEffectStep with canBeModified:false is executed but not further modified', async () => {
			const additionalCannotModify: IEffectStep = { verb: 'additional_cannot_modify', targets: 'self', canBeModified: false };
			const addBeforeMod = { modifierType: ModifierType.AddStepBefore, additionalEffectStep: additionalCannotModify, priority: 1 } as IModifier;

			// First call to getActiveModifiers (for originalStep): returns addBeforeMod
			// Second call (for additionalCannotModify): this is where its canBeModified:false is checked.
			//    RuleAdjudicator would be called, but EffectProcessor's resolveSingleStep for additionalCannotModify will short-circuit.
			let callCount = 0;
			gsm.ruleAdjudicator.getActiveModifiers = mock().mockImplementation(() => {
				callCount++;
				if (callCount === 1) return [addBeforeMod]; // For originalStep
				return []; // For additional_cannot_modify
			});

			const executedVerbs: string[] = [];
			mockExecuteStepLogic.mockImplementation(async (step: IEffectStep) => {
				executedVerbs.push(step.verb);
				return true;
			});

			await effectProcessor['resolveSingleStep'](originalStep, effectSource, currentContext, []);
			expect(executedVerbs).toEqual(['additional_cannot_modify', 'original_verb']);
			expect(mockExecuteStepLogic).toHaveBeenCalledWith(additionalCannotModify, effectSource, currentContext, []);
			expect(mockExecuteStepLogic).toHaveBeenCalledWith(originalStep, effectSource, currentContext, []);
			expect(gsm.ruleAdjudicator.getActiveModifiers).toHaveBeenCalledTimes(2); // Once for original, once for additional
		});
	});
});
[end of tests/unit/ModifierSystem.test.ts]
