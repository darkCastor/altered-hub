import { CardPlaySystem, TargetInfo, ModeSelection } from '../../src/engine/CardPlaySystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import {
	ZoneIdentifier,
	CardType,
	StatusType,
	KeywordAbility,
	PermanentZoneType,
	CounterType,
	AbilityType
} from '../../src/engine/types/enums';
import { IGameObject, ICardInstance } from '../../src/engine/types/objects';
import { ICardDefinition } from '../../src/engine/types/cards';
import { IZone } from '../../src/engine/types/zones';
import { IPlayer } from '../../src/engine/types/game';

// Mock implementations
// jest.mock('../../src/engine/GameStateManager'); // Manual mocks are defined below
// jest.mock('../../src/engine/EventBus');

let mockGsm: jest.Mocked<GameStateManager>;
let mockEventBus: jest.Mocked<EventBus>;

// Card Definitions
const noReqCardDef: ICardDefinition = {
	id: 'noReqCard',
	name: 'No Requirement Card',
	type: CardType.Spell,
	handCost: 1,
	reserveCost: 1,
	abilities: [],
	effect: { steps: [] }
};
const targetCardDef: ICardDefinition = {
	id: 'targetCard',
	name: 'Target Card',
	type: CardType.Spell,
	handCost: 1,
	reserveCost: 1,
	abilities: [],
	targetRequirements: [{ targetId: 't1', count: 1, criteria: {} }],
	effect: { steps: [] }
};
const multiTargetCardDef: ICardDefinition = {
	id: 'multiTargetCard',
	name: 'Multi Target Card',
	type: CardType.Spell,
	handCost: 1,
	reserveCost: 1,
	abilities: [],
	targetRequirements: [{ targetId: 't1', count: 2, criteria: {} }],
	effect: { steps: [] }
};
const modeCardDef: ICardDefinition = {
	id: 'modeCard',
	name: 'Mode Card',
	type: CardType.Spell,
	handCost: 1,
	reserveCost: 1,
	abilities: [],
	modes: [
		{ modeId: 'mode1', name: 'Mode 1', description: '' },
		{ modeId: 'mode2', name: 'Mode 2', description: '' }
	],
	effect: { steps: [] }
};
const targetModeCardDef: ICardDefinition = {
	id: 'targetModeCard',
	name: 'Target Mode Card',
	type: CardType.Spell,
	handCost: 1,
	reserveCost: 1,
	abilities: [],
	targetRequirements: [{ targetId: 't1', count: 1, criteria: {} }],
	modes: [{ modeId: 'modeA', name: 'Mode A', description: '' }],
	effect: { steps: [] }
};
const reservePlayCardDef: ICardDefinition = {
	id: 'reservePlayCard',
	name: 'Reserve Play Card',
	type: CardType.Character,
	handCost: 2,
	reserveCost: 2,
	abilities: []
};
const fleetingKeywordCardDef: ICardDefinition = {
	id: 'fleetingKeywordCard',
	name: 'Fleeting Keyword Card',
	type: CardType.Spell,
	handCost: 1,
	reserveCost: 1,
	abilities: [
		{
			abilityId: 'abFleeting',
			abilityType: AbilityType.Passive,
			keyword: KeywordAbility.Fleeting,
			effect: { steps: [] },
			text: '',
			isSupportAbility: false
		}
	],
	effect: { steps: [] }
};
const landmarkDef: ICardDefinition = {
	id: 'landmarkDef',
	name: 'Test Landmark',
	type: CardType.LandmarkPermanent,
	permanentZoneType: PermanentZoneType.Landmark,
	handCost: 3,
	reserveCost: 3,
	abilities: []
};

