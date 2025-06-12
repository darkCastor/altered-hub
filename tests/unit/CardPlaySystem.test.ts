import { describe, test, expect, beforeEach } from 'bun:test';
import { CardPlaySystem, CardPlayOptions } from '../../src/engine/CardPlaySystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import {
	CardType,
	StatusType,
	ZoneIdentifier,
	GamePhase,
	KeywordAbility,
	PermanentZoneType
} from '../../src/engine/types/enums'; // Added KeywordAbility, PermanentZoneType
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';

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
				keyword: KeywordAbility.Fleeting,
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
		permanentZoneType: PermanentZoneType.Expedition, // Corrected to use PermanentZoneType
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
		permanentZoneType: PermanentZoneType.Landmark, // Corrected to use PermanentZoneType
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
				id: 'char-exp-test', // Specific for expedition tests
				name: 'Expedition Test Character',
				type: CardType.Character,
				subTypes: [],
				handCost: { total: 1 },
				reserveCost: { total: 1 },
				faction: 'Neutral',
				statistics: { forest: 1, mountain: 1, water: 1 },
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
			cardDef_LandmarkPermanent_001,
			cardDef_FleetingTestSpell,
			cardDef_ExpeditionPermanent_001
		];

		gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
		cardPlaySystem = new CardPlaySystem(gameStateManager);
		gameStateManager.initializeGame();
		gameStateManager.setCurrentPhase(GamePhase.Afternoon);
	});

	describe('Rule 5.1.2: Card Playing Process (4 Parts)', () => {
		test('Rule 5.1.2.c: Part 1 - Declare Intent (reveal, choose modes, declare payment)', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
			}

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
			if (player) {
				player.zones.handZone.add(card);
			}

			cardPlaySystem.declarePlayIntent('player1', card.id, { paymentMethod: 'hand' });
			const moveResult = cardPlaySystem.moveToLimbo('player1', card.id);

			expect(moveResult.success).toBe(true);
			if (player) {
				expect(player.zones.handZone.contains(card.id)).toBe(false);
				expect(player.zones.limboZone.contains(card.id)).toBe(true);
			}
		});

		test('Rule 5.1.2.h: Part 3 - Pay Costs (all costs paid simultaneously)', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');

			if (player) {
				player.zones.manaZone.getAll().forEach((orb) => orb.statuses.delete(StatusType.Exhausted));
				player.zones.limboZone.add(card);
			}

			const paymentResult = cardPlaySystem.payCosts('player1', card.id);

			expect(paymentResult.success).toBe(true);
			expect(paymentResult.costsDetail).toBeDefined();

			if (player) {
				const exhaustedOrbs = player.zones.manaZone
					.getAll()
					.filter((orb) => orb.statuses.has(StatusType.Exhausted));
				expect(exhaustedOrbs.length).toBeGreaterThan(0);
			}
		});

		test('Rule 5.1.2.i: Part 4 - Resolution (effect resolves, move to final zone)', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.limboZone.add(card);
			}

			const resolutionResult = cardPlaySystem.resolveCard('player1', card.id);

			expect(resolutionResult.success).toBe(true);
			if (player) {
				expect(player.zones.limboZone.contains(card.id)).toBe(false);
				expect(player.zones.expeditionZone.contains(card.id)).toBe(true);
			}
		});

		test('Complete card playing process should work end-to-end', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
				player.zones.manaZone.getAll().forEach((orb) => orb.statuses.delete(StatusType.Exhausted));
			}

			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand',
				chosenModes: [],
				targetChoices: []
			});

			expect(playResult.success).toBe(true);
			if (player) {
				expect(player.zones.handZone.contains(card.id)).toBe(false);
				expect(player.zones.expeditionZone.contains(card.id)).toBe(true);
			}
		});
	});

	describe('Rule 5.1.2.d: Hand Cost vs Reserve Cost', () => {
		test('Should use Hand Cost when playing from Hand', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			console.log('[Test LOG] Created card object:', JSON.stringify(card, null, 2));
			if (player) {
				player.zones.handZone.add(card);
			}
			const idToPass = String(card?.id);

			const costCheck = cardPlaySystem.getPlayingCost('player1', idToPass, 'hand');
			const definition = gameStateManager.getCardDefinition('character-001');
			const expectedCost = definition?.handCost;
			expect(costCheck.cost).toEqual(expectedCost);
			expect(costCheck.source).toBe('hand');
		});

		test('Should use Reserve Cost when playing from Reserve', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.reserveZone.add(card);
			}
			const idToPass = String(card.id);

			const costCheck = cardPlaySystem.getPlayingCost('player1', idToPass, 'reserve');
			const definition = gameStateManager.getCardDefinition('character-001');
			const expectedCost = definition?.reserveCost;
			expect(costCheck.cost).toEqual(expectedCost);
			expect(costCheck.source).toBe('reserve');
		});

		test('Reserve cost should be lower than hand cost', () => {
			const cardDefinition = gameStateManager.getCardDefinition('character-001');
			if (cardDefinition && cardDefinition.reserveCost && cardDefinition.handCost) {
				expect(cardDefinition.reserveCost.total).toBeLessThan(cardDefinition.handCost.total);
			} else {
				throw new Error('Card definition or costs missing for character-001');
			}
		});
	});

	describe('Rule 5.1.2.e: Cost Alterations (Increases → Decreases → Restrictions)', () => {
		test('Should apply cost increases first', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
			}

			cardPlaySystem.addCostModifier('player1', {
				type: 'increase',
				amount: { total: 1, forest: 0, mountain: 0, water: 0 },
				applies: () => true
			});
			const idToPassForIncrease = String(card.id);

			const modifiedCostIncrease = cardPlaySystem.calculateModifiedCost(
				'player1',
				idToPassForIncrease,
				'hand'
			);
			const cardDefinitionIncrease = gameStateManager.getCardDefinition('character-001');
			if (cardDefinitionIncrease && cardDefinitionIncrease.handCost) {
				expect(modifiedCostIncrease.total).toBe(cardDefinitionIncrease.handCost.total + 1);
			} else {
				throw new Error('Card definition or handCost missing for character-001');
			}
		});

		test('Should apply cost decreases after increases', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
			}

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
			const idToPassForDecrease = String(card.id);

			const modifiedCostDecrease = cardPlaySystem.calculateModifiedCost(
				'player1',
				idToPassForDecrease,
				'hand'
			);
			const cardDefinitionDecrease = gameStateManager.getCardDefinition('character-001');
			if (cardDefinitionDecrease && cardDefinitionDecrease.handCost) {
				expect(modifiedCostDecrease.total).toBe(cardDefinitionDecrease.handCost.total + 1);
			} else {
				throw new Error('Card definition or handCost missing for character-001');
			}
		});

		test('Should apply restrictions last', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
			}

			cardPlaySystem.addCostModifier('player1', {
				type: 'restriction',
				restriction: 'minimum',
				minimumCost: { total: 2, forest: 1, mountain: 1, water: 0 },
				applies: () => true
			});

			cardPlaySystem.addCostModifier('player1', {
				type: 'decrease',
				amount: { total: 10, forest: 10, mountain: 10, water: 10 },
				applies: () => true
			});
			const idToPass = String(card.id);

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
			if (player) {
				expect(player.zones.expeditionZone.contains(character.id)).toBe(true);
			}
		});

		test('Should handle zone placement restrictions', () => {
			const player = gameStateManager.getPlayer('player1');
			const character = gameStateManager.objectFactory.createCard('character-001', 'player1');

			if (player) {
				// expeditionZone available at player.zones.expeditionZone
			}
			// expeditionZone.setCapacity(0); // Force placement failure - BaseZone has no setCapacity

			const placementResult = cardPlaySystem.placeCharacter('player1', character.id);

			expect(placementResult.success).toBe(false);
			expect(placementResult.error).toContain('zone full');
		});
	});

	describe('Rule 5.1.4: Permanent Card Placement', () => {
		test('Landmark Permanents should be placed in Landmark zone', () => {
			const player = gameStateManager.getPlayer('player1');
			const permanent = gameStateManager.objectFactory.createCard(
				cardDef_LandmarkPermanent_001.id,
				'player1'
			);

			const placementResult = cardPlaySystem.placePermanent('player1', permanent.id);

			expect(placementResult.success).toBe(true);
			expect(placementResult.zone).toBe(ZoneIdentifier.LandmarkZone);
			if (player) {
				expect(player.zones.landmarkZone.contains(permanent.id)).toBe(true);
			}
		});

		test('Expedition Permanents should be placed in Expedition zone', () => {
			const player = gameStateManager.getPlayer('player1');
			const permanent = gameStateManager.objectFactory.createCard(
				cardDef_ExpeditionPermanent_001.id,
				'player1'
			);
			if (player) {
				player.zones.handZone.add(permanent);
				player.currentMana = 10;
			}
			const playCompleteResult = cardPlaySystem._playCardForTestSteps('player1', permanent.id, {
				paymentMethod: 'hand'
			});
			expect(playCompleteResult.success).toBe(true);
			if (player) {
				expect(player.zones.expeditionZone.contains(permanent.id)).toBe(true);
			}
		});
	});

	describe('Rule 5.1.5 & 5.2.4.b: Spell Card Resolution Destination', () => {
		test('Non-Fleeting Spells should resolve and go to Reserve (Rule 5.2.4.b)', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');

			if (player) {
				player.zones.handZone.add(spell);
				player.currentMana = 10;
			}
			cardPlaySystem._playCardForTestSteps('player1', spell.id, { paymentMethod: 'hand' });

			if (player) {
				const spellInReserve = player.zones.reserveZone.findById(spell.id);
				expect(spellInReserve).toBeDefined();
				expect(player.zones.discardPileZone.contains(spell.id)).toBe(false);
				expect(spellInReserve?.statuses.has(StatusType.Exhausted)).toBe(false);
			}
		});

		test('Fleeting Spells should resolve and go to Discard pile (Rule 5.2.4.b implicitly, 2.4.6.e for spells)', async () => {
			const player = gameStateManager.getPlayer('player1');
			const fleetingSpell = gameStateManager.objectFactory.createCard(
				cardDef_FleetingTestSpell.id,
				player?.id || 'player1'
			);
			if (player) {
				player.zones.handZone.add(fleetingSpell);
				player.currentMana = 10;
			}

			const playResult = cardPlaySystem._playCardForTestSteps(
				player?.id || 'player1',
				fleetingSpell.id,
				{
					paymentMethod: 'hand'
				}
			);
			expect(playResult.success).toBe(true);
			if (player) {
				expect(player.zones.discardPileZone.findById(fleetingSpell.id)).toBeDefined();
				expect(player.zones.reserveZone.findById(fleetingSpell.id)).toBeUndefined();
			}
		});

		test('Spells with Cooldown should go to Reserve instead of Discard (and be Exhausted)', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');
			if (player) {
				player.zones.handZone.add(spell);
				player.currentMana = 10;
			}

			const spellDef = gameStateManager.getCardDefinition(spell.definitionId);
			if (spellDef) {
				spellDef.abilities.push({
					abilityId: 'cooldown-abil',
					keyword: KeywordAbility.Cooldown,
					text: 'Cooldown',
					abilityType: 'keyword', // Added to satisfy IAbility if needed
					effect: { steps: [] }, // Added to satisfy IAbility if needed
					isSupportAbility: false // Added to satisfy IAbility if needed
				});
			}

			cardPlaySystem._playCardForTestSteps('player1', spell.id, { paymentMethod: 'hand' });

			if (player) {
				const cardInReserve = player.zones.reserveZone.findById(spell.id);
				expect(cardInReserve).toBeDefined();
				expect(cardInReserve?.statuses.has(StatusType.Exhausted)).toBe(true);
			}
			if (spellDef) {
				spellDef.abilities.pop();
			}
		});
	});

	describe('Rule 5.2.4.a & 2.4.6.c: Fleeting Status Application and Resolution', () => {
		test('Character played from Reserve should gain Fleeting in Limbo', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.reserveZone.add(card);
			}

			cardPlaySystem.moveToLimbo('player1', card.id, 'reserve');

			const cardInLimbo = player?.zones.limboZone.findById(card.id);
			expect(cardInLimbo).toBeDefined();
			expect(cardInLimbo?.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Spell played from Reserve should gain Fleeting in Limbo', () => {
			const player = gameStateManager.getPlayer('player1');
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');
			if (player) {
				player.zones.reserveZone.add(spell);
			}

			cardPlaySystem.moveToLimbo('player1', spell.id, 'reserve');

			const spellInLimbo = player?.zones.limboZone.findById(spell.id);
			expect(spellInLimbo).toBeDefined();
			expect(spellInLimbo?.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Spell with passive Fleeting keyword gains Fleeting in Limbo when played from hand', () => {
			const player = gameStateManager.getPlayer('player1');
			const fleetingSpell = gameStateManager.objectFactory.createCard(
				cardDef_FleetingTestSpell.id,
				'player1'
			);
			if (player) {
				player.zones.handZone.add(fleetingSpell);
			}

			cardPlaySystem.moveToLimbo('player1', fleetingSpell.id, 'hand');

			const spellInLimbo = player?.zones.limboZone.findById(fleetingSpell.id);
			expect(spellInLimbo).toBeDefined();

			const def = gameStateManager.getCardDefinition(fleetingSpell.definitionId);
			const hasPassiveFleeting = def?.abilities.some(
				(a) =>
					a.keyword === KeywordAbility.Fleeting &&
					(a.abilityType === 'passive' || a.abilityType === 'keyword')
			);
			expect(hasPassiveFleeting).toBe(true);
			expect(spellInLimbo?.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Character played from Reserve (gains Fleeting) enters Expedition Zone with Fleeting', () => {
			const player = gameStateManager.getPlayer('player1');
			const character = gameStateManager.objectFactory.createCard(
				'character-001',
				player?.id || 'player1'
			);
			if (player) {
				player.zones.reserveZone.add(character);
				player.currentMana = 10;
			}

			cardPlaySystem._playCardForTestSteps(player?.id || 'player1', character.id, {
				paymentMethod: 'reserve'
			});

			const charInExpedition = player?.zones.expeditionZone.findById(character.id);
			expect(charInExpedition).toBeDefined();
			expect(charInExpedition?.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Expedition Permanent played from Reserve (gains Fleeting) enters Expedition Zone with Fleeting', () => {
			const player = gameStateManager.getPlayer('player1');
			const expPermanent = gameStateManager.objectFactory.createCard(
				cardDef_ExpeditionPermanent_001.id,
				player?.id || 'player1'
			);
			if (player) {
				player.zones.reserveZone.add(expPermanent);
				player.currentMana = 10;
			}

			cardPlaySystem._playCardForTestSteps(player?.id || 'player1', expPermanent.id, {
				paymentMethod: 'reserve'
			});

			const permInExpedition = player?.zones.expeditionZone.findById(expPermanent.id);
			expect(permInExpedition).toBeDefined();
			expect(permInExpedition?.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Fleeting card (Character) should go to Discard when leaving play from Expedition', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			card.statuses.add(StatusType.Fleeting);
			if (player) {
				player.zones.expeditionZone.add(card);
			}

			cardPlaySystem.removeFromPlay('player1', card.id);
			if (player) {
				expect(player.zones.expeditionZone.contains(card.id)).toBe(false);
				expect(player.zones.discardPileZone.contains(card.id)).toBe(true);
				expect(player.zones.reserveZone.contains(card.id)).toBe(false);
			}
		});
	});

	describe('Targeting and Validation', () => {
		test('Should validate legal targets for card abilities', () => {
			const spell = gameStateManager.objectFactory.createCard('spell-001', 'player1');

			spell.abilities = [
				{
					abilityId: 'test-abil', // Added abilityId
					abilityType: 'triggered', // Changed from 'type'
					trigger: 'play',
					effect: {
						steps: [{ verb: 'deal_damage', targets: 'character', parameters: { amount: 2 } }]
					}, // Simplified effect
					text: 'Deal 2 damage', // Added text
					isSupportAbility: false // Added
				}
			];

			const targetValidation = cardPlaySystem.validateTargets('player1', spell.id, [
				'invalid-target'
			]);

			expect(targetValidation.valid).toBe(false);
			expect(targetValidation.errors).toContain('Invalid target');
		});

		test('Should handle cards with no targeting requirements', () => {
			const character = gameStateManager.objectFactory.createCard('character-001', 'player1');
			const targetValidation = cardPlaySystem.validateTargets('player1', character.id, []);
			expect(targetValidation.valid).toBe(true);
			expect(targetValidation.errors).toHaveLength(0);
		});
	});

	describe('Error Handling', () => {
		test('Should prevent playing cards not in valid zones', () => {
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand'
			});
			expect(playResult.success).toBe(false);
			expect(playResult.error).toBe('Card not found in playable zone');
		});

		test('Should prevent playing with insufficient mana', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
				player.zones.manaZone.getAll().forEach((orb) => orb.statuses.add(StatusType.Exhausted));
			}

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
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('character-001', 'player1');
			if (player) {
				player.zones.handZone.add(card);
			}
			// gameStateManager.setCurrentPhase(GamePhase.Dusk); // Example of incorrect phase
			// For this test, we'll assume the default Afternoon is fine, but if it were Dusk:
			const originalPhase = gameStateManager.state.currentPhase;
			gameStateManager.setCurrentPhase(GamePhase.Dusk);

			const playResult = cardPlaySystem._playCardForTestSteps('player1', card.id, {
				paymentMethod: 'hand'
			});

			expect(playResult.success).toBe(false);
			expect(playResult.error).toBe('Cannot play cards during current phase');
			gameStateManager.setCurrentPhase(originalPhase); // Reset phase
		});
	});

	describe('Shared Expedition Zone Card Play', () => {
		beforeEach(() => {
			// Ensure player1 has mana
			const player = gameStateManager.getPlayer('player1');
			if (player) {
				player.zones.manaZone.getAll().forEach(orb => {
					if (orb.statuses.has(StatusType.Exhausted)) {
						orb.statuses.delete(StatusType.Exhausted);
					}
				});
				// Give enough mana orbs if needed, assuming 3 are standard from initializeGame
				while(player.zones.manaZone.getCount() < 3) {
					const manaOrbDef = mockCardDefinitions.find(def => def.type === CardType.Spell); // Use any card def for mock orb
					if(manaOrbDef){
						const orb = gameStateManager.objectFactory.createCard(manaOrbDef.id, 'player1');
						orb.type = CardType.ManaOrb;
						orb.faceDown = true;
						player.zones.manaZone.add(orb);
					} else {
						break; // no def found
					}
				}
			}
		});

		test('Playing a Character to Hero expedition places it in shared zone with correct assignment', async () => {
			const player = gameStateManager.getPlayer('player1')!;
			const cardToPlay = gameStateManager.objectFactory.createCardInstance('char-exp-test', 'player1');
			player.zones.handZone.add(cardToPlay);

			const options: CardPlayOptions = { fromZone: ZoneIdentifier.Hand, expeditionChoice: 'hero' };
			await cardPlaySystem.playCard('player1', cardToPlay.instanceId, options);

			const sharedExpeditionZone = gameStateManager.state.sharedZones.expedition;
			// CardPlaySystem.playCard currently moves to Limbo, then the "resolve" part (which is placeholder) moves to final zone.
			// The placeholder in playCard was set up to move characters/exp-permanents to shared expedition.

			let foundInExpedition = false;
			let gameObjectInExpedition: IGameObject | undefined;

			for (const entity of sharedExpeditionZone.getAll()) {
				if (entity.definitionId === 'char-exp-test') {
					foundInExpedition = true;
					gameObjectInExpedition = entity as IGameObject;
					break;
				}
			}
			expect(foundInExpedition).toBe(true);
			expect(player.zones.handZone.findById(cardToPlay.instanceId)).toBeUndefined();

			expect(gameObjectInExpedition).toBeDefined();
			if (gameObjectInExpedition) {
				expect(gameObjectInExpedition.expeditionAssignment).toEqual({ playerId: 'player1', type: 'Hero' });
			}
		});

		test('Playing a Character to Companion expedition places it in shared zone with correct assignment', async () => {
			const player = gameStateManager.getPlayer('player1')!;
			const cardToPlay = gameStateManager.objectFactory.createCardInstance('char-exp-test', 'player1');
			player.zones.handZone.add(cardToPlay);

			const options: CardPlayOptions = { fromZone: ZoneIdentifier.Hand, expeditionChoice: 'companion' };
			await cardPlaySystem.playCard('player1', cardToPlay.instanceId, options);

			const sharedExpeditionZone = gameStateManager.state.sharedZones.expedition;
			let gameObjectInExpedition: IGameObject | undefined;
			for (const entity of sharedExpeditionZone.getAll()) {
				if (entity.definitionId === 'char-exp-test') {
					gameObjectInExpedition = entity as IGameObject;
					break;
				}
			}
			expect(gameObjectInExpedition).toBeDefined();
			if (gameObjectInExpedition) {
				expect(gameObjectInExpedition.expeditionAssignment).toEqual({ playerId: 'player1', type: 'Companion' });
			}
		});

		test('Playing an Expedition Permanent places it in shared zone with correct assignment', async () => {
			const player = gameStateManager.getPlayer('player1')!;
			const cardToPlay = gameStateManager.objectFactory.createCardInstance('exp-permanent-001', 'player1');
			player.zones.handZone.add(cardToPlay);

			// Ensure player has mana for a card that costs 2
			player.zones.manaZone.getAll().forEach(orb => orb.statuses.delete(StatusType.Exhausted));


			const options: CardPlayOptions = { fromZone: ZoneIdentifier.Hand, expeditionChoice: 'hero' }; // Assuming exp permanents also need a choice
			await cardPlaySystem.playCard('player1', cardToPlay.instanceId, options);

			const sharedExpeditionZone = gameStateManager.state.sharedZones.expedition;
			let gameObjectInExpedition: IGameObject | undefined;
			for (const entity of sharedExpeditionZone.getAll()) {
				if (entity.definitionId === 'exp-permanent-001') {
					gameObjectInExpedition = entity as IGameObject;
					break;
				}
			}
			expect(gameObjectInExpedition).toBeDefined();
			if (gameObjectInExpedition) {
				expect(gameObjectInExpedition.expeditionAssignment).toEqual({ playerId: 'player1', type: 'Hero' });
				expect(gameObjectInExpedition.type).toBe(CardType.Permanent);
			}
		});
	});
});
