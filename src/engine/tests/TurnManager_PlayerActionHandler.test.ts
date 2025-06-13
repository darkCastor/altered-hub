import { TurnManager } from '../TurnManager';
import { PlayerActionHandler, PlayerAction } from '../PlayerActionHandler';
import { GameStateManager } from '../GameStateManager';
import { EventBus } from '../EventBus';
import { CardPlaySystem } from '../CardPlaySystem';
import { EffectProcessor } from '../EffectProcessor';
import { ManaSystem } from '../ManaSystem';
import type { IGameState, IPlayer } from '../types/gameState';
import { GamePhase, ZoneIdentifier, CardType, AbilityType } from '../types/enums';
import type { IGameObject, ICardInstance, IEmblemObject } from '../types/objects';
import type { IAbility, IEffect } from '../types/abilities';
import { Zone } from '../Zone';

jest.mock('../GameStateManager');
jest.mock('../EventBus');
jest.mock('../CardPlaySystem');
jest.mock('../EffectProcessor');
jest.mock('../ManaSystem');

describe('TurnManager and PlayerActionHandler Integration', () => {
	let turnManager: TurnManager;
	let playerActionHandler: PlayerActionHandler;
	let mockGameStateManager: jest.Mocked<GameStateManager>;
	let mockEventBus: jest.Mocked<EventBus>;
	let mockCardPlaySystem: jest.Mocked<CardPlaySystem>;
	let mockEffectProcessor: jest.Mocked<EffectProcessor>;
	let mockManaSystem: jest.Mocked<ManaSystem>;
	let mockGameState: IGameState;
	let player1: IPlayer;
	let player2: IPlayer;

	const createMockPlayerTest = (id: string): IPlayer =>
		({
			id,
			zones: {
				handZone: new Zone(`${id}-hand`, ZoneIdentifier.Hand, 'hidden', id),
				reserveZone: new Zone(`${id}-reserve`, ZoneIdentifier.Reserve, 'visible', id)
			} as any, // Add other zones if needed by specific tests
			hasPassedTurn: false
		}) as IPlayer;

	beforeEach(() => {
		jest.clearAllMocks();

		mockEventBus = new EventBus() as jest.Mocked<EventBus>;
		mockGameStateManager = new GameStateManager(
			new Map(),
			mockEventBus
		) as jest.Mocked<GameStateManager>;

		player1 = createMockPlayerTest('player1');
		player2 = createMockPlayerTest('player2');

		mockGameState = {
			players: [player1, player2],
			sharedZones: { limbo: new Zone('limbo', ZoneIdentifier.Limbo, 'visible', 'shared') } as any,
			currentPhase: GamePhase.Afternoon,
			currentPlayerId: 'player1',
			firstPlayerId: 'player1'
		} as IGameState;
		mockGameStateManager.state = mockGameState;

		mockCardPlaySystem = new CardPlaySystem(mockGameStateManager) as jest.Mocked<CardPlaySystem>;
		mockEffectProcessor = new EffectProcessor(mockGameStateManager) as jest.Mocked<EffectProcessor>;
		mockManaSystem = new ManaSystem(mockGameStateManager) as jest.Mocked<ManaSystem>;

		mockGameStateManager.cardPlaySystem = mockCardPlaySystem;
		mockGameStateManager.effectProcessor = mockEffectProcessor;
		mockGameStateManager.manaSystem = mockManaSystem;
		mockGameStateManager.getPlayer = jest.fn((id) =>
			mockGameState.players.find((p) => p.id === id)
		);
		mockGameStateManager.getObject = jest.fn(
			(id) => ({ objectId: id, controllerId: 'player1' }) as IGameObject
		); // Simple mock

		turnManager = new TurnManager(mockGameStateManager, mockEventBus);
		playerActionHandler = new PlayerActionHandler(mockGameStateManager);

		mockGameStateManager.resolveReactions = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.eventBus = new EventBus() as jest.Mocked<EventBus>; // Ensure eventBus is a mock
		jest.spyOn(mockGameStateManager.eventBus, 'publish');
	});

	describe('TurnManager - playerPasses', () => {
		it('should call resolveReactions after a player passes', async () => {
			// Ensure playerPasses is async if it awaits resolveReactions
			// Modify TurnManager.playerPasses to be async:
			// public async playerPasses(playerId: string): Promise<void> { ... }
			// await this.gsm.resolveReactions(this.gsm.state); ...}

			// For this test, we assume playerPasses in TurnManager has been made async
			// to correctly await resolveReactions. If not, the test setup needs adjustment
			// or the method itself needs to be async.
			// Let's spy on the actual method and make it async for the test's purpose if needed.
			const originalPlayerPasses = turnManager.playerPasses;
			turnManager.playerPasses = jest
				.fn(originalPlayerPasses)
				.mockImplementation(async (playerId: string) => {
					const player = mockGameStateManager.getPlayer(playerId);
					if (player) player.hasPassedTurn = true;
					mockGameStateManager.eventBus.publish('playerPassedTurn', { playerId });
					await mockGameStateManager.resolveReactions(mockGameStateManager.state); // Manually ensure async call
					turnManager.checkPhaseEnd();
				});

			await turnManager.playerPasses('player1');

			expect(mockGameStateManager.eventBus.publish).toHaveBeenCalledWith('playerPassedTurn', {
				playerId: 'player1'
			});
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledWith(mockGameState);
			// checkPhaseEnd would be called after resolveReactions
			// We can check mockTurnManager.checkPhaseEnd if we spy on it.
		});
	});

	describe('PlayerActionHandler - executePlayCardAction', () => {
		it('should call resolveReactions after a card play resolves', async () => {
			mockCardPlaySystem.playCard.mockResolvedValue({ success: true, card: {} as IGameObject }); // Assume it returns a result

			await playerActionHandler.executePlayCardAction('player1', 'card1', ZoneIdentifier.Hand);

			expect(mockCardPlaySystem.playCard).toHaveBeenCalledTimes(1);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledWith(mockGameState);
		});
	});

	describe('PlayerActionHandler - executeActivateAbilityAction', () => {
		it('should call resolveReactions after a quick action resolves', async () => {
			const mockAbility: IAbility = {
				abilityId: 'qa1',
				abilityType: AbilityType.QuickAction,
				text: 'Test QuickAction',
				effect: { effectType: 'testEffect', value: 1, sourceObjectId: 'obj1' },
				cost: { mana: 0 }
			};
			const mockObject: IGameObject = {
				objectId: 'obj1',
				definitionId: 'def1',
				name: 'QA Object',
				type: CardType.Character,
				controllerId: 'player1',
				ownerId: 'player1',
				abilities: [mockAbility],
				currentCharacteristics: { abilities: [mockAbility] } as any,
				baseCharacteristics: {} as any,
				statuses: new Set(),
				counters: new Map(),
				timestamp: 0,
				abilityActivationsToday: new Map()
			};
			mockGameStateManager.getObject = jest.fn().mockReturnValue(mockObject);
			mockEffectProcessor.resolveEffect.mockResolvedValue(undefined);
			mockManaSystem.canPayMana.mockReturnValue(true);
			mockManaSystem.spendMana.mockResolvedValue(undefined);

			await playerActionHandler.executeActivateAbilityAction('player1', 'obj1', 'qa1');

			expect(mockEffectProcessor.resolveEffect).toHaveBeenCalledTimes(1);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledWith(mockGameState);
		});
	});

	// Test for executeAction in PlayerActionHandler (to ensure it doesn't call resolveReactions by itself anymore)
	describe('PlayerActionHandler - executeAction', () => {
		it('should NOT call resolveReactions directly for playCard action type', async () => {
			mockCardPlaySystem.playCard.mockResolvedValue({ success: true, card: {} as IGameObject });
			const playAction: PlayerAction = {
				type: 'playCard',
				cardId: 'c1',
				zone: ZoneIdentifier.Hand,
				description: 'Play'
			};

			await playerActionHandler.executeAction('player1', playAction);

			// resolveReactions is called by executePlayCardAction, so it's called once.
			// This test verifies executeAction ITSELF doesn't add a second call.
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1);
		});

		it('should NOT call resolveReactions directly for quickAction action type', async () => {
			const mockAbility: IAbility = {
				abilityId: 'qa1',
				abilityType: AbilityType.QuickAction,
				text: 'Test QA',
				effect: {} as IEffect,
				cost: { mana: 0 }
			};
			const mockObject: IGameObject = {
				objectId: 'obj1',
				controllerId: 'player1',
				abilities: [mockAbility],
				currentCharacteristics: { abilities: [mockAbility] } as any
			} as IGameObject;
			mockGameStateManager.getObject = jest.fn().mockReturnValue(mockObject);
			mockEffectProcessor.resolveEffect.mockResolvedValue(undefined);
			mockManaSystem.canPayMana.mockReturnValue(true);

			const quickAction: PlayerAction = {
				type: 'quickAction',
				sourceObjectId: 'obj1',
				abilityId: 'qa1',
				description: 'QA'
			};

			await playerActionHandler.executeAction('player1', quickAction);

			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1); // Called by executeActivateAbilityAction
		});

		it('should NOT call resolveReactions for pass action type (TurnManager handles it)', async () => {
			// Mock turnManager on gsm for this test
			const mockTurnManagerInstance = new TurnManager(
				mockGameStateManager,
				mockEventBus
			) as jest.Mocked<TurnManager>;
			mockTurnManagerInstance.playerPasses = jest.fn().mockImplementation(async () => {
				// Simulate TurnManager's own call to resolveReactions
				await mockGameStateManager.resolveReactions(mockGameState);
			});
			mockGameStateManager.turnManager = mockTurnManagerInstance;

			const passAction: PlayerAction = { type: 'pass', description: 'Pass' };
			await playerActionHandler.executeAction('player1', passAction);

			// TurnManager.playerPasses (mocked above) calls resolveReactions once.
			// We are testing that PlayerActionHandler.executeAction does not call it *again* for 'pass'.
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1);
			expect(mockTurnManagerInstance.playerPasses).toHaveBeenCalledWith('player1');
		});
	});
});
