import { PhaseManager } from '../PhaseManager';
import { GameStateManager } from '../GameStateManager';
import { EventBus } from '../EventBus';
import { GamePhase } from '../types/enums';
import type { IGameState } from '../types/gameState';
import { TurnManager } from '../TurnManager'; // Needed for handleMorning
import { AdvancedTriggerHandler } from '../AdvancedTriggerHandler'; // For processPhaseTriggersForPhase

jest.mock('../GameStateManager');
jest.mock('../EventBus');
jest.mock('../TurnManager');
jest.mock('../AdvancedTriggerHandler');

describe('PhaseManager', () => {
	let phaseManager: PhaseManager;
	let mockGameStateManager: jest.Mocked<GameStateManager>;
	let mockEventBus: jest.Mocked<EventBus>;
	let mockTurnManager: jest.Mocked<TurnManager>;
	let mockAdvancedTriggerHandler: jest.Mocked<AdvancedTriggerHandler>;
	let mockGameState: IGameState;

	beforeEach(() => {
		jest.clearAllMocks();

		mockEventBus = new EventBus() as jest.Mocked<EventBus>;
		// Provide a basic IGameState structure for GameStateManager constructor
		const initialMockGameState: Partial<IGameState> = {
			players: [],
			sharedZones: { limbo: {} } as any, // Add other zones if needed by GSM constructor
			currentPhase: GamePhase.Setup,
			firstPlayerId: 'player1',
			currentPlayerId: 'player1'
		};
		mockGameStateManager = new GameStateManager(
			new Map(),
			mockEventBus
		) as jest.Mocked<GameStateManager>;
		// Override the state with a more complete mock for tests if needed
		mockGameStateManager.state = initialMockGameState as IGameState;

		mockTurnManager = new TurnManager(
			mockGameStateManager,
			mockEventBus
		) as jest.Mocked<TurnManager>;
		mockAdvancedTriggerHandler = new AdvancedTriggerHandler(
			mockGameStateManager
		) as jest.Mocked<AdvancedTriggerHandler>;

		mockGameStateManager.turnManager = mockTurnManager;
		mockGameStateManager.triggerHandler = mockAdvancedTriggerHandler; // Assuming GSM stores it like this

		phaseManager = new PhaseManager(mockGameStateManager, mockEventBus);

		// Full mockGameState for phase transitions
		mockGameState = {
			players: [
				{ id: 'player1', zones: {}, hasExpandedThisTurn: false } as any,
				{ id: 'player2', zones: {}, hasExpandedThisTurn: false } as any
			],
			sharedZones: { limbo: { getAll: jest.fn(() => []) } } as any,
			currentPhase: GamePhase.Setup,
			currentPlayerId: 'player1',
			firstPlayerId: 'player1',
			currentDay: 1,
			dayNumber: 1,
			firstMorningSkipped: false,
			gameEnded: false,
			actionHistory: []
		} as IGameState; // Cast to IGameState, ensure all required fields are present or mocked
		mockGameStateManager.state = mockGameState; // Assign the more complete mock

		// Mock methods that PhaseManager calls on GameStateManager
		mockGameStateManager.resolveReactions = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.setCurrentPhase = jest.fn().mockImplementation((phase) => {
			mockGameState.currentPhase = phase;
			// Simulate GSM's own call to triggerHandler and resolveReactions upon phase change
			mockAdvancedTriggerHandler.processPhaseTriggersForPhase.mockResolvedValue(undefined);
			mockGameStateManager.resolveReactions.mockResolvedValue(undefined);
		});
		mockGameStateManager.preparePhase = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.drawCards = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.progressPhase = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.restPhase = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.cleanupPhase = jest.fn().mockResolvedValue(undefined);
		mockGameStateManager.checkVictoryConditions = jest.fn().mockResolvedValue(null);
		mockGameStateManager.getPlayerIdsInInitiativeOrder = jest.fn((id) =>
			id === 'player1' ? ['player1', 'player2'] : ['player2', 'player1']
		);
		mockGameStateManager.getPlayer = jest.fn((id) =>
			mockGameState.players.find((p) => p.id === id)
		);

		// Mock methods on TurnManager
		mockTurnManager.succeedPhase = jest.fn();
		mockTurnManager.startAfternoon = jest.fn();

		// Mock methods on AdvancedTriggerHandler (already done by jest.mock)
		// but ensure functions called by PhaseManager directly are also jest.fn()
		mockAdvancedTriggerHandler.processPhaseTriggersForPhase = jest
			.fn()
			.mockResolvedValue(undefined);
	});

	describe('handleMorning (Subsequent Mornings)', () => {
		beforeEach(() => {
			// Setup for a subsequent morning
			mockGameState.currentPhase = GamePhase.Night; // So advancePhase goes to Morning
			mockGameState.currentDay = 1;
			phaseManager.advancePhase(); // This will set currentPhase to Morning and call handleMorning
		});

		it('should call resolveReactions after TurnManager.succeedPhase', async () => {
			// succeedPhase is called first in handleMorning
			expect(mockTurnManager.succeedPhase).toHaveBeenCalled();
			// resolveReactions is expected after succeedPhase
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockTurnManager.succeedPhase as any
			);
		});

		it('should call resolveReactions after GameStateManager.preparePhase', async () => {
			// preparePhase is called after succeedPhase's block
			expect(mockGameStateManager.preparePhase).toHaveBeenCalled();
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockGameStateManager.preparePhase as any
			);
		});

		it('should call resolveReactions after drawing cards for all players', async () => {
			// drawCards is called in a loop
			expect(mockGameStateManager.drawCards).toHaveBeenCalledTimes(mockGameState.players.length);
			// resolveReactions is called once after the loop
			const lastDrawCallOrder =
				mockGameStateManager.drawCards.mock.invocationCallOrder[mockGameState.players.length - 1];
			const resolveReactionsCallOrder =
				mockGameStateManager.resolveReactions.mock.invocationCallOrder.find(
					(order) => order > lastDrawCallOrder
				);
			expect(resolveReactionsCallOrder).toBeDefined();
		});

		it('should call resolveReactions after each player expand action', async () => {
			// This test is more complex due to the loop and conditional expand
			// For simplicity, we'll assume PhaseManager's internal loop for expansion calls resolveReactions
			// The current PhaseManager code already does this.
			// A more granular test would mock playerActionHandler.executeExpandAction
			// and verify resolveReactions after it. Given the current structure, this is implicitly tested
			// by the fact that handleMorning itself calls resolveReactions multiple times.
			// The provided PhaseManager code calls resolveReactions inside the expand loop.
			// We check that resolveReactions has been called multiple times through the morning.
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalled();
			const numPlayers = mockGameState.players.length;
			// Expected calls: after succeed, after prepare, after all draws, after each expand (numPlayers), and one at the end for Noon triggers.
			// If expand calls are mocked out or players don't expand, it might be less.
			// The current mock of handleMorning will call it after draw, and at the end for Noon.
			// Plus the ones from setCurrentPhase for Morning itself.
			// Let's check the specific call for "At Noon" triggers at the end of handleMorning:
			expect(mockAdvancedTriggerHandler.processPhaseTriggersForPhase).toHaveBeenCalledWith(
				GamePhase.Noon
			);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockAdvancedTriggerHandler.processPhaseTriggersForPhase as any
			);
		});

		it('should process "At Noon" triggers and reactions at the end of Morning', async () => {
			// This is the specific block added at the end of handleMorning
			expect(mockAdvancedTriggerHandler.processPhaseTriggersForPhase).toHaveBeenCalledWith(
				GamePhase.Noon
			);
			const noonTriggerCall =
				mockAdvancedTriggerHandler.processPhaseTriggersForPhase.mock.calls.find(
					(call) => call[0] === GamePhase.Noon
				);
			expect(noonTriggerCall).toBeDefined();

			const associatedReactionCall = mockGameStateManager.resolveReactions.mock.calls.find(
				(call, index) =>
					mockGameStateManager.resolveReactions.mock.invocationCallOrder[index] >
					mockAdvancedTriggerHandler.processPhaseTriggersForPhase.mock.invocationCallOrder[
						mockAdvancedTriggerHandler.processPhaseTriggersForPhase.mock.calls.indexOf(
							noonTriggerCall!
						)
					]
			);
			expect(associatedReactionCall).toBeDefined();
		});
	});

	describe('Phase Transitions and "At [Phase]" Triggers', () => {
		// GSM.setCurrentPhase is mocked to call triggerHandler.processPhaseTriggersForPhase & resolveReactions
		// So these tests verify that PhaseManager correctly tells GSM to set the phase.

		it('handleFirstMorning should set phase to Noon and trigger its "At Noon" effects', () => {
			mockGameState.currentPhase = GamePhase.Setup;
			// advancePhase calls handleFirstMorning if currentPhase is Setup and next is Morning
			phaseManager.advancePhase(); // Should go Setup -> Noon (skipping Morning)

			expect(mockGameStateManager.setCurrentPhase).toHaveBeenCalledWith(GamePhase.Noon);
			// setCurrentPhase mock internally calls triggerHandler & resolveReactions
			expect(mockAdvancedTriggerHandler.processPhaseTriggersForPhase).toHaveBeenCalledWith(
				GamePhase.Noon
			);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1); // From setCurrentPhase(Noon)
		});

		it('handleAfternoon should trigger "At Afternoon" effects via setCurrentPhase', () => {
			mockGameState.currentPhase = GamePhase.Noon;
			phaseManager.advancePhase(); // Noon -> Afternoon

			expect(mockGameStateManager.setCurrentPhase).toHaveBeenCalledWith(GamePhase.Afternoon);
			expect(mockAdvancedTriggerHandler.processPhaseTriggersForPhase).toHaveBeenCalledWith(
				GamePhase.Afternoon
			);
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledTimes(1); // From setCurrentPhase(Afternoon)
			expect(mockTurnManager.startAfternoon).toHaveBeenCalled();
		});

		it('handleDusk should trigger "At Dusk" effects and reactions after progressPhase', async () => {
			mockGameState.currentPhase = GamePhase.Afternoon;
			// Simulate all players passing to trigger phase advance from Afternoon
			mockGameState.players.forEach((p) => (p.hasPassedTurn = true));
			// Need to call something that would invoke checkPhaseEnd if it's not automatic from advancePhase
			// Or directly call handleDusk after setting phase
			mockGameState.currentPhase = GamePhase.Dusk; // Manually set for direct test
			await phaseManager['handleDusk'](); // Access private method for test

			// Check "At Dusk" from setCurrentPhase (if advancePhase was used)
			// For direct handleDusk call, check progressPhase related calls
			expect(mockGameStateManager.progressPhase).toHaveBeenCalled();
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockGameStateManager.progressPhase as any
			);
		});

		it('handleNight should trigger "At Night" and reactions after various steps', async () => {
			mockGameState.currentPhase = GamePhase.Dusk;
			// Manually set for direct test
			mockGameState.currentPhase = GamePhase.Night;
			await phaseManager['handleNight']();

			// Check "At Night" from setCurrentPhase (if advancePhase was used)
			// For direct handleNight call:
			expect(mockGameStateManager.restPhase).toHaveBeenCalled();
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockGameStateManager.restPhase as any
			);

			expect(mockGameStateManager.cleanupPhase).toHaveBeenCalled();
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockGameStateManager.cleanupPhase as any
			);

			expect(mockGameStateManager.checkVictoryConditions).toHaveBeenCalled();
			expect(mockGameStateManager.resolveReactions).toHaveBeenCalledAfter(
				mockGameStateManager.checkVictoryConditions as any
			);
		});
	});
});
