import { describe, test, expect, beforeEach } from 'bun:test';
import { CardPlaySystem } from '../../src/engine/CardPlaySystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { CardType, StatusType, ZoneIdentifier, GamePhase } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for CardPlaySystem - Rules 5.1 (Card Playing Process) and 5.2 (Playing from Reserve)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('CardPlaySystem - Card Playing Rules', () => {
	let cardPlaySystem: CardPlaySystem;
	let gameStateManager: GameStateManager;
	let eventBus: EventBus;

	// Define new card definitions as per requirements
	const cardDef_FleetingTestSpell: ICardDefinition = {
		id: 'spell-fleeting-passive',
		name: 'Fleeting Passive Spell',
		type: CardType.Spell,
		subTypes: [],
		handCost: { total: 1 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		abilities: [
			{
				abilityId: 'abil-passive-fleeting',
				text: 'This spell is Fleeting.',
				abilityType: 'passive',
				keyword: KeywordAbility.Fleeting, // Assuming KeywordAbility enum is imported
				effect: { steps: [] },
				isSupportAbility: false
			}
		],
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_ExpeditionPermanent_001: ICardDefinition = {
		id: 'exp-permanent-001',
		name: 'Test Expedition Permanent',
		type: CardType.Permanent,
		subTypes: ['Gear'], // Example subType
		permanentZoneType: ZoneIdentifier.ExpeditionZone, // Custom property to guide placement
		handCost: { total: 2 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: {},
		abilities: [],
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_LandmarkPermanent_001: ICardDefinition = {
		id: 'landmark-permanent-001',
		name: 'Test Landmark Permanent',
		type: CardType.Permanent,
		subTypes: ['Structure'], // Example subType
		permanentZoneType: ZoneIdentifier.LandmarkZone, // Custom property to guide placement
		handCost: { total: 2 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: {},
		abilities: [],
		rarity: 'Common',
		version: '1.0'
	};

	beforeEach(() => {
		eventBus = new EventBus();
		const mockCardDefinitions: ICardDefinition[] = [
			{
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
				id: 'spell-001', // Non-fleeting spell
				name: 'Test Spell',
				type: CardType.Spell,
				subTypes: [],
				handCost: { total: 2, forest: 1, mountain: 0, water: 1 },
				reserveCost: { total: 1, forest: 0, mountain: 0, water: 1 },
				faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 0 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			cardDef_LandmarkPermanent_001, // Use the specific landmark permanent
			cardDef_FleetingTestSpell,
			cardDef_ExpeditionPermanent_001
		];

		gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
		cardPlaySystem = new CardPlaySystem(gameStateManager);
		gameStateManager.initializeGame();
		gameStateManager.setCurrentPhase(GamePhase.Afternoon); // Default to a phase where cards can be played
		// Clear any cost modifiers from previous tests if CardPlaySystem instance is reused across describe blocks (it's new here)
		// cardPlaySystem.clearCostModifiers('player1');
		// cardPlaySystem.clearCostModifiers('player2');
	});

	describe('Rule 5.1.2: Card Playing Process (4 Parts)', () => {
		test('Rule 5.1.2.c: Part 1 - Declare Intent (reveal, choose modes, declare payment)', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card);

			const intent = cardPlaySystem.declarePlayIntent('player1', card.id, {
				paymentMethod: 'hand',
				chosenModes: [],
				targetChoices: []
			});

			expect(intent.success).toBe(true);
			expect(intent.declaredCard).toBe(card.id);
			expect(intent.revealedToAll).toBe(true);
			expect(intent.paymentMethod).toBe('hand');
		});

		test('Rule 5.1.2.g: Part 2 - Move to Limbo', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card);

			cardPlaySystem.declarePlayIntent('player1', card.id, { paymentMethod: 'hand' });
			const moveResult = cardPlaySystem.moveToLimbo('player1', card.id);

			expect(moveResult.success).toBe(true);
			expect(player!.zones.handZone.contains(card.id)).toBe(false);
			expect(player!.zones.limboZone.contains(card.id)).toBe(true);
		});

		test('Rule 5.1.2.h: Part 3 - Pay Costs (all costs paid simultaneously)', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');

			// Setup mana
			player!.zones.manaZone.getAll().forEach((orb) => orb.statuses.delete(StatusType.Exhausted));

			player!.zones.limboZone.add(card);

			const paymentResult = cardPlaySystem.payCosts('player1', card.id);

			expect(paymentResult.success).toBe(true);
			expect(paymentResult.costsDetail).toBeDefined();

			// Verify mana was spent
			const exhaustedOrbs = player!.zones.manaZone
				.getAll()
				.filter((orb) => orb.statuses.has(StatusType.Exhausted));
			expect(exhaustedOrbs.length).toBeGreaterThan(0);
		});

		test('Rule 5.1.2.i: Part 4 - Resolution (effect resolves, move to final zone)', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.limboZone.add(card);

			const resolutionResult = cardPlaySystem.resolveCard('player1', card.id);

			expect(resolutionResult.success).toBe(true);
			expect(player!.zones.limboZone.contains(card.id)).toBe(false);

			// Character should go to expedition zone
			expect(player!.zones.expeditionZone.contains(card.id)).toBe(true);
		});

		test('Complete card playing process should work end-to-end', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card);

			// Setup sufficient mana
			player!.zones.manaZone.getAll().forEach((orb) => orb.statuses.delete(StatusType.Exhausted));

			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand',
				chosenModes: [],
				targetChoices: []
			});

			expect(playResult.success).toBe(true);
			expect(player!.zones.handZone.contains(card.id)).toBe(false);
			expect(player!.zones.expeditionZone.contains(card.id)).toBe(true);
		});
	});

	describe('Rule 5.1.2.d: Hand Cost vs Reserve Cost', () => {
		test('Should use Hand Cost when playing from Hand', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			console.log('[Test LOG] Created card object:', JSON.stringify(card, null, 2)); // Log the whole card
			player!.zones.handZone.add(card);
			const idToPass = String(card?.id); // Use optional chaining for safety if id is indeed missing

			const costCheck = cardPlaySystem.getPlayingCost('player1', idToPass, 'hand');

			const expectedCost = gameStateManager.getCardDefinition('character-001')!.handCost;
			expect(costCheck.cost).toEqual(expectedCost);
			expect(costCheck.source).toBe('hand');
		});

		test('Should use Reserve Cost when playing from Reserve', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.reserveZone.add(card);
			const idToPass = String(card.id); // Explicitly cast to string

			const costCheck = cardPlaySystem.getPlayingCost('player1', idToPass, 'reserve');

			const expectedCost = gameStateManager.getCardDefinition('character-001')!.reserveCost;
			expect(costCheck.cost).toEqual(expectedCost);
			expect(costCheck.source).toBe('reserve');
		});

		test('Reserve cost should be lower than hand cost', () => {
			const cardDefinition = gameStateManager.getCardDefinition('character-001')!; // Get definition for direct comparison

			expect(cardDefinition.reserveCost.total).toBeLessThan(cardDefinition.handCost.total);
		});
	});

	describe('Rule 5.1.2.e: Cost Alterations (Increases → Decreases → Restrictions)', () => {
		test('Should apply cost increases first', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card); // ADDED THIS LINE

			// Add cost increase effect
			cardPlaySystem.addCostModifier('player1', {
				type: 'increase',
				amount: { total: 1, forest: 0, mountain: 0, water: 0 },
				applies: () => true
			});
			const idToPassForIncrease = String(card.id); // Explicitly cast to string

			const modifiedCostIncrease = cardPlaySystem.calculateModifiedCost(
				'player1',
				idToPassForIncrease,
				'hand'
			);
			const cardDefinitionIncrease = gameStateManager.getCardDefinition('character-001')!;

			expect(modifiedCostIncrease.total).toBe(cardDefinitionIncrease.handCost.total + 1);
		});

		test('Should apply cost decreases after increases', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card); // ADDED THIS LINE

			// Add both increase and decrease
			cardPlaySystem.addCostModifier('player1', {
				type: 'increase',
				amount: { total: 2, forest: 0, mountain: 0, water: 0 },
				applies: () => true
			});

			cardPlaySystem.addCostModifier('player1', {
				type: 'decrease',
				amount: { total: 1, forest: 0, mountain: 0, water: 0 },
				applies: () => true
			});
			const idToPassForDecrease = String(card.id); // Explicitly cast to string

			const modifiedCostDecrease = cardPlaySystem.calculateModifiedCost(
				'player1',
				idToPassForDecrease,
				'hand'
			);
			const cardDefinitionDecrease = gameStateManager.getCardDefinition('character-001')!;

			// Should be original + 2 - 1 = original + 1
			expect(modifiedCostDecrease.total).toBe(cardDefinitionDecrease.handCost.total + 1);
		});

		test('Should apply restrictions last', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card); // ADDED THIS LINE

			// Add restriction (e.g., can't be reduced below certain cost)
			cardPlaySystem.addCostModifier('player1', {
				type: 'restriction',
				restriction: 'minimum',
				minimumCost: { total: 2, forest: 1, mountain: 1, water: 0 },
				applies: () => true
			});

			// Try to reduce cost below minimum
			cardPlaySystem.addCostModifier('player1', {
				type: 'decrease',
				amount: { total: 10, forest: 10, mountain: 10, water: 10 },
				applies: () => true
			});
			const idToPass = String(card.id); // Explicitly cast to string

			const modifiedCost = cardPlaySystem.calculateModifiedCost('player1', idToPass, 'hand');

			expect(modifiedCost.total).toBeGreaterThanOrEqual(2);
			expect(modifiedCost.forest).toBeGreaterThanOrEqual(1);
			expect(modifiedCost.mountain).toBeGreaterThanOrEqual(1);
		});
	});

	describe('Rule 5.1.3: Character Card Placement', () => {
		test('Characters should be placed in Expedition zone by default', () => {
			const player = gameStateManager.getPlayer('player1');
			const character = gameStateManager.objectFactory.createCard('character-001', 'player1');

			const placementResult = cardPlaySystem.placeCharacter('player1', character.id);

			expect(placementResult.success).toBe(true);
			expect(placementResult.zone).toBe(ZoneIdentifier.Expedition);
			expect(player!.zones.expeditionZone.contains(character.id)).toBe(true);
		});

		test('Should handle zone placement restrictions', () => {
			const player = gameStateManager.getPlayer('player1');
			const character = gameStateManager.objectFactory.createCard('character-001', 'player1');

			// Mock zone full condition
			const expeditionZone = player!.zones.expeditionZone;
			// expeditionZone.setCapacity(0); // Force placement failure - BaseZone has no setCapacity

			const placementResult = cardPlaySystem.placeCharacter('player1', character.id);

			expect(placementResult.success).toBe(false);
			expect(placementResult.error).toContain('zone full');
		});
	});

	describe('Rule 5.1.4: Permanent Card Placement', () => {
		test('Landmark Permanents should be placed in Landmark zone', () => {
			const player = gameStateManager.getPlayer('player1');
			// Use the specific landmark permanent ID
			const permanent = gameStateManager.objectFactory.createCard(
				cardDef_LandmarkPermanent_001.id,
				'player1'
			);

			// Assuming placePermanent is called by resolveCard or a similar top-level play function
			// For this test, let's assume placePermanent correctly identifies it as a Landmark type
			// based on cardDef_LandmarkPermanent_001.permanentZoneType or other internal logic.
			const placementResult = cardPlaySystem.placePermanent('player1', permanent.id);

			expect(placementResult.success).toBe(true);
			expect(placementResult.zone).toBe(ZoneIdentifier.LandmarkZone);
			expect(player!.zones.landmarkZone.contains(permanent.id)).toBe(true);
		});

		test('Expedition Permanents should be placed in Expedition zone', () => {
			const player = gameStateManager.getPlayer('player1');
			const permanent = gameStateManager.objectFactory.createCard(
				cardDef_ExpeditionPermanent_001.id,
				'player1'
			);

			// This test assumes that when cardPlaySystem.placePermanent is called,
			// it (or a preceding step like resolveCard) determines the correct zone.
			// If permanentZoneType is used, the system should respect it.
			const placementResult = cardPlaySystem.placePermanent('player1', permanent.id);

			expect(placementResult.success).toBe(true);
			// The CardPlaySystem.placePermanent might be generic, and the actual zone determined by resolveCard.
			// Let's adjust to test via _playCardForTestSteps which handles resolution.
			player!.zones.handZone.add(permanent); // Add to hand to play
			player!.currentMana = 10; // Ensure mana
			const playCompleteResult = cardPlaySystem._playCardForTestSteps('player1', permanent.id, {
				paymentMethod: 'hand'
			});
			expect(playCompleteResult.success).toBe(true);
			expect(player!.zones.expeditionZone.contains(permanent.id)).toBe(true);
		});
	});

	describe('Rule 5.1.5 & 5.2.4.b: Spell Card Resolution Destination', () => {
		test('Non-Fleeting Spells should resolve and go to Reserve (Rule 5.2.4.b)', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1'); // spell-001 is non-Fleeting

			// Simulate full play process
			player!.zones.handZone.add(spell);
			player!.currentMana = 10;
			cardPlaySystem._playCardForTestSteps('player1', spell.id, { paymentMethod: 'hand' });

			// Assertion: Spell is in Reserve and not exhausted (unless it had Cooldown)
			const spellInReserve = player!.zones.reserveZone.findById(spell.id);
			expect(spellInReserve).toBeDefined();
			expect(player!.zones.discardPileZone.contains(spell.id)).toBe(false);
			// Assuming Cooldown is a separate keyword that would make it exhausted.
			// For a basic spell, it should be ready in reserve.
			expect(spellInReserve?.statuses.has(StatusType.Exhausted)).toBe(false);
		});

		test('Fleeting Spells should resolve and go to Discard pile (Rule 5.2.4.b implicitly, 2.4.6.e for spells)', async () => {
			const player = gameStateManager.getPlayer('player1')!;
			const fleetingSpell = gameStateManager.objectFactory.createCard(
				cardDef_FleetingTestSpell.id,
				player.id
			);
			player.zones.handZone.add(fleetingSpell);
			player.currentMana = 10;

			// Play the fleeting spell
			const playResult = cardPlaySystem._playCardForTestSteps(player.id, fleetingSpell.id, {
				paymentMethod: 'hand'
			});
			expect(playResult.success).toBe(true);

			// Assertion: Spell is in Discard pile
			expect(player.zones.discardPileZone.findById(fleetingSpell.id)).toBeDefined();
			expect(player.zones.reserveZone.findById(fleetingSpell.id)).toBeUndefined();
		});

		test('Spells with Cooldown should go to Reserve instead of Discard (and be Exhausted)', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1'); // Normal spell
			player.zones.handZone.add(spell); // Add to hand to play
			player.currentMana = 10;

			// Manually add Cooldown to its definition for this test or have a specific Cooldown spell
			// For simplicity, let's assume a way to make THIS INSTANCE gain Cooldown for the test
			// or that the rule for Cooldown is checked by resolveSpell based on a property.
			// If Cooldown is a keyword:
			const spellDef = gameStateManager.getCardDefinition(spell.definitionId)!;
			spellDef.abilities.push({
				abilityId: 'cooldown-abil',
				keyword: KeywordAbility.Cooldown,
				text: 'Cooldown'
			}); // Mock Cooldown

			cardPlaySystem._playCardForTestSteps('player1', spell.id, { paymentMethod: 'hand' });

			const cardInReserve = player!.zones.reserveZone.findById(spell.id);
			expect(cardInReserve).toBeDefined();
			expect(cardInReserve!.statuses.has(StatusType.Exhausted)).toBe(true);
			// cleanup mock
			spellDef.abilities.pop();
		});
	});

	describe('Rule 5.2.4.a & 2.4.6.c: Fleeting Status Application and Resolution', () => {
		test('Character played from Reserve should gain Fleeting in Limbo', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.reserveZone.add(card);

			// Move to Limbo simulating playing from reserve
			cardPlaySystem.moveToLimbo('player1', card.id, 'reserve');

			const cardInLimbo = player!.zones.limboZone.findById(card.id);
			expect(cardInLimbo).toBeDefined();
			expect(cardInLimbo!.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Spell played from Reserve should gain Fleeting in Limbo', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');
			player!.zones.reserveZone.add(spell);

			cardPlaySystem.moveToLimbo('player1', spell.id, 'reserve');

			const spellInLimbo = player!.zones.limboZone.findById(spell.id);
			expect(spellInLimbo).toBeDefined();
			expect(spellInLimbo!.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Spell with passive Fleeting keyword gains Fleeting in Limbo when played from hand', () => {
			const player = gameStateManager.getPlayer('player1');
			const fleetingSpell = gameStateManager.objectFactory.createCard(
				cardDef_FleetingTestSpell.id,
				'player1'
			);
			player!.zones.handZone.add(fleetingSpell);

			cardPlaySystem.moveToLimbo('player1', fleetingSpell.id, 'hand');

			const spellInLimbo = player!.zones.limboZone.findById(fleetingSpell.id);
			expect(spellInLimbo).toBeDefined();
			// This relies on CardPlaySystem or ObjectFactory applying passive statuses when moving to Limbo or upon creation.
			// If not, this test might need adjustment to spy on status application or pre-apply it if passive handling is elsewhere.
			// For now, assume moveToLimbo (or a prior step in full play) handles passive status application.
			// A more robust way: check if the definition has passive fleeting, then the instance should get it.
			const def = gameStateManager.getCardDefinition(fleetingSpell.definitionId);
			const hasPassiveFleeting = def?.abilities.some(
				(a) =>
					a.keyword === KeywordAbility.Fleeting &&
					(a.abilityType === 'passive' || a.abilityType === 'keyword')
			);
			expect(hasPassiveFleeting).toBe(true);
			// And the instance should have it after moving to limbo
			expect(spellInLimbo!.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Character played from Reserve (gains Fleeting) enters Expedition Zone with Fleeting', () => {
			const player = gameStateManager.getPlayer('player1')!;
			const character = gameStateManager.objectFactory.createCard('character-001', player.id);
			player.zones.reserveZone.add(character);
			player.currentMana = 10;

			cardPlaySystem._playCardForTestSteps(player.id, character.id, { paymentMethod: 'reserve' });

			const charInExpedition = player.zones.expeditionZone.findById(character.id);
			expect(charInExpedition).toBeDefined();
			expect(charInExpedition!.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Expedition Permanent played from Reserve (gains Fleeting) enters Expedition Zone with Fleeting', () => {
			const player = gameStateManager.getPlayer('player1')!;
			const expPermanent = gameStateManager.objectFactory.createCard(
				cardDef_ExpeditionPermanent_001.id,
				player.id
			);
			player.zones.reserveZone.add(expPermanent);
			player.currentMana = 10;

			cardPlaySystem._playCardForTestSteps(player.id, expPermanent.id, {
				paymentMethod: 'reserve'
			});

			const permInExpedition = player.zones.expeditionZone.findById(expPermanent.id);
			expect(permInExpedition).toBeDefined();
			expect(permInExpedition!.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Fleeting card (Character) should go to Discard when leaving play from Expedition', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			card.statuses.add(StatusType.Fleeting);
			player!.zones.expeditionZone.add(card);

			// Simulate card leaving play
			cardPlaySystem.removeFromPlay('player1', card.id);

			expect(player!.zones.expeditionZone.contains(card.id)).toBe(false);
			expect(player!.zones.discardPileZone.contains(card.id)).toBe(true);
			expect(player!.zones.reserveZone.contains(card.id)).toBe(false); // Not to Reserve
		});
	});

	describe('Targeting and Validation', () => {
		test('Should validate legal targets for card abilities', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');

			// Mock spell with targeting requirement
			spell.abilities = [
				{
					type: 'triggered',
					trigger: 'play',
					effect: 'deal_damage',
					targets: ['character'],
					amount: 2
				}
			];

			const targetValidation = cardPlaySystem.validateTargets('player1', spell.id, [
				'invalid-target'
			]);

			expect(targetValidation.valid).toBe(false);
			expect(targetValidation.errors).toContain('Invalid target');
		});

		test('Should handle cards with no targeting requirements', () => {
			const player = gameStateManager.getPlayer('player1');
			const character = gameStateManager.objectFactory.createCard('character-001', 'player1');

			const targetValidation = cardPlaySystem.validateTargets('player1', character.id, []);

			expect(targetValidation.valid).toBe(true);
			expect(targetValidation.errors).toHaveLength(0);
		});
	});

	describe('Error Handling', () => {
		test('Should prevent playing cards not in valid zones', () => {
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			// Card not in any zone

			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand'
			});

			expect(playResult.success).toBe(false);
			expect(playResult.error).toBe('Card not found in playable zone');
		});

		test('Should prevent playing with insufficient mana', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card);

			// Exhaust all mana orbs
			player!.zones.manaZone.getAll().forEach((orb) => orb.statuses.add(StatusType.Exhausted));

			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand'
			});

			expect(playResult.success).toBe(false);
			expect(playResult.error).toBe('Insufficient mana');
		});

		test('Should handle invalid player IDs', () => {
			const playResult = cardPlaySystem._playCardForTestSteps('invalid-player', 'some-card', {
				paymentMethod: 'hand'
			});

			expect(playResult.success).toBe(false);
			expect(playResult.error).toBe('Invalid player');
		});

		test('Should prevent playing during incorrect phases', () => {
			// gameStateManager.setCurrentPhase(GamePhase.Dusk); // Cards can't be played during Dusk

			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			player!.zones.handZone.add(card);

			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand'
			});

			expect(playResult.success).toBe(false);
			expect(playResult.error).toBe('Cannot play cards during current phase');
		});
	});
});
