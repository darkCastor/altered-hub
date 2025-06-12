import type { GameStateManager } from './GameStateManager';
import type { EventBus } from './EventBus';
import type { IGameObject, ICardInstance } from './types/objects';
import { ZoneIdentifier, CardType, StatusType, KeywordAbility } from './types/enums';
import { isGameObject } from './types/objects';
import type { CostModifier } from './types/costs'; // Import CostModifier

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
		fromZoneIdentifier: ZoneIdentifier,
		isScoutPlay?: boolean, // Hint for Scout play
		scoutRawCost?: number,   // Raw Scout cost if isScoutPlay is true
		overrideCost?: number // New parameter for specific cost overrides (e.g., 0 for free)
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

		const finalCost = overrideCost !== undefined ? overrideCost : this.getModifiedCost(cardEntity, fromZoneIdentifier, playerId, isScoutPlay, scoutRawCost);

		if (finalCost > 0 && !this.gsm.manaSystem.canPayMana(playerId, finalCost)) { // Only check canPayMana if there's a cost
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
		playerId: string,
		isScoutPlayHint?: boolean,
		scoutRawCostHint?: number,
		overrideCost?: number // Added to signature, though direct check is now in canPlayCard/playCard
	): number {
		// If an overrideCost is provided (e.g. for "play for free"), it bypasses all other calculations.
		// This check is primarily here if getModifiedCost is called externally with an override.
		// Internally, playCard and canPlayCard now handle overrideCost before calling this for standard calculation.
		if (overrideCost !== undefined) {
			return Math.max(0, overrideCost);
		}

		const definition = this.gsm.getCardDefinition(card.definitionId);
		if (!definition) throw new Error('Card definition not found for cost calculation.');

		let baseCost: number;
		// Determine baseCost (Rule 5.1.2.e - initial step)
		// Rule 7.4.5.d: Cost alterations also apply when playing a card with a Scout ability.
		if (isScoutPlayHint && scoutRawCostHint !== undefined && (fromZone === ZoneIdentifier.Hand || fromZone === ZoneIdentifier.Limbo /* Card from hand via scout goes to limbo */)) {
			baseCost = scoutRawCostHint;
			console.log(`[CardPlaySystem.getModifiedCost] Using Scout base cost ${baseCost} for ${definition.name}`);
		} else if (fromZone === ZoneIdentifier.Hand) {
			baseCost = definition.handCost;
		} else if (fromZone === ZoneIdentifier.Reserve) {
			baseCost = definition.reserveCost;
		} else if (fromZone === ZoneIdentifier.Limbo) {
			// When a card is in Limbo, its cost was determined by its original zone.
			// The `playCard` method moves the card to Limbo and then calls getModifiedCost.
			// It's assumed that the `card` object in Limbo might retain info about its original cost basis,
			// or this logic needs to be robust enough to infer it.
			// For now, this replicates the existing logic for Limbo, which might need refinement
			// if the original zone isn't implicitly handled by how `playCard` prepares the card.
			const limboGameObject = card as IGameObject;
			// A potential improvement: store originalZone on the card object when moved to Limbo.
			// For now, using definition and card type as a proxy.
			if (limboGameObject.baseCharacteristics.cardType === CardType.Spell) {
				// This assumes spells are typically played from hand if not specified.
				// If a spell could be played from Reserve with a different base cost, this needs adjustment.
				baseCost = definition.handCost;
			} else if (
				limboGameObject.baseCharacteristics.cardType === CardType.Character ||
				limboGameObject.baseCharacteristics.cardType === CardType.ExpeditionPermanent ||
				limboGameObject.baseCharacteristics.cardType === CardType.LandmarkPermanent
			) {
				// Assume permanents were being played from hand if not specified.
				baseCost = definition.handCost;
			} else {
				baseCost = definition.handCost; // Default fallback
				console.warn(`[CardPlaySystem.getModifiedCost] Cost calculation for Limbo card ${definition.name} of type ${definition.type} might be inaccurate without original zone info. Defaulting to handCost.`);
			}
		} else {
			throw new Error(`Cannot determine base cost from zone: ${fromZone}`);
		}

		// Fetch cost modifiers from the RuleAdjudicator
		// The RuleAdjudicator would be responsible for finding all passive abilities
		// (e.g., from objects in play, emblems) that generate CostModifier objects.
		let costModifiers: CostModifier[] = [];
		if (this.gsm.ruleAdjudicator && typeof this.gsm.ruleAdjudicator.getActiveCostModifiersForCardPlay === 'function') {
			costModifiers = this.gsm.ruleAdjudicator.getActiveCostModifiersForCardPlay(card, playerId, fromZone, this.gsm);
		} else {
			// This else block is for environments where ruleAdjudicator or its method might not be fully implemented yet.
			// For actual gameplay, ruleAdjudicator should always be present and provide the method.
			console.warn('[CardPlaySystem.getModifiedCost] RuleAdjudicator or getActiveCostModifiersForCardPlay method not available on GSM. Proceeding without dynamic cost modifiers.');
		}

		let modifiedCost = baseCost;

		// Apply Increases (Rule 5.1.2.e.1)
		costModifiers
			.filter(mod => mod.type === 'increase' && mod.appliesTo(card, this.gsm, playerId, fromZone))
			.forEach(mod => modifiedCost += mod.value);

		// Apply Decreases (Rule 5.1.2.e.2)
		costModifiers
			.filter(mod => mod.type === 'decrease' && mod.appliesTo(card, this.gsm, playerId, fromZone))
			.forEach(mod => modifiedCost -= mod.value);

		// Ensure Non-Negative Cost (before specific value setters/minimums)
		// Rule 5.1.2.e (implicit: "cost cannot be reduced below 0" before explicit minimums)
		modifiedCost = Math.max(0, modifiedCost);

		// Apply Restrictions (Setters, Minimums, Maximums - Rule 5.1.2.e.3)

		// Handle 'set' modifiers first
		const setModifiers = costModifiers
			.filter(mod => mod.type === 'set' && mod.appliesTo(card, this.gsm, playerId, fromZone))
			.sort((a, b) => b.value - a.value); // Example: if multiple "set to X", highest X wins? Or lowest? Or last applied?
											// Rule 5.1.2.e.3 implies "set" effects are applied, then min/max.
											// For multiple "set" effects, standard is often that the last applied or most specific wins.
											// Or, if they are numeric, that the "most impactful" (e.g. highest set cost) applies.
											// Assuming for now: if multiple 'set' apply, the largest value is taken. This might need rule clarification.
		if (setModifiers.length > 0) {
			modifiedCost = setModifiers[0].value; // Apply the highest 'set' value.
												 // Re-check non-negative in case set value is < 0, though typically set values are >= 0.
			modifiedCost = Math.max(0, modifiedCost);
		}

		// Apply 'minimum' cost restrictions
		// "Cannot cost less than X". Apply all, then take the highest minimum.
		let currentMinimum = 0; // Smallest possible minimum is 0
		costModifiers
			.filter(mod => mod.type === 'minimum' && mod.appliesTo(card, this.gsm, playerId, fromZone))
			.forEach(mod => currentMinimum = Math.max(currentMinimum, mod.value));

		modifiedCost = Math.max(modifiedCost, currentMinimum);


		// Apply 'maximum' cost restrictions
		// "Cannot cost more than X". Apply all, then take the lowest maximum.
		// Initialize with a very high number if no maximums are found.
		let currentMaximum = Infinity;
		costModifiers
			.filter(mod => mod.type === 'maximum' && mod.appliesTo(card, this.gsm, playerId, fromZone))
			.forEach(mod => currentMaximum = Math.min(currentMaximum, mod.value));

		if (currentMaximum !== Infinity) {
			modifiedCost = Math.min(modifiedCost, currentMaximum);
		}

		// Final Non-Negative Check (Rule 5.1.2.e implies cost is ultimately >= 0)
		const finalCost = Math.max(0, modifiedCost);

		return finalCost;
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
		_targets?: TargetInfo[],
		isScoutPlay?: boolean,
		scoutRawCost?: number,
		overrideCost?: number // New parameter for specific cost overrides
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
			const definition = this.gsm.getCardDefinition(limboCardObject.definitionId);
			if (!definition) throw new Error(`Card definition not found for ${limboCardObject.definitionId} in Limbo.`);

			// Fleeting, etc. and other pre-cost steps
			if (fromZoneIdentifier === ZoneIdentifier.Reserve) {
				// Rule 2.4.6.a: Card played from Reserve gains Fleeting, UNLESS it's a Landmark Permanent (implied by 5.2.3)
				const isLandmarkType = definition.type === CardType.LandmarkPermanent ||
									  (definition.type === CardType.Permanent && definition.permanentZoneType === PermanentZoneType.Landmark);
				if (!isLandmarkType) {
					limboCardObject.statuses.add(StatusType.Fleeting);
					console.log(`[CardPlaySystem] Card ${limboCardObject.name} played from Reserve, gained Fleeting status.`);
				} else {
					console.log(`[CardPlaySystem] Landmark ${limboCardObject.name} played from Reserve, does not gain Fleeting.`);
				}
			}

			// Rule 2.4.6.b (Spells) & prepares for 2.4.6.c (Characters/ExpeditionPermanents with inherent Fleeting)
			const hasFleetingKeyword = definition.abilities.some(ab => ab.keyword === KeywordAbility.Fleeting);
			if (hasFleetingKeyword) {
				if (definition.type === CardType.Spell ||
					definition.type === CardType.Character ||
					definition.type === CardType.ExpeditionPermanent ||
					(definition.type === CardType.Permanent && definition.permanentZoneType === PermanentZoneType.Expedition)) {
					limboCardObject.statuses.add(StatusType.Fleeting);
					console.log(`[CardPlaySystem] Card ${limboCardObject.name} (Type: ${definition.type}) has Fleeting keyword, gains Fleeting status in Limbo.`);
				}
			}
			// TODO: Apply passives to limboCardObject if any affect its state before cost payment (e.g. granting Fleeting)

			// Pay Tough Costs for any pre-selected targets (Rule 7.4.7)
			// This happens before paying the card's own cost.
			let totalToughCost = 0;
			if (_targets && _targets.length > 0 && this.gsm.keywordAbilityHandler) {
				for (const targetInfo of _targets) {
					const targetObject = this.gsm.getObject(targetInfo.objectId);
					// Ensure target exists and is controlled by an opponent
					if (targetObject && targetObject.controllerId !== playerId) {
						const toughValue = this.gsm.keywordAbilityHandler.getToughValue(targetObject);
						if (toughValue > 0) {
							totalToughCost += toughValue;
						}
					}
				}
			}

			if (totalToughCost > 0) {
				if (!this.gsm.manaSystem) { // Ensure manaSystem exists before using it
					throw new Error("[CardPlaySystem] ManaSystem not available on GSM. Cannot pay Tough costs.");
				}
				await this.gsm.manaSystem.spendMana(playerId, totalToughCost); // Assumes spendMana throws if unable to pay
				console.log(`[CardPlaySystem] Player ${playerId} paid ${totalToughCost} additional mana for Tough costs for card ${definition.name}.`);
			}

			// c. Pay Card's Own Costs (Rule 5.1.2.h, 6.4)
			// Determine the effective zone for cost calculation (Limbo usually, but Hand for Scout's initial cost basis)
			const effectiveZoneForCostCalc = (fromZoneIdentifier === ZoneIdentifier.Hand && isScoutPlay) ? ZoneIdentifier.Hand : ZoneIdentifier.Limbo;
			const finalCardManaCost = this.getModifiedCost(limboCardObject, effectiveZoneForCostCalc, playerId, isScoutPlay, scoutRawCost);

			console.log(`[CardPlaySystem] Final card mana cost for ${limboCardObject.name}${isScoutPlay ? ' (Scout)' : ''}: ${finalCardManaCost}`);
			if (finalCardManaCost > 0) {
				if (!this.gsm.manaSystem) { // Ensure manaSystem exists
					throw new Error("[CardPlaySystem] ManaSystem not available on GSM. Cannot pay card mana cost.");
				}
				await this.gsm.manaSystem.spendMana(playerId, finalCardManaCost); // Assumes spendMana throws if unable to pay
				console.log(`[CardPlaySystem] Player ${playerId} paid ${finalCardManaCost} mana for ${definition.name}.`);
			} else {
				console.log(`[CardPlaySystem] Card ${definition.name} has no mana cost to pay or cost is 0.`);
			}

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
					const finalExpeditionObject = this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, expeditionZone, playerId) as IGameObject;
					finalDestinationZone = ZoneIdentifier.Expedition;
					if (finalExpeditionObject && definition.startingCounters) {
						for (const [type, amount] of definition.startingCounters) {
							this.gsm.addCounters(finalExpeditionObject.objectId, type, amount);
						}
						console.log(`[CardPlaySystem] Applied starting counters to ${finalExpeditionObject.name}.`);
					}
					console.log(`[CardPlaySystem] ${definition.type} ${finalExpeditionObject?.name || limboCardObject.name} moved to ${selectedExpeditionType} expedition.`);
					break;

				case CardType.LandmarkPermanent:
					const finalLandmarkObject = this.gsm.moveEntity(limboCardObject.objectId, this.gsm.state.sharedZones.limbo, player.zones.landmarkZone, playerId) as IGameObject;
					finalDestinationZone = ZoneIdentifier.Landmark;
					if (finalLandmarkObject && definition.startingCounters) {
						for (const [type, amount] of definition.startingCounters) {
							this.gsm.addCounters(finalLandmarkObject.objectId, type, amount);
						}
						console.log(`[CardPlaySystem] Applied starting counters to ${finalLandmarkObject.name}.`);
					}
					console.log(`[CardPlaySystem] Landmark Permanent ${finalLandmarkObject?.name || limboCardObject.name} moved to landmark zone.`);
					if (finalLandmarkObject?.statuses.has(StatusType.Fleeting) && fromZoneIdentifier === ZoneIdentifier.Reserve) {
                         // Fleeting from reserve should not stick to permanents unless specified by another effect
                        finalLandmarkObject.statuses.delete(StatusType.Fleeting);
                        console.log(`[CardPlaySystem] Removed Fleeting from ${finalLandmarkObject.name} upon entering landmark zone.`);
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
						if (reservedSpell && definition.abilities.some(ab => ab.keyword === KeywordAbility.Cooldown)) { // Check abilities array
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
				fromZone: fromZoneIdentifier, // Original zone (e.g. Hand for Scout)
				finalZone: finalDestinationZone, // Actual zone it landed in (e.g. Expedition)
				definitionId: originalDefinitionId
			});

			// If played using Scout, grant the "Send to Reserve" reaction ability (Rule 7.4.5.c)
			if (isScoutPlay &&
				(finalDestinationZone === ZoneIdentifier.Expedition || finalDestinationZone === ZoneIdentifier.Landmark) &&
				this.gsm.keywordAbilityHandler) { // Ensure handler exists
				// limboCardObject is the card that is now in its final play zone
				this.gsm.keywordAbilityHandler.grantScoutSendToReserveAbility(limboCardObject);
			}

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
