import type { GameStateManager } from './GameStateManager';
import type { EventBus } from './EventBus';
import type { IGameObject, ICardInstance } from './types/objects';
import { ZoneIdentifier, CardType, StatusType, KeywordAbility } from './types/enums';
import { isGameObject } from './types/objects';

// Placeholder for targeting types, can be refined later
export interface TargetInfo {
	targetId: string; // A conceptual ID for the target slot/requirement
	objectId: string; // The ID of the IGameObject chosen as the target
}

export interface TargetRequirement {
	targetId: string;
	criteria: any; // Define criteria for valid targets
	count: number;
}

export class CardPlaySystem {
	constructor(
		private gsm: GameStateManager,
		private eventBus: EventBus
	) {}

	/**
	 * Checks if a card can be played.
	 * Rule 5.1, 5.2
	 */
	public async canPlayCard(
		playerId: string,
		cardId: string, // Can be ICardInstance.instanceId or IGameObject.objectId
		fromZoneIdentifier: ZoneIdentifier
	): Promise<{ isPlayable: boolean; cost?: number; reason?: string, definitionId?: string }> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return { isPlayable: false, reason: 'Player not found.' };

		const fromZone = this.gsm.getZoneByIdentifier(fromZoneIdentifier, playerId);
		if (!fromZone) return { isPlayable: false, reason: 'Source zone not found.' };

		const cardEntity = fromZone.findById(cardId);
		if (!cardEntity) return { isPlayable: false, reason: 'Card not found in source zone.' };

		const definition = this.gsm.getCardDefinition(cardEntity.definitionId);
		if (!definition) return { isPlayable: false, reason: 'Card definition not found.' };

		// Basic checks
		if (fromZoneIdentifier === ZoneIdentifier.Reserve) {
			if (!isGameObject(cardEntity)) return { isPlayable: false, reason: 'Card in Reserve is not a game object.' };
			if (cardEntity.statuses.has(StatusType.Exhausted)) { // Rule 2.4.5.c
				return { isPlayable: false, reason: 'Card in Reserve is exhausted.' };
			}
		}
		// TODO: Add faction requirements if applicable

		const finalCost = this.getModifiedCost(cardEntity, fromZoneIdentifier, playerId);

		if (!this.gsm.manaSystem.canPayMana(playerId, finalCost)) {
			return { isPlayable: false, cost: finalCost, reason: 'Cannot pay mana cost.', definitionId: definition.id };
		}

