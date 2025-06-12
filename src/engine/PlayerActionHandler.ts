import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance, IEmblemObject } from './types/objects';
import { GamePhase, CardType, StatusType, ZoneIdentifier, AbilityType, KeywordAbility } from './types/enums';
import { isGameObject } from './types/objects';
import type { TargetInfo } from './CardPlaySystem'; // Assuming TargetInfo is in CardPlaySystem
// import type { TargetRequirement } from './CardPlaySystem'; // If defined there

/**
 * Handles player actions.
 */
export class PlayerActionHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Gets available actions for a player.
	 * Rule 4.2.3.d (Afternoon), Rule 4.2.1.e (Morning Expand)
	 */
	public async getAvailableActions(playerId: string): Promise<PlayerAction[]> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const actions: PlayerAction[] = [];
		const currentPhase = this.gsm.state.currentPhase;
		const isCurrentPlayer = this.gsm.state.currentPlayerId === playerId;

		// Play Card Actions (Hand & Reserve) - Typically Afternoon
		if (isCurrentPlayer && currentPhase === GamePhase.Afternoon) {
			// From Hand
			for (const cardInHand of player.zones.handZone.getAll()) {
				const currentCardId = cardInHand.instanceId; // Assuming ICardInstance has instanceId
				const definition = this.gsm.getCardDefinition(cardInHand.definitionId);
				if (!definition) continue;

				// Normal Play Action
				const canPlayCheckNormal = await this.gsm.cardPlaySystem.canPlayCard(playerId, currentCardId, ZoneIdentifier.Hand);
				if (canPlayCheckNormal.isPlayable) {
					actions.push({
						type: 'playCard',
						cardId: currentCardId,
						cardDefinitionId: definition.id,
						zone: ZoneIdentifier.Hand,
						cost: canPlayCheckNormal.cost,
						description: `Play ${definition.name} from hand (Cost: ${canPlayCheckNormal.cost})`,
						useScoutCost: false
					});
				}

				// Scout Play Action
				const scoutAbility = definition.abilities.find(ab => ab.keyword === KeywordAbility.Scout);
				if (scoutAbility && scoutAbility.keywordValue !== undefined) {
					const scoutCostX = scoutAbility.keywordValue;
					const canPlayCheckScout = await this.gsm.cardPlaySystem.canPlayCard(playerId, currentCardId, ZoneIdentifier.Hand, true, scoutCostX);
					if (canPlayCheckScout.isPlayable) {
						actions.push({
							type: 'playCard',
							cardId: currentCardId,
							cardDefinitionId: definition.id,
							zone: ZoneIdentifier.Hand,
							cost: canPlayCheckScout.cost, // This will be the modified scout cost
							description: `Play ${definition.name} using Scout (Cost: ${canPlayCheckScout.cost}, Base Scout: ${scoutCostX})`,
							useScoutCost: true,
							scoutCostValue: scoutCostX
						});
					}
				}
			}
			// From Reserve
			for (const cardInReserve of player.zones.reserveZone.getAll()) {
				if (isGameObject(cardInReserve)) { // Cards in reserve are IGameObjects
					const canPlayCheck = await this.gsm.cardPlaySystem.canPlayCard(playerId, cardInReserve.objectId, ZoneIdentifier.Reserve);
					if (canPlayCheck.isPlayable) {
						actions.push({
							type: 'playCard',
							cardId: cardInReserve.objectId,
							cardDefinitionId: canPlayCheck.definitionId,
							zone: ZoneIdentifier.Reserve,
							cost: canPlayCheck.cost,
							description: `Play ${cardInReserve.name} from reserve (Cost: ${canPlayCheck.cost})`
							// TODO: Add targeting requirements
						});
					}
				}
			}
		}

		// Activate Ability Actions (Quick Actions)
		if (isCurrentPlayer) { // Simplified: only current player can activate abilities for now
			const activatableAbilities = await this.getActivatableQuickActions(playerId);
			actions.push(...activatableAbilities);
		}

		// Pass Turn Action (Afternoon only)
		if (isCurrentPlayer && currentPhase === GamePhase.Afternoon) {
			actions.push({ type: 'pass', description: 'Pass turn' });
		}

		// Expand Action (Morning only)
		if (currentPhase === GamePhase.Morning && isCurrentPlayer && !player.hasExpandedThisTurn && player.zones.handZone.getCount() > 0) {
			actions.push({
				type: 'expandMana',
				description: 'Expand a card from your hand to your Mana zone.'
				// cardToExpandId would be chosen by player before execution
			});
		}

		// Mana Conversion
		if (isCurrentPlayer) { // Typically on player's turn
			const manaZone = player.zones.manaZone;
			const allManaOrbs = manaZone.getAll().filter(isGameObject);
			const readyOrbs = allManaOrbs.filter(orb => !orb.statuses.has(StatusType.Exhausted));
			const exhaustedOrbs = allManaOrbs.filter(orb => orb.statuses.has(StatusType.Exhausted));

			for (const readyOrb of readyOrbs) {
				for (const exhaustedOrb of exhaustedOrbs) {
					if (readyOrb.objectId !== exhaustedOrb.objectId) {
						actions.push({
							type: 'convertManaOrb',
							sourceOrbId: readyOrb.objectId,
							targetOrbId: exhaustedOrb.objectId,
							description: `Exhaust ${readyOrb.name || 'Orb'} to ready ${exhaustedOrb.name || 'Orb'}`
						});
					}
				}
			}
		}
		return actions;
	}

	private async getActivatableQuickActions(playerId: string): Promise<PlayerAction[]> {
		const availableQuickActions: PlayerAction[] = [];
		// Use a default if gsm.config or nothingIsForeverLimit is not set
		const activationLimit = (this.gsm.config as any)?.nothingIsForeverLimit ?? 100; // Rule 1.4.6.b

		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const zonesToScan = [
			player.zones.heroZone,
			this.gsm.state.sharedZones.expedition,
			player.zones.landmarkZone,
			player.zones.reserveZone,
		];

		for (const zone of zonesToScan) {
			const playerObjects = zone.getAll().filter(
				(e): e is IGameObject => isGameObject(e) && e.controllerId === playerId
			);

			for (const sourceObject of playerObjects) {
				const allAbilities = [
					...sourceObject.abilities,
					...(sourceObject.currentCharacteristics.grantedAbilities || [])
				];

				for (const ability of allAbilities) {
					if (ability.abilityType !== AbilityType.QuickAction) continue;

					// Support Quick Actions (Rule 2.2.11.e)
					if (zone.zoneType === ZoneIdentifier.Reserve && !ability.isSupportAbility) continue;
					if (zone.zoneType !== ZoneIdentifier.Reserve && ability.isSupportAbility) continue;

					const currentActivations = sourceObject.abilityActivationsToday?.get(ability.abilityId) || 0;
					if (currentActivations >= activationLimit) continue;

					let canPayAllCosts = true;
					if (ability.cost) {
					let totalManaCost = 0;
					if (ability.cost?.mana) {
						totalManaCost += ability.cost.mana;
					}

					// Hypothetical: If this ability targets, and we've selected a target.
					// This part is conceptual for demonstrating Tough integration, as full target
					// selection isn't part of getAvailableActions yet for all action types.
					// We would loop through resolved targets if the ability has them.
					// For now, let's assume a hypothetical single opponentTargetObject if the ability implies targeting.

					// Example: const potentialTargets = this.resolvePotentialTargets(ability.effect, sourceObject, playerId);
					// for (const pTarget of potentialTargets) {
					//    if (pTarget.controllerId !== playerId && this.gsm.keywordAbilityHandler) { ... }
					// }
					// For this subtask, we'll just illustrate with a placeholder check.

					let currentAdditionalToughCost = 0;
					let toughCheckPassed = true; // Assume true unless a Tough target makes it false

					// --- Conceptual Tough Check Start (Illustrative) ---
					// In a real scenario, you'd identify actual potential targets of the ability.
					// For demonstration, let's imagine 'hypotheticalOpponentTargetWithTough' is one such target.
					/*
					if (hypotheticalOpponentTargetWithTough && hypotheticalOpponentTargetWithTough.controllerId !== playerId && this.gsm.keywordAbilityHandler) {
						const toughValue = this.getToughValue(hypotheticalOpponentTargetWithTough); // Helper to get X
						if (toughValue > 0) {
							if (!this.gsm.keywordAbilityHandler.canTargetWithTough(hypotheticalOpponentTargetWithTough, playerId)) {
								toughCheckPassed = false;
							} else {
								currentAdditionalToughCost += toughValue;
							}
						}
					}
					*/
					// --- Conceptual Tough Check End ---

					if (!toughCheckPassed) {
						// If any chosen/required Tough target cannot be paid for, this specific action variant isn't available.
						// This might mean skipping this action, or if the ability can be used without that target,
						// generating a different version of the action. For now, assume it makes this variant invalid.
						continue;
					}

					totalManaCost += currentAdditionalToughCost;

					if (ability.cost?.mana && ability.cost.mana > 0) { // Original mana cost check
						if (!this.gsm.manaSystem.canPayMana(playerId, totalManaCost)) { // Check total including Tough
								canPayAllCosts = false;
							}
					} else if (currentAdditionalToughCost > 0) { // No base mana cost, but Tough cost exists
						if (!this.gsm.manaSystem.canPayMana(playerId, currentAdditionalToughCost)) {
							canPayAllCosts = false;
						}
						}


					if (ability.cost?.exhaustSelf) {
							if (sourceObject.statuses.has(StatusType.Exhausted)) canPayAllCosts = false;
						}
					if (ability.cost?.discardSelfFromReserve) {
							if (zone.zoneType !== ZoneIdentifier.Reserve || sourceObject.statuses.has(StatusType.Exhausted)) {
								canPayAllCosts = false;
							}
						}
						// TODO: Add other cost checks (sacrifice, spendCounters)
					}


					if (canPayAllCosts) {
					let description = `Use QA: ${ability.text || ability.abilityId} from ${sourceObject.name}`;
					if (currentAdditionalToughCost > 0) {
						description += ` (Cost: ${totalManaCost}, incl. Tough ${currentAdditionalToughCost})`;
					} else if (ability.cost?.mana) {
						description += ` (Cost: ${ability.cost.mana})`;
					}

						availableQuickActions.push({
							type: 'quickAction',
							abilityId: ability.abilityId,
							sourceObjectId: sourceObject.objectId,
						description: description,
						cost: totalManaCost > 0 ? totalManaCost : (ability.cost?.mana || 0), // Ensure cost reflects total
						additionalToughCost: currentAdditionalToughCost > 0 ? currentAdditionalToughCost : undefined,
						// TODO: Add actual target(s) chosen that resulted in this cost
						});
					}
				}
			}
		}
		return availableQuickActions;
	}

	/**
	 * Executes a player action.
	 */
	public async executeAction(playerId: string, action: PlayerAction): Promise<boolean> {
		// Basic check, more nuanced checks per action type might be needed
		if (this.gsm.state.currentPlayerId !== playerId &&
			action.type !== 'convertManaOrb' && // Allow mana conversion if applicable out of turn
			action.type !== 'expandMana' // Expand mana is phase-specific, not turn-specific necessarily
		) {
			// Most actions require it to be the player's turn.
			// throw new Error(`Not ${playerId}'s turn to perform action ${action.type}`);
		}

		let turnEnds = false;

		switch (action.type) {
			case 'pass':
				if (this.gsm.state.currentPhase !== GamePhase.Afternoon || this.gsm.state.currentPlayerId !== playerId) {
					throw new Error('Cannot pass turn outside of Afternoon phase or if not current player.');
				}
				if(this.gsm.turnManager) this.gsm.turnManager.playerPasses(playerId); // Check if turnManager is set
				else console.warn("[PlayerActionHandler] TurnManager not available on GSM for pass action.");
				console.log(`[PlayerActionHandler] ${playerId} passed their turn`);
				turnEnds = true;
				break;

			case 'playCard':
				if (!action.cardId || action.zone === undefined) {
					throw new Error('Action playCard missing cardId or zone.');
				}
				await this.executePlayCardAction(
					playerId,
					action.cardId,
					action.zone as ZoneIdentifier,
					action.selectedExpeditionType,
					action.targets,
					action.useScoutCost,
					action.scoutCostValue
				);
				console.log(`[PlayerActionHandler] ${playerId} played card: ${action.cardDefinitionId || action.cardId}${action.useScoutCost ? ' using Scout' : ''}`);
				turnEnds = true;
				break;

			case 'quickAction':
				if (!action.abilityId || !action.sourceObjectId) {
					throw new Error('Action quickAction missing abilityId or sourceObjectId.');
				}
				await this.executeActivateAbilityAction(playerId, action.sourceObjectId, action.abilityId, action.targets);
				console.log(`[PlayerActionHandler] ${playerId} used quick action: ${action.abilityId} on ${action.sourceObjectId}`);
				turnEnds = false;
				break;

			case 'expandMana':
				// cardToExpandId should be part of the action if a specific card is chosen prior to execution
				if (!action.cardToExpandId && !action.cardId) throw new Error('No card specified for expandMana action.');
				const cardToExpand = action.cardToExpandId || action.cardId; // Use cardId if cardToExpandId isn't filled
				if(!cardToExpand) throw new Error('No card ID found for expandMana action.');
				await this.executeExpandAction(playerId, cardToExpand);
				console.log(`[PlayerActionHandler] Player ${playerId} expanded a card to mana.`);
				turnEnds = false;
				break;

			case 'convertManaOrb':
				if (!action.sourceOrbId || !action.targetOrbId) {
					throw new Error('Action convertManaOrb missing sourceOrbId or targetOrbId.');
				}
				const converted = this.gsm.manaSystem.convertMana(playerId, action.sourceOrbId, action.targetOrbId);
				if (!converted) {
					console.warn(`[PlayerActionHandler] Mana conversion failed for player ${playerId}.`);
				} else {
					console.log(`[PlayerActionHandler] ${playerId} converted mana.`);
				}
				turnEnds = false;
				break;

			default:
				throw new Error(`Unknown action type: ${(action as any).type}`);
		}

		if (action.type !== 'pass' && action.type !== 'convertManaOrb') {
			await this.gsm.resolveReactions();
		}

		return turnEnds;
	}

	// getToughValue has been moved to KeywordAbilityHandler.ts

	public async executePlayCardAction(
		playerId: string,
		cardId: string,
		fromZone: ZoneIdentifier,
		selectedExpeditionType?: 'hero' | 'companion',
		targets?: TargetInfo[],
		isScoutPlay?: boolean,
		scoutRawCost?: number
		// Tough cost payment will be handled inside CardPlaySystem.playCard or EffectProcessor if it's for effect targets
	): Promise<void> {
		await this.gsm.cardPlaySystem.playCard(playerId, cardId, fromZone, selectedExpeditionType, targets, isScoutPlay, scoutRawCost);
	}

	public async executeActivateAbilityAction(
		playerId: string,
		sourceObjectId: string,
		abilityId: string,
		targets?: TargetInfo[]
	): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		const sourceObject = this.gsm.getObject(sourceObjectId);

		if (!player) throw new Error(`Player ${playerId} not found.`);
		if (!sourceObject) throw new Error(`Source object ${sourceObjectId} not found.`);
		if (sourceObject.controllerId !== playerId) {
			throw new Error(`Player ${playerId} does not control source object ${sourceObjectId}.`);
		}

		const allAbilities = [
			...(sourceObject.currentCharacteristics.abilities || []),
			...(sourceObject.currentCharacteristics.grantedAbilities || [])
		];
		const ability = allAbilities.find(a => a.abilityId === abilityId);

		if (!ability) throw new Error(`Ability ${abilityId} not found on source object ${sourceObjectId}.`);
		if (ability.abilityType !== AbilityType.QuickAction) {
			throw new Error(`Ability ${abilityId} on ${sourceObjectId} is not a QuickAction.`);
		}

		const activationLimit = (this.gsm.config as any)?.nothingIsForeverLimit ?? 100;
		const currentActivations = sourceObject.abilityActivationsToday?.get(abilityId) || 0;
		if (currentActivations >= activationLimit) {
			throw new Error(`Quick action ${abilityId} on ${sourceObjectId} has reached its daily activation limit.`);
		}

		// Step 1: Determine all costs and check if they can be paid (Rule 6.4.c, 6.4.d)
		let canPayAll = true;
		let combinedManaCost = 0;

		// Tough costs for targets
		if (targets && targets.length > 0 && this.gsm.keywordAbilityHandler) {
			for (const targetInfo of targets) {
				const targetObject = this.gsm.getObject(targetInfo.objectId);
				if (targetObject && targetObject.controllerId !== playerId) {
					const toughValue = this.gsm.keywordAbilityHandler.getToughValue(targetObject);
					if (toughValue > 0) combinedManaCost += toughValue;
				}
			}
		}

		// Ability's own mana cost
		if (ability.cost?.mana && ability.cost.mana > 0) {
			combinedManaCost += ability.cost.mana;
		}

		if (combinedManaCost > 0 && !this.gsm.manaSystem.canPayMana(playerId, combinedManaCost)) {
			canPayAll = false;
			console.warn(`[PlayerActionHandler] Cannot pay total mana cost ${combinedManaCost} for QA ${abilityId}.`);
		}

		if (ability.cost?.exhaustSelf && sourceObject.statuses.has(StatusType.Exhausted)) {
			canPayAll = false;
			console.warn(`[PlayerActionHandler] Cannot pay exhaustSelf cost for QA ${abilityId}: ${sourceObject.name} already exhausted.`);
		}

		if (ability.cost?.discardSelfFromReserve) {
			const objectZone = this.gsm.findZoneOfObject(sourceObject.objectId);
			if (!objectZone || objectZone.zoneType !== ZoneIdentifier.Reserve || sourceObject.statuses.has(StatusType.Exhausted)) {
				canPayAll = false;
				console.warn(`[PlayerActionHandler] Cannot pay discardSelfFromReserve cost for QA ${abilityId}.`);
			}
		}

		if (ability.cost?.spendCounters) {
			const currentCounters = sourceObject.counters.get(ability.cost.spendCounters.type) || 0;
			if (currentCounters < ability.cost.spendCounters.amount) {
				canPayAll = false;
				console.warn(`[PlayerActionHandler] Cannot pay spendCounters cost for QA ${abilityId}: needs ${ability.cost.spendCounters.amount} ${ability.cost.spendCounters.type}, has ${currentCounters}.`);
			}
		}
		// TODO: Check other cost types like sacrifice

		if (!canPayAll) {
			throw new Error(`Player ${playerId} cannot pay all costs for QA ${abilityId} on ${sourceObject.name}.`);
		}

		// Step 2: Pay all costs simultaneously (Rule 6.4.a)
		if (combinedManaCost > 0) {
			await this.gsm.manaSystem.spendMana(playerId, combinedManaCost);
			console.log(`[PlayerActionHandler] Player ${playerId} paid total ${combinedManaCost} mana for QA ${abilityId}.`);
		}
		if (ability.cost?.exhaustSelf) {
			sourceObject.statuses.add(StatusType.Exhausted);
			this.gsm.eventBus.publish('objectStatusChanged', { object: sourceObject, status: StatusType.Exhausted, added: true });
			console.log(`[PlayerActionHandler] Exhausted ${sourceObject.name} for QA ${abilityId}.`);
		}
		if (ability.cost?.discardSelfFromReserve) {
			// Re-fetch player in case of changes, though unlikely for this operation sequence
			const currentSourcePlayer = this.gsm.getPlayer(playerId);
			if (currentSourcePlayer) { // Check if player still exists
				this.gsm.moveEntity(sourceObjectId, currentSourcePlayer.zones.reserveZone, currentSourcePlayer.zones.discardPileZone, playerId);
				console.log(`[PlayerActionHandler] Discarded ${sourceObject.name} from Reserve for QA ${abilityId}.`);
			} else {
				// This case should be rare, implies player was removed mid-action.
				throw new Error(`Player ${playerId} not found when attempting to discard from reserve.`);
			}
		}
		if (ability.cost?.spendCounters) {
			this.gsm.removeCounters(sourceObject.objectId, ability.cost.spendCounters.type, ability.cost.spendCounters.amount);
			console.log(`[PlayerActionHandler] Spent ${ability.cost.spendCounters.amount} ${ability.cost.spendCounters.type} counters from ${sourceObject.name} for QA ${abilityId}.`);
		}
		// TODO: Pay other cost types

		// Step 3: Resolve effect
		await this.gsm.effectProcessor.resolveEffect(ability.effect, sourceObject, targets, (ability as any)._triggerPayload );
		console.log(`[PlayerActionHandler] Resolved effect for QA ${abilityId} from ${sourceObject.name}.`);

		if (!sourceObject.abilityActivationsToday) {
			sourceObject.abilityActivationsToday = new Map<string, number>();
		}
		sourceObject.abilityActivationsToday.set(abilityId, currentActivations + 1);
		console.log(`[PlayerActionHandler] Incremented QA count for ${abilityId} on ${sourceObject.name} to ${currentActivations + 1}.`);

		await this.gsm.resolveReactions();
	}

	// Remove old synchronous helper methods as their logic is now part of the new async flow or CardPlaySystem
	// private getPlayableCardsFromHand(playerId: string): ICardInstance[] { ... }
	// private getPlayableCardsFromReserve(playerId: string): IGameObject[] { ... }
	// private canPlayCardFromHand(playerId: string, card: ICardInstance): boolean { ... }
	// private canPlayCardFromReserve(playerId: string, object: IGameObject): boolean { ... }
	// private canPayManaCost(playerId: string, cost: number): boolean { ... }
	// private async playCard(playerId: string, cardId: string, fromZone: string): Promise<void> { ... } // Old name for execution
	// private async payManaCost(playerId: string, cost: number): Promise<void> { ... }
	// private getAvailableQuickActions(playerId: string): PlayerAction[] { ... } // Old synchronous version
	// private async executeQuickAction(playerId: string, abilityId: string, sourceObjectId: string): Promise<void> { ... } // Old version


	/**
	 * Gets available expand action for a player.
	 * Rule 4.2.1.e - Expand: Player may move one card from hand to Mana zone.
	 */
	public getAvailableExpandAction(playerId: string): PlayerAction | null {
		const player = this.gsm.getPlayer(playerId);
		if (!player || player.hasExpandedThisTurn) {
			return null;
		}

		// This action is only available during the Morning phase's Expand step.
		// PhaseManager will be responsible for calling this at the right time.
		// For now, we just check if the player has cards in hand.
		if (player.zones.hand.isEmpty()) {
			return null;
		}

		// For simplicity, we assume any card can be chosen.
		// A more advanced version would list choices or filter by expandable cards.
		// We'll return a generic action here, the specific card will be chosen by the player.
		// The PhaseManager will simulate this choice for now.
		return {
			type: 'expandMana',
			description: 'Expand a card from your hand to your Mana zone.',
		};
	}

	/**
	 * Executes the expand action.
	 * Moves a card from hand to Mana zone, face down, as a Mana Orb.
	 */
	public async executeExpandAction(playerId: string, cardIdToExpand: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			throw new Error(`Player ${playerId} not found.`);
		}
		if (player.hasExpandedThisTurn) {
			throw new Error(`Player ${playerId} has already expanded this turn.`);
		}

		const cardToMove = player.zones.hand.findById(cardIdToExpand) as ICardInstance | undefined;
		if (!cardToMove) {
			throw new Error(`Card ${cardIdToExpand} not found in player ${playerId}'s hand.`);
		}

		// Move the card to the player's Mana zone.
		// It becomes a new IGameObject in the Mana zone.
		const movedEntity = this.gsm.moveEntity(
			cardIdToExpand, // This should be the instanceId of the card in hand
			player.zones.handZone, // Corrected to use handZone
			player.zones.manaZone,
			playerId
		);

		if (!movedEntity || !isGameObject(movedEntity)) {
			throw new Error(`Failed to move card ${cardIdToExpand} to mana zone or it did not become a GameObject.`);
		}
		const newManaOrb = movedEntity as IGameObject;

		// Configure the card as a Mana Orb
		newManaOrb.faceDown = true;
		newManaOrb.type = CardType.ManaOrb; // Rule 3.2.9.c
		// Ensure it's ready (Rule 4.2.1.e "ready Mana Orb")
		newManaOrb.statuses.delete(StatusType.Exhausted);
		// Rule 3.2.9.c also implies losing other characteristics; this should ideally be
		// handled by a more robust type-changing mechanism or within moveEntity when moving to ManaZone for Orbs.
		// For now, setting type, faceDown, and ready status fulfills the direct requirements.

		player.hasExpandedThisTurn = true; // Set flag

		console.log(`[PlayerActionHandler] Player ${playerId} expanded card ${cardIdToExpand} into a Mana Orb ${newManaOrb.objectId}.`);
	}

	public async chooseReaction(playerId: string, availableReactions: IEmblemObject[]): Promise<string | null> {
		if (availableReactions.length === 0) {
			return null;
		}
		// TODO: Implement actual player choice mechanism here.
		// For now, mimics the old behavior: sorts by timestamp and picks the oldest.
		console.log(`[PlayerActionHandler] Player ${playerId} needs to choose a reaction from ${availableReactions.length} available.`);

		availableReactions.sort((a, b) => a.timestamp - b.timestamp);
		const chosenReaction = availableReactions[0];

		console.log(`[PlayerActionHandler] Auto-choosing oldest reaction: ${chosenReaction.name} (ID: ${chosenReaction.objectId}) for player ${playerId}.`);
		return chosenReaction.objectId;
	}

	/**
	 * Allows a player to choose which objects to keep in a zone when over limit.
	 * Returns a list of object IDs TO DISCARD/SACRIFICE.
	 * This is a simulation for now. A real implementation would involve player input.
	 * Rule 4.2.5.c
	 */
	public async playerChoosesObjectsToKeep(
		playerId: string,
		objectsInZone: IGameObject[],
		limit: number,
		zoneType: 'reserve' | 'landmark' // To slightly customize logging if needed
	): Promise<string[]> { // Returns IDs of objects to discard/sacrifice
		console.log(`[PlayerActionHandler] Player ${playerId} choosing for ${zoneType} zone. Have ${objectsInZone.length}, limit ${limit}.`);

		if (objectsInZone.length <= limit) {
			return []; // No objects to discard
		}

		// Simulate keeping the first 'limit' objects based on current sort (e.g., timestamp or how they were passed)
		// or a simple sort by timestamp if not already sorted. This matches a common simple AI approach.
		// A real implementation would prompt the player.
		// For this simulation, we'll sort by timestamp (older first are less likely to be discarded by this naive simulation).
		// The GameStateManager currently pre-sorts them by cost/timestamp for its deterministic logic;
		// if that sort is maintained before calling this, this simulation would discard the lowest value items.
		// For robustness, let's assume objectsInZone might not be pre-sorted in a specific way the player desires.
		// A simple simulation: keep the objects with the smallest timestamps.
		const sortedObjects = [...objectsInZone].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

		const objectsToKeep = sortedObjects.slice(0, limit);
		const objectsToDiscard = sortedObjects.slice(limit);

		const keptIds = objectsToKeep.map(obj => obj.objectId);
		const discardIds = objectsToDiscard.map(obj => obj.objectId);

		console.log(`[PlayerActionHandler] Player ${playerId} (simulated) keeping in ${zoneType}: ${objectsToKeep.map(o => o.name + '(' + o.objectId.substring(0,3) + ')').join(', ')}`);
		console.log(`[PlayerActionHandler] Player ${playerId} (simulated) discarding from ${zoneType}: ${objectsToDiscard.map(o => o.name + '(' + o.objectId.substring(0,3) + ')').join(', ')}`);

		return discardIds;
	}

	/**
	 * Prompts the player to choose a card to Expand or to skip expanding.
	 * For this subtask, simulates the choice.
	 * Rule 4.2.1.e
	 */
	public async promptPlayerForExpandChoice(playerId: string): Promise<{ cardToExpandId: string | null }> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			console.warn(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} not found.`);
			return { cardToExpandId: null };
		}

		const handCards = player.zones.handZone.getAll();
		if (handCards.length === 0) {
			console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} has no cards in hand to expand.`);
			return { cardToExpandId: null };
		}

		// Simulate player decision (50% chance to expand)
		if (Math.random() < 0.5) {
			console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} (simulated) chose NOT to expand.`);
			return { cardToExpandId: null };
		}

		// Simulate choosing a random card
		const randomIndex = Math.floor(Math.random() * handCards.length);
		const chosenCard = handCards[randomIndex];
		// Card in hand can be ICardInstance or IGameObject. We need instanceId for executeExpandAction if it's ICardInstance.
		const chosenCardId = isGameObject(chosenCard) ? chosenCard.objectId : chosenCard.instanceId;

		console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} (simulated) chose to expand card: ${chosenCard.definitionId} (ID: ${chosenCardId}).`);
		return { cardToExpandId: chosenCardId };
	}
}

