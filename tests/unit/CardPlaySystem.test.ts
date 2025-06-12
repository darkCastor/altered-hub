import { describe, test, expect, beforeEach } from 'bun:test'; // Removed mock, spyOn, Mock
import { CardPlaySystem, CardPlayOptions } from '../../src/engine/CardPlaySystem';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import {
	CardType,
	StatusType,
	ZoneIdentifier,
	GamePhase,
	KeywordAbility,
	PermanentZoneType,
	AbilityType // Added AbilityType
} from '../../src/engine/types/enums'; // Added KeywordAbility, PermanentZoneType
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject} from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';
import { GenericZone } from '../../src/engine/Zone';


/**
 * Unit tests for CardPlaySystem - Rules 5.1 (Card Playing Process) and 5.2 (Playing from Reserve)
 * Following TDD methodology: write failing tests based on Altered rules, then fix implementation
 */
// This describe block will be replaced with tests for the new CardPlaySystem API
describe('CardPlaySystem - NEW API Tests', () => {
	let cardPlaySystem: CardPlaySystem;
	let gsm: jest.Mocked<GameStateManager>; // Reverted to jest.Mocked
	let eventBus: jest.Mocked<EventBus>; // Reverted to jest.Mocked
	let player1: any; // Mock player
	let mockPlayerDeckDefinitions: Map<string, ICardDefinition[]>;

	// Test Card Definitions
	const charDef: ICardDefinition = { id: 'char1', name: 'Test Character', type: CardType.Character, handCost: { total: 3 }, reserveCost: { total: 2 }, faction: 'Neutral', statistics: { forest: 1, mountain:1, water:1}, abilities: [], rarity:'Common', version:'1' };
	const spellDef: ICardDefinition = { id: 'spell1', name: 'Test Spell', type: CardType.Spell, handCost: { total: 1 }, reserveCost: { total: 1 }, faction: 'Neutral', abilities: [], effect: { steps: [{verb: 'test_effect', targets: 'self'}]}, rarity:'Common', version:'1' };
	const spellFleetingDef: ICardDefinition = { id: 'spell2', name: 'Fleeting Spell', type: CardType.Spell, handCost: { total: 1 }, reserveCost: { total: 1 }, faction: 'Neutral', abilities: [{abilityId:'fleetingPassive', abilityType:AbilityType.Passive, keyword:KeywordAbility.Fleeting, effect:{steps:[]}, text:'', isSupportAbility:false}], effect: { steps: [{verb: 'test_effect', targets: 'self'}]}, rarity:'Common', version:'1' };
	const spellCooldownDef: ICardDefinition = { id: 'spell3', name: 'Cooldown Spell', type: CardType.Spell, handCost: { total: 1 }, reserveCost: { total: 1 }, faction: 'Neutral', abilities: [{abilityId:'cooldownPassive', abilityType:AbilityType.Passive, keyword:KeywordAbility.Cooldown, effect:{steps:[]}, text:'', isSupportAbility:false}], effect: { steps: [{verb: 'test_effect', targets: 'self'}]}, rarity:'Common', version:'1' };
	const landmarkDef: ICardDefinition = { id: 'land1', name: 'Test Landmark', type: CardType.Permanent, permanentZoneType: PermanentZoneType.Landmark, handCost: { total: 2 }, reserveCost: { total:2}, faction: 'Neutral', abilities: [], rarity:'Common', version:'1' };

	beforeEach(() => {
		eventBus = new EventBus() as jest.Mocked<EventBus>; // Reverted
		jest.spyOn(eventBus, 'publish'); // Spy on publish method - Reverted

		// Setup mock Player
		player1 = {
			id: 'player1',
			zones: {
				handZone: new GenericZone('p1-hand', ZoneIdentifier.Hand, 'hidden', 'player1'),
				reserveZone: new GenericZone('p1-reserve', ZoneIdentifier.Reserve, 'visible', 'player1'),
				discardPileZone: new GenericZone('p1-discard', ZoneIdentifier.DiscardPile, 'visible', 'player1'),
				expeditionZone: new GenericZone('p1-expedition', ZoneIdentifier.Expedition, 'visible', 'player1'), // Note: GSM uses shared, but player might have an alias
				landmarkZone: new GenericZone('p1-landmark', ZoneIdentifier.Landmark, 'visible', 'player1'),
			},
			currentMana: 5, // Sufficient mana for most tests
		};

		// Setup mock GameStateManager
		gsm = {
			getPlayer: jest.fn().mockReturnValue(player1), // Reverted
			getCardDefinition: jest.fn(id => { // Reverted
				return [charDef, spellDef, spellFleetingDef, spellCooldownDef, landmarkDef].find(d => d.id === id);
			}),
			moveEntity: jest.fn().mockImplementation((cardId, fromZone, toZone, _controllerId) => { // Reverted
				const card = fromZone.remove(cardId);
				if (card) {
					// Simulate object creation if moving to a visible zone like Limbo or final destination
					if (toZone.visibility === 'visible' && !(isGameObject(card))) {
						const def = gsm.getCardDefinition(card.definitionId);
						const gameObject = {
							...card, // Spread ICardInstance props
							objectId: `obj-${card.instanceId}`, // Create objectId
							type: def?.type || CardType.Token, // Use actual type
							name: def?.name || 'Unknown Object',
							baseCharacteristics: { ...def },
							currentCharacteristics: { ...def },
							controllerId: player1.id,
							ownerId: player1.id,
							statuses: new Set(),
							counters: new Map(),
					abilities: def?.abilities ? JSON.parse(JSON.stringify(def.abilities)) : [],
							expeditionAssignment: undefined,
							abilityActivationsToday: new Map(),
							timestamp: Date.now(),
						} as IGameObject;
						toZone.add(gameObject);
						return gameObject;
					}
					toZone.add(card);
					return card;
				}
				return null;
			}),
			manaSystem: {
				canPayMana: jest.fn().mockReturnValue(true), // Reverted
				spendMana: jest.fn().mockResolvedValue(undefined), // Reverted
			},
			effectProcessor: {
				resolveEffect: jest.fn().mockResolvedValue(undefined), // Reverted
			},
			state: {
				sharedZones: {
					limbo: new GenericZone('limbo', ZoneIdentifier.Limbo, 'visible', 'shared'),
					expedition: new GenericZone('shared-expedition', ZoneIdentifier.Expedition, 'visible', 'shared'),
				},
				currentPhase: GamePhase.Afternoon,
			},
			eventBus: eventBus, // Use the spied eventBus
			objectFactory: {
				generateId: jest.fn(() => `obj-${Math.random()}`), // Reverted
				createGameObjectFromDefinition: jest.fn((def, ownerId) => ({ // Reverted
					// Basic mock for createGameObjectFromDefinition
					objectId: `obj-${def.id}-${ownerId}`,
					definitionId: def.id,
					name: def.name,
					type: def.type,
					subTypes: def.subTypes,
					baseCharacteristics: { ...def },
					currentCharacteristics: { ...def },
					ownerId,
					controllerId: ownerId,
					statuses: new Set(),
					counters: new Map(),
					abilities: def.abilities ? JSON.parse(JSON.stringify(def.abilities)) : [],
					timestamp: Date.now(),
				} as IGameObject))
			}
			// getZoneByIdentifier removed from here
		} as unknown as jest.Mocked<GameStateManager>; // Reverted

		cardPlaySystem = new CardPlaySystem(gsm, eventBus);
	});

	describe('canPlayCard', () => {
		test('should allow playing from hand if mana cost is met', async () => {
			const card = { instanceId: 'c1', definitionId: 'spell1', ownerId: 'player1' } as ICardInstance;
			player1.zones.handZone.add(card);
			(gsm.manaSystem.canPayMana as jest.Mock).mockReturnValue(true); // Reverted

			const result = await cardPlaySystem.canPlayCard('player1', 'c1', ZoneIdentifier.Hand);
			expect(result.isPlayable).toBe(true);
			expect(result.cost).toBe(spellDef.handCost.total);
		});

		test('should prevent playing from hand if mana cost is not met', async () => {
			const card = { instanceId: 'c1', definitionId: 'spell1', ownerId: 'player1' } as ICardInstance;
			player1.zones.handZone.add(card);
			(gsm.manaSystem.canPayMana as jest.Mock).mockReturnValue(false); // Reverted

			const result = await cardPlaySystem.canPlayCard('player1', 'c1', ZoneIdentifier.Hand);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Cannot pay mana cost');
		});

		test('should prevent playing from Reserve if card is exhausted', async () => {
			const card = { objectId: 'objRes', definitionId: 'spell1', statuses: new Set([StatusType.Exhausted]) } as IGameObject;
			player1.zones.reserveZone.add(card);

			const result = await cardPlaySystem.canPlayCard('player1', 'objRes', ZoneIdentifier.Reserve);
			expect(result.isPlayable).toBe(false);
			expect(result.reason).toContain('Card in Reserve is exhausted');
		});
	});

	describe('playCard Lifecycle', () => {
		test('Playing a Character moves to Limbo, then to shared expedition with assignment', async () => {
			const charInstance = { instanceId: 'charInst1', definitionId: 'char1', ownerId: 'player1' } as ICardInstance;
			player1.zones.handZone.add(charInstance);

			await cardPlaySystem.playCard('player1', 'charInst1', ZoneIdentifier.Hand, { expeditionType: 'hero' });

			expect(gsm.moveEntity).toHaveBeenCalledWith('charInst1', player1.zones.handZone, gsm.state.sharedZones.limbo, 'player1');
			// The second moveEntity (Limbo to Expedition) is called with the objectId of the card in Limbo
			const limboCard = gsm.state.sharedZones.limbo.getAll()[0]; // Assume it's the only one for simplicity
			expect(gsm.moveEntity).toHaveBeenCalledWith(limboCard.objectId, gsm.state.sharedZones.limbo, gsm.state.sharedZones.expedition, 'player1');

			const finalCardInExpedition = gsm.state.sharedZones.expedition.getAll().find(c => c.definitionId === 'char1');
			expect(finalCardInExpedition).toBeDefined();
			expect((finalCardInExpedition as IGameObject).expeditionAssignment).toEqual({ playerId: 'player1', type: 'hero' });
			expect(gsm.manaSystem.spendMana).toHaveBeenCalledWith('player1', charDef.handCost.total);
			expect(eventBus.publish).toHaveBeenCalledWith('cardPlayed', expect.anything());
		});

		test('Playing a Spell from hand moves to Limbo, resolves effect, then to Reserve', async () => {
			const spellInstance = { instanceId: 'spellInst1', definitionId: 'spell1', ownerId: 'player1' } as ICardInstance;
			player1.zones.handZone.add(spellInstance);

			await cardPlaySystem.playCard('player1', 'spellInst1', ZoneIdentifier.Hand, {});

			expect(gsm.moveEntity).toHaveBeenCalledWith('spellInst1', player1.zones.handZone, gsm.state.sharedZones.limbo, 'player1');
			const limboCard = gsm.state.sharedZones.limbo.getAll()[0]; // It's removed after effect
			expect(gsm.effectProcessor.resolveEffect).toHaveBeenCalled();
			expect(gsm.moveEntity).toHaveBeenCalledWith(expect.any(String), gsm.state.sharedZones.limbo, player1.zones.reserveZone, 'player1');
			expect(gsm.manaSystem.spendMana).toHaveBeenCalledWith('player1', spellDef.handCost.total);
		});

		test('Playing a Fleeting Spell from hand moves to Limbo, resolves, then to Discard', async () => {
			const spellInstance = { instanceId: 'spellInstF', definitionId: 'spell2', ownerId: 'player1' } as ICardInstance; // spell2 is FleetingSpell
			player1.zones.handZone.add(spellInstance);

			await cardPlaySystem.playCard('player1', 'spellInstF', ZoneIdentifier.Hand, {});

			const limboCardObjectId = (gsm.moveEntity as jest.Mock).mock.calls.find(call => call[1] === player1.zones.handZone)![0]; // Reverted



			expect(gsm.moveEntity).toHaveBeenCalledWith(limboCardObjectId, player1.zones.handZone, gsm.state.sharedZones.limbo, 'player1');
			expect(gsm.effectProcessor.resolveEffect).toHaveBeenCalled();
			// Check the arguments of the second moveEntity call (Limbo to Discard)
			const moveToDiscardCall = gsm.moveEntity.mock.calls.find(call => call[1] === gsm.state.sharedZones.limbo && call[2] === player1.zones.discardPileZone);
			expect(moveToDiscardCall).toBeDefined();
		});

		test('Playing a Cooldown Spell from hand moves to Limbo, resolves, then to Reserve and becomes Exhausted', async () => {
			const spellInstance = { instanceId: 'spellInstC', definitionId: 'spell3', ownerId: 'player1' } as ICardInstance; // spell3 is CooldownSpell
			player1.zones.handZone.add(spellInstance);

			await cardPlaySystem.playCard('player1', 'spellInstC', ZoneIdentifier.Hand, {});

			const limboCardObjectId = (gsm.moveEntity as jest.Mock).mock.calls.find(call => call[1] === player1.zones.handZone)![0]; // Reverted

			expect(gsm.moveEntity).toHaveBeenCalledWith(limboCardObjectId, player1.zones.handZone, gsm.state.sharedZones.limbo, 'player1');
			expect(gsm.effectProcessor.resolveEffect).toHaveBeenCalled();

			const moveToReserveCall = gsm.moveEntity.mock.calls.find(call => call[1] === gsm.state.sharedZones.limbo && call[2] === player1.zones.reserveZone);
			expect(moveToReserveCall).toBeDefined();

			// The object returned by moveEntity when moving to reserve should be the one exhausted
			const cardInReserve = player1.zones.reserveZone.getAll().find(c => c.definitionId === 'spell3');
			expect(cardInReserve).toBeDefined();
			expect((cardInReserve as IGameObject).statuses.has(StatusType.Exhausted)).toBe(true);
		});


		test('Playing a Landmark from hand moves to Limbo, then to Landmark Zone', async () => {
			const landmarkInstance = { instanceId: 'landInst1', definitionId: 'land1', ownerId: 'player1' } as ICardInstance;
			player1.zones.handZone.add(landmarkInstance);

			await cardPlaySystem.playCard('player1', 'landInst1', ZoneIdentifier.Hand, {});

			expect(gsm.moveEntity).toHaveBeenCalledWith('landInst1', player1.zones.handZone, gsm.state.sharedZones.limbo, 'player1');
			const limboCard = gsm.state.sharedZones.limbo.getAll()[0];
			expect(gsm.moveEntity).toHaveBeenCalledWith(limboCard.objectId, gsm.state.sharedZones.limbo, player1.zones.landmarkZone, 'player1');
			expect(gsm.manaSystem.spendMana).toHaveBeenCalledWith('player1', landmarkDef.handCost.total);
		});

		test('Playing card from Reserve gains Fleeting and moves to appropriate final zone', async () => {
			// Test with a Character from reserve
			const charObject = (gsm.objectFactory.createGameObjectFromDefinition as jest.Mock)(charDef, 'player1'); // Reverted
			charObject.objectId = 'charObjReserve'; // Ensure it has a consistent ID for the test
			player1.zones.reserveZone.add(charObject);

			await cardPlaySystem.playCard('player1', 'charObjReserve', ZoneIdentifier.Reserve, { expeditionType: 'companion' });

			// Check it gained Fleeting in Limbo (hard to check Limbo state post-play, so check final object)
			const finalChar = gsm.state.sharedZones.expedition.getAll().find(c => c.definitionId === 'char1');
			expect(finalChar).toBeDefined();
			expect((finalChar as IGameObject).statuses.has(StatusType.Fleeting)).toBe(true);
			expect((finalChar as IGameObject).expeditionAssignment).toEqual({ playerId: 'player1', type: 'companion' });
			expect(gsm.manaSystem.spendMana).toHaveBeenCalledWith('player1', charDef.reserveCost.total);
		});

	});
});