		// TODO: Check other conditions (e.g., specific card conditions, global conditions)
		// For now, if mana is payable, assume it's playable.
		return { isPlayable: true, cost: finalCost, definitionId: definition.id };
	}

	/**
	 * Calculates the modified cost of playing a card.
	 * Rule 5.1.2.e
	 */
	public getModifiedCost(
		card: IGameObject | ICardInstance,
		fromZone: ZoneIdentifier,
		_playerId: string // playerId might be needed for player-specific cost mods
	): number {
		const definition = this.gsm.getCardDefinition(card.definitionId);
		if (!definition) throw new Error('Card definition not found for cost calculation.');

		let baseCost: number;
		if (fromZone === ZoneIdentifier.Hand) {
			baseCost = definition.handCost;
		} else if (fromZone === ZoneIdentifier.Reserve) {
			baseCost = definition.reserveCost;
		} else if (fromZone === ZoneIdentifier.Limbo) {
			// If card is already in Limbo, its cost was determined by its original zone.
			// This requires knowing the original zone or storing it temporarily.
			// A simple heuristic: if it has characteristics of a spell (effect) vs permanent.
			// This is not robust. Best if original zone/cost basis is passed or stored.
			const limboGameObject = card as IGameObject; // In Limbo, it's always an IGameObject
			if (limboGameObject.baseCharacteristics.cardType === CardType.Spell) { // Assuming baseCharacteristics has cardType
                 // Spells from hand use handCost, spells from reserve (if possible to play) would use reserveCost
                 // This needs more context for accuracy. Defaulting to handCost.
                 baseCost = definition.handCost;
            } else if (limboGameObject.baseCharacteristics.cardType === CardType.Character ||
				limboGameObject.baseCharacteristics.cardType === CardType.ExpeditionPermanent ||
				limboGameObject.baseCharacteristics.cardType === CardType.LandmarkPermanent
			) {
				// Assume permanents in limbo were being played from hand if not specified.
				baseCost = definition.handCost;
			}
			else {
				// Fallback, could be inaccurate.
				baseCost = definition.handCost;
				console.warn(`[CardPlaySystem.getModifiedCost] Cost calculation for Limbo card ${definition.name} of type ${definition.type} might be inaccurate without original zone info. Defaulting to handCost.`);
			}

		} else {
			throw new Error(`Cannot determine base cost from zone: ${fromZone}`);
		}

		// TODO: Apply cost modifications (Rule 5.1.2.e)
		// const increases = this.getCostIncreases(card, fromZone, playerId);
		// const decreases = this.getCostDecreases(card, fromZone, playerId);
		// let finalCost = baseCost + increases - decreases;
		// finalCost = Math.max(0, finalCost); // Cost cannot be negative
		// TODO: Apply "can't cost less than X" restrictions

		return baseCost; // Placeholder
	}

	/**
	 * Plays a card from a zone.
	 * Rule 5.1, 5.2
	 */
	public async playCard(
		playerId: string,
		cardId: string, // ICardInstance.instanceId or IGameObject.objectId
		fromZoneIdentifier: ZoneIdentifier,
		selectedExpeditionType?: 'hero' | 'companion',
		_targets?: TargetInfo[] // Placeholder for target processing
	): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found.`);

		const fromZone = this.gsm.getZoneByIdentifier(fromZoneIdentifier, playerId);
		if (!fromZone) throw new Error(`Source zone ${fromZoneIdentifier} not found for player ${playerId}.`);

		const cardEntity = fromZone.findById(cardId);
		if (!cardEntity) throw new Error(`Card ${cardId} not found in zone ${fromZone.id}.`);

		const originalDefinitionId = cardEntity.definitionId;

		console.log(`[CardPlaySystem] Attempting to play card ${originalDefinitionId} (ID: ${cardId}) from ${fromZoneIdentifier}`);

		// b. Move to Limbo (Rule 5.1.2.g)
		const limboCardObject = this.gsm.moveEntity(cardId, fromZone, this.gsm.state.sharedZones.limbo, playerId) as IGameObject;
		if (!limboCardObject) throw new Error('Failed to move card to Limbo or card became non-object.');
		console.log(`[CardPlaySystem] Card ${limboCardObject.name} (ObjID: ${limboCardObject.objectId}) moved to Limbo.`);

		try {
			// Fleeting (Rule 5.2.4.a, 2.4.6)
			if (fromZoneIdentifier === ZoneIdentifier.Reserve) {
				limboCardObject.statuses.add(StatusType.Fleeting);
				console.log(`[CardPlaySystem] Card ${limboCardObject.name} played from Reserve, gained Fleeting.`);
			}
			const definition = this.gsm.getCardDefinition(limboCardObject.definitionId);
			if (!definition) throw new Error(`Card definition not found for ${limboCardObject.definitionId} in Limbo.`);

			if (definition.keywords?.has(KeywordAbility.Fleeting)) {
				limboCardObject.statuses.add(StatusType.Fleeting);
				console.log(`[CardPlaySystem] Card ${limboCardObject.name} has inherent Fleeting.`);
			}
			// TODO: Apply passive abilities that grant/lose Fleeting to the card in Limbo.
			// this.gsm.ruleAdjudicator.applyPassivesToSingleObject(limboCardObject);

			// c. Pay Costs (Rule 5.1.2.h, 6.4)
			// Pass ZoneIdentifier.Limbo because the card is now in Limbo for cost calculation context
			const finalManaCost = this.getModifiedCost(limboCardObject, ZoneIdentifier.Limbo, playerId);
			console.log(`[CardPlaySystem] Final mana cost for ${limboCardObject.name}: ${finalManaCost}`);
			await this.gsm.manaSystem.spendMana(playerId, finalManaCost);
			console.log(`[CardPlaySystem] Player ${playerId} paid ${finalManaCost} mana.`);
			// TODO: Pay Tough costs for targets (Rule 7.4.7)

			// d. Resolution (Rule 5.1.2.i)
			console.log(`[CardPlaySystem] Resolving card ${limboCardObject.name} of type ${definition.type}.`);
			let finalDestinationZone: ZoneIdentifier | undefined = undefined;

			switch (definition.type) {
				case CardType.Character:
				case CardType.ExpeditionPermanent:
					if (!selectedExpeditionType) {
						throw new Error(`Expedition type (hero/companion) not selected for ${definition.type}: ${limboCardObject.name}`);
					}
					const expeditionZone = this.gsm.state.sharedZones.expedition;
					limboCardObject.expeditionAssignment = { playerId, type: selectedExpeditionType };
					this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, expeditionZone, playerId);
					finalDestinationZone = ZoneIdentifier.Expedition;
					console.log(`[CardPlaySystem] ${definition.type} ${limboCardObject.name} moved to ${selectedExpeditionType} expedition.`);
					break;

				case CardType.LandmarkPermanent:
					this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, player.zones.landmarkZone, playerId);
					finalDestinationZone = ZoneIdentifier.Landmark;
					console.log(`[CardPlaySystem] Landmark Permanent ${limboCardObject.name} moved to landmark zone.`);
					if (limboCardObject.statuses.has(StatusType.Fleeting) && fromZoneIdentifier === ZoneIdentifier.Reserve) {
                         // Fleeting from reserve should not stick to permanents unless specified by another effect
                        limboCardObject.statuses.delete(StatusType.Fleeting);
                        console.log(`[CardPlaySystem] Removed Fleeting from ${limboCardObject.name} upon entering landmark zone.`);
                    }
					break;

				case CardType.Spell:
					const spellDefinition = this.gsm.getCardDefinition(originalDefinitionId); // Use original for true effect
					if (!spellDefinition || !spellDefinition.effect) throw new Error (`Spell definition or effect missing for ${originalDefinitionId}`);

					console.log(`[CardPlaySystem] Resolving spell effect for ${limboCardObject.name} (DefID: ${originalDefinitionId}).`);
					await this.gsm.effectProcessor.resolveEffect(spellDefinition.effect, limboCardObject /*, targets, triggerContext */);

					if (limboCardObject.statuses.has(StatusType.Fleeting)) {
						console.log(`[CardPlaySystem] Fleeting spell ${limboCardObject.name} moving to Discard Pile.`);
						this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, player.zones.discardPileZone, playerId);
						finalDestinationZone = ZoneIdentifier.DiscardPile;
					} else {
						console.log(`[CardPlaySystem] Non-Fleeting spell ${limboCardObject.name} moving to Reserve.`);
						const reservedSpell = this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, player.zones.reserveZone, playerId) as IGameObject;
						finalDestinationZone = ZoneIdentifier.Reserve;
						if (reservedSpell && definition.keywords?.has(KeywordAbility.Cooldown)) {
							reservedSpell.statuses.add(StatusType.Exhausted);
							console.log(`[CardPlaySystem] Spell ${reservedSpell.name} has Cooldown, exhausted in Reserve.`);
						}
					}
					break;
				default:
					console.error(`[CardPlaySystem] Unknown card type to play: ${definition.type} for card ${limboCardObject.name}`);
					throw new Error(`Unhandled card type for play: ${definition.type}`);
			}

			this.eventBus.publish('cardPlayed', {
				card: limboCardObject, // This is the object instance that was played, now possibly in its final zone
				playerId,
				fromZone: fromZoneIdentifier,
				finalZone: finalDestinationZone, // Add final zone for listeners
				definitionId: originalDefinitionId
			});
			// Rule 5.1.2.j: "When a card is played" triggers. These typically occur after the card has resolved.
			// The event 'cardPlayed' should be used by AdvancedTriggerHandler to find and queue these triggers.
			// Then, resolveReactions will pick them up if they create reaction emblems.
			await this.gsm.resolveReactions();

		} catch (error) {
			console.error(`[CardPlaySystem] Error playing card ${originalDefinitionId} (ID: ${cardId}) for player ${playerId}:`, error);
			// Attempt to return the card to its original zone or hand if play fails mid-process.
			const cardStillInLimbo = this.gsm.state.sharedZones.limbo.findById(limboCardObject.objectId);
			if (cardStillInLimbo) {
				console.warn(`[CardPlaySystem] Attempting to return ${limboCardObject.name} from Limbo to player ${playerId}'s hand due to error during play.`);
				// Deciding the "original" zone is tricky. Hand is a safe default.
				// If `fromZoneIdentifier` was Reserve, it should ideally go back there.
				const returnZone = (fromZoneIdentifier === ZoneIdentifier.Reserve) ? fromZone : player.zones.handZone;
				this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, returnZone, playerId);
			}
			throw error; // Re-throw the error to be handled by the caller
		}
	}
}
