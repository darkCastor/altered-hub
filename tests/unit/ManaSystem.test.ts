import { describe, test, expect, beforeEach } from 'bun:test';
import { ManaSystem } from '../../src/engine/ManaSystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { StatusType, CardType } from '../../src/engine/types/enums'; // Removed TerrainType
import type { ICardDefinition } from '../../src/engine/types/cards';

/**
 * Unit tests for ManaSystem - Rules 3.2.9 (Mana Zone) and 2.2.10 (Terrain Statistics)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
describe('ManaSystem - Mana and Terrain Rules', () => {
	let manaSystem: ManaSystem;
	let gameStateManager: GameStateManager;
	let eventBus: EventBus;

	beforeEach(() => {
		eventBus = new EventBus();
		const mockCardDefinitions: ICardDefinition[] = [
			{
				id: 'character-forest',
				name: 'Forest Character',
				type: CardType.Character,
				subTypes: [],
				handCost: { total: 2, forest: 2, mountain: 0, water: 0 },
				reserveCost: { total: 1, forest: 1, mountain: 0, water: 0 },
				faction: 'Forest',
				statistics: { forest: 3, mountain: 0, water: 1 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			{
				id: 'character-mountain',
				name: 'Mountain Character',
				type: CardType.Character,
				subTypes: [],
				handCost: { total: 2, forest: 0, mountain: 2, water: 0 },
				reserveCost: { total: 1, forest: 0, mountain: 1, water: 0 },
				faction: 'Mountain',
				statistics: { forest: 0, mountain: 3, water: 1 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			},
			{
				id: 'basic-card',
				name: 'Basic Card',
				type: CardType.Spell,
				subTypes: [],
				handCost: { total: 1, forest: 0, mountain: 0, water: 0 },
				reserveCost: { total: 1, forest: 0, mountain: 0, water: 0 },
				faction: 'Neutral',
				statistics: { forest: 0, mountain: 0, water: 0 },
				abilities: [],
				rarity: 'Common',
				version: '1.0'
			}
		];

		gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
		manaSystem = new ManaSystem(gameStateManager);
		gameStateManager.initializeGame();
	});

	describe('Rule 3.2.9: Mana Zone and Mana Orbs', () => {
		test('Rule 3.2.9.b: Cards should enter Mana zone face-down and exhausted', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('basic-card', 'player1');

			if (!player) throw new Error('Player not found');
			player.zones.handZone.add(card);

			manaSystem.addCardToMana('player1', card.id);

			const manaZone = player.zones.manaZone;
			const addedCard = manaZone.getAll().find((c) => c.id === card.id);

			expect(addedCard?.faceDown).toBe(true);
			expect(addedCard?.statuses.has(StatusType.Exhausted)).toBe(true);
		});

		test('Rule 3.2.9.c: Cards in Mana zone should become type "Mana Orb"', () => {
			const player = gameStateManager.getPlayer('player1');
			const card = gameStateManager.objectFactory.createCard('basic-card', 'player1');

			expect(card.type).toBe(CardType.Spell);

			if (!player) throw new Error('Player not found');
			player.zones.handZone.add(card);

			manaSystem.addCardToMana('player1', card.id);

			const manaZone = player.zones.manaZone;
			const manaOrb = manaZone.getAll().find((c) => c.id === card.id);

			expect(manaOrb?.type).toBe(CardType.ManaOrb);
		});

		test('Rule 3.2.9.e: Should be able to exhaust one Mana Orb to ready another', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');
			const manaOrbs = player.zones.manaZone.getAll();

			manaOrbs.forEach((orb) => orb.statuses.delete(StatusType.Exhausted));
			if (manaOrbs.length < 2) throw new Error('Not enough mana orbs for test');

			manaOrbs[1].statuses.add(StatusType.Exhausted);

			const conversionResult = manaSystem.convertMana(
				'player1',
				manaOrbs[0].objectId,
				manaOrbs[1].objectId
			);

			expect(conversionResult).toBe(true);
			expect(manaOrbs[0].statuses.has(StatusType.Exhausted)).toBe(true);
			expect(manaOrbs[1].statuses.has(StatusType.Exhausted)).toBe(false);
		});

		test('Rule 3.2.9.f: Should pay X mana by exhausting X Mana Orbs', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');
			const manaOrbs = player.zones.manaZone.getAll();

			manaOrbs.forEach((orb) => orb.statuses.delete(StatusType.Exhausted));

			const paymentResult = manaSystem.payMana('player1', 2);

			expect(paymentResult.success).toBe(true);

			const exhaustedCount = manaOrbs.filter((orb) =>
				orb.statuses.has(StatusType.Exhausted)
			).length;
			expect(exhaustedCount).toBe(2);
		});

		test('Should not be able to pay more mana than available', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');
			const manaOrbs = player.zones.manaZone.getAll();

			manaOrbs.forEach((orb) => orb.statuses.delete(StatusType.Exhausted));

			const paymentResult = manaSystem.payMana('player1', 5);

			expect(paymentResult.success).toBe(false);
			expect(paymentResult.error).toBe('Insufficient mana');

			const exhaustedCount = manaOrbs.filter((orb) =>
				orb.statuses.has(StatusType.Exhausted)
			).length;
			expect(exhaustedCount).toBe(0);
		});

		test('Should correctly calculate available mana from ready orbs', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');
			const manaOrbs = player.zones.manaZone.getAll();

			manaOrbs.forEach((orb) => orb.statuses.delete(StatusType.Exhausted));

			let availableMana = manaSystem.getManaFromOrbs('player1');
			expect(availableMana).toBe(3);

			if (manaOrbs.length > 0) {
				manaOrbs[0].statuses.add(StatusType.Exhausted);
			}

			availableMana = manaSystem.getManaFromOrbs('player1');
			expect(availableMana).toBe(manaOrbs.length > 0 ? 2 : 0);
		});
	});

	describe('Rule 2.2.10: Character Statistics and Terrain Mana', () => {
		test('Rule 2.2.10: Characters should provide terrain-based mana through statistics', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			player.zones.expeditionZone.add(forestChar);

			const mountainChar = gameStateManager.objectFactory.createCard(
				'character-mountain',
				'player1'
			);
			player.zones.heroZone.add(mountainChar);

			const manaPool = manaSystem.getAvailableMana('player1');

			expect(manaPool.forest).toBe(3);
			expect(manaPool.mountain).toBe(3);
			expect(manaPool.water).toBe(2);
			expect(manaPool.orbs).toBe(3);
			expect(manaPool.total).toBe(11);
		});

		test('Should only count statistics from characters in expedition and hero zones', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const handChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			player.zones.handZone.add(handChar);

			const reserveChar = gameStateManager.objectFactory.createCard(
				'character-mountain',
				'player1'
			);
			player.zones.reserveZone.add(reserveChar);

			const manaPool = manaSystem.getAvailableMana('player1');

			expect(manaPool.forest).toBe(0);
			expect(manaPool.mountain).toBe(0);
			expect(manaPool.water).toBe(0);
			expect(manaPool.orbs).toBe(3);
			expect(manaPool.total).toBe(3);
		});

		test('Should handle terrain restrictions correctly', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			player.zones.expeditionZone.add(forestChar);

			const forestCost = { total: 2, forest: 2, mountain: 0, water: 0 };
			const canPayForest = manaSystem.canPayCost('player1', forestCost);
			expect(canPayForest).toBe(true);

			const mountainCost = { total: 2, forest: 0, mountain: 2, water: 0 };
			const canPayMountain = manaSystem.canPayCost('player1', mountainCost);
			expect(canPayMountain).toBe(false);
		});

		test('Should allow terrain mana to be used for generic costs', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const character = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			player.zones.expeditionZone.add(character);

			const genericCost = { total: 2, forest: 0, mountain: 0, water: 0 };
			const canPayGeneric = manaSystem.canPayCost('player1', genericCost);
			expect(canPayGeneric).toBe(true);

			const paymentResult = manaSystem.payGenericCost('player1', genericCost);
			expect(paymentResult.success).toBe(true);
		});
	});

	describe('Rule 4.2.1.e: Expand Mechanics', () => {
		test('Should allow adding card from hand to mana during Morning phase', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const card = gameStateManager.objectFactory.createCard('basic-card', 'player1');
			player.zones.handZone.add(card);

			const initialHandSize = player.zones.handZone.getAll().length;
			const initialManaCount = player.zones.manaZone.getAll().length;

			const expandResult = manaSystem.expandMana('player1', card.objectId);

			expect(expandResult.success).toBe(true);
			expect(player.zones.handZone.getAll().length).toBe(initialHandSize - 1);
			expect(player.zones.manaZone.getAll().length).toBe(initialManaCount + 1);

			const manaCard = player.zones.manaZone.getAll().find((c) => c.id === card.id);
			expect(manaCard).toBeDefined();
			expect(manaCard?.faceDown).toBe(true);
			expect(manaCard?.statuses.has(StatusType.Exhausted)).toBe(false);
		});

		test('Should prevent expand if card not in hand', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const expandResult = manaSystem.expandMana('player1', 'nonexistent-card');

			expect(expandResult.success).toBe(false);
			expect(expandResult.error).toBe('Card not found in hand');
		});

		test('Should track expand usage per player per turn', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const card1 = gameStateManager.objectFactory.createCard('basic-card', 'player1');
			const card2 = gameStateManager.objectFactory.createCard('basic-card', 'player1');
			player.zones.handZone.add(card1);
			player.zones.handZone.add(card2);

			const expand1 = manaSystem.expandMana('player1', card1.objectId);
			expect(expand1.success).toBe(true);

			const expand2 = manaSystem.expandMana('player1', card2.objectId);
			expect(expand2.success).toBe(false);
			expect(expand2.error).toBe('Already expanded this turn');
		});
	});

	describe('Mana Conversion and Complex Payments', () => {
		test('Should handle complex mana costs with terrain requirements', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			const mountainChar = gameStateManager.objectFactory.createCard(
				'character-mountain',
				'player1'
			);

			player.zones.expeditionZone.add(forestChar);
			player.zones.heroZone.add(mountainChar);

			const complexCost = { total: 5, forest: 2, mountain: 2, water: 1 };

			const canPay = manaSystem.canPayCost('player1', complexCost);
			expect(canPay).toBe(true);

			const paymentResult = manaSystem.payComplexCost('player1', complexCost);
			expect(paymentResult.success).toBe(true);
			expect(paymentResult.payment).toEqual({
				forestUsed: 2,
				mountainUsed: 2,
				waterUsed: 1,
				orbsUsed: 0
			});
		});

		test('Should prioritize specific terrain mana over generic mana', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const forestChar = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			player.zones.expeditionZone.add(forestChar);

			const cost = { total: 4, forest: 2, mountain: 0, water: 0 };

			const paymentResult = manaSystem.payComplexCost('player1', cost);

			expect(paymentResult.success).toBe(true);
			if (paymentResult.payment) {
				expect(paymentResult.payment.forestUsed).toBe(2);
				expect(paymentResult.payment.orbsUsed).toBe(2);
			} else {
				throw new Error('Payment details missing');
			}
		});

		test('Should handle mana overflow correctly', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			const character = gameStateManager.objectFactory.createCard('character-forest', 'player1');
			player.zones.expeditionZone.add(character);

			const manaPool = manaSystem.getAvailableMana('player1');

			expect(manaPool.forest).toBeGreaterThanOrEqual(0);
			expect(manaPool.mountain).toBeGreaterThanOrEqual(0);
			expect(manaPool.water).toBeGreaterThanOrEqual(0);
			expect(manaPool.orbs).toBeGreaterThanOrEqual(0);
			expect(manaPool.total).toBeGreaterThanOrEqual(0);
		});
	});

	describe('Error Handling', () => {
		test('Should handle invalid player ID gracefully', () => {
			const manaPool = manaSystem.getAvailableMana('invalid-player');

			expect(manaPool).toEqual({
				total: 0,
				forest: 0,
				mountain: 0,
				water: 0,
				orbs: 0
			});
		});

		test('Should handle empty mana zone', () => {
			const player = gameStateManager.getPlayer('player1');
			if (!player) throw new Error('Player not found');

			player.zones.manaZone.clear();

			const availableMana = manaSystem.getManaFromOrbs('player1');
			expect(availableMana).toBe(0);

			const paymentResult = manaSystem.payMana('player1', 1);
			expect(paymentResult.success).toBe(false);
			expect(paymentResult.error).toBe('Insufficient mana');
		});

		test('Should validate mana conversion parameters', () => {
			const conversionResult = manaSystem.convertMana(
				'invalid-player',
				'invalid-source',
				'invalid-target'
			);

			expect(conversionResult).toBe(false);
		});
	});
});
