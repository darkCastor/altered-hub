// tests/unit/RuleAdjudicator.test.ts
import { RuleAdjudicator } from '../../src/engine/RuleAdjudicator';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { ObjectFactory } from '../../src/engine/ObjectFactory';
import { EventBus } from '../../src/engine/EventBus';
import type { IGameObject } from '../../src/engine/types/objects';
import type { IAbility, IEffectStep } from '../../src/engine/types/abilities';
import { AbilityType, CardType } from '../../src/engine/types/enums';
import { EffectProcessor } from '../../src/engine/EffectProcessor'; // Needed for gsm.effectProcessor

// Mock dependencies
jest.mock('../../src/engine/GameStateManager');
jest.mock('../../src/engine/ObjectFactory');
jest.mock('../../src/engine/EventBus');
jest.mock('../../src/engine/EffectProcessor');


describe('RuleAdjudicator', () => {
	let gsm: jest.Mocked<GameStateManager>;
	let objectFactory: jest.Mocked<ObjectFactory>;
	let eventBus: jest.Mocked<EventBus>;
	let effectProcessor: jest.Mocked<EffectProcessor>;
	let ruleAdjudicator: RuleAdjudicator;

	const createMockGameObject = (id: string, controllerId: string, abilities: IAbility[] = [], timestamp: number = 0): IGameObject => ({
		objectId: id,
		definitionId: `def-${id}`,
		name: `TestObject ${id}`,
		type: CardType.Character, // Default type
		baseCharacteristics: { abilities: abilities.map(a => ({...a})) }, // Store base abilities here
		currentCharacteristics: { abilities: abilities.map(a => ({...a})) }, // current starts same as base
		ownerId: controllerId,
		controllerId,
		timestamp,
		statuses: new Set(),
		counters: new Map(),
		abilities: abilities.map(a => ({...a})), // Live abilities on object
		isToken: false,
		expeditionAssignment: undefined,
		abilityActivationsToday: new Map(),
	});

	const createMockAbility = (id: string, effectSteps: IEffectStep[] = [], text: string = `Ability ${id}`, type: AbilityType = AbilityType.Passive): IAbility => ({
		abilityId: id,
		abilityType: type,
		effect: { steps: effectSteps },
		text,
		isSupportAbility: false,
		reactionActivationsToday: 0,
		sourceObjectId: '', // Will be set when added to an object or when processing
	});

	beforeEach(() => {
		// Manually create fresh mocks for each test
		eventBus = new EventBus() as jest.Mocked<EventBus>; // No methods needed for these tests yet

		// Mock GameStateManager methods that RuleAdjudicator uses
		const mockGsmInstance = {
			getObject: jest.fn(),
			effectProcessor: { // Mocking the effectProcessor property on GSM
				resolveTargetsForDependency: jest.fn().mockImplementation((targets, sourceId, _payload) => {
					if (targets === 'self' && sourceId) return [sourceId];
					if (Array.isArray(targets)) return targets; // Simplistic mock
					return [];
				}),
				findZoneByTypeForDependency: jest.fn().mockReturnValue(null), // Default to null
			} as any, // Cast to any to satisfy the type if only subset is mocked
			// Add other methods if RuleAdjudicator starts using them
		} as unknown as jest.Mocked<GameStateManager>;

		gsm = mockGsmInstance;

		// ObjectFactory might not be directly used by RuleAdjudicator, but GSM needs it.
		// For RuleAdjudicator tests, direct interactions with ObjectFactory are less common.
		objectFactory = new ObjectFactory(new Map()) as jest.Mocked<ObjectFactory>;
		gsm.objectFactory = objectFactory; // Assign to the mocked GSM if it needs it

		ruleAdjudicator = new RuleAdjudicator(gsm);
	});

	describe('Dependency Sorting (doesADependOnB)', () => {
		it('B should apply before A if A depends on a keyword B grants', () => {
			const abilityA_Effect: IEffectStep = { verb: 'do_something', targets: 'self', parameters: { conditionKeyword: 'TestKeyword' }};
			const abilityA = createMockAbility('A1', [abilityA_Effect], 'Ability A depends on TestKeyword');
			abilityA.effect.targetCriteria = { keyword: 'TestKeyword' } as any; // Simplified criteria

			const abilityB_Effect: IEffectStep = { verb: 'grant_keyword', targets: 'self', parameters: { keyword: 'TestKeyword' }};
			const abilityB = createMockAbility('B1', [abilityB_Effect], 'Ability B grants TestKeyword');

			const objA = createMockGameObject('objA', 'player1', [abilityA], 1);
			const objB = createMockGameObject('objB', 'player1', [abilityB], 2);
			abilityA.sourceObjectId = 'objA';
			abilityB.sourceObjectId = 'objB';

			gsm.getObject.mockImplementation((id) => {
				if (id === 'objA') return objA;
				if (id === 'objB') return objB;
				return undefined;
			});
			// Mock resolveTargetsForDependency for B's grant_keyword step
			// Assuming B targets objA to grant the keyword that A on objA needs
			gsm.effectProcessor.resolveTargetsForDependency.mockImplementation((targetSpec, sourceId) => {
				if (sourceId === 'objB' && targetSpec === 'self') return ['objA']; // B grants to A's source
				return [sourceId];
			});

			// A depends on B because B grants 'TestKeyword' which A's targetCriteria needs.
			// This means B's effect changes what A applies to (Rule 2.3.2.e)
			const result = (ruleAdjudicator as any).doesADependOnB(abilityA, abilityB, [abilityA, abilityB]);
			expect(result).toBe(true);
		});

		it('A should apply and B should not if A removes B', () => {
			const abilityB = createMockAbility('B2', [], 'Ability B to be removed');
			const abilityA_Effect: IEffectStep = { verb: 'lose_ability', targets: 'self', parameters: { abilityId: 'B2' }};
			const abilityA = createMockAbility('A2', [abilityA_Effect], 'Ability A removes B2');

			const objWithBoth = createMockGameObject('objWithBoth', 'player1', [abilityA, abilityB], 1);
			abilityA.sourceObjectId = 'objWithBoth';
			abilityB.sourceObjectId = 'objWithBoth';

			gsm.getObject.mockReturnValue(objWithBoth);
			gsm.effectProcessor.resolveTargetsForDependency.mockReturnValue(['objWithBoth']); // A targets its own source to remove B

			// A depends on B (because B is the ability A would remove, so B must exist for A to target its removal - this is a bit counter-intuitive for sorting,
			// but the rule is "B's application could change A's existence, text, or how it applies."
			// More accurately: A's application depends on B's prior existence.
			// For sorting: If A removes B, B should ideally not be in the "unapplied" list when A is considered, or A's effect on B is "later".
			// The current rule 2.3.2.d "B removes or negates A" means B's effect step verb is 'lose_ability' and targets A.
			// Here, A's effect step verb is 'lose_ability' and targets B.
			// So, doesADependOnB(abilityB, abilityA) should be true.
			const bDependsOnA = (ruleAdjudicator as any).doesADependOnB(abilityB, abilityA, [abilityA, abilityB]);
			expect(bDependsOnA).toBe(true); // B depends on A because A removes B.
		});

		it('should sort by timestamp for circular dependencies', () => {
            // A's effect relies on power, B sets power. B's effect relies on subtype, A sets subtype.
            const abilityA = createMockAbility('A_circ', [{ verb: 'set_subtype', targets: 'self', parameters: { subType: 'Goblin' } }], 'A sets subtype, needs power');
            abilityA.text = 'My power is X'; // Implies it reads power for its effect magnitude

            const abilityB = createMockAbility('B_circ', [{ verb: 'set_characteristic', targets: 'self', parameters: { characteristic: 'power', value: 5 } }], 'B sets power, needs subtype Goblin');
            abilityB.effect.targetCriteria = { subType: 'Goblin' } as any; // Implies its targeting/condition depends on subtype

            const objA = createMockGameObject('objA_circ', 'p1', [abilityA], 10); // Earlier timestamp
            const objB = createMockGameObject('objB_circ', 'p1', [abilityB], 20); // Later timestamp
            abilityA.sourceObjectId = 'objA_circ';
            abilityB.sourceObjectId = 'objB_circ';

            gsm.getObject.mockImplementation(id => id === 'objA_circ' ? objA : id === 'objB_circ' ? objB : undefined);
            gsm.effectProcessor.resolveTargetsForDependency.mockImplementation((_ts, srcId) => [srcId]);


            // A depends on B (B sets power, A's text mentions power)
            // B depends on A (A sets subtype, B's targetCriteria depends on subtype)
            // This is a circular dependency.
            const aDependsOnB = (ruleAdjudicator as any).doesADependOnB(abilityA, abilityB, [abilityA, abilityB]);
            const bDependsOnA = (ruleAdjudicator as any).doesADependOnB(abilityB, abilityA, [abilityA, abilityB]);
            expect(aDependsOnB).toBe(true);
            expect(bDependsOnA).toBe(true);

            // sortAbilitiesByDependency should resolve by timestamp
            const sorted = (ruleAdjudicator as any).sortAbilitiesByDependency([abilityB, abilityA]); // Pass in reverse timestamp order
            expect(sorted[0].abilityId).toBe('A_circ'); // objA has earlier timestamp
            expect(sorted[1].abilityId).toBe('B_circ');
        });
	});

	describe('Granting/Losing Abilities', () => {
		let sourceObject: IGameObject;
		const baseAbility = createMockAbility('base1', [], 'Base Ability');
		const grantedAbilityDef = { id: 'grantedDef1', abilityType: AbilityType.Passive, effect: { steps: [{ verb: 'test_effect', targets: 'self' }] }, text: 'Granted Passive' };

		beforeEach(() => {
			sourceObject = createMockGameObject('srcObj', 'p1', [baseAbility]);
			baseAbility.sourceObjectId = sourceObject.objectId;
			// Reset granted/negated for each test
			sourceObject.currentCharacteristics.grantedAbilities = [];
			sourceObject.currentCharacteristics.negatedAbilityIds = [];

			// Mock ObjectFactory.createAbility if it's called by _grantAbility directly (it is in the spec)
			// For these tests, _grantAbility and _loseAbility are internal to applyAbility,
			// so we test their effects via applyAllPassiveAbilities or by checking characteristics.
		});

		it('passive ability grants another ability, which is then collected', () => {
			const grantingEffect: IEffectStep = { verb: 'grant_ability', targets: 'self', parameters: { ability: grantedAbilityDef }};
			const grantingAbility = createMockAbility('granting1', [grantingEffect]);
			grantingAbility.sourceObjectId = sourceObject.objectId;

			sourceObject.abilities.push(grantingAbility); // Add granting ability to the object
			sourceObject.baseCharacteristics.abilities?.push(grantingAbility);
			sourceObject.currentCharacteristics.abilities?.push(grantingAbility);

			gsm.getObject.mockReturnValue(sourceObject);
			// Mock createAbility to return a valid IAbility
			const mockCreatedGrantedAbility = {...createMockAbility(grantedAbilityDef.id, grantedAbilityDef.effect.steps, grantedAbilityDef.text), sourceObjectId: sourceObject.objectId };
			(objectFactory.createAbility as jest.Mock).mockReturnValue(mockCreatedGrantedAbility);


			// Apply the granting ability
			(ruleAdjudicator as any).applyAbility(grantingAbility);

			expect(sourceObject.currentCharacteristics.grantedAbilities).toHaveLength(1);
			expect(sourceObject.currentCharacteristics.grantedAbilities![0].abilityId).toBe(grantedAbilityDef.id);

			// Now, test applyAllPassiveAbilities to see if the granted one is collected
			// Reset mocks for getAllPlayObjects and getObject for a clean test of applyAllPassiveAbilities
			(ruleAdjudicator as any).getAllPlayObjects = jest.fn().mockReturnValue([sourceObject]);
			gsm.getObject.mockImplementation(id => id === sourceObject.objectId ? sourceObject : undefined);

			// Clear reactionActivationsToday for all abilities before sorting
			sourceObject.abilities.forEach(a => a.reactionActivationsToday = 0);
			(sourceObject.currentCharacteristics.grantedAbilities || []).forEach(a => a.reactionActivationsToday = 0);


			const sortedAbilities = (ruleAdjudicator as any).sortAbilitiesByDependency(
				(ruleAdjudicator as any).gatherAndFilterAbilities([sourceObject]) // Assume helper exists or test applyAllPassiveAbilities directly
			);

			// Expect base, granting, and the granted ability to be in the sorted list
			// The exact order depends on dependencies, but all should be present if not negated.
			const abilityIds = sortedAbilities.map((a: IAbility) => a.abilityId);
			expect(abilityIds).toContain('base1');
			expect(abilityIds).toContain('granting1');
			expect(abilityIds).toContain(grantedAbilityDef.id);
		});

		it('passive ability negates a base ability, which is then not collected', () => {
			const negatingEffect: IEffectStep = { verb: 'lose_ability', targets: 'self', parameters: { abilityId: 'base1' }};
			const negatingAbility = createMockAbility('negating1', [negatingEffect]);
			negatingAbility.sourceObjectId = sourceObject.objectId;

			sourceObject.abilities.push(negatingAbility);
			sourceObject.baseCharacteristics.abilities?.push(negatingAbility);
			sourceObject.currentCharacteristics.abilities?.push(negatingAbility);

			gsm.getObject.mockReturnValue(sourceObject);

			// Apply the negating ability
			(ruleAdjudicator as any).applyAbility(negatingAbility);

			expect(sourceObject.currentCharacteristics.negatedAbilityIds).toContain('base1');

			// Test applyAllPassiveAbilities collection
			(ruleAdjudicator as any).getAllPlayObjects = jest.fn().mockReturnValue([sourceObject]);
			gsm.getObject.mockImplementation(id => id === sourceObject.objectId ? sourceObject : undefined);

			const collectedAbilities = (ruleAdjudicator as any).gatherAndFilterAbilities([sourceObject]);
			const abilityIds = collectedAbilities.map((a: IAbility) => a.abilityId);

			expect(abilityIds).not.toContain('base1');
			expect(abilityIds).toContain('negating1');
		});

		it('applyAllPassiveAbilities should correctly apply granted abilities in a subsequent pass (conceptual)', () => {
			// Setup: Obj1 has BaseAbility1 and GrantingAbility1 (grants GrantedAbility1 to Obj1)
			// Obj2 has BaseAbility2
			// GrantedAbility1 modifies a characteristic (e.g., adds a keyword "Supercharged")

			const grantedEffectStep: IEffectStep = { verb: 'grant_keyword', targets: 'self', parameters: { keyword: 'Supercharged' } };
			const grantedAbilityDefForGranting = { id: 'granted1', abilityType: AbilityType.Passive, effect: { steps: [grantedEffectStep] }, text: 'Granted Supercharge' };
			const grantingEffectStep: IEffectStep = { verb: 'grant_ability', targets: 'self', parameters: { ability: grantedAbilityDefForGranting }};
			const grantingAbility = createMockAbility('grantingMain', [grantingEffectStep], 'Grants Supercharge Ability');

			const baseAbility1 = createMockAbility('baseA1', [], 'Base A1');
			const obj1 = createMockGameObject('obj1', 'p1', [baseAbility1, grantingAbility], 1);
			grantingAbility.sourceObjectId = obj1.objectId;
			baseAbility1.sourceObjectId = obj1.objectId;

			const obj2 = createMockGameObject('obj2', 'p1', [createMockAbility('baseB1', [], 'Base B1')], 2);
			obj2.abilities[0].sourceObjectId = obj2.objectId;

			// Mock GSM calls
			gsm.getObject.mockImplementation(id => {
				if (id === 'obj1') return obj1;
				if (id === 'obj2') return obj2;
				return undefined;
			});
			(ruleAdjudicator as any).getAllPlayObjects = jest.fn().mockReturnValue([obj1, obj2]);

			// Mock ObjectFactory for the grant_ability step
			const mockCreatedGrantedAbility = {...createMockAbility(grantedAbilityDefForGranting.id, grantedAbilityDefForGranting.effect.steps, grantedAbilityDefForGranting.text), sourceObjectId: obj1.objectId };
			(objectFactory.createAbility as jest.Mock).mockReturnValue(mockCreatedGrantedAbility);


			// --- First Pass of applyAllPassiveAbilities ---
			// This pass will apply 'grantingMain', which should add 'granted1' to obj1.currentCharacteristics.grantedAbilities
			ruleAdjudicator.applyAllPassiveAbilities();

			// Check that 'granted1' was added
			expect(obj1.currentCharacteristics.grantedAbilities?.find(a => a.abilityId === 'granted1')).toBeDefined();
			// Check that 'Supercharged' is NOT YET on obj1 because granted abilities apply on the NEXT full pass
			expect((obj1.currentCharacteristics as any).hasSupercharged).toBeUndefined();


			// --- Simulate state for a "Next Pass" of applyAllPassiveAbilities ---
			// For the "next pass", the granted ability is now part of the pool from the start.
			// We need to reset currentCharacteristics as applyAllPassiveAbilities does, but keep the granted ability.
			// The actual applyAllPassiveAbilities will re-gather, including from grantedAbilities.

			// Reset characteristics but manually preserve the granted ability for the next conceptual pass
			// This simulates that grantedAbilities are populated from the previous pass's effects.
			const previouslyGranted = obj1.currentCharacteristics.grantedAbilities;
			obj1.currentCharacteristics = { ...obj1.baseCharacteristics, grantedAbilities: previouslyGranted, negatedAbilityIds: [] };
			obj2.currentCharacteristics = { ...obj2.baseCharacteristics, grantedAbilities: [], negatedAbilityIds: [] };

			// Ensure abilities on currentCharacteristics also have their NIF counters reset (as if new pass)
			obj1.abilities.forEach(a => a.reactionActivationsToday = 0);
			(obj1.currentCharacteristics.grantedAbilities || []).forEach(a => a.reactionActivationsToday = 0);
			obj2.abilities.forEach(a => a.reactionActivationsToday = 0);


			// --- Second Pass of applyAllPassiveAbilities ---
			// This pass should collect 'granted1' and apply its effect.
			ruleAdjudicator.applyAllPassiveAbilities();

			// Now check that 'Supercharged' IS on obj1
			expect((obj1.currentCharacteristics as any).hasSupercharged).toBe(true); // or whatever grant_keyword does
		});

	});

	describe('Passive Ability Scope - HeroZone', () => {
		let hero: IGameObject;
		let passiveAbility: IAbility;
		let player1: any;
		let player2: any; // For testing opponent interactions if necessary

		beforeEach(() => {
			passiveAbility = createMockAbility('heroPassive1', [{ verb: 'modify_statistics', targets: 'self', parameters: { power: 1 } }], 'Grants +1 Power');
			hero = createMockGameObject('hero1', 'player1', [passiveAbility]);
			hero.type = CardType.Hero;
			passiveAbility.sourceObjectId = hero.objectId; // Set sourceObjectId

			// Mock zones for players
			player1 = {
				playerId: 'player1',
				zones: {
					heroZone: { zoneType: 'HeroZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player1' },
					handZone: { zoneType: 'HandZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player1' },
					discardPileZone: { zoneType: 'DiscardPileZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player1' },
					expeditionZone: { zoneType: 'ExpeditionZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player1' }, // Individual expedition for player1
					landmarkZone: { zoneType: 'LandmarkZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player1' },
				},
			};
			player2 = { // Opponent, if needed for specific tests
				playerId: 'player2',
				zones: {
					heroZone: { zoneType: 'HeroZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player2' },
					expeditionZone: { zoneType: 'ExpeditionZone', getAll: jest.fn().mockReturnValue([]), controllerId: 'player2' },
				},
			};

			// Mock gsm.state.players
			const playersMap = new Map();
			playersMap.set('player1', player1);
			playersMap.set('player2', player2);
			gsm.state = { players: playersMap } as any; // Simplified state mock

			// Default mock for getObject
			gsm.getObject.mockImplementation(id => {
				if (id === hero.objectId) return hero;
				return undefined;
			});

			// Default mock for getAllPlayObjects (can be overridden in tests)
			// This mock represents objects in Expedition/Landmark zones.
			(ruleAdjudicator as any).getAllPlayObjects = jest.fn().mockReturnValue([]);

			// Reset hero characteristics
			hero.currentCharacteristics = {
				...hero.baseCharacteristics,
				grantedAbilities: [],
				negatedAbilityIds: [],
				statistics: { power: 0, health: 0, forest: 0, mountain: 0, water: 0 },
				keywords: {},
			};
			hero.baseCharacteristics.statistics = { power: 0, health: 0, forest: 0, mountain: 0, water: 0 };
		});

		it('Hero in HeroZone should have its passive ability active', () => {
			player1.zones.heroZone.getAll.mockReturnValue([hero]); // Hero is in Player 1's HeroZone

			ruleAdjudicator.applyAllPassiveAbilities();

			expect(hero.currentCharacteristics.statistics?.power).toBe(1);
		});

		it('Hero in HandZone should NOT have its passive ability active', () => {
			player1.zones.handZone.getAll.mockReturnValue([hero]); // Hero is in Player 1's HandZone
			// Ensure it's not accidentally in heroZone from a previous mock
			player1.zones.heroZone.getAll.mockReturnValue([]);

			ruleAdjudicator.applyAllPassiveAbilities();

			expect(hero.currentCharacteristics.statistics?.power).toBe(0);
		});

		it('Hero in DiscardPileZone should NOT have its passive ability active', () => {
			player1.zones.discardPileZone.getAll.mockReturnValue([hero]); // Hero is in Player 1's DiscardPileZone
			player1.zones.heroZone.getAll.mockReturnValue([]);

			ruleAdjudicator.applyAllPassiveAbilities();

			expect(hero.currentCharacteristics.statistics?.power).toBe(0);
		});

		it('Hero in another players HeroZone should have its passive ability active (global application)', () => {
			player2.zones.heroZone.getAll.mockReturnValue([hero]); // Hero is in Player 2's HeroZone
			hero.controllerId = 'player2'; // Change controller to player2
			passiveAbility.sourceObjectId = hero.objectId; // Ensure sourceObjectId is still correct

			// Reset hero characteristics for this specific scenario with new controller
			hero.currentCharacteristics = {
				...hero.baseCharacteristics,
				controllerId: 'player2', // Update controller in characteristics
				grantedAbilities: [],
				negatedAbilityIds: [],
				statistics: { power: 0, health: 0, forest: 0, mountain: 0, water: 0 },
				keywords: {},
			};
			hero.baseCharacteristics.statistics = { power: 0, health: 0, forest: 0, mountain: 0, water: 0 };
			hero.baseCharacteristics.controllerId = 'player2';


			gsm.getObject.mockImplementation(id => { // Ensure getObject returns the hero
				if (id === hero.objectId) return hero;
				return undefined;
			});

			ruleAdjudicator.applyAllPassiveAbilities();

			expect(hero.currentCharacteristics.statistics?.power).toBe(1);
		});

		it('Non-Hero in ExpeditionZone should have its passive ability active', () => {
			const nonHeroPassive = createMockAbility('nonHeroPassive', [{ verb: 'modify_statistics', targets: 'self', parameters: { health: 5 } }], '+5 Health');
			const nonHero = createMockGameObject('nonHero1', 'player1', [nonHeroPassive]);
			nonHero.type = CardType.Character; // Ensure it's not a Hero
			nonHeroPassive.sourceObjectId = nonHero.objectId;

			nonHero.currentCharacteristics = {
				...nonHero.baseCharacteristics,
				grantedAbilities: [],
				negatedAbilityIds: [],
				statistics: { power: 0, health: 0, forest: 0, mountain: 0, water: 0 },
				keywords: {},
			};
			nonHero.baseCharacteristics.statistics = { power: 0, health: 0, forest: 0, mountain: 0, water: 0 };

			// Mock that this nonHero object is returned by getAllPlayObjects
			(ruleAdjudicator as any).getAllPlayObjects = jest.fn().mockReturnValue([nonHero]);
			gsm.getObject.mockImplementation(id => { // Ensure getObject can find this nonHero
				if (id === nonHero.objectId) return nonHero;
				return undefined;
			});


			ruleAdjudicator.applyAllPassiveAbilities();

			expect(nonHero.currentCharacteristics.statistics?.health).toBe(5);
		});

		it('Hero in HeroZone AND Non-Hero in Expedition should BOTH have passives active', () => {
			player1.zones.heroZone.getAll.mockReturnValue([hero]); // Hero in P1's HeroZone

			const nonHeroPassive = createMockAbility('nonHeroPassiveExp', [{ verb: 'modify_statistics', targets: 'self', parameters: { health: 3 } }], '+3 Health');
			const nonHeroExp = createMockGameObject('nonHeroExp1', 'player1', [nonHeroPassive]);
			nonHeroExp.type = CardType.Structure;
			nonHeroPassive.sourceObjectId = nonHeroExp.objectId;

			nonHeroExp.currentCharacteristics = {
				...nonHeroExp.baseCharacteristics,
				grantedAbilities: [],
				negatedAbilityIds: [],
				statistics: { power: 0, health: 0, forest: 0, mountain: 0, water: 0 },
				keywords: {},
			};
			nonHeroExp.baseCharacteristics.statistics = { power: 0, health: 0, forest: 0, mountain: 0, water: 0 };

			(ruleAdjudicator as any).getAllPlayObjects = jest.fn().mockReturnValue([nonHeroExp]);

			gsm.getObject.mockImplementation(id => {
				if (id === hero.objectId) return hero;
				if (id === nonHeroExp.objectId) return nonHeroExp;
				return undefined;
			});

			ruleAdjudicator.applyAllPassiveAbilities();

			expect(hero.currentCharacteristics.statistics?.power).toBe(1);
			expect(nonHeroExp.currentCharacteristics.statistics?.health).toBe(3);
		});
	});
});
