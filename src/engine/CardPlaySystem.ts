import type { GameStateManager } from './GameStateManager';
import type { EventBus } from './EventBus';
import type { IGameObject, ICardInstance } from './types/objects';
import { ZoneIdentifier, CardType, StatusType, KeywordAbility, PermanentZoneType } from './types/enums';
import { isGameObject } from './types/objects';
import type { CostModifier } from './types/costs'; // Import CostModifier

// Placeholder for targeting types, can be refined later
export interface TargetInfo {
	targetId: string; // A conceptual ID for the target slot/requirement
	objectId: string; // The ID of the IGameObject chosen as the target
}

// Represents a chosen mode for a card with multiple modes of play.
export interface ModeSelection {
	modeId: string; // The identifier of the chosen mode.
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
	 * Helper method to declare intent to play a card, selecting targets and modes.
	 * This step happens before the card is moved to Limbo or costs are paid.
	 */
	private async declareIntent(
		playerId: string,
		cardEntity: IGameObject | ICardInstance,
		_fromZoneIdentifier: ZoneIdentifier, // fromZoneIdentifier is kept for context if needed in future target/mode validation based on origin
		_targets?: TargetInfo[],
		_mode?: ModeSelection
	): Promise<{ selectedTargets: TargetInfo[], selectedMode?: ModeSelection, definition: ICardDefinition, cardInstance: IGameObject | ICardInstance }> {
		const definition = this.gsm.getCardDefinition(cardEntity.definitionId);
		if (!definition) {
			throw new Error(`Card definition ${cardEntity.definitionId} not found during intent declaration.`);
		}

		let selectedTargets: TargetInfo[] = [];
		let selectedMode: ModeSelection | undefined = _mode;

		// Check for target requirements
		// Assuming ICardDefinition might have targetRequirements (e.g., definition.targetRequirements)
		// or it might be part of an effect (e.g., definition.effect?.targetRequirements)
		const targetRequirements = definition.targetRequirements || (definition.effect as any)?.targetRequirements;

		if (targetRequirements && Array.isArray(targetRequirements) && targetRequirements.length > 0) {
			if (_targets && _targets.length > 0) {
				// Basic validation: check if the number of targets matches.
				// More complex validation (criteria matching) would be in canPlayCard or a dedicated validation step.
				// For now, just accept provided targets. In a real scenario, validate each targetInfo.
				// Example: if (targetRequirements.length !== _targets.length) {
				// throw new Error(`Mismatch in number of targets provided versus required for ${definition.name}.`);
				// }
				console.log(`[CardPlaySystem.declareIntent] Targets provided for ${definition.name}:`, _targets);
				selectedTargets = _targets;
			} else {
				// If targets are required but not provided, this would normally prompt the player.
				// For this subtask, we throw an error as player interaction is out of scope.
				throw new Error(`Targets are required for ${definition.name} but were not provided.`);
			}
		} else if (_targets && _targets.length > 0) {
			// Targets provided but card does not require them. This could be an error or ignored.
			// For now, let's log a warning and ignore them, as canPlayCard should prevent this.
			console.warn(`[CardPlaySystem.declareIntent] Targets provided for ${definition.name}, but it does not require targets. Ignoring provided targets.`);
		}

		// Check for modes
		// Assuming ICardDefinition might have a 'modes' array (e.g., definition.modes)
		const cardModes = definition.modes;
		if (cardModes && Array.isArray(cardModes) && cardModes.length > 0) {
			if (_mode) {
				const isValidMode = cardModes.some(m => m.modeId === _mode.modeId);
				if (!isValidMode) {
					throw new Error(`Invalid mode selected for ${definition.name}. Mode ID: ${_mode.modeId}`);
				}
				selectedMode = _mode;
				console.log(`[CardPlaySystem.declareIntent] Mode selected for ${definition.name}:`, selectedMode);
			} else {
				// If modes exist but none provided, either default or error.
				// For now, error if choice is mandatory. If a default mode exists, that logic would go here.
				// Example: if (cardModes.some(m => m.isDefault)) { selectedMode = { modeId: cardModes.find(m => m.isDefault).modeId }; }
				// else { throw new Error(`Mode selection is required for ${definition.name} but was not provided.`); }
				throw new Error(`Mode selection is required for ${definition.name} but was not provided.`);
			}
		} else if (_mode) {
			// Mode provided but card does not have modes.
			console.warn(`[CardPlaySystem.declareIntent] Mode selected for ${definition.name}, but it does not have modes. Ignoring selected mode.`);
			selectedMode = undefined; // Clear the mode if card doesn't support it.
		}

		return { selectedTargets, selectedMode, definition, cardInstance: cardEntity };
	}


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
		overrideCost?: number, // New parameter for specific cost overrides (e.g., 0 for free)
		targets?: TargetInfo[], // Added for target validation
		mode?: ModeSelection    // Added for mode validation
	): Promise<{ isPlayable: boolean; cost?: number; reason?: string, definitionId?: string }> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return { isPlayable: false, reason: 'Player not found.' };

		const fromZone = this.gsm.getZoneByIdentifier(fromZoneIdentifier, playerId);
		if (!fromZone) return { isPlayable: false, reason: 'Source zone not found.' };

		const cardEntity = fromZone.findById(cardId);
		if (!cardEntity) return { isPlayable: false, reason: 'Card not found in source zone.' };

		const definition = this.gsm.getCardDefinition(cardEntity.definitionId);
		if (!definition) return { isPlayable: false, reason: 'Card definition not found.' };

		// Target Validation
		const targetRequirements: TargetRequirement[] | undefined = definition.targetRequirements || (definition.effect as any)?.targetRequirements;
		if (targetRequirements && Array.isArray(targetRequirements) && targetRequirements.length > 0) {
			if (!targets || targets.length === 0) {
				return { isPlayable: false, reason: `Targets required for ${definition.name} but not provided.`, definitionId: definition.id };
			}

			// Validate number of targets
			// This is a simplified check. A more robust check would sum `TargetRequirement.count`.
			// For now, assuming one requirement entry means that many targets.
			// Or, if each TargetInfo is meant to fulfill one TargetRequirement item.
			// Let's assume for now `targets.length` should equal `targetRequirements.reduce((sum, req) => sum + req.count, 0)`
			// For simplicity in this subtask, let's assume each target in TargetInfo[] corresponds to a slot,
			// and the number of TargetInfo entries must match the number of TargetRequirement entries.
			// A more complex system would match targetInfo.targetId to targetRequirement.targetId.
			const requiredTargetCount = targetRequirements.reduce((sum, req) => sum + req.count, 0);
			if (targets.length !== requiredTargetCount) {
				return { isPlayable: false, reason: `Incorrect number of targets for ${definition.name}. Expected ${requiredTargetCount}, got ${targets.length}.`, definitionId: definition.id };
			}

			for (const targetInfo of targets) {
				const targetObject = this.gsm.getObject(targetInfo.objectId);
				if (!targetObject) {
					return { isPlayable: false, reason: `Target object ${targetInfo.objectId} not found for ${definition.name}.`, definitionId: definition.id };
				}
				// Conceptual: this.gsm.isValidTarget(targetObject, requirement.criteria)
				// For now, just checking existence is the basic criteria validation.
				// TODO: Implement detailed criteria validation based on TargetRequirement.criteria
			}
		} else if (targets && targets.length > 0) {
			// Targets provided, but card does not require them.
			// Depending on game rules, this could be an error or just ignored.
			// For now, this is not considered an error for canPlayCard, declareIntent handles warnings.
			console.warn(`[CardPlaySystem.canPlayCard] Targets provided for ${definition.name}, but it does not seem to require targets. This might be an issue with card definition or play attempt.`);
		}

		// Mode Validation
		const cardModes = definition.modes;
		if (cardModes && Array.isArray(cardModes) && cardModes.length > 0) {
			if (!mode) {
				return { isPlayable: false, reason: `Mode selection required for ${definition.name} but not provided.`, definitionId: definition.id };
			}
			const isValidMode = cardModes.some(m => m.modeId === mode.modeId);
			if (!isValidMode) {
				return { isPlayable: false, reason: `Invalid mode '${mode.modeId}' selected for ${definition.name}.`, definitionId: definition.id };
			}
		} else if (mode) {
			// Mode provided, but card does not have modes.
			console.warn(`[CardPlaySystem.canPlayCard] Mode selected for ${definition.name}, but it does not have modes. This might be an issue with card definition or play attempt.`);
		}


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
		_mode?: ModeSelection, // Added for mode selection
		isScoutPlay?: boolean,
		scoutRawCost?: number,
		overrideCost?: number // New parameter for specific cost overrides
	): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found.`);

		const fromZone = this.gsm.getZoneByIdentifier(fromZoneIdentifier, playerId);
		if (!fromZone) throw new Error(`Source zone ${fromZoneIdentifier} not found for player ${playerId}.`);

		let cardEntityToPlay = fromZone.findById(cardId);
		if (!cardEntityToPlay) throw new Error(`Card ${cardId} not found in zone ${fromZone.id}.`);

		// Step 1: Declare Intent (before moving to Limbo or paying costs)
		// This will fetch the definition and validate targets/modes if provided.
		const {
			selectedTargets,
			selectedMode,
			definition: cardDefinition, // Renaming to avoid conflict with 'definition' later if it's re-fetched (though ideally not)
			cardInstance: initialCardInstance // The card entity before any state changes like moving to Limbo
		} = await this.declareIntent(playerId, cardEntityToPlay, fromZoneIdentifier, _targets, _mode);

		const originalDefinitionId = initialCardInstance.definitionId; // Should be same as cardDefinition.id
		console.log(`[CardPlaySystem] Intent declared for card ${cardDefinition.name} (ID: ${initialCardInstance.objectId || initialCardInstance.instanceId}) from ${fromZoneIdentifier}. Targets: ${selectedTargets.length}, Mode: ${selectedMode?.modeId}`);

		// Step 2: Verify Play Legality (includes targets, mode, cost) BEFORE moving to Limbo
		// Note: cardId for canPlayCard should be the original cardId from the source zone.
		// isScoutPlay, scoutRawCost, overrideCost are passed through.
		const legalityCheck = await this.canPlayCard(
			playerId,
			isGameObject(initialCardInstance) ? initialCardInstance.objectId : initialCardInstance.instanceId, // Use ID of card in its current zone (before Limbo)
			fromZoneIdentifier,
			isScoutPlay,
			scoutRawCost,
			overrideCost,
			selectedTargets, // Pass selected targets
			selectedMode     // Pass selected mode
		);

		if (!legalityCheck.isPlayable) {
			throw new Error(`Cannot play card ${cardDefinition.name}: ${legalityCheck.reason || 'Unknown reason.'}`);
		}
		console.log(`[CardPlaySystem] Legality check passed for ${cardDefinition.name}. Cost: ${legalityCheck.cost}`);


		// b. Move to Limbo (Rule 5.1.2.g)
		// Use initialCardInstance.objectId or instanceId as appropriate for moveEntity
		const cardIdentifierForMove = isGameObject(initialCardInstance) ? initialCardInstance.objectId : initialCardInstance.instanceId;
		const limboCardObject = this.gsm.moveEntity(cardIdentifierForMove, fromZone, this.gsm.state.sharedZones.limbo, playerId) as IGameObject;
		if (!limboCardObject) throw new Error('Failed to move card to Limbo or card became non-object.');
		console.log(`[CardPlaySystem] Card ${limboCardObject.name} (ObjID: ${limboCardObject.objectId}) moved to Limbo.`);

		// Update cardEntityToPlay to be the one in Limbo for subsequent operations
		cardEntityToPlay = limboCardObject;


		try {
			// const definition = this.gsm.getCardDefinition(limboCardObject.definitionId); // Already have cardDefinition
			// if (!cardDefinition) throw new Error(`Card definition not found for ${limboCardObject.definitionId} in Limbo.`); // Should be caught by declareIntent

			// Fleeting, etc. and other pre-cost steps
			if (fromZoneIdentifier === ZoneIdentifier.Reserve) {
				// Rule 2.4.6.a: Card played from Reserve gains Fleeting, UNLESS it's a Landmark Permanent (implied by 5.2.3)
				const isLandmarkType = cardDefinition.type === CardType.LandmarkPermanent ||
									  (cardDefinition.type === CardType.Permanent && cardDefinition.permanentZoneType === PermanentZoneType.Landmark);
				if (!isLandmarkType) {
					cardEntityToPlay.statuses.add(StatusType.Fleeting); // Use cardEntityToPlay (which is limboCardObject)
					console.log(`[CardPlaySystem] Card ${cardEntityToPlay.name} played from Reserve, gained Fleeting status.`);
				} else {
					console.log(`[CardPlaySystem] Landmark ${cardEntityToPlay.name} played from Reserve, does not gain Fleeting.`);
				}
			}

			// Rule 2.4.6.b (Spells) & prepares for 2.4.6.c (Characters/ExpeditionPermanents with inherent Fleeting)
			const hasFleetingKeyword = cardDefinition.abilities.some(ab => ab.keyword === KeywordAbility.Fleeting);
			if (hasFleetingKeyword) {
				if (cardDefinition.type === CardType.Spell ||
					cardDefinition.type === CardType.Character ||
					cardDefinition.type === CardType.ExpeditionPermanent ||
					(cardDefinition.type === CardType.Permanent && cardDefinition.permanentZoneType === PermanentZoneType.Expedition)) {
					cardEntityToPlay.statuses.add(StatusType.Fleeting);
					console.log(`[CardPlaySystem] Card ${cardEntityToPlay.name} (Type: ${cardDefinition.type}) has Fleeting keyword, gains Fleeting status in Limbo.`);
				}
			}
			// TODO: Apply passives to cardEntityToPlay (limboCardObject) if any affect its state before cost payment

			// Pay Tough Costs for any pre-selected targets (Rule 7.4.7)
			// This happens before paying the card's own cost.
			// Use selectedTargets from declareIntent
			let totalToughCost = 0;
			if (selectedTargets.length > 0 && this.gsm.keywordAbilityHandler) {
				for (const targetInfo of selectedTargets) { // Use selectedTargets
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
				console.log(`[CardPlaySystem] Player ${playerId} paid ${totalToughCost} additional mana for Tough costs for card ${cardDefinition.name}.`);
			}

			// c. Pay Card's Own Costs (Rule 5.1.2.h, 6.4)
			// Determine the effective zone for cost calculation (Limbo usually, but Hand for Scout's initial cost basis)
			const effectiveZoneForCostCalc = (fromZoneIdentifier === ZoneIdentifier.Hand && isScoutPlay) ? ZoneIdentifier.Hand : ZoneIdentifier.Limbo;
			// Use cardEntityToPlay (limboCardObject) for cost calculation
			const finalCardManaCost = this.getModifiedCost(cardEntityToPlay, effectiveZoneForCostCalc, playerId, isScoutPlay, scoutRawCost);

			console.log(`[CardPlaySystem] Final card mana cost for ${cardEntityToPlay.name}${isScoutPlay ? ' (Scout)' : ''}: ${finalCardManaCost}`);
			if (finalCardManaCost > 0) {
				if (!this.gsm.manaSystem) { // Ensure manaSystem exists
					throw new Error("[CardPlaySystem] ManaSystem not available on GSM. Cannot pay card mana cost.");
				}
				await this.gsm.manaSystem.spendMana(playerId, finalCardManaCost); // Assumes spendMana throws if unable to pay
				console.log(`[CardPlaySystem] Player ${playerId} paid ${finalCardManaCost} mana for ${cardDefinition.name}.`);
			} else {
				console.log(`[CardPlaySystem] Card ${cardDefinition.name} has no mana cost to pay or cost is 0.`);
			}

			// Rule 5.2.b: Handle passive abilities granting counters/statuses to the card being played.
			// This creates Emblem-Reactions that will be picked up by resolveReactions later.
			// This occurs after costs are paid but before the card moves to its final zone or resolves its own effects.
			if (this.gsm.handlePassivesGrantingCountersOrStatusesOnPlay) { // Check if method exists for safety
				await this.gsm.handlePassivesGrantingCountersOrStatusesOnPlay(cardEntityToPlay, playerId);
				console.log(`[CardPlaySystem] Handled passives granting counters/statuses for ${cardEntityToPlay.name}.`);
			} else {
				console.warn(`[CardPlaySystem] GSM method handlePassivesGrantingCountersOrStatusesOnPlay not found. Skipping.`);
			}


			// d. Resolution (Rule 5.1.2.i)
			// Use cardEntityToPlay (limboCardObject) and cardDefinition
			console.log(`[CardPlaySystem] Resolving card ${cardEntityToPlay.name} of type ${cardDefinition.type}.`);
			let finalDestinationZone: ZoneIdentifier | undefined = undefined;

			switch (cardDefinition.type) {
				case CardType.Character:
				case CardType.ExpeditionPermanent:
					if (!selectedExpeditionType) {
						throw new Error(`Expedition type (hero/companion) not selected for ${cardDefinition.type}: ${cardEntityToPlay.name}`);
					}
					const expeditionZone = this.gsm.state.sharedZones.expedition;
					cardEntityToPlay.expeditionAssignment = { playerId, type: selectedExpeditionType };
					const finalExpeditionObject = this.gsm.moveEntity(cardEntityToPlay.objectId, this.gsm.state.sharedZones.limbo, expeditionZone, playerId) as IGameObject;
					finalDestinationZone = ZoneIdentifier.Expedition;
					if (finalExpeditionObject && cardDefinition.startingCounters) {
						for (const [type, amount] of cardDefinition.startingCounters) {
							this.gsm.addCounters(finalExpeditionObject.objectId, type, amount);
						}
						console.log(`[CardPlaySystem] Applied starting counters to ${finalExpeditionObject.name}.`);
					}
					console.log(`[CardPlaySystem] ${cardDefinition.type} ${finalExpeditionObject?.name || cardEntityToPlay.name} moved to ${selectedExpeditionType} expedition.`);
					break;

				case CardType.LandmarkPermanent:
					const finalLandmarkObject = this.gsm.moveEntity(cardEntityToPlay.objectId, this.gsm.state.sharedZones.limbo, player.zones.landmarkZone, playerId) as IGameObject;
					finalDestinationZone = ZoneIdentifier.Landmark;
					if (finalLandmarkObject && cardDefinition.startingCounters) {
						for (const [type, amount] of cardDefinition.startingCounters) {
							this.gsm.addCounters(finalLandmarkObject.objectId, type, amount);
						}
						console.log(`[CardPlaySystem] Applied starting counters to ${finalLandmarkObject.name}.`);
					}
					console.log(`[CardPlaySystem] Landmark Permanent ${finalLandmarkObject?.name || cardEntityToPlay.name} moved to landmark zone.`);
					if (finalLandmarkObject?.statuses.has(StatusType.Fleeting) && fromZoneIdentifier === ZoneIdentifier.Reserve) {
                         // Fleeting from reserve should not stick to permanents unless specified by another effect
                        finalLandmarkObject.statuses.delete(StatusType.Fleeting);
                        console.log(`[CardPlaySystem] Removed Fleeting from ${finalLandmarkObject.name} upon entering landmark zone.`);
                    }
					break;

				case CardType.Spell:
					// Use cardDefinition for effect, originalDefinitionId for logging if specific version needed
					if (!cardDefinition.effect) throw new Error (`Spell definition or effect missing for ${originalDefinitionId}`);

					console.log(`[CardPlaySystem] Resolving spell effect for ${cardEntityToPlay.name} (DefID: ${originalDefinitionId}). Mode: ${selectedMode?.modeId}`);
					// Pass selectedTargets and selectedMode to resolveEffect
					await this.gsm.effectProcessor.resolveEffect(
						cardDefinition.effect,
						cardEntityToPlay, // sourceCardObject
						selectedTargets,  // targets
						undefined,        // triggerContext (playCard is not a trigger context itself)
						selectedMode      // mode
					);

					if (cardEntityToPlay.statuses.has(StatusType.Fleeting)) {
						console.log(`[CardPlaySystem] Fleeting spell ${cardEntityToPlay.name} moving to Discard Pile.`);
						this.gsm.moveEntity(cardEntityToPlay.objectId, this.gsm.state.sharedZones.limbo, player.zones.discardPileZone, playerId);
						finalDestinationZone = ZoneIdentifier.DiscardPile;
					} else {
						console.log(`[CardPlaySystem] Non-Fleeting spell ${cardEntityToPlay.name} moving to Reserve.`);
						const reservedSpell = this.gsm.moveEntity(cardEntityToPlay.objectId, this.gsm.state.sharedZones.limbo, player.zones.reserveZone, playerId) as IGameObject;
						finalDestinationZone = ZoneIdentifier.Reserve;
						if (reservedSpell && cardDefinition.abilities.some(ab => ab.keyword === KeywordAbility.Cooldown)) { // Check abilities array
							reservedSpell.statuses.add(StatusType.Exhausted);
							console.log(`[CardPlaySystem] Spell ${reservedSpell.name} has Cooldown, exhausted in Reserve.`);
						}
					}
					break;
				default:
					console.error(`[CardPlaySystem] Unknown card type to play: ${cardDefinition.type} for card ${cardEntityToPlay.name}`);
					throw new Error(`Unhandled card type for play: ${cardDefinition.type}`);
			}

			this.eventBus.publish('cardPlayed', {
				card: cardEntityToPlay, // This is the object instance that was played, now possibly in its final zone
				playerId,
				fromZone: fromZoneIdentifier, // Original zone (e.g. Hand for Scout)
				finalZone: finalDestinationZone, // Actual zone it landed in (e.g. Expedition)
				definitionId: originalDefinitionId,
				selectedTargets, // Include selected targets in the event
				selectedMode     // Include selected mode in the event
			});

			// If played using Scout, grant the "Send to Reserve" reaction ability (Rule 7.4.5.c)
			if (isScoutPlay &&
				(finalDestinationZone === ZoneIdentifier.Expedition || finalDestinationZone === ZoneIdentifier.Landmark) &&
				this.gsm.keywordAbilityHandler) { // Ensure handler exists
				// cardEntityToPlay is the card that is now in its final play zone
				this.gsm.keywordAbilityHandler.grantScoutSendToReserveAbility(cardEntityToPlay as IGameObject); // Ensure it's IGameObject
			}

			// Rule 5.1.2.j: "When a card is played" triggers. These typically occur after the card has resolved.
			// The event 'cardPlayed' should be used by AdvancedTriggerHandler to find and queue these triggers.
			// Then, resolveReactions will pick them up if they create reaction emblems.
			await this.gsm.resolveReactions();

		} catch (error) {
			console.error(`[CardPlaySystem] Error playing card ${originalDefinitionId} (ID: ${isGameObject(initialCardInstance) ? initialCardInstance.objectId : initialCardInstance.instanceId}) for player ${playerId}:`, error);
			// Attempt to return the card to its original zone or hand if play fails mid-process.
			// Check if the card is still in Limbo using cardEntityToPlay (which is limboCardObject)
			const cardStillInLimbo = this.gsm.state.sharedZones.limbo.findById(cardEntityToPlay.objectId);
			if (cardStillInLimbo) {
				console.warn(`[CardPlaySystem] Attempting to return ${cardEntityToPlay.name} from Limbo to player ${playerId}'s hand due to error during play.`);
				// Deciding the "original" zone is tricky. Hand is a safe default.
				// If `fromZoneIdentifier` was Reserve, it should ideally go back there.
				// `fromZone` object is already fetched and correct for this.
				const returnZone = (fromZoneIdentifier === ZoneIdentifier.Reserve || fromZoneIdentifier === ZoneIdentifier.Battlefield || fromZoneIdentifier === ZoneIdentifier.Landmark || fromZoneIdentifier === ZoneIdentifier.Expedition) ? fromZone : player.zones.handZone;
				this.gsm.moveEntity(cardEntityToPlay.objectId, this.gsm.state.sharedZones.limbo, returnZone, playerId);
			} else {
				// If the card is not in Limbo, it might have been moved to its final destination before an error occurred
				// or failed to move to Limbo in the first place. This part of error recovery is complex.
				// For now, if it's not in Limbo, we assume it was either never moved or already moved elsewhere by a completed step.
				console.warn(`[CardPlaySystem] Card ${originalDefinitionId} was not found in Limbo during error handling. It might be in its original zone or an intermediate/final zone.`);
			}
			throw error; // Re-throw the error to be handled by the caller
		}
	}
}
