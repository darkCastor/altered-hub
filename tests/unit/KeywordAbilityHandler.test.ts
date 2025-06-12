import { describe, test, expect, beforeEach } from 'bun:test';
import { KeywordAbilityHandler } from '../../src/engine/KeywordAbilityHandler';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { CardType, KeywordAbility } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';

describe('KeywordAbilityHandler', () => {
	let gsm: GameStateManager;
	let keywordHandler: KeywordAbilityHandler;
	let eventBus: EventBus;
	let mockCardDefinitions: ICardDefinition[];

	const cardDefDefender: ICardDefinition = {
		id: 'defender-char',
		name: 'Defender Char',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 }, reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 1, mountain: 1, water: 1 },
		abilities: [{ abilityId: 'abil-def', text: 'Defender', keyword: KeywordAbility.Defender, abilityType: 'keyword', effect: {steps:[]}, isSupportAbility: false }],
		rarity: 'Common',
		version: '1.0',
	};

	const cardDefNonDefender: ICardDefinition = {
		id: 'non-defender-char',
		name: 'Non-Defender Char',
		type: CardType.Character,
		subTypes: [],
		handCost: { total: 1 }, reserveCost: { total: 1 },
		faction: 'Neutral',
		statistics: { forest: 1, mountain: 1, water: 1 },
		abilities: [],
		rarity: 'Common',
		version: '1.0',
	};

	beforeEach(async () => {
		eventBus = new EventBus();
		mockCardDefinitions = [cardDefDefender, cardDefNonDefender];
		gsm = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
		keywordHandler = gsm.keywordHandler; // GameStateManager creates its own KeywordAbilityHandler instance
		await gsm.initializeGame();

		// Clear expedition zone before each test for clean state
		gsm.state.sharedZones.expedition.clear();
	});

	describe('checkDefenderRestrictions', () => {
		test('P1 Hero Defender, P1 Companion No Defender: returns { hero: false, companion: true }', () => {
			const defenderChar = gsm.objectFactory.createCard(cardDefDefender.id, 'player1');
			defenderChar.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			gsm.state.sharedZones.expedition.add(defenderChar);

			const nonDefenderChar = gsm.objectFactory.createCard(cardDefNonDefender.id, 'player1');
			nonDefenderChar.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
			gsm.state.sharedZones.expedition.add(nonDefenderChar);

			const restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(restrictions).toEqual({ hero: false, companion: true });
		});

		test('P1 Hero No Defender, P1 Companion Defender: returns { hero: true, companion: false }', () => {
			const nonDefenderChar = gsm.objectFactory.createCard(cardDefNonDefender.id, 'player1');
			nonDefenderChar.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			gsm.state.sharedZones.expedition.add(nonDefenderChar);

			const defenderChar = gsm.objectFactory.createCard(cardDefDefender.id, 'player1');
			defenderChar.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
			gsm.state.sharedZones.expedition.add(defenderChar);

			const restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(restrictions).toEqual({ hero: true, companion: false });
		});

		test('P1 No Defenders: returns { hero: true, companion: true }', () => {
			const nonDefenderHero = gsm.objectFactory.createCard(cardDefNonDefender.id, 'player1');
			nonDefenderHero.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			gsm.state.sharedZones.expedition.add(nonDefenderHero);

			const nonDefenderCompanion = gsm.objectFactory.createCard(cardDefNonDefender.id, 'player1');
			nonDefenderCompanion.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
			gsm.state.sharedZones.expedition.add(nonDefenderCompanion);

			const restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(restrictions).toEqual({ hero: true, companion: true });
		});

		test('P1 Both Hero and Companion Defender: returns { hero: false, companion: false }', () => {
			const defenderHero = gsm.objectFactory.createCard(cardDefDefender.id, 'player1');
			defenderHero.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			gsm.state.sharedZones.expedition.add(defenderHero);

			const defenderCompanion = gsm.objectFactory.createCard(cardDefDefender.id, 'player1');
			defenderCompanion.expeditionAssignment = { playerId: 'player1', type: 'Companion' };
			gsm.state.sharedZones.expedition.add(defenderCompanion);

			const restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(restrictions).toEqual({ hero: false, companion: false });
		});

		test('P2 has Defender, P1 has none: P1 restrictions are true, P2 hero is false', () => {
			const p1NonDefender = gsm.objectFactory.createCard(cardDefNonDefender.id, 'player1');
			p1NonDefender.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			gsm.state.sharedZones.expedition.add(p1NonDefender);

			const p2Defender = gsm.objectFactory.createCard(cardDefDefender.id, 'player2');
			p2Defender.expeditionAssignment = { playerId: 'player2', type: 'Hero' };
			gsm.state.sharedZones.expedition.add(p2Defender);

			const p1Restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(p1Restrictions).toEqual({ hero: true, companion: true });

			const p2Restrictions = keywordHandler.checkDefenderRestrictions('player2');
			expect(p2Restrictions).toEqual({ hero: false, companion: true }); // Assuming P2 has no companion units
		});

		test('Player has no units in expedition: returns { hero: true, companion: true }', () => {
			const restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(restrictions).toEqual({ hero: true, companion: true });
		});

		test('Defender with hasDefender characteristic but no keyword ability', () => {
			const defenderChar = gsm.objectFactory.createCard(cardDefNonDefender.id, 'player1'); // Uses non-defender base
			defenderChar.expeditionAssignment = { playerId: 'player1', type: 'Hero' };
			defenderChar.currentCharacteristics.hasDefender = true; // Set via characteristic
			gsm.state.sharedZones.expedition.add(defenderChar);

			const restrictions = keywordHandler.checkDefenderRestrictions('player1');
			expect(restrictions).toEqual({ hero: false, companion: true });
		});
	});
});
