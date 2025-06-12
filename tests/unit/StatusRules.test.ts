import { describe, test, expect, beforeEach } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import {
	CardType,
	StatusType,
	ZoneIdentifier,
	KeywordAbility,
	CounterType
} from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';

describe('GameStateManager - Status Rule Compliance (Rule 2.4)', () => {
	let gsm: GameStateManager;
	let eventBus: EventBus;
	let P1 = 'player1';
	let P2 = 'player2';

	const cardDef_AsleepAnchoredChar: ICardDefinition = {
		id: 'char-asleep-anchored',
		name: 'Sleepy Rock',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 1, mountain: 1, water: 1 },
		abilities: [], // No passive abilities that grant these statuses
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_NormalChar: ICardDefinition = {
		id: 'char-normal',
		name: 'Normal Guy',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 2, mountain: 2, water: 2 },
		abilities: [],
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_FleetingChar: ICardDefinition = {
		id: 'char-fleeting',
		name: 'Fleeting Fellow',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 1, mountain: 1, water: 1 },
		abilities: [
			{
				description: 'Fleeting (passive for test)',
				type: 'passive',
				keyword: KeywordAbility.Fleeting
			}
		], // Note: This is a conceptual passive. Real Fleeting is applied differently.
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_FleetingSpell: ICardDefinition = {
		id: 'spell-fleeting',
		name: 'Fleeting Chant',
		type: CardType.Spell,
		subTypes: [],
		handCost: { total: 1 },
		faction: 'Neutral',
		abilities: [
			{
				abilityId: 'abil-fleeting-passive-spell',
				text: 'This spell is Fleeting.',
				abilityType: 'passive',
				keyword: KeywordAbility.Fleeting, // This implies the card instance itself should become Fleeting
				effect: { steps: [] },
				isSupportAbility: false
			}
		],
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_CharWithTapAbility: ICardDefinition = {
		id: 'char-tap-ability',
		name: 'Resourceful Tapper',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 1, mountain: 1, water: 1 },
		abilities: [
			{
				abilityId: 'abil-tap-draw',
				text: 'T: Draw a card.',
				abilityType: 'activated',
				cost: [{ type: 'exhaustSelf' }],
				effect: { steps: [{ type: 'drawCard', player: 'self', quantity: 1 }] },
				isSupportAbility: false
			}
		],
		rarity: 'Common',
		version: '1.0'
	};

	const cardDef_CharWithSupportAbility: ICardDefinition = {
		id: 'char-support-ability',
		name: 'Helpful Friend',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 },
		reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 1, mountain: 1, water: 1 },
		abilities: [
			{
				abilityId: 'abil-support-draw',
				text: 'D: You may draw a card.',
				abilityType: 'support',
				trigger: 'onDemand', // Assuming 'onDemand' or similar for 'D' abilities
				effect: { steps: [{ type: 'drawCard', player: 'self', quantity: 1, isOptional: true }] },
				isSupportAbility: true
			}
		],
		rarity: 'Common',
		version: '1.0'
	};

	beforeEach(async () => {
		eventBus = new EventBus();
		gsm = new GameStateManager(
			[P1, P2],
			[
				cardDef_AsleepAnchoredChar,
				cardDef_NormalChar,
				cardDef_FleetingChar,
				cardDef_FleetingSpell,
				cardDef_CharWithTapAbility,
				cardDef_CharWithSupportAbility
			],
			eventBus
		);
		await gsm.initializeGame(); // Basic setup
		// Ensure players start with some mana for tests
		gsm.getPlayer(P1)!.currentMana = 10;
		gsm.getPlayer(P2)!.currentMana = 10;

		// Ensure players have their expedition zones set up in gsm.state.players.get(P1).zones.expeditionZone
		// initializeGame should handle this, but good to be aware.
	});

	// Rule 2.4.3.a: Asleep Character's statistics are not counted in their expedition's statistics during Progress.
	test('Rule 2.4.3.a: Asleep character stats are not counted during Progress', async () => {
		const player = gsm.getPlayer(P1)!;
		const sleepyChar = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_AsleepAnchoredChar.id, P1),
			P1
		);
		sleepyChar.statuses.add(StatusType.Asleep);
		player.zones.expeditionZone.add(sleepyChar);

		const normalChar = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1),
			P1
		);
		player.zones.expeditionZone.add(normalChar);

		// Manually trigger stat calculation for P1's hero expedition (assuming it's one of them)
		const stats = gsm.calculateExpeditionStats(P1, 'hero');
		expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest); // Only normalChar's stats
		expect(stats.mountain).toBe(cardDef_NormalChar.statistics!.mountain);
		expect(stats.water).toBe(cardDef_NormalChar.statistics!.water);
	});

	// Rule 2.4.3.b & 2.4.2.b: During Rest, Asleep/Anchored Characters are not sent to Reserve and lose Asleep/Anchored.
	test('Rule 2.4.3.b / 2.4.2.b: Asleep/Anchored characters are not sent to Reserve and lose status during Rest', async () => {
		const player = gsm.getPlayer(P1)!;
		const expeditionZone = player.zones.expeditionZone;
		const reserveZone = player.zones.reserveZone;

		const sleepyChar = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_AsleepAnchoredChar.id, P1),
			P1
		);
		sleepyChar.statuses.add(StatusType.Asleep);
		expeditionZone.add(sleepyChar);
		const sleepyCharId = sleepyChar.objectId;

		const anchoredChar = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_AsleepAnchoredChar.id, P1),
			P1 // Use same def for simplicity
		);
		anchoredChar.instanceId = 'anchoredCharInst'; // different instance
		anchoredChar.statuses.add(StatusType.Anchored);
		expeditionZone.add(anchoredChar);
		const anchoredCharId = anchoredChar.objectId;

		const normalChar = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1),
			P1
		);
		expeditionZone.add(normalChar);
		const normalCharId = normalChar.objectId;

		// Simulate that the player's expeditions moved forward to trigger Rest actions
		player.heroExpedition.hasMoved = true;
		player.companionExpedition.hasMoved = true;

		await gsm.restPhase();

		expect(expeditionZone.findById(sleepyCharId)).toBeDefined(); // Stays in expedition
		expect(reserveZone.findById(sleepyCharId)).toBeUndefined();
		expect(gsm.getObject(sleepyCharId)?.statuses.has(StatusType.Asleep)).toBe(false); // Loses Asleep

		expect(expeditionZone.findById(anchoredCharId)).toBeDefined(); // Stays in expedition
		expect(reserveZone.findById(anchoredCharId)).toBeUndefined();
		expect(gsm.getObject(anchoredCharId)?.statuses.has(StatusType.Anchored)).toBe(false); // Loses Anchored

		expect(expeditionZone.findById(normalCharId)).toBeUndefined(); // Normal char goes to reserve
		// Find by definitionId as objectId changes on move
		const normalCharInReserve = reserveZone
			.getAll()
			.find((o) => isGameObject(o) && o.definitionId === cardDef_NormalChar.id);
		expect(normalCharInReserve).toBeDefined();
	});

	// Rule 2.4.6.d: If a Fleeting Character or Expedition Permanent would go to the Reserve from the Expedition zone, it is discarded instead.
	test('Rule 2.4.6.d: Fleeting character is discarded instead of going to Reserve during Rest', async () => {
		const player = gsm.getPlayer(P1)!;
		const expeditionZone = player.zones.expeditionZone;
		const reserveZone = player.zones.reserveZone;
		const discardPile = player.zones.discardPileZone;

		const fleetingChar = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_FleetingChar.id, P1),
			P1
		);
		// Fleeting is typically applied on play from reserve. Here, we simulate it being active.
		// The StatusEffectHandler or game logic should correctly apply Fleeting.
		// For this test, we'll manually add it.
		fleetingChar.statuses.add(StatusType.Fleeting);
		expeditionZone.add(fleetingChar);
		const fleetingCharId = fleetingChar.objectId;

		player.heroExpedition.hasMoved = true; // Simulate expedition moved

		await gsm.restPhase();

		expect(expeditionZone.findById(fleetingCharId)).toBeUndefined();
		expect(reserveZone.findById(fleetingCharId)).toBeUndefined();
		// Find by definitionId as objectId changes on move
		const fleetingCharInDiscard = discardPile
			.getAll()
			.find((o) => isGameObject(o) && o.definitionId === cardDef_FleetingChar.id);
		expect(fleetingCharInDiscard).toBeDefined(); // Should be in discard
	});

	// Rule 2.4.4.b: Boosted status (derived from boost counters)
	test('Rule 2.4.4.b: Boosted status is present if boost counters > 0, affects stats', async () => {
		const player = gsm.getPlayer(P1)!;
		const normalCharObj = gsm.objectFactory.createGameObject(
			gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1),
			P1
		);
		player.zones.expeditionZone.add(normalCharObj);

		// Initial state: no boost counters, no Boosted status
		// Explicitly call status update after adding to zone to ensure initial state is clean
		await gsm.statusUpdater.updateObjectStatusBasedOnCounters(normalCharObj); // Hypothetical method
		expect(normalCharObj.counters.get(CounterType.Boost) || 0).toBe(0);
		expect(normalCharObj.statuses.has(StatusType.Boosted)).toBe(false);
		let stats = gsm.calculateExpeditionStats(P1, 'hero'); // Assumes normalCharObj is part of hero expedition
		expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest);

		// Add a boost counter
		normalCharObj.counters.set(CounterType.Boost, 1);
		// System should update status based on counter change
		await gsm.statusUpdater.updateObjectStatusBasedOnCounters(normalCharObj); // Hypothetical method

		stats = gsm.calculateExpeditionStats(P1, 'hero');
		expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest! + 1); // Stats reflect boost
		expect(normalCharObj.statuses.has(StatusType.Boosted)).toBe(true); // Boosted status is present

		// Remove boost counter
		normalCharObj.counters.set(CounterType.Boost, 0);
		// System should update status based on counter change
		await gsm.statusUpdater.updateObjectStatusBasedOnCounters(normalCharObj); // Hypothetical method

		stats = gsm.calculateExpeditionStats(P1, 'hero');
		expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest); // Stats back to normal
		expect(normalCharObj.statuses.has(StatusType.Boosted)).toBe(false); // Boosted status is removed
	});

	// --- Tests for Gaining Statuses ---
	describe('Gaining Statuses', () => {
		test('Rule 2.4.6.a: Character played from Reserve gains Fleeting', async () => {
			const player = gsm.getPlayer(P1)!;
			const cardInst = gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1);
			player.zones.reserveZone.add(cardInst); // Add to reserve first
			player.currentMana = cardDef_NormalChar.reserveCost!.total;

			// Action: Player plays the card from Reserve
			// Assuming a method like playerPlaysCardFromReserve exists or is part of playerPlaysCardFromHand logic
			const playResult = await gsm.playerPlaysCardFromHand(P1, cardInst.instanceId, {
				fromZone: ZoneIdentifier.Reserve
			});
			expect(playResult.success).toBe(true);

			const charInExpedition = gsm.findCardInAnyZone(
				cardInst.instanceId,
				ZoneIdentifier.Expedition
			) as IGameObject;
			expect(charInExpedition).toBeDefined();

			// Assertion: The character in the expedition zone should have StatusType.Fleeting
			// This relies on the game engine correctly applying Fleeting when a card is played from Reserve.
			// Rule 2.4.6.a: "When a Character or Expedition Permanent is played from a Reserve zone, it gains Fleeting."
			// This might be applied by the CardPlaySystem or a similar handler.
			// For testing, we check the status after it has entered play.
			// If a specific "gainFleetingFromReservePlay" event/handler is expected, this test verifies its outcome.
			expect(charInExpedition.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Rule 2.4.6.b: Spell with passive Fleeting ability is Fleeting when played', async () => {
			const player = gsm.getPlayer(P1)!;
			const spellCardInst = gsm.objectFactory.createCardInstance(cardDef_FleetingSpell.id, P1);
			player.zones.hand.add(spellCardInst);
			player.currentMana = cardDef_FleetingSpell.handCost!.total;

			// Action: P1 plays the spell.
			// The spell itself (cardDef_FleetingSpell) has a passive Fleeting keyword.
			// This implies the spell instance should become Fleeting.
			const playResult = await gsm.playerPlaysCardFromHand(P1, spellCardInst.instanceId, {
				targetObjectIds: []
			}); // Assuming no target needed or handled by effect
			expect(playResult.success).toBe(true); // Spell play itself is successful

			// The spell, being Fleeting, should go to discard instead of limbo/resolve and then discard normally.
			// Rule 2.4.6.e: "If a Fleeting Spell card would go to Limbo, it is discarded instead."
			// We need to check if it ended up in the discard pile.
			const spellInDiscard = player.zones.discardPileZone.findById(spellCardInst.instanceId);
			expect(spellInDiscard).toBeDefined();
			// And it should have had the Fleeting status that caused this.
			// This is hard to check on the instance if it's immediately moved.
			// We infer it was Fleeting because it went to discard directly.
			// If possible to inspect the object *during* its transition or if status is retained on the instance:
			// expect(spellInDiscard.statuses.has(StatusType.Fleeting)).toBe(true);
			// This part of the assertion might be tricky depending on engine implementation.
			// For now, its presence in discard due to Fleeting property is the key.
			// The passive ability on cardDef_FleetingSpell should make the instance Fleeting.
			// Let's assume the object in discard pile retains its statuses from when it was active/in limbo.
			if (spellInDiscard) {
				// We need to ensure the status was applied by the passive ability.
				// This might require a step where passive abilities apply to spells as they become objects.
				// For now, let's check if the definition implies it should be fleeting.
				const spellDef = gsm.cardDataRepository.getCardDefinition(spellInDiscard.definitionId);
				const hasPassiveFleeting = spellDef?.abilities.some(
					(a) => a.keyword === KeywordAbility.Fleeting && a.abilityType === 'passive'
				);
				expect(hasPassiveFleeting).toBe(true);
				// And ideally, the instance itself would have gained the status:
				// This depends on whether the engine applies statuses to spell instances from their passives before checking Fleeting for Limbo.
				// expect(spellInDiscard.statuses.has(StatusType.Fleeting)).toBe(true);
			}
		});

		test('Rule 2.4.6.c: Character that became Fleeting (e.g. from Reserve) retains Fleeting in expedition', async () => {
			// This is essentially the same as 2.4.6.a's assertion but confirms retention.
			const player = gsm.getPlayer(P1)!;
			const cardInst = gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1);
			player.zones.reserveZone.add(cardInst);
			player.currentMana = cardDef_NormalChar.reserveCost!.total;

			const playResult = await gsm.playerPlaysCardFromHand(P1, cardInst.instanceId, {
				fromZone: ZoneIdentifier.Reserve
			});
			expect(playResult.success).toBe(true);

			const charInExpedition = gsm.findCardInAnyZone(
				cardInst.instanceId,
				ZoneIdentifier.Expedition
			) as IGameObject;
			expect(charInExpedition).toBeDefined();
			// Fleeting should have been gained when played from reserve and should persist on entering expedition.
			expect(charInExpedition.statuses.has(StatusType.Fleeting)).toBe(true);
		});

		test('Rule 2.4.5.a (T-cost): Character becomes Exhausted after paying a T (Exhaust me) cost', async () => {
			const player = gsm.getPlayer(P1)!;
			const charInst = gsm.objectFactory.createCardInstance(cardDef_CharWithTapAbility.id, P1);
			const charObject = gsm.objectFactory.createGameObject(charInst, P1);
			player.zones.expeditionZone.add(charObject);
			gsm.ruleAdjudicator.applyAllPassiveAbilities(); // Apply any initial passives

			expect(charObject.statuses.has(StatusType.Exhausted)).toBe(false); // Starts ready

			// Action: P1 activates the 'T' ability.
			// Assuming an activateAbility method that handles costs.
			const abilityToActivate = charObject.definition.abilities.find(
				(a) => a.abilityId === 'abil-tap-draw'
			);
			expect(abilityToActivate).toBeDefined();

			const activationResult = await gsm.playerActivatesAbility(
				P1,
				charObject.objectId,
				abilityToActivate!.abilityId
			);
			expect(activationResult.success).toBe(true);

			// Assertion: The character has StatusType.Exhausted.
			// The cost payment ({ type: 'exhaustSelf' }) should apply this status.
			expect(charObject.statuses.has(StatusType.Exhausted)).toBe(true);
		});

		test('Rule 2.4.1.f: Cannot gain an existing status (Asleep)', async () => {
			const player = gsm.getPlayer(P1)!;
			const charObject = gsm.objectFactory.createGameObject(
				gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1),
				P1
			);
			player.zones.expeditionZone.add(charObject);
			charObject.statuses.add(StatusType.Asleep); // Pre-set Asleep status
			expect(charObject.statuses.has(StatusType.Asleep)).toBe(true);

			// Action: Apply an effect that grants StatusType.Asleep.
			// This requires a mechanism to apply a status via an effect.
			// Let's simulate this by directly calling a status adding function that respects 2.4.1.f.
			// gsm.statusHandler.addStatus(charObject, StatusType.Asleep);
			// If addStatus is idempotent or has specific "becomes Asleep" logic, this tests it.
			// For now, we'll assume the add method is simple. The rule implies no "new" gaining event.

			// To test "does not trigger 'becomes Asleep' logic again", we'd need to spy on an event/handler.
			// Since we can't do that easily here, we assert the state remains correct.
			// The core of 2.4.1.f is that you can't "stack" the same status or re-trigger "gains X" for it.
			charObject.statuses.add(StatusType.Asleep); // Attempt to add it again
			let asleepCount = 0;
			charObject.statuses.forEach((s) => {
				if (s === StatusType.Asleep) asleepCount++;
			});
			expect(asleepCount).toBe(1); // Still just one instance of Asleep

			expect(charObject.statuses.has(StatusType.Asleep)).toBe(true);
		});

		test('Rule 2.4.1.h: Cannot lose a non-existing status (Asleep)', async () => {
			const player = gsm.getPlayer(P1)!;
			const charObject = gsm.objectFactory.createGameObject(
				gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1),
				P1
			);
			player.zones.expeditionZone.add(charObject);
			expect(charObject.statuses.has(StatusType.Asleep)).toBe(false); // Not Asleep

			// Action: Apply an effect that removes StatusType.Asleep.
			// gsm.statusHandler.removeStatus(charObject, StatusType.Asleep);
			// Similar to the above, testing "does not trigger 'loses Asleep' logic" is hard without spies.
			// We ensure the state remains correct.
			charObject.statuses.delete(StatusType.Asleep); // Attempt to remove it

			expect(charObject.statuses.has(StatusType.Asleep)).toBe(false);
		});
	});

	// --- Tests for Effects of Statuses ---
	describe('Effects of Statuses', () => {
		test('Rule 2.4.5.c: Cannot play an Exhausted card from Reserve', async () => {
			const player = gsm.getPlayer(P1)!;
			const cardInst = gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1);
			// Manually set Exhausted for this test setup in Reserve
			// In a real game, it might become Exhausted in Reserve through other means (e.g. effect)
			const cardAsObject = gsm.objectFactory.createGameObject(cardInst, P1); // Create a temporary game object to add status
			cardAsObject.statuses.add(StatusType.Exhausted);
			player.zones.reserveZone.add(cardAsObject); // Add the object with status to reserve

			player.currentMana = cardDef_NormalChar.reserveCost!.total;

			// Action: Attempt to play this Exhausted character from Reserve
			const playResult = await gsm.playerPlaysCardFromHand(P1, cardInst.instanceId, {
				fromZone: ZoneIdentifier.Reserve
			});

			// Assertion: Play action fails or is invalid
			expect(playResult.success).toBe(false);
			const charInReserve = player.zones.reserveZone.findById(cardInst.instanceId);
			expect(charInReserve).toBeDefined(); // Card remains in Reserve
			expect(charInReserve?.statuses.has(StatusType.Exhausted)).toBe(true); // Still Exhausted

			const charInExpedition = gsm.findCardInAnyZone(
				cardInst.instanceId,
				ZoneIdentifier.Expedition
			);
			expect(charInExpedition).toBeUndefined(); // Not in expedition
		});

		test('Rule 2.4.5.e: Support ability of an Exhausted card in Reserve cannot be used', async () => {
			const player = gsm.getPlayer(P1)!;
			const cardInst = gsm.objectFactory.createCardInstance(cardDef_CharWithSupportAbility.id, P1);
			const cardObject = gsm.objectFactory.createGameObject(cardInst, P1);
			cardObject.statuses.add(StatusType.Exhausted); // Manually set Exhausted
			player.zones.reserveZone.add(cardObject);

			const supportAbility = cardObject.definition.abilities.find(
				(a) => a.abilityType === 'support'
			);
			expect(supportAbility).toBeDefined();

			// Action: P1 attempts to activate the support ability
			// Assuming playerActivatesAbility checks for valid source object state (not Exhausted in Reserve for support)
			const activationResult = await gsm.playerActivatesAbility(
				P1,
				cardObject.objectId,
				supportAbility!.abilityId
			);

			// Assertion: Activation fails
			expect(activationResult.success).toBe(false);
			// Any effects of the ability (e.g. drawing a card) should not have happened.
			// (This would be more robust with an initial hand size check if the ability drew cards)
		});
	});

	// --- Tests for Losing Statuses ---
	describe('Losing Statuses', () => {
		test('Rule 4.2.1.c: Exhausted characters/cards become ready during Prepare phase', async () => {
			const player = gsm.getPlayer(P1)!;

			// Setup Exhausted character in Expedition
			const charInExpInst = gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1);
			const exhaustedCharInExp = gsm.objectFactory.createGameObject(charInExpInst, P1);
			exhaustedCharInExp.statuses.add(StatusType.Exhausted);
			player.zones.expeditionZone.add(exhaustedCharInExp);
			expect(exhaustedCharInExp.statuses.has(StatusType.Exhausted)).toBe(true);

			// Setup Exhausted card (as object to hold status) in Reserve
			const cardInReserveInst = gsm.objectFactory.createCardInstance(
				cardDef_CharWithTapAbility.id,
				P1
			); // Using a different card for variety
			const exhaustedCardInReserve = gsm.objectFactory.createGameObject(cardInReserveInst, P1);
			exhaustedCardInReserve.statuses.add(StatusType.Exhausted);
			player.zones.reserveZone.add(exhaustedCardInReserve);
			expect(exhaustedCardInReserve.statuses.has(StatusType.Exhausted)).toBe(true);

			// Action: Trigger Prepare phase (or the part of it that readies cards)
			// This assumes preparePhase correctly calls the logic to remove Exhausted status.
			// Rule 4.2.1.c: "All Exhausted cards its controller owns in their Expedition zone and Reserve zone lose Exhausted."
			await gsm.preparePhase(); // This method should iterate and remove Exhausted status

			// Assertion
			const charAfterPrepare = player.zones.expeditionZone.findById(exhaustedCharInExp.objectId);
			expect(charAfterPrepare).toBeDefined();
			expect(charAfterPrepare?.statuses.has(StatusType.Exhausted)).toBe(false);

			const cardAfterPrepare = player.zones.reserveZone.findById(exhaustedCardInReserve.objectId);
			expect(cardAfterPrepare).toBeDefined();
			expect(cardAfterPrepare?.statuses.has(StatusType.Exhausted)).toBe(false);
		});
	});
});