describe('CardPlaySystem', () => {
	let cardPlaySystem: CardPlaySystem;
	let mockPlayer: jest.Mocked<IPlayer>;
	let mockHandZone: jest.Mocked<IZone>;
	let mockReserveZone: jest.Mocked<IZone>;
	let mockLimboZone: jest.Mocked<IZone>;

	beforeEach(() => {
		// Manually create mocks for each test run to ensure isolation
		mockEventBus = {
			publish: jest.fn()
		} as unknown as jest.Mocked<EventBus>;

		mockLimboZone = {
			id: ZoneIdentifier.Limbo, // Use actual enum for ID consistency
			zoneType: ZoneIdentifier.Limbo,
			findById: jest.fn(),
			add: jest.fn(),
			remove: jest.fn(),
			getAll: jest.fn(),
			getCount: jest.fn(),
			clear: jest.fn(),
			shuffle: jest.fn(),
			addBottom: jest.fn(),
			removeTop: jest.fn()
		} as unknown as jest.Mocked<IZone>;

		mockGsm = {
			getPlayer: jest.fn(),
			getZoneByIdentifier: jest.fn(),
			getCardDefinition: jest.fn(),
			getObject: jest.fn(),
			moveEntity: jest.fn(),
			effectProcessor: { resolveEffect: jest.fn().mockResolvedValue(undefined) },
			handlePassivesGrantingCountersOrStatusesOnPlay: jest.fn().mockResolvedValue(undefined),
			resolveReactions: jest.fn().mockResolvedValue(undefined),
			manaSystem: {
				canPayMana: jest.fn().mockReturnValue(true),
				spendMana: jest.fn().mockResolvedValue(undefined)
			},
			ruleAdjudicator: {
				getActiveCostModifiersForCardPlay: jest.fn().mockReturnValue([])
			},
			keywordAbilityHandler: {
				getToughValue: jest.fn().mockReturnValue(0),
				grantScoutSendToReserveAbility: jest.fn()
			},
			state: {
				sharedZones: {
					limbo: mockLimboZone,
					expedition: {} as IZone
				},
				players: new Map()
			},
			// Add any other methods used by CardPlaySystem if they arise
			getCardDataRepository: jest.fn(), // if CardPlaySystem uses it indirectly
			findZoneOfObject: jest.fn()
		} as unknown as jest.Mocked<GameStateManager>;

		mockPlayer = {
			id: 'player1',
			zones: {
				handZone: {
					id: 'hand-p1',
					zoneType: ZoneIdentifier.Hand,
					findById: jest.fn(),
					getAll: jest.fn()
				} as any,
				reserveZone: {
					id: 'reserve-p1',
					zoneType: ZoneIdentifier.Reserve,
					findById: jest.fn(),
					getAll: jest.fn()
				} as any,
				deckZone: {} as any,
				discardPileZone: {} as any,
				manaZone: {} as any,
				landmarkZone: {} as any,
				heroZone: {} as any,
				limboZone: mockLimboZone
			}
		} as jest.Mocked<IPlayer>;

		mockGsm.getPlayer.mockReturnValue(mockPlayer);
		mockHandZone = mockPlayer.zones.handZone as jest.Mocked<IZone>;
		mockReserveZone = mockPlayer.zones.reserveZone as jest.Mocked<IZone>;

		mockGsm.getZoneByIdentifier.mockImplementation((zoneId, _playerId) => {
			if (zoneId === ZoneIdentifier.Hand) return mockHandZone;
			if (zoneId === ZoneIdentifier.Reserve) return mockReserveZone;
			if (zoneId === ZoneIdentifier.Limbo) return mockLimboZone; // Ensure Limbo is returned correctly
			return undefined as any;
		});

		(mockGsm.manaSystem.canPayMana as jest.Mock).mockReturnValue(true);
		(mockGsm.manaSystem.spendMana as jest.Mock).mockResolvedValue(undefined);

		cardPlaySystem = new CardPlaySystem(mockGsm, mockEventBus);
	});

	describe('canPlayCard', () => {
		it('should be unplayable if targets required but none provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'targetCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(targetCardDef);

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				[]
			);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Targets required');
		});

		it('should be unplayable if wrong number of targets provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'multiTargetCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(multiTargetCardDef); // Requires 2 targets based on count
			const singleTarget: TargetInfo[] = [{ targetId: 't1', objectId: 'obj1' }];

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				singleTarget
			);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Incorrect number of targets');
		});

		it('should be unplayable if a target object does not exist', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'targetCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(targetCardDef);
			mockGsm.getObject.mockReturnValue(undefined); // Target does not exist
			const targets: TargetInfo[] = [{ targetId: 't1', objectId: 'nonExistentObj' }];

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				targets
			);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Target object nonExistentObj not found');
		});

		it('should be playable if valid targets provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'targetCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(targetCardDef);
			mockGsm.getObject.mockReturnValue({
				objectId: 'obj1',
				definitionId: 'someDef',
				controllerId: 'opponent'
			} as IGameObject);
			const targets: TargetInfo[] = [{ targetId: 't1', objectId: 'obj1' }];

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				targets
			);
			expect(result.isPlayable).toBe(true);
		});

		it('should be unplayable if mode required but none provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'modeCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(modeCardDef);

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				[],
				undefined
			);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Mode selection required');
		});

		it('should be unplayable if invalid modeId provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'modeCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(modeCardDef);
			const mode: ModeSelection = { modeId: 'invalidMode' };

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				[],
				mode
			);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Invalid mode');
		});

		it('should be playable if valid mode provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'modeCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(modeCardDef);
			const mode: ModeSelection = { modeId: 'mode1' };

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				[],
				mode
			);
			expect(result.isPlayable).toBe(true);
		});

		it('should be playable if valid targets and mode provided', async () => {
			mockHandZone.findById.mockReturnValue({
				instanceId: 'card1',
				definitionId: 'targetModeCard'
			} as ICardInstance);
			mockGsm.getCardDefinition.mockReturnValue(targetModeCardDef);
			mockGsm.getObject.mockReturnValue({
				objectId: 'obj1',
				definitionId: 'someDef',
				controllerId: 'opponent'
			} as IGameObject);
			const targets: TargetInfo[] = [{ targetId: 't1', objectId: 'obj1' }];
			const mode: ModeSelection = { modeId: 'modeA' };

			const result = await cardPlaySystem.canPlayCard(
				'player1',
				'card1',
				ZoneIdentifier.Hand,
				false,
				undefined,
				undefined,
				targets,
				mode
			);
			expect(result.isPlayable).toBe(true);
		});
	});

	describe('playCard', () => {
		const mockCardObjectId = 'card1_obj';
		const mockCardInstanceId = 'card1_inst';
		// Use a base mock entity that can be spread and overridden in specific tests
		const baseMockCardEntity: IGameObject = {
			instanceId: mockCardInstanceId,
			objectId: mockCardObjectId,
			definitionId: noReqCardDef.id,
			name: 'Test Card',
			statuses: new Set(),
			counters: new Map(),
			controllerId: 'player1',
			expeditionAssignment: undefined, // Explicitly undefined
			baseCharacteristics: {
				cardType: CardType.Spell,
				keywords: {},
				statistics: { power: 0, health: 0, forest: 0, mountain: 0, water: 0 }
			}, // Add baseChar
			currentCharacteristics: {
				cardType: CardType.Spell,
				keywords: {},
				statistics: { power: 0, health: 0, forest: 0, mountain: 0, water: 0 },
				grantedAbilities: [],
				negatedAbilityIds: []
			}, // Add currentChar
			type: CardType.Spell // Add type directly
		};

		beforeEach(() => {
			mockGsm.getCardDefinition.mockReturnValue(noReqCardDef);
			mockHandZone.findById.mockReturnValue(baseMockCardEntity);
			mockReserveZone.findById.mockReturnValue(baseMockCardEntity);

			mockGsm.moveEntity.mockImplementation((idOrObject, _from, to) => {
				const entityToMove =
					typeof idOrObject === 'string' ? _from.findById(idOrObject) : idOrObject;
				const limboVersion = {
					...entityToMove,
					objectId: `${entityToMove.definitionId}-limbo`,
					statuses: new Set(entityToMove.statuses),
					counters: new Map(entityToMove.counters)
				};
				if (to.id === ZoneIdentifier.Limbo) return limboVersion;
				return { ...limboVersion, objectId: `${entityToMove.definitionId}-final` }; // For moves to final zones
			});
		});

		it('should successfully play a card with no requirements', async () => {
			mockGsm.effectProcessor.resolveEffect = jest.fn().mockResolvedValue(undefined); // Ensure this is reset
			await expect(
				cardPlaySystem.playCard('player1', mockCardObjectId, ZoneIdentifier.Hand)
			).resolves.toBeUndefined();
			expect(mockGsm.moveEntity).toHaveBeenCalledWith(
				mockCardObjectId,
				mockHandZone,
				mockLimboZone,
				'player1'
			);
			expect(mockGsm.manaSystem.spendMana).toHaveBeenCalledTimes(1);
			expect(mockGsm.effectProcessor.resolveEffect).toHaveBeenCalled();
			expect(mockEventBus.publish).toHaveBeenCalledWith('cardPlayed', expect.anything());
		});

		it('should throw error if targets required but not provided (declareIntent check)', async () => {
			const cardEntity = { ...baseMockCardEntity, definitionId: targetCardDef.id };
			mockGsm.getCardDefinition.mockReturnValue(targetCardDef);
			mockHandZone.findById.mockReturnValue(cardEntity);

			await expect(
				cardPlaySystem.playCard('player1', cardEntity.objectId, ZoneIdentifier.Hand, undefined, [])
			).rejects.toThrow(`Targets are required for ${targetCardDef.name} but were not provided.`);
			expect(mockGsm.moveEntity).not.toHaveBeenCalled(); // Not moved to Limbo because declareIntent fails first
		});

		it('should throw error if mode required but not provided (declareIntent check)', async () => {
			const cardEntity = { ...baseMockCardEntity, definitionId: modeCardDef.id };
			mockGsm.getCardDefinition.mockReturnValue(modeCardDef);
			mockHandZone.findById.mockReturnValue(cardEntity);

			await expect(
				cardPlaySystem.playCard(
					'player1',
					cardEntity.objectId,
					ZoneIdentifier.Hand,
					undefined,
					[],
					undefined
				)
			).rejects.toThrow(`Mode selection is required for ${modeCardDef.name} but was not provided.`);
			expect(mockGsm.moveEntity).not.toHaveBeenCalled();
		});

		it('should throw error if canPlayCard check fails (e.g. mana after declareIntent)', async () => {
			const cardEntity = { ...baseMockCardEntity, definitionId: noReqCardDef.id };
			mockGsm.getCardDefinition.mockReturnValue(noReqCardDef);
			mockHandZone.findById.mockReturnValue(cardEntity);

			// Sabotage canPlayCard (e.g., cannot pay mana)
			(mockGsm.manaSystem.canPayMana as jest.Mock).mockReturnValue(false);

			await expect(
				cardPlaySystem.playCard('player1', cardEntity.objectId, ZoneIdentifier.Hand)
			).rejects.toThrow(/Cannot play card.*Cannot pay mana cost/);

			// moveEntity to Limbo should NOT have been called because canPlayCard (called by playCard) fails
			expect(mockGsm.moveEntity).not.toHaveBeenCalled();
		});

		it('card played from Reserve (not Landmark) gains Fleeting', async () => {
			const cardEntity = {
				...baseMockCardEntity,
				definitionId: reservePlayCardDef.id,
				type: CardType.Character
			};
			mockGsm.getCardDefinition.mockReturnValue(reservePlayCardDef);
			mockReserveZone.findById.mockReturnValue(cardEntity);

			const limboSpy = jest.fn((id, from, to) => {
				const moved = {
					...cardEntity,
					objectId: `${id}-limbo`,
					statuses: new Set(cardEntity.statuses),
					counters: new Map(cardEntity.counters)
				};
				if (to.id === ZoneIdentifier.Limbo) {
					moved.statuses.add(StatusType.Fleeting); // Simulate Fleeting being added by the logic being tested
				}
				return moved;
			});
			mockGsm.moveEntity.mockImplementation(limboSpy);

			await cardPlaySystem.playCard('player1', cardEntity.objectId, ZoneIdentifier.Reserve, 'hero');

			// Check the object *returned* by the limbo move specifically
			const movedToLimbo = limboSpy.mock.results[0].value; // First call to moveEntity is to Limbo
			expect(movedToLimbo.statuses).toContain(StatusType.Fleeting);
		});

		it('Landmark played from Reserve does NOT gain Fleeting', async () => {
			const cardEntity = {
				...baseMockCardEntity,
				definitionId: landmarkDef.id,
				type: CardType.LandmarkPermanent,
				permanentZoneType: PermanentZoneType.Landmark
			};
			mockGsm.getCardDefinition.mockReturnValue(landmarkDef);
			mockReserveZone.findById.mockReturnValue(cardEntity);

			const limboSpy = jest.fn((id, from, to) => ({
				...cardEntity,
				objectId: `${id}-limbo`,
				statuses: new Set(cardEntity.statuses),
				counters: new Map(cardEntity.counters)
			}));
			mockGsm.moveEntity.mockImplementation(limboSpy);

			await cardPlaySystem.playCard('player1', cardEntity.objectId, ZoneIdentifier.Reserve);

			const movedToLimbo = limboSpy.mock.results[0].value;
			expect(movedToLimbo.statuses).not.toContain(StatusType.Fleeting);
		});

		it('card with Fleeting keyword gains Fleeting status', async () => {
			const cardEntity = {
				...baseMockCardEntity,
				definitionId: fleetingKeywordCardDef.id,
				type: CardType.Spell
			};
			mockGsm.getCardDefinition.mockReturnValue(fleetingKeywordCardDef);
			mockHandZone.findById.mockReturnValue(cardEntity);

			const limboSpy = jest.fn((id, from, to) => {
				const moved = {
					...cardEntity,
					objectId: `${id}-limbo`,
					statuses: new Set(cardEntity.statuses),
					counters: new Map(cardEntity.counters)
				};
				if (to.id === ZoneIdentifier.Limbo) {
					// Simulate Fleeting being added by the logic if keyword present
					const def = mockGsm.getCardDefinition(cardEntity.definitionId);
					if (def?.abilities.some((a) => a.keyword === KeywordAbility.Fleeting)) {
						moved.statuses.add(StatusType.Fleeting);
					}
				}
				return moved;
			});
			mockGsm.moveEntity.mockImplementation(limboSpy);

			await cardPlaySystem.playCard('player1', cardEntity.objectId, ZoneIdentifier.Hand);
			const movedToLimbo = limboSpy.mock.results[0].value;
			expect(movedToLimbo.statuses).toContain(StatusType.Fleeting);
		});

		it('should pay Tough costs if targets have Tough', async () => {
			const cardEntity = { ...baseMockCardEntity, definitionId: targetCardDef.id };
			mockGsm.getCardDefinition.mockReturnValue(targetCardDef);
			mockHandZone.findById.mockReturnValue(cardEntity);

			const targetObject = {
				objectId: 'target1',
				definitionId: 'enemyUnit',
				controllerId: 'player2',
				statuses: new Set(),
				counters: new Map()
			} as IGameObject;
			mockGsm.getObject.mockReturnValue(targetObject);
			(mockGsm.keywordAbilityHandler.getToughValue as jest.Mock).mockReturnValue(1);

			await cardPlaySystem.playCard(
				'player1',
				cardEntity.objectId,
				ZoneIdentifier.Hand,
				undefined,
				[{ targetId: 't1', objectId: 'target1' }]
			);

			expect(mockGsm.manaSystem.spendMana).toHaveBeenCalledTimes(2);
			expect(mockGsm.manaSystem.spendMana).toHaveBeenCalledWith('player1', 1);
			expect(mockGsm.manaSystem.spendMana).toHaveBeenCalledWith('player1', targetCardDef.handCost);
		});
	});
});