export interface PlayerAction {
	type: 'playCard' | 'quickAction' | 'pass' | 'convertManaOrb' | 'expandMana';
	cardId?: string;
	cardDefinitionId?: string;
	zone?: ZoneIdentifier | string;
	cost?: number;
	abilityId?: string;
	sourceObjectId?: string;
	selectedExpeditionType?: 'hero' | 'companion';
	targets?: TargetInfo[];
	sourceOrbId?: string;
	targetOrbId?: string;
	description: string;
	cardToExpandId?: string;
	// For Scout keyword
	useScoutCost?: boolean;
	scoutCostValue?: number;
	// For Tough keyword
	additionalToughCost?: number;
}

export type PlayerActionType = PlayerAction['type'];

// --- Stubs for new Player Choice Prompts ---

// Placeholder for IEffectStep to avoid circular dependency if imported fully
interface IMinimalEffectStep { verb: string; parameters?: any; text?: string; }

export class PlayerActionHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Prompts the player to choose whether to execute an optional effect step.
	 * Rule 6.5.c
	 * @param playerId The ID of the player to prompt.
	 * @param step The optional effect step.
	 * @returns True if the player chooses to execute, false otherwise.
	 */
	public async promptForOptionalStepChoice(playerId: string, step: IMinimalEffectStep): Promise<boolean> {
		// TODO: Implement actual player prompting (e.g., via UI or AI logic)
		console.log(`[PlayerActionHandler.promptForOptionalStepChoice] Player ${playerId} prompted for optional step: "${step.text || step.verb}". Simulating YES.`);
		return true; // Default to yes for now
	}

	/**
	 * Prompts the player to choose modes for a modal effect.
	 * Rule 6.5.g
	 * @param playerId The ID of the player to prompt.
	 * @param promptText The text to display to the player for the choice.
	 * @param availableModeKeys The keys/names of the available modes.
	 * @param chooseCount The number of modes the player must/can choose.
	 * @returns An array of chosen mode keys.
	 */
	public async promptForModeChoice(
		playerId: string,
		promptText: string,
		availableModeKeys: string[],
		chooseCount: number
	): Promise<string[]> {
		// TODO: Implement actual player prompting
		console.log(`[PlayerActionHandler.promptForModeChoice] Player ${playerId} prompted: "${promptText}". Choose ${chooseCount} from [${availableModeKeys.join(', ')}]. Simulating choice of first ${chooseCount} mode(s).`);
		if (availableModeKeys.length === 0) return [];
		return availableModeKeys.slice(0, chooseCount); // Default to first X modes
	}

	/**
	 * Prompts the player to choose an expedition type for an effect (e.g., creating a token).
	 * @param playerId The ID of the player to prompt.
	 * @param promptText The text to display to the player for the choice.
	 * @returns The chosen expedition type ('hero' or 'companion').
	 */
	public async promptForExpeditionChoice(playerId: string, promptText: string): Promise<'hero' | 'companion'> {
		// TODO: Implement actual player prompting
		console.log(`[PlayerActionHandler.promptForExpeditionChoice] Player ${playerId} prompted: "${promptText}". Simulating choice of 'hero'.`);
		return 'hero'; // Default to 'hero' for now
	}

	/**
	 * Gets available actions for a player.
	 * Rule 4.2.3.d (Afternoon), Rule 4.2.1.e (Morning Expand)
	 */
	public async getAvailableActions(playerId: string): Promise<PlayerAction[]> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const actions: PlayerAction[] = [];
		const currentPhase = this.gsm.state.currentPhase;
		const isCurrentPlayer = this.gsm.state.currentPlayerId === playerId;

		// Play Card Actions (Hand & Reserve) - Typically Afternoon
		if (isCurrentPlayer && currentPhase === GamePhase.Afternoon) {
			// From Hand
			for (const cardInHand of player.zones.handZone.getAll()) {
				const currentCardId = cardInHand.instanceId; // Assuming ICardInstance has instanceId
				const definition = this.gsm.getCardDefinition(cardInHand.definitionId);
				if (!definition) continue;

				// Normal Play Action
				const canPlayCheckNormal = await this.gsm.cardPlaySystem.canPlayCard(playerId, currentCardId, ZoneIdentifier.Hand);
				if (canPlayCheckNormal.isPlayable) {
					actions.push({
						type: 'playCard',
						cardId: currentCardId,
						cardDefinitionId: definition.id,
						zone: ZoneIdentifier.Hand,
						cost: canPlayCheckNormal.cost,
						description: `Play ${definition.name} from hand (Cost: ${canPlayCheckNormal.cost})`,
						useScoutCost: false
					});
				}

				// Scout Play Action
				const scoutAbility = definition.abilities.find(ab => ab.keyword === KeywordAbility.Scout);
				if (scoutAbility && scoutAbility.keywordValue !== undefined) {
					const scoutCostX = scoutAbility.keywordValue;
					const canPlayCheckScout = await this.gsm.cardPlaySystem.canPlayCard(playerId, currentCardId, ZoneIdentifier.Hand, true, scoutCostX);
					if (canPlayCheckScout.isPlayable) {
						actions.push({
							type: 'playCard',
							cardId: currentCardId,
							cardDefinitionId: definition.id,
							zone: ZoneIdentifier.Hand,
							cost: canPlayCheckScout.cost, // This will be the modified scout cost
							description: `Play ${definition.name} using Scout (Cost: ${canPlayCheckScout.cost}, Base Scout: ${scoutCostX})`,
							useScoutCost: true,
							scoutCostValue: scoutCostX
						});
					}
				}
			}
			// From Reserve
			for (const cardInReserve of player.zones.reserveZone.getAll()) {
				if (isGameObject(cardInReserve)) { // Cards in reserve are IGameObjects
					const canPlayCheck = await this.gsm.cardPlaySystem.canPlayCard(playerId, cardInReserve.objectId, ZoneIdentifier.Reserve);
					if (canPlayCheck.isPlayable) {
						actions.push({
							type: 'playCard',
							cardId: cardInReserve.objectId,
							cardDefinitionId: canPlayCheck.definitionId,
							zone: ZoneIdentifier.Reserve,
							cost: canPlayCheck.cost,
							description: `Play ${cardInReserve.name} from reserve (Cost: ${canPlayCheck.cost})`
							// TODO: Add targeting requirements
						});
					}
				}
			}
		}

		// Activate Ability Actions (Quick Actions)
		if (isCurrentPlayer) { // Simplified: only current player can activate abilities for now
			const activatableAbilities = await this.getActivatableQuickActions(playerId);
			actions.push(...activatableAbilities);
		}

		// Pass Turn Action (Afternoon only)
		if (isCurrentPlayer && currentPhase === GamePhase.Afternoon) {
			actions.push({ type: 'pass', description: 'Pass turn' });
		}

		// Expand Action (Morning only)
		if (currentPhase === GamePhase.Morning && isCurrentPlayer && !player.hasExpandedThisTurn && player.zones.handZone.getCount() > 0) {
			actions.push({
				type: 'expandMana',
				description: 'Expand a card from your hand to your Mana zone.'
				// cardToExpandId would be chosen by player before execution
			});
		}

		// Mana Conversion
		if (isCurrentPlayer) { // Typically on player's turn
			const manaZone = player.zones.manaZone;
			const allManaOrbs = manaZone.getAll().filter(isGameObject);
			const readyOrbs = allManaOrbs.filter(orb => !orb.statuses.has(StatusType.Exhausted));
			const exhaustedOrbs = allManaOrbs.filter(orb => orb.statuses.has(StatusType.Exhausted));

			for (const readyOrb of readyOrbs) {
				for (const exhaustedOrb of exhaustedOrbs) {
					if (readyOrb.objectId !== exhaustedOrb.objectId) {
						actions.push({
							type: 'convertManaOrb',
							sourceOrbId: readyOrb.objectId,
							targetOrbId: exhaustedOrb.objectId,
							description: `Exhaust ${readyOrb.name || 'Orb'} to ready ${exhaustedOrb.name || 'Orb'}`
						});
					}
				}
			}
		}
		return actions;
	}

	private async getActivatableQuickActions(playerId: string): Promise<PlayerAction[]> {
		const availableQuickActions: PlayerAction[] = [];
		// Use a default if gsm.config or nothingIsForeverLimit is not set
		const activationLimit = (this.gsm.config as any)?.nothingIsForeverLimit ?? 100; // Rule 1.4.6.b

		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const zonesToScan = [
			player.zones.heroZone,
			this.gsm.state.sharedZones.expedition,
			player.zones.landmarkZone,
			player.zones.reserveZone,
		];

		for (const zone of zonesToScan) {
			const playerObjects = zone.getAll().filter(
				(e): e is IGameObject => isGameObject(e) && e.controllerId === playerId
			);

			for (const sourceObject of playerObjects) {
				const allAbilities = [
					...sourceObject.abilities,
					...(sourceObject.currentCharacteristics.grantedAbilities || [])
				];

				for (const ability of allAbilities) {
					if (ability.abilityType !== AbilityType.QuickAction) continue;

					// Support Quick Actions (Rule 2.2.11.e)
					if (zone.zoneType === ZoneIdentifier.Reserve && !ability.isSupportAbility) continue;
					if (zone.zoneType !== ZoneIdentifier.Reserve && ability.isSupportAbility) continue;

					const currentActivations = sourceObject.abilityActivationsToday?.get(ability.abilityId) || 0;
					if (currentActivations >= activationLimit) continue;

					let canPayAllCosts = true;
					if (ability.cost) {
					let totalManaCost = 0;
					if (ability.cost?.mana) {
						totalManaCost += ability.cost.mana;
					}

					// Hypothetical: If this ability targets, and we've selected a target.
					// This part is conceptual for demonstrating Tough integration, as full target
					// selection isn't part of getAvailableActions yet for all action types.
					// We would loop through resolved targets if the ability has them.
					// For now, let's assume a hypothetical single opponentTargetObject if the ability implies targeting.

					// Example: const potentialTargets = this.resolvePotentialTargets(ability.effect, sourceObject, playerId);
					// for (const pTarget of potentialTargets) {
					//    if (pTarget.controllerId !== playerId && this.gsm.keywordAbilityHandler) { ... }
					// }
					// For this subtask, we'll just illustrate with a placeholder check.

					let currentAdditionalToughCost = 0;
					let toughCheckPassed = true; // Assume true unless a Tough target makes it false

					// --- Conceptual Tough Check Start (Illustrative) ---
					// In a real scenario, you'd identify actual potential targets of the ability.
					// For demonstration, let's imagine 'hypotheticalOpponentTargetWithTough' is one such target.
					/*
					if (hypotheticalOpponentTargetWithTough && hypotheticalOpponentTargetWithTough.controllerId !== playerId && this.gsm.keywordAbilityHandler) {
						const toughValue = this.getToughValue(hypotheticalOpponentTargetWithTough); // Helper to get X
						if (toughValue > 0) {
							if (!this.gsm.keywordAbilityHandler.canTargetWithTough(hypotheticalOpponentTargetWithTough, playerId)) {
								toughCheckPassed = false;
							} else {
								currentAdditionalToughCost += toughValue;
							}
						}
					}
					*/
					// --- Conceptual Tough Check End ---

					if (!toughCheckPassed) {
						// If any chosen/required Tough target cannot be paid for, this specific action variant isn't available.
						// This might mean skipping this action, or if the ability can be used without that target,
						// generating a different version of the action. For now, assume it makes this variant invalid.
						continue;
					}

					totalManaCost += currentAdditionalToughCost;

					if (ability.cost?.mana && ability.cost.mana > 0) { // Original mana cost check
						if (!this.gsm.manaSystem.canPayMana(playerId, totalManaCost)) { // Check total including Tough
								canPayAllCosts = false;
							}
					} else if (currentAdditionalToughCost > 0) { // No base mana cost, but Tough cost exists
						if (!this.gsm.manaSystem.canPayMana(playerId, currentAdditionalToughCost)) {
							canPayAllCosts = false;
						}
						}


					if (ability.cost?.exhaustSelf) {
							if (sourceObject.statuses.has(StatusType.Exhausted)) canPayAllCosts = false;
						}
					if (ability.cost?.discardSelfFromReserve) {
							if (zone.zoneType !== ZoneIdentifier.Reserve || sourceObject.statuses.has(StatusType.Exhausted)) {
								canPayAllCosts = false;
							}
						}
						// TODO: Add other cost checks (sacrifice, spendCounters)
					}


					if (canPayAllCosts) {
					let description = `Use QA: ${ability.text || ability.abilityId} from ${sourceObject.name}`;
					if (currentAdditionalToughCost > 0) {
						description += ` (Cost: ${totalManaCost}, incl. Tough ${currentAdditionalToughCost})`;
					} else if (ability.cost?.mana) {
						description += ` (Cost: ${ability.cost.mana})`;
					}

						availableQuickActions.push({
							type: 'quickAction',
							abilityId: ability.abilityId,
							sourceObjectId: sourceObject.objectId,
						description: description,
						cost: totalManaCost > 0 ? totalManaCost : (ability.cost?.mana || 0), // Ensure cost reflects total
						additionalToughCost: currentAdditionalToughCost > 0 ? currentAdditionalToughCost : undefined,
						// TODO: Add actual target(s) chosen that resulted in this cost
						});
					}
				}
			}
		}
		return availableQuickActions;
	}

	/**
	 * Executes a player action.
	 */
	public async executeAction(playerId: string, action: PlayerAction): Promise<boolean> {
		// Basic check, more nuanced checks per action type might be needed
		if (this.gsm.state.currentPlayerId !== playerId &&
			action.type !== 'convertManaOrb' && // Allow mana conversion if applicable out of turn
			action.type !== 'expandMana' // Expand mana is phase-specific, not turn-specific necessarily
		) {
			// Most actions require it to be the player's turn.
			// throw new Error(`Not ${playerId}'s turn to perform action ${action.type}`);
		}

		let turnEnds = false;

		switch (action.type) {
			case 'pass':
				if (this.gsm.state.currentPhase !== GamePhase.Afternoon || this.gsm.state.currentPlayerId !== playerId) {
					throw new Error('Cannot pass turn outside of Afternoon phase or if not current player.');
				}
				if(this.gsm.turnManager) this.gsm.turnManager.playerPasses(playerId); // Check if turnManager is set
				else console.warn("[PlayerActionHandler] TurnManager not available on GSM for pass action.");
				console.log(`[PlayerActionHandler] ${playerId} passed their turn`);
				turnEnds = true;
				break;

			case 'playCard':
				if (!action.cardId || action.zone === undefined) {
					throw new Error('Action playCard missing cardId or zone.');
				}
				await this.executePlayCardAction(
					playerId,
					action.cardId,
					action.zone as ZoneIdentifier,
					action.selectedExpeditionType,
					action.targets,
					action.useScoutCost,
					action.scoutCostValue
				);
				console.log(`[PlayerActionHandler] ${playerId} played card: ${action.cardDefinitionId || action.cardId}${action.useScoutCost ? ' using Scout' : ''}`);
				turnEnds = true;
				break;

			case 'quickAction':
				if (!action.abilityId || !action.sourceObjectId) {
					throw new Error('Action quickAction missing abilityId or sourceObjectId.');
				}
				await this.executeActivateAbilityAction(playerId, action.sourceObjectId, action.abilityId, action.targets);
				console.log(`[PlayerActionHandler] ${playerId} used quick action: ${action.abilityId} on ${action.sourceObjectId}`);
				turnEnds = false;
				break;

			case 'expandMana':
				// cardToExpandId should be part of the action if a specific card is chosen prior to execution
				if (!action.cardToExpandId && !action.cardId) throw new Error('No card specified for expandMana action.');
				const cardToExpand = action.cardToExpandId || action.cardId; // Use cardId if cardToExpandId isn't filled
				if(!cardToExpand) throw new Error('No card ID found for expandMana action.');
				await this.executeExpandAction(playerId, cardToExpand);
				console.log(`[PlayerActionHandler] Player ${playerId} expanded a card to mana.`);
				turnEnds = false;
				break;

			case 'convertManaOrb':
				if (!action.sourceOrbId || !action.targetOrbId) {
					throw new Error('Action convertManaOrb missing sourceOrbId or targetOrbId.');
				}
				const converted = this.gsm.manaSystem.convertMana(playerId, action.sourceOrbId, action.targetOrbId);
				if (!converted) {
					console.warn(`[PlayerActionHandler] Mana conversion failed for player ${playerId}.`);
				} else {
					console.log(`[PlayerActionHandler] ${playerId} converted mana.`);
				}
				turnEnds = false;
				break;

			default:
				throw new Error(`Unknown action type: ${(action as any).type}`);
		}

		if (action.type !== 'pass' && action.type !== 'convertManaOrb') {
			await this.gsm.resolveReactions();
		}

		return turnEnds;
	}

	// getToughValue has been moved to KeywordAbilityHandler.ts

	public async executePlayCardAction(
		playerId: string,
		cardId: string,
		fromZone: ZoneIdentifier,
		selectedExpeditionType?: 'hero' | 'companion',
		targets?: TargetInfo[],
		isScoutPlay?: boolean,
		scoutRawCost?: number
		// Tough cost payment will be handled inside CardPlaySystem.playCard or EffectProcessor if it's for effect targets
	): Promise<void> {
		await this.gsm.cardPlaySystem.playCard(playerId, cardId, fromZone, selectedExpeditionType, targets, isScoutPlay, scoutRawCost);
	}

	public async executeActivateAbilityAction(
		playerId: string,
		sourceObjectId: string,
		abilityId: string,
		targets?: TargetInfo[]
	): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		const sourceObject = this.gsm.getObject(sourceObjectId);

		if (!player) throw new Error(`Player ${playerId} not found.`);
		if (!sourceObject) throw new Error(`Source object ${sourceObjectId} not found.`);
		if (sourceObject.controllerId !== playerId) {
			throw new Error(`Player ${playerId} does not control source object ${sourceObjectId}.`);
		}

		const allAbilities = [
			...(sourceObject.currentCharacteristics.abilities || []),
			...(sourceObject.currentCharacteristics.grantedAbilities || [])
		];
		const ability = allAbilities.find(a => a.abilityId === abilityId);

		if (!ability) throw new Error(`Ability ${abilityId} not found on source object ${sourceObjectId}.`);
		if (ability.abilityType !== AbilityType.QuickAction) {
			throw new Error(`Ability ${abilityId} on ${sourceObjectId} is not a QuickAction.`);
		}

		const activationLimit = (this.gsm.config as any)?.nothingIsForeverLimit ?? 100;
		const currentActivations = sourceObject.abilityActivationsToday?.get(abilityId) || 0;
		if (currentActivations >= activationLimit) {
			throw new Error(`Quick action ${abilityId} on ${sourceObjectId} has reached its daily activation limit.`);
		}

		// Calculate and pay Tough costs before ability's own costs
		let totalToughCost = 0;
		if (targets && targets.length > 0 && this.gsm.keywordAbilityHandler) {
			for (const targetInfo of targets) {
				const targetObject = this.gsm.getObject(targetInfo.objectId);
				if (targetObject && targetObject.controllerId !== playerId) {
					const toughValue = this.gsm.keywordAbilityHandler.getToughValue(targetObject);
					if (toughValue > 0) {
						totalToughCost += toughValue;
					}
				}
			}
		}

		if (totalToughCost > 0) {
			// Ensure ManaSystem is available
			if (!this.gsm.manaSystem) {
				throw new Error("[PlayerActionHandler] ManaSystem not available on GSM. Cannot pay Tough costs.");
			}
			// Check if player can pay (should have been checked in getAvailableActions, but good for safety)
			if (!this.gsm.manaSystem.canPayMana(playerId, totalToughCost)) {
				throw new Error(`Player ${playerId} cannot afford additional ${totalToughCost} mana for Tough costs.`);
			}
			await this.gsm.manaSystem.spendMana(playerId, totalToughCost);
			console.log(`[PlayerActionHandler] Player ${playerId} paid ${totalToughCost} additional mana for Tough costs for QA ${abilityId}.`);
		}

		// Pay ability's own costs
		if (ability.cost) {
			if (ability.cost.mana && ability.cost.mana > 0) {
				if (!this.gsm.manaSystem) {
					throw new Error("[PlayerActionHandler] ManaSystem not available on GSM. Cannot pay ability mana cost.");
				}
				await this.gsm.manaSystem.spendMana(playerId, ability.cost.mana);
				console.log(`[PlayerActionHandler] Paid ${ability.cost.mana} base mana for QA ${abilityId} from ${sourceObject.name}.`);
			}
			if (ability.cost.exhaustSelf) {
				if (sourceObject.statuses.has(StatusType.Exhausted)) {
					throw new Error(`Cannot pay exhaustSelf cost: ${sourceObject.name} is already exhausted for QA ${abilityId}.`);
				}
				sourceObject.statuses.add(StatusType.Exhausted);
				this.gsm.eventBus.publish('objectStatusChanged', { object: sourceObject, status: StatusType.Exhausted, added: true });
				console.log(`[PlayerActionHandler] Exhausted ${sourceObject.name} for QA ${abilityId}.`);
			}
			if (ability.cost.discardSelfFromReserve) {
				const objectZone = this.gsm.findZoneOfObject(sourceObject.objectId);
				if (!objectZone || objectZone.zoneType !== ZoneIdentifier.Reserve) {
					throw new Error(`${sourceObject.name} is not in Reserve to pay discardSelfFromReserve cost.`);
				}
				if (sourceObject.statuses.has(StatusType.Exhausted)){
					throw new Error(`Cannot discard exhausted ${sourceObject.name} from reserve to pay cost.`);
				}
				this.gsm.moveEntity(sourceObjectId, player.zones.reserveZone, player.zones.discardPileZone, playerId);
				console.log(`[PlayerActionHandler] Discarded ${sourceObject.name} from Reserve for QA ${abilityId}.`);
			}
			if (ability.cost.spendCounters) {
				const currentCounters = sourceObject.counters.get(ability.cost.spendCounters.type) || 0;
				if (currentCounters < ability.cost.spendCounters.amount) {
					throw new Error(`Cannot pay spendCounters cost: ${sourceObject.name} has ${currentCounters} of ${ability.cost.spendCounters.type}, needs ${ability.cost.spendCounters.amount}.`);
				}
				this.gsm.removeCounters(sourceObject.objectId, ability.cost.spendCounters.type, ability.cost.spendCounters.amount);
				console.log(`[PlayerActionHandler] Spent ${ability.cost.spendCounters.amount} ${ability.cost.spendCounters.type} counters from ${sourceObject.name} for QA ${abilityId}.`);
			}
			// TODO: Implement other cost types (sacrifice)
		}

		await this.gsm.effectProcessor.resolveEffect(ability.effect, sourceObject, targets, (ability as any)._triggerPayload );
		console.log(`[PlayerActionHandler] Resolved effect for QA ${abilityId} from ${sourceObject.name}.`);

		if (!sourceObject.abilityActivationsToday) {
			sourceObject.abilityActivationsToday = new Map<string, number>();
		}
		sourceObject.abilityActivationsToday.set(abilityId, currentActivations + 1);
		console.log(`[PlayerActionHandler] Incremented QA count for ${abilityId} on ${sourceObject.name} to ${currentActivations + 1}.`);

		await this.gsm.resolveReactions();
	}

	// Remove old synchronous helper methods as their logic is now part of the new async flow or CardPlaySystem
	// private getPlayableCardsFromHand(playerId: string): ICardInstance[] { ... }
	// private getPlayableCardsFromReserve(playerId: string): IGameObject[] { ... }
	// private canPlayCardFromHand(playerId: string, card: ICardInstance): boolean { ... }
	// private canPlayCardFromReserve(playerId: string, object: IGameObject): boolean { ... }
	// private canPayManaCost(playerId: string, cost: number): boolean { ... }
	// private async playCard(playerId: string, cardId: string, fromZone: string): Promise<void> { ... } // Old name for execution
	// private async payManaCost(playerId: string, cost: number): Promise<void> { ... }
	// private getAvailableQuickActions(playerId: string): PlayerAction[] { ... } // Old synchronous version
	// private async executeQuickAction(playerId: string, abilityId: string, sourceObjectId: string): Promise<void> { ... } // Old version


	/**
	 * Gets available expand action for a player.
	 * Rule 4.2.1.e - Expand: Player may move one card from hand to Mana zone.
	 */
	public getAvailableExpandAction(playerId: string): PlayerAction | null {
		const player = this.gsm.getPlayer(playerId);
		if (!player || player.hasExpandedThisTurn) {
			return null;
		}

		// This action is only available during the Morning phase's Expand step.
		// PhaseManager will be responsible for calling this at the right time.
		// For now, we just check if the player has cards in hand.
		if (player.zones.hand.isEmpty()) {
			return null;
		}

		// For simplicity, we assume any card can be chosen.
		// A more advanced version would list choices or filter by expandable cards.
		// We'll return a generic action here, the specific card will be chosen by the player.
		// The PhaseManager will simulate this choice for now.
		return {
			type: 'expandMana',
			description: 'Expand a card from your hand to your Mana zone.',
		};
	}

	/**
	 * Executes the expand action.
	 * Moves a card from hand to Mana zone, face down, as a Mana Orb.
	 */
	public async executeExpandAction(playerId: string, cardIdToExpand: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			throw new Error(`Player ${playerId} not found.`);
		}
		if (player.hasExpandedThisTurn) {
			throw new Error(`Player ${playerId} has already expanded this turn.`);
		}

		const cardToMove = player.zones.hand.findById(cardIdToExpand) as ICardInstance | undefined;
		if (!cardToMove) {
			throw new Error(`Card ${cardIdToExpand} not found in player ${playerId}'s hand.`);
		}

		// Move the card to the player's Mana zone.
		// It becomes a new IGameObject in the Mana zone.
		const movedEntity = this.gsm.moveEntity(
			cardIdToExpand, // This should be the instanceId of the card in hand
			player.zones.handZone, // Corrected to use handZone
			player.zones.manaZone,
			playerId
		);

		if (!movedEntity || !isGameObject(movedEntity)) {
			throw new Error(`Failed to move card ${cardIdToExpand} to mana zone or it did not become a GameObject.`);
		}
		const newManaOrb = movedEntity as IGameObject;

		// Configure the card as a Mana Orb
		newManaOrb.faceDown = true;
		newManaOrb.type = CardType.ManaOrb; // Rule 3.2.9.c
		// Ensure it's ready (Rule 4.2.1.e "ready Mana Orb")
		newManaOrb.statuses.delete(StatusType.Exhausted);
		// Rule 3.2.9.c also implies losing other characteristics; this should ideally be
		// handled by a more robust type-changing mechanism or within moveEntity when moving to ManaZone for Orbs.
		// For now, setting type, faceDown, and ready status fulfills the direct requirements.

		player.hasExpandedThisTurn = true; // Set flag

		console.log(`[PlayerActionHandler] Player ${playerId} expanded card ${cardIdToExpand} into a Mana Orb ${newManaOrb.objectId}.`);
	}

	public async chooseReaction(playerId: string, availableReactions: IEmblemObject[]): Promise<string | null> {
		if (availableReactions.length === 0) {
			return null;
		}
		// TODO: Implement actual player choice mechanism here.
		// For now, mimics the old behavior: sorts by timestamp and picks the oldest.
		console.log(`[PlayerActionHandler] Player ${playerId} needs to choose a reaction from ${availableReactions.length} available.`);

		availableReactions.sort((a, b) => a.timestamp - b.timestamp);
		const chosenReaction = availableReactions[0];

		console.log(`[PlayerActionHandler] Auto-choosing oldest reaction: ${chosenReaction.name} (ID: ${chosenReaction.objectId}) for player ${playerId}.`);
		return chosenReaction.objectId;
	}

	/**
	 * Allows a player to choose which objects to keep in a zone when over limit.
	 * Returns a list of object IDs TO DISCARD/SACRIFICE.
	 * This is a simulation for now. A real implementation would involve player input.
	 * Rule 4.2.5.c
	 */
	public async playerChoosesObjectsToKeep(
		playerId: string,
		objectsInZone: IGameObject[],
		limit: number,
		zoneType: 'reserve' | 'landmark' // To slightly customize logging if needed
	): Promise<string[]> { // Returns IDs of objects to discard/sacrifice
		console.log(`[PlayerActionHandler] Player ${playerId} choosing for ${zoneType} zone. Have ${objectsInZone.length}, limit ${limit}.`);

		if (objectsInZone.length <= limit) {
			return []; // No objects to discard
		}

		// Simulate keeping the first 'limit' objects based on current sort (e.g., timestamp or how they were passed)
		// or a simple sort by timestamp if not already sorted. This matches a common simple AI approach.
		// A real implementation would prompt the player.
		// For this simulation, we'll sort by timestamp (older first are less likely to be discarded by this naive simulation).
		// The GameStateManager currently pre-sorts them by cost/timestamp for its deterministic logic;
		// if that sort is maintained before calling this, this simulation would discard the lowest value items.
		// For robustness, let's assume objectsInZone might not be pre-sorted in a specific way the player desires.
		// A simple simulation: keep the objects with the smallest timestamps.
		const sortedObjects = [...objectsInZone].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

		const objectsToKeep = sortedObjects.slice(0, limit);
		const objectsToDiscard = sortedObjects.slice(limit);

		const keptIds = objectsToKeep.map(obj => obj.objectId);
		const discardIds = objectsToDiscard.map(obj => obj.objectId);

		console.log(`[PlayerActionHandler] Player ${playerId} (simulated) keeping in ${zoneType}: ${objectsToKeep.map(o => o.name + '(' + o.objectId.substring(0,3) + ')').join(', ')}`);
		console.log(`[PlayerActionHandler] Player ${playerId} (simulated) discarding from ${zoneType}: ${objectsToDiscard.map(o => o.name + '(' + o.objectId.substring(0,3) + ')').join(', ')}`);

		return discardIds;
	}

	/**
	 * Prompts the player to choose a card to Expand or to skip expanding.
	 * For this subtask, simulates the choice.
	 * Rule 4.2.1.e
	 */
	public async promptPlayerForExpandChoice(playerId: string): Promise<{ cardToExpandId: string | null }> {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			console.warn(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} not found.`);
			return { cardToExpandId: null };
		}

		const handCards = player.zones.handZone.getAll();
		if (handCards.length === 0) {
			console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} has no cards in hand to expand.`);
			return { cardToExpandId: null };
		}

		// Simulate player decision (50% chance to expand)
		if (Math.random() < 0.5) {
			console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} (simulated) chose NOT to expand.`);
			return { cardToExpandId: null };
		}

		// Simulate choosing a random card
		const randomIndex = Math.floor(Math.random() * handCards.length);
		const chosenCard = handCards[randomIndex];
		// Card in hand can be ICardInstance or IGameObject. We need instanceId for executeExpandAction if it's ICardInstance.
		const chosenCardId = isGameObject(chosenCard) ? chosenCard.objectId : chosenCard.instanceId;

		console.log(`[PlayerActionHandler.promptPlayerForExpandChoice] Player ${playerId} (simulated) chose to expand card: ${chosenCard.definitionId} (ID: ${chosenCardId}).`);
		return { cardToExpandId: chosenCardId };
	}
}
