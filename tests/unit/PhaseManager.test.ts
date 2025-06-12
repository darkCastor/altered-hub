import { describe, test, expect, beforeEach } from 'bun:test';
import { PhaseManager } from '../../src/engine/PhaseManager';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { TurnManager } from '../../src/engine/TurnManager';
import { EventBus } from '../../src/engine/EventBus';
import { GamePhase, StatusType, CardType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for PhaseManager - Rules 4.2 (Day Structure and Phase Transitions)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('PhaseManager - Phase Transition Rules', () => {
	let phaseManager: PhaseManager;
	let gameStateManager: GameStateManager;
	let turnManager: TurnManager;
	let eventBus: EventBus;

	beforeEach(async () => {
		eventBus = new EventBus();
		const mockCardDefinitions: ICardDefinition[] = [
			{
				id: 'hero-001',
				name: 'Test Hero',
				type: CardType.Hero,
				subTypes: [],
				handCost: { total: 0, forest: 0, mountain: 0, water: 0 },
				reserveCost: { total: 0, forest: 0, mountain: 0, water: 0 },
				faction: 'Neutral',
				statistics: { forest: 2, mountain: 1, water: 1 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			{
				id: 'test-card',
				name: 'Test Card',
				type: CardType.Spell,
				subTypes: [],
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 },
				reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
				faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 0 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			{
				// Added missing definition
				id: 'character-001',
				name: 'Test Character',
				type: CardType.Character,
				subTypes: [],
				handCost: { total: 3, forest: 1, mountain: 1, water: 1 },
				reserveCost: { total: 2, forest: 0, mountain: 1, water: 1 },
				faction: 'Neutral',
				statistics: { forest: 2, mountain: 1, water: 1 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			{
				id: 'at-noon-effect-card',
				name: 'Sundial of Effects',
				type: CardType.Landmark, // Or Character, depending on where "At Noon" can trigger
				subTypes: [],
				handCost: { total: 1 },
				reserveCost: { total: 1 },
				faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 0 },
				abilities: [
					{
						abilityId: 'noon-abil',
						text: 'At Noon: Gain 1 mana.',
						abilityType: 'reaction',
						trigger: 'onNoonPhaseStart', // Assuming such a trigger
						effect: { steps: [{ type: 'gainMana', player: 'self', quantity: 1 }] }
					}
				],
				rarity: 'Common',
				version: '1.0'
			},
			{
				id: 'gear-001',
				name: 'Test Gear',
				type: CardType.Gear,
				subTypes: [],
				handCost: { total: 1 },
				reserveCost: { total: 1 },
				faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 0 }, // Gears might not have stats
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			{
				id: 'landmark-001',
				name: 'Test Landmark',
				type: CardType.Landmark,
				subTypes: [],
				handCost: { total: 2 },
				reserveCost: { total: 2 },
				faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 0 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			}
		];
		gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
		// Setup default hero limits if not part of hero card def for these tests
		gameStateManager.getPlayer('player1')!.limits.reserve = 2;
		gameStateManager.getPlayer('player1')!.limits.landmarks = 2;
		gameStateManager.getPlayer('player2')!.limits.reserve = 2;
		gameStateManager.getPlayer('player2')!.limits.landmarks = 2;

		turnManager = new TurnManager(gameStateManager);
		phaseManager = new PhaseManager(gameStateManager, turnManager);

		// Initialize game state
		await gameStateManager.initializeGame();
		// Set current player for tests that need it.
		gameStateManager.state.currentPlayerId = gameStateManager.state.firstPlayerId;
	});

	describe('Rule 4.2: Day Structure - Five Phases', () => {
		test('Rule 4.2.a: Day should consist of exactly 5 phases in correct order', () => {
			const expectedPhases = [
				GamePhase.Morning,
				GamePhase.Noon,
				GamePhase.Afternoon,
				GamePhase.Dusk,
				GamePhase.Night
			];

			// Test phase progression through a complete day
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			expect(gameStateManager.state.currentPhase).toBe(GamePhase.Morning);

			// Should advance through each phase in order
			for (let i = 0; i < expectedPhases.length - 1; i++) {
				phaseManager.advancePhase();
				expect(gameStateManager.state.currentPhase).toBe(expectedPhases[i + 1]);
			}
		});

		test('Rule 4.2.g: Night phase should advance to next day and return to Morning', async () => {
			const initialDay = gameStateManager.state.currentDay;
			gameStateManager.setCurrentPhase(GamePhase.Night);

			await phaseManager.advancePhase();

			expect(gameStateManager.state.currentDay).toBe(initialDay + 1);
			expect(gameStateManager.state.currentPhase).toBe(GamePhase.Morning);
		});
	});

	describe('Rule 4.2.1: Morning Phase - Succeed → Prepare → Draw → Expand', () => {
		test('Rule 4.2.1.a (Succeed): Morning phase should update firstPlayerId and currentPlayerId', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			const p1 = 'player1';
			const p2 = 'player2';
			gameStateManager.state.firstPlayerId = p2; // P2 starts as first player
			gameStateManager.state.currentPlayerId = p2;

			await phaseManager.executeMorningPhaseSucceedStep(); // Assuming this specific sub-step method exists for testing

			expect(gameStateManager.state.firstPlayerId).toBe(p1); // Should switch to P1
			expect(gameStateManager.state.currentPlayerId).toBe(p1); // Current player also becomes P1
		});

		test('Rule 4.2.1.c (Prepare): Morning phase readies exhausted characters, reserve cards, and mana', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			const player1 = gameStateManager.getPlayer('player1')!;

			// Setup exhausted entities
			const charInExp = gameStateManager.objectFactory.createGameObject(
				gameStateManager.objectFactory.createCard('character-001', 'player1'),
				'player1'
			);
			charInExp.statuses.add(StatusType.Exhausted);
			player1.zones.expeditionZone.add(charInExp);

			const cardInReserve = gameStateManager.objectFactory.createGameObject(
				gameStateManager.objectFactory.createCard('test-card', 'player1'),
				'player1'
			);
			cardInReserve.statuses.add(StatusType.Exhausted);
			player1.zones.reserveZone.add(cardInReserve);

			const manaOrb = player1.zones.manaZone.getAll()[0]; // Assuming at least one mana orb from init
			if (manaOrb) manaOrb.statuses.add(StatusType.Exhausted);

			await phaseManager.executeMorningPhasePrepareStep(); // Assuming this specific sub-step method exists

			expect(charInExp.statuses.has(StatusType.Exhausted)).toBe(false);
			expect(cardInReserve.statuses.has(StatusType.Exhausted)).toBe(false);
			if (manaOrb) expect(manaOrb.statuses.has(StatusType.Exhausted)).toBe(false);
		});

		test('Rule 4.2.1.d (Draw): Morning phase executes Draw step', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			const player1 = gameStateManager.getPlayer('player1')!;
			const initialHandSize = player1.zones.handZone.count;

			await phaseManager.executeMorningPhaseDrawStep(); // Assuming this specific sub-step method

			expect(player1.zones.handZone.count).toBe(initialHandSize + 2); // Draws 2 cards
		});

		test('Rule 4.2.1.e (Expand): Morning phase allows player to expand once', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			const player1 = gameStateManager.getPlayer('player1')!;
			const cardToExpand = gameStateManager.objectFactory.createCard('test-card', 'player1');
			player1.zones.handZone.add(cardToExpand); // Add a card to hand

			const initialManaCount = player1.zones.manaZone.count;
			const initialHandCount = player1.zones.handZone.count;

			// Simulate P1 choosing to expand this card
			// This assumes PhaseManager has a way to signal this choice for a player.
			// For testing, we might directly call a method like phaseManager.playerChoseExpand(P1, cardToExpand.id);
			// Then executeExpandStep would process it.
			gameStateManager.state.playerExpandChoices = { [player1.id]: cardToExpand.instanceId }; // Simulate choice
			await phaseManager.executeMorningPhaseExpandStep(); // Assuming this specific sub-step method

			expect(player1.zones.manaZone.count).toBe(initialManaCount + 1);
			expect(player1.zones.handZone.count).toBe(initialHandCount - 1);
			const newManaOrb = player1.zones.manaZone.findById(cardToExpand.instanceId);
			expect(newManaOrb).toBeDefined();
			expect(newManaOrb?.statuses.has(StatusType.Exhausted)).toBe(false); // New mana is ready
			expect(player1.flags.hasExpandedThisTurn).toBe(true); // Check flag
		});

		test('Rule 4.2.1.e: Expand is once-per-turn and only in Morning phase', async () => {
			// This test logic from original file is mostly fine, adapt to use new sub-step methods
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			const player = gameStateManager.getPlayer('player1')!;
			const cardToExpand = gameStateManager.objectFactory.createCard('test-card', 'player1');
			player.zones.handZone.add(cardToExpand);

			// Simulate P1 choosing to expand
			gameStateManager.state.playerExpandChoices = { [player.id]: cardToExpand.instanceId };
			await phaseManager.executeMorningPhaseExpandStep();
			expect(player.flags.hasExpandedThisTurn).toBe(true);

			// Attempt to expand again (should not be possible)
			player.flags.hasExpandedThisTurn = true; // Ensure flag is set from previous action
			const canExpandAgain = phaseManager.canPlayerExpand(player.id); // Check before trying
			expect(canExpandAgain).toBe(false);

			// In other phases, expand should not be available
			gameStateManager.setCurrentPhase(GamePhase.Afternoon);
			expect(phaseManager.canPlayerExpand(player.id)).toBe(false);
		});

		test('Rule 4.1.l: First Morning phase (Day 1) is skipped, and subsequent are not', async () => {
			// Reset to game start, Day 1 Morning
			await gameStateManager.initializeGame(); // Re-initialize to reset day and flags
			gameStateManager.setCurrentPhase(GamePhase.Morning); // Set explicitly if initializeGame doesn't set to Morning
			expect(gameStateManager.state.currentDay).toBe(1);

			await phaseManager.advancePhase(); // Attempt to advance from Day 1 Morning

			expect(gameStateManager.state.currentPhase).toBe(GamePhase.Noon); // Should skip to Noon
			expect(gameStateManager.state.flags.firstMorningSkipped).toBe(true);

			// Progress to Day 2 Morning
			gameStateManager.setCurrentPhase(GamePhase.Night);
			await phaseManager.advancePhase(); // Night -> Morning (Day 2)
			expect(gameStateManager.state.currentDay).toBe(2);
			expect(gameStateManager.state.currentPhase).toBe(GamePhase.Morning);

			// On Day 2, Morning phase should not be skipped
			// To test executeMorningPhase not skipping, we'd need to check some effect of morning phase occurred.
			// For example, currentPlayerId should be the firstPlayerId after Succeed step.
			const firstPlayerDay2 = gameStateManager.state.firstPlayerId;
			await phaseManager.executeMorningPhase(); // Execute full morning
			expect(gameStateManager.state.currentPlayerId).toBe(firstPlayerDay2); // Succeed step ran
			// Or check if draw happened, etc.
		});
	});

	describe('Rule 4.2.2: Noon Phase', () => {
		test('Rule 4.2.2: Noon phase should trigger "At Noon" reactions', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Noon);
			const player1 = gameStateManager.getPlayer('player1')!;
			const atNoonCard = gameStateManager.objectFactory.createGameObject(
				gameStateManager.objectFactory.createCard('at-noon-effect-card', player1.id),
				player1.id
			);
			player1.zones.landmarkZone.add(atNoonCard); // Assuming it's a landmark

			const initialMana = player1.currentMana;
			// Spy on eventBus or EffectExecutionManager if "At Noon" triggers are event-based
			// For now, assume executeNoonPhase directly calls or leads to effect resolution.

			await phaseManager.executeNoonPhase();

			// The card 'at-noon-effect-card' is defined to "Gain 1 mana" At Noon.
			expect(player1.currentMana).toBe(initialMana + 1);
		});

		test('Noon phase should have no daily effects (Prepare, Draw, Expand)', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Noon);
			const player1 = gameStateManager.getPlayer('player1')!;

			// Setup: Exhaust mana, note hand size
			player1.zones.manaZone.getAll().forEach((orb) => orb.statuses.add(StatusType.Exhausted));
			const initialHandSize = player1.zones.handZone.count;
			player1.flags.hasExpandedThisTurn = false;

			await phaseManager.executeNoonPhase();

			// Assertions: No Prepare, Draw, or Expand actions occurred
			player1.zones.manaZone.getAll().forEach((orb) => {
				expect(orb.statuses.has(StatusType.Exhausted)).toBe(true); // Mana remains exhausted
			});
			expect(player1.zones.handZone.count).toBe(initialHandSize); // Hand size unchanged
			expect(player1.flags.hasExpandedThisTurn).toBe(false); // Expand flag not set/used
		});
	});

	describe('Rule 4.2.3: Afternoon Phase - Player Turns', () => {
		test('Rule 4.2.3.c: First player (firstPlayerId) should take the first turn', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Afternoon);
			// Set P2 as first player for this test
			gameStateManager.state.firstPlayerId = 'player2';
			await phaseManager.executeAfternoonPhase(); // This should set currentPlayerId
			expect(gameStateManager.state.currentPlayerId).toBe('player2');
		});

		test('Playing a card ends the turn', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Afternoon);
			const p1 = gameStateManager.getPlayer('player1')!;
			const p2Id = 'player2';
			gameStateManager.state.currentPlayerId = p1.id; // P1 is active

			const spellCard = gameStateManager.objectFactory.createCard('test-card', p1.id);
			p1.zones.handZone.add(spellCard);
			p1.currentMana = 10; // Ensure enough mana

			// Spy or check turn manager's state if possible, for now, check currentPlayerId change
			// This assumes playerPlaysCardFromHand internally calls the logic to end the turn.
			await gameStateManager.playerPlaysCardFromHand(p1.id, spellCard.instanceId, {
				targetObjectIds: []
			});

			expect(gameStateManager.state.currentPlayerId).toBe(p2Id);
		});

		test('Rule 4.2.3.e: Afternoon should end when all players pass consecutively', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Afternoon);
			const p1Id = gameStateManager.state.firstPlayerId;
			const p2Id = p1Id === 'player1' ? 'player2' : 'player1';

			gameStateManager.state.currentPlayerId = p1Id;
			await phaseManager.passTurn(); // P1 passes, turn goes to P2
			expect(gameStateManager.state.currentPlayerId).toBe(p2Id);

			await phaseManager.passTurn(); // P2 passes

			// After both pass consecutively, phase should advance to Dusk
			// This relies on passTurn calling checkAfternoonEnd, which calls advancePhase.
			expect(gameStateManager.state.currentPhase).toBe(GamePhase.Dusk);
		});
	});

	describe('Rule 4.2.4: Dusk Phase - Progress Calculation', () => {
		// Helper to set expedition stats for testing
		const setExpeditionStats = (playerId: string, heroStats: any, companionStats?: any) => {
			const player = gameStateManager.getPlayer(playerId)!;
			player.expeditionState.heroStats = heroStats;
			player.expeditionState.heroPosition = 0; // Reset position for each test
			if (companionStats) {
				player.expeditionState.companionStats = companionStats;
				player.expeditionState.companionPosition = 0;
			}
		};

		test('Rule 4.2.4.b/e: Expedition moves if stats > opponent AND > 0', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Dusk);
			setExpeditionStats('player1', { forest: 3, mountain: 0, water: 0 });
			setExpeditionStats('player2', { forest: 2, mountain: 0, water: 0 });
			await phaseManager.executeDuskPhaseProgressStep();
			expect(gameStateManager.getPlayer('player1')!.expeditionState.heroPosition).toBe(1);
			expect(gameStateManager.getPlayer('player2')!.expeditionState.heroPosition).toBe(0);

			setExpeditionStats('player1', { forest: 1, mountain: 0, water: 0 });
			setExpeditionStats('player2', { forest: 0, mountain: -1, water: 0 }); // P2 has non-positive relevant stat
			await phaseManager.executeDuskPhaseProgressStep();
			expect(gameStateManager.getPlayer('player1')!.expeditionState.heroPosition).toBe(1);
			expect(gameStateManager.getPlayer('player2')!.expeditionState.heroPosition).toBe(0);

			setExpeditionStats('player1', { forest: 0, mountain: 0, water: 0 }); // P1 has zero stat
			setExpeditionStats('player2', { forest: -1, mountain: -1, water: -1 });
			await phaseManager.executeDuskPhaseProgressStep();
			expect(gameStateManager.getPlayer('player1')!.expeditionState.heroPosition).toBe(0);
		});

		test('Rule 4.2.4.e: Ties (or P1 stat not strictly greater) should not allow movement', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Dusk);
			setExpeditionStats('player1', { forest: 2, mountain: 0, water: 0 });
			setExpeditionStats('player2', { forest: 2, mountain: 0, water: 0 }); // Tie
			await phaseManager.executeDuskPhaseProgressStep();
			expect(gameStateManager.getPlayer('player1')!.expeditionState.heroPosition).toBe(0);
			expect(gameStateManager.getPlayer('player2')!.expeditionState.heroPosition).toBe(0);

			setExpeditionStats('player1', { forest: 2, mountain: 0, water: 0 });
			setExpeditionStats('player2', { forest: 3, mountain: 0, water: 0 }); // P1 loses
			await phaseManager.executeDuskPhaseProgressStep();
			expect(gameStateManager.getPlayer('player1')!.expeditionState.heroPosition).toBe(0);
			// P2 would move if their stats are also >0, but this test focuses on P1 not moving.
		});

		test('Rule 4.2.4.h: All successful expeditions move simultaneously (conceptual)', async () => {
			// This rule is hard to test directly without deep diving into how simultaneous resolution is architected.
			// We test that if both P1 hero and P1 companion win their respective matchups, both move.
			gameStateManager.setCurrentPhase(GamePhase.Dusk);
			setExpeditionStats(
				'player1',
				{ forest: 3, mountain: 0, water: 0 }, // Hero
				{ forest: 3, mountain: 0, water: 0 } // Companion
			);
			setExpeditionStats(
				'player2',
				{ forest: 1, mountain: 0, water: 0 }, // Hero
				{ forest: 1, mountain: 0, water: 0 } // Companion
			);

			await phaseManager.executeDuskPhaseProgressStep();

			expect(gameStateManager.getPlayer('player1')!.expeditionState.heroPosition).toBe(1);
			expect(gameStateManager.getPlayer('player1')!.expeditionState.companionPosition).toBe(1);
			expect(gameStateManager.getPlayer('player2')!.expeditionState.heroPosition).toBe(0);
			expect(gameStateManager.getPlayer('player2')!.expeditionState.companionPosition).toBe(0);
		});
	});

	describe('Rule 4.2.5: Night Phase - Rest → Clean-up → Victory Check', () => {
		test('Rule 4.2.5.b (Rest): Characters/Gears in MOVED expeditions go to Reserve; others stay', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Night);
			const p1 = gameStateManager.getPlayer('player1')!;

			const charMovedExp = gameStateManager.objectFactory.createGameObject(
				gameStateManager.objectFactory.createCard('character-001', p1.id),
				p1.id
			);
			const gearMovedExp = gameStateManager.objectFactory.createGameObject(
				gameStateManager.objectFactory.createCard('gear-001', p1.id),
				p1.id
			);
			p1.zones.expeditionZone.add(charMovedExp);
			p1.zones.expeditionZone.add(gearMovedExp);
			// Associate them with hero expedition for this test, and mark hero expedition as moved
			p1.expeditionState.heroExpeditionObjects = [charMovedExp.objectId, gearMovedExp.objectId];
			p1.expeditionState.heroMovedThisTurn = true;

			const charStayExp = gameStateManager.objectFactory.createGameObject(
				gameStateManager.objectFactory.createCard('character-001', p1.id),
				p1.id
			);
			charStayExp.instanceId = 'charStay'; // ensure unique id
			p1.zones.expeditionZone.add(charStayExp);
			p1.expeditionState.companionExpeditionObjects = [charStayExp.objectId];
			p1.expeditionState.companionMovedThisTurn = false; // Companion expedition did not move

			await phaseManager.executeNightPhaseRestStep();

			expect(p1.zones.reserveZone.findById(charMovedExp.objectId)).toBeDefined();
			expect(p1.zones.reserveZone.findById(gearMovedExp.objectId)).toBeDefined();
			expect(p1.zones.expeditionZone.findById(charStayExp.objectId)).toBeDefined(); // Stays
		});

		test('Rule 4.2.5.c (Clean-up): Discard/Sacrifice excess Reserve/Landmark cards', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Night);
			const p1 = gameStateManager.getPlayer('player1')!;
			p1.limits.reserve = 1; // Lower limit for testing
			p1.limits.landmarks = 1;

			// Add 2 cards to Reserve
			p1.zones.reserveZone.add(gameStateManager.objectFactory.createCard('character-001', p1.id));
			p1.zones.reserveZone.add(gameStateManager.objectFactory.createCard('test-card', p1.id));
			// Add 2 Landmarks
			p1.zones.landmarkZone.add(
				gameStateManager.objectFactory.createGameObject(
					gameStateManager.objectFactory.createCard('landmark-001', p1.id),
					p1.id
				)
			);
			p1.zones.landmarkZone.add(
				gameStateManager.objectFactory.createGameObject(
					gameStateManager.objectFactory.createCard('landmark-001', p1.id),
					p1.id
				)
			);

			expect(p1.zones.reserveZone.count).toBe(2);
			expect(p1.zones.landmarkZone.count).toBe(2);

			// This assumes player choice is handled or defaults (e.g., discards oldest/newest)
			// Or that PhaseManager triggers a choice request that would be mocked in a more complex setup.
			await phaseManager.executeNightPhaseCleanupStep();

			expect(p1.zones.reserveZone.count).toBe(1);
			expect(p1.zones.landmarkZone.count).toBe(1);
			expect(p1.zones.discardPileZone.count).toBeGreaterThanOrEqual(1); // At least one reserve card discarded
			// Plus one landmark sacrificed (also goes to discard)
		});

		test('Rule 1.3.3.c (Victory Check): Tie in distance leads to Tiebreaker mode', async () => {
			gameStateManager.setCurrentPhase(GamePhase.Night);
			const p1 = gameStateManager.getPlayer('player1')!;
			const p2 = gameStateManager.getPlayer('player2')!;

			p1.expeditionState.heroPosition = 3;
			p1.expeditionState.companionPosition = 4; // P1 Total = 7
			p2.expeditionState.heroPosition = 4;
			p2.expeditionState.companionPosition = 3; // P2 Total = 7

			await phaseManager.executeNightPhaseVictoryCheckStep();

			expect(gameStateManager.state.gameEnded).toBe(false); // Game not ended yet
			expect(gameStateManager.state.winner).toBeUndefined();
			expect(gameStateManager.state.flags.tiebreakerMode).toBe(true); // Tiebreaker mode activated
		});
	});

	describe('Reaction Checking - Rule 4.4', () => {
		// Rule 4.4 is about the system for offering players the chance to act with reactions.
		// Testing the full reaction system (which card reactions trigger, how choices are presented/resolved)
		// is likely beyond *just* PhaseManager tests. PhaseManager's role is likely to initiate
		// the reaction window at the correct times (e.g., after phase change, after an action).

		test('Rule 4.4.a: Advancing phase should conceptually open a reaction window', async () => {
			// This test is more about the *concept* that a reaction check step is part of advancing.
			// Actual reaction processing would be handled by a ReactionManager or similar,
			// potentially by PhaseManager calling it.
			// We can check if the turn ownership or priority is correctly set for reactions.
			gameStateManager.setCurrentPhase(GamePhase.Morning);
			const initialPlayer = gameStateManager.state.currentPlayerId;

			// After advancing from Morning to Noon, a reaction window should occur.
			// The first player (usually currentPlayerId at the start of the new phase) gets priority.
			await phaseManager.advancePhase(); // Advances to Noon
			expect(gameStateManager.state.currentPhase).toBe(GamePhase.Noon);

			// PhaseManager might set a flag or state indicating a reaction window is open,
			// and currentTurnPlayerId would still be the player who has priority.
			// For example, if P1 was firstPlayerId and currentPlayerId in Morning, they'd also be after Succeed step.
			// If firstPlayerId changed in Morning's Succeed step, that new firstPlayer gets priority.
			expect(gameStateManager.state.currentPlayerId).toBe(gameStateManager.state.firstPlayerId);
			// A more specific assertion would require knowledge of how ReactionManager is invoked.
			// For now, ensuring the currentPlayerId is the one expected to react first is a good proxy.
		});

		test('Rule 4.4.b: First player should have priority in reaction windows following phase changes', async () => {
			// Setup: P2 is the first player.
			gameStateManager.state.firstPlayerId = 'player2';
			gameStateManager.state.currentPlayerId = 'player2'; // Current player is P2
			gameStateManager.setCurrentPhase(GamePhase.Morning); // Start of a phase where P2 is active.

			// PhaseManager.checkReactions() or a similar method would be called.
			// This method should ensure that 'player2' (the firstPlayerId) gets the first chance to react.
			// This might involve setting some state in gameStateManager like 'reactionPlayerId' or 'priorityPlayerId'.
			// For now, we'll assume that after a phase change, currentPlayerId reflects who has priority.

			await phaseManager.executeMorningPhaseSucceedStep(); // P1 becomes firstPlayer and currentPlayer
			expect(gameStateManager.state.firstPlayerId).toBe('player1');
			expect(gameStateManager.state.currentPlayerId).toBe('player1');

			// If phaseManager.checkReactions() was called (implicitly or explicitly after a step/phase change),
			// it should respect that 'player1' now has priority.
			// This is difficult to assert without more details on ReactionManager interaction.
			// The previous test covers that currentPlayerId (who would act first) is correctly set.
			// This test essentially re-affirms that the currentPlayerId is the one with priority.
			// No direct action for checkReactions() separate from phase transitions for this test.
			// The assertion is that the game state (currentPlayerId) is correctly set for P1 to act.
			expect(gameStateManager.state.currentPlayerId).toBe('player1');
		});
	});
});
