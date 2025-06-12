import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IEffect, IEffectStep } from './types/abilities';
import type { IZone } from './types/zones';
import { CounterType, StatusType, ZoneIdentifier } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Processes effect resolution with all core effect verbs
 * Rule 7.3 - Keyword Actions and core game effects
 */
export class EffectProcessor {
	private currentTriggerPayload: unknown | null = null;
	private pendingEffects: IEffect[] = [];

	constructor(private gsm: GameStateManager) {}

	/**
	 * Resolves a complete effect with all its steps
	 * Rule 1.2.6 - Effects are changes to the game state
	 */
	public async resolveEffect(effect: IEffect, sourceObject?: IGameObject, targets?: any[], triggerContext?: any): Promise<void> {
		const sourceIdForLog = effect.sourceObjectId || sourceObject?.objectId || 'unknown source';
		console.log(
			`[EffectProcessor] Resolving effect from ${sourceIdForLog} with ${effect.steps.length} steps. Trigger: ${triggerContext ? JSON.stringify(triggerContext) : 'none'}`
		);

		// Make triggerContext available to steps if needed, potentially merging with effect._triggerPayload
		const currentContext = {
			...(effect._triggerPayload as object || {}),
			...(triggerContext as object || {}),
			// This effect instance's specific runtime values can be stored here by verbs like roll_die
			_effectRuntimeValues: {}
		};

		let sourceObjectForStepContext: IGameObject | undefined | null = sourceObject;
		if (effect._lkiSourceObject) {
			sourceObjectForStepContext = effect._lkiSourceObject as IGameObject;
		} else if (!sourceObjectForStepContext && effect.sourceObjectId) {
			sourceObjectForStepContext = this.gsm.getObject(effect.sourceObjectId);
		}

		for (const step of effect.steps) {
			try {
				// Pass down the pre-selected targets from PlayerActionHandler if available
				// and the current step expects targets that might have been pre-selected.
				// resolveTargetsForStep will need to know if it should use these preSelectedTargets.
				await this.resolveEffectStep(step, sourceObjectForStepContext, currentContext, targets);
			} catch (error) {
				console.error(
					`[EffectProcessor] Error resolving step ${JSON.stringify(step)} for effect from ${sourceIdForLog}:`,
					error
				);
				// Decide if an error in one step stops the whole effect. Usually, yes.
				// throw error; // Optionally re-throw to stop effect processing.
			}
		}

		// After the entire effect resolves
		this.gsm.ruleAdjudicator.applyAllPassiveAbilities(); // Re-evaluate passives
		await this.gsm.resolveReactions(); // Process any reactions triggered by this effect
	}

	/**
	 * Resolves a single effect step based on its verb
	 */
	private async resolveEffectStep(
		step: IEffectStep,
		sourceObjectForContext: IGameObject | undefined | null,
		currentContext: any, // Combined trigger & effect runtime context
		preSelectedTargets?: any[] // Targets chosen by player before effect resolution
	): Promise<void> {
		if (step.isOptional && !this.shouldExecuteOptionalEffect(step, currentContext)) {
			console.log(`[EffectProcessor] Skipping optional effect: ${step.verb}`);
			return;
		}

		const targetsForThisStep = await this.resolveTargetsForStep(step.targets, sourceObjectForContext, currentContext, preSelectedTargets, step.parameters?.targetKey);
		console.log(
			`[EffectProcessor] Executing ${step.verb} for source ${sourceObjectForContext?.name || 'system'}, targeting: ${targetsForThisStep.map(t => (isGameObject(t) ? t.name : t)).join(', ')}`
		);

		switch (step.verb.toLowerCase()) {
			// Existing verbs (ensure they use targetsForThisStep and currentContext as needed)
			case 'draw': // Renamed to draw_cards for clarity
			case 'draw_cards':
				await this.effectDrawCards(step, targetsForThisStep);
				break;
			case 'discard': // Renamed to discard_cards
			case 'discard_cards':
				await this.effectDiscardCards(step, targetsForThisStep);
				break;
			case 'resupply':
				await this.effectResupply(step, targetsForThisStep);
				break;
			case 'move_forward':
				await this.effectMove(step, targetsForThisStep, 1); // 1 for forward
				break;
			case 'move_backward':
				await this.effectMove(step, targetsForThisStep, -1); // -1 for backward
				break;
			case 'create_token': // Was 'create'
				await this.effectCreateToken(step, sourceObjectForContext, currentContext);
				break;
			case 'gainability':
				await this.effectGainAbility(step, targetsForThisStep);
				break;
			case 'augmentcounter':
				await this.effectAugmentCounters(step, targetsForThisStep);
				break;
			case 'exchange':
				await this.effectExchange(step, sourceObjectForContext, currentContext);
				break;
			case 'gain_counters': // Was 'gaincounter'
				await this.effectGainCounters(step, targetsForThisStep);
				break;
			case 'lose_counters': // Was 'losecounter'
				await this.effectLoseCounters(step, targetsForThisStep);
				break;
			case 'gain_status': // Was 'gainstatus'
				await this.effectGainStatus(step, targetsForThisStep);
				break;
			case 'lose_status': // Was 'losestatus'
				await this.effectLoseStatus(step, targetsForThisStep);
				break;
			case 'put_in_zone': // Was 'moveto'
			case 'move_to': // Keep alias for compatibility
				await this.effectPutInZone(step, targetsForThisStep);
				break;
			case 'ready':
				await this.effectReady(step, targetsForThisStep);
				break;
			case 'exhaust':
				await this.effectExhaust(step, targetsForThisStep);
				break;

			// New Verbs from Task
			case 'sacrifice':
				await this.effectSacrifice(step, targetsForThisStep);
				break;
			case 'set_characteristic':
				await this.effectSetCharacteristic(step, targetsForThisStep);
				break;
			case 'modify_statistics':
				await this.effectModifyStatistics(step, targetsForThisStep);
				break;
			case 'change_controller':
				await this.effectChangeController(step, targetsForThisStep);
				break;
			case 'roll_die':
				await this.effectRollDie(step, sourceObjectForContext, currentContext);
				break;
			case 'if_condition':
				await this.effectIfCondition(step, sourceObjectForContext, currentContext, preSelectedTargets);
				break;
			case 'switch_expedition': // New verb for Rule 7.4.4.m
				await this.effectSwitchExpedition(step, targetsForThisStep);
				break;

			default:
				console.warn(`[EffectProcessor] Unknown effect verb: ${step.verb}`);
		}
	}

	/**
	 * Rule 7.3.7 - Draw Cards
	 */
	private async effectDrawCards(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;

		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (playerId) {
				await this.gsm.drawCards(playerId, count);
				this.gsm.eventBus.publish('cardsDrawn', { playerId, count });
				console.log(`[EffectProcessor] Player ${playerId} drew ${count} cards.`);
			}
		}
	}

	/**
	 * Rule 7.3.5 - Discard Cards
	 */
	private async effectDiscardCards(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;
		const specificCardIds = step.parameters?.cardIds as string[] | undefined;
		// const fromZoneIdentifier = step.parameters?.fromZone as ZoneIdentifier || ZoneIdentifier.Hand; // Default to hand

		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (!playerId) continue;

			const player = this.gsm.getPlayer(playerId);
			if (!player) continue;

			const handCards = player.zones.handZone.getAll(); // Assuming discard from hand
			const cardsToDiscard: (IGameObject | ICardInstance)[] = [];

			if (specificCardIds) {
				for (const cardId of specificCardIds) {
					const foundCard = handCards.find(c => (isGameObject(c) ? c.objectId : c.instanceId) === cardId);
					if (foundCard) cardsToDiscard.push(foundCard);
				}
			} else {
				// TODO: Implement random discard or player choice for non-specific discards
				cardsToDiscard.push(...handCards.slice(0, count)); // Simple: first N cards
			}

			for (const card of cardsToDiscard) {
				const cardId = isGameObject(card) ? card.objectId : card.instanceId;
				this.gsm.moveEntity(cardId, player.zones.handZone, player.zones.discardPileZone, playerId);
			}
			if (cardsToDiscard.length > 0) {
				this.gsm.eventBus.publish('cardsDiscarded', { playerId, count: cardsToDiscard.length, cardIds: cardsToDiscard.map(c => isGameObject(c) ? c.objectId : c.instanceId) });
				console.log(`[EffectProcessor] Player ${playerId} discarded ${cardsToDiscard.length} cards.`);
			}
		}
	}

	/**
	 * Rule 7.3.22 - Resupply
	 */
	private async effectResupply(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		// Count is usually 1 for Resupply from rulebook.
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;

		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (!playerId) continue;

			const player = this.gsm.getPlayer(playerId);
			if (!player) continue;

			let resuppliedCount = 0;
			for (let i = 0; i < count; i++) {
				const cardMoved = await this.gsm.resupplyPlayer(playerId); // gsm.resupplyPlayer needs to exist or logic here
				if (cardMoved) resuppliedCount++;
				else break; // Stop if no more cards can be resupplied
			}
			if (resuppliedCount > 0) {
				this.gsm.eventBus.publish('cardsResupplied', { playerId, count: resuppliedCount });
				console.log(`[EffectProcessor] Player ${playerId} resupplied ${resuppliedCount} cards.`);
				}
			}
		}
	}

	/**
	/**
	 * Rule 7.3.16 & 7.3.17 - Move Forward / Move Backward
	 */
	private async effectMove(step: IEffectStep, targets: (IGameObject | string)[], direction: 1 | -1): Promise<void> {
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;
		const distance = count * direction;
		const targetExpeditionType = step.parameters?.targetExpeditionType as 'hero' | 'companion' | 'both' | undefined; // 'both' or specific

		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (!playerId) continue;

			const player = this.gsm.getPlayer(playerId);
			if (!player) continue;

			let movedSomething = false;
			if (targetExpeditionType === 'hero' || targetExpeditionType === 'both' || !targetExpeditionType) {
				const oldPos = player.expeditionState.heroPosition;
				player.expeditionState.heroPosition = Math.max(0, player.expeditionState.heroPosition + distance);
				// TODO: Check against max position (adventureRegions.length - 1 or similar)
				// TODO: Handle Tumult card reveals if moving into new region (Rule 7.3.17.b)
				if (player.expeditionState.heroPosition !== oldPos) {
					console.log(`[EffectProcessor] Player ${playerId} Hero expedition moved by ${distance} to ${player.expeditionState.heroPosition}.`);
					this.gsm.eventBus.publish('expeditionMoved', { playerId, type: 'hero', newPosition: player.expeditionState.heroPosition, distance });
					movedSomething = true;
				}
			}
			if (targetExpeditionType === 'companion' || targetExpeditionType === 'both' || !targetExpeditionType) {
				const oldPos = player.expeditionState.companionPosition;
				player.expeditionState.companionPosition = Math.max(0, player.expeditionState.companionPosition + distance);
				// TODO: Check against max position
				// TODO: Handle Tumult card reveals
				if (player.expeditionState.companionPosition !== oldPos) {
					console.log(`[EffectProcessor] Player ${playerId} Companion expedition moved by ${distance} to ${player.expeditionState.companionPosition}.`);
					this.gsm.eventBus.publish('expeditionMoved', { playerId, type: 'companion', newPosition: player.expeditionState.companionPosition, distance });
					movedSomething = true;
				}
			}
			if (!movedSomething) {
				console.log(`[EffectProcessor] Player ${playerId} expeditions did not move (already at boundary or no valid type specified).`);
			}
		}
	}

	/**
	 * Rule 7.3.4 - Create Token
	 */
	private async effectCreateToken(step: IEffectStep, sourceObjectForContext: IGameObject | undefined | null, currentContext: any): Promise<void> {
		const tokenDefinitionId = step.parameters?.tokenDefinitionId as string;
		let destinationExpeditionType = step.parameters?.destinationExpeditionType as 'hero' | 'companion' | 'source_assigned_or_choice' | undefined;
		let controllerId = step.parameters?.controllerId as string | undefined;

		if (!controllerId && sourceObjectForContext) {
			controllerId = sourceObjectForContext.controllerId;
		} else if (!controllerId) {
			// If controller is not specified and no source object, default to current player if available in context?
			// This might need a more robust way to determine controller if not explicit.
			// controllerId = currentContext.currentPlayerId; // Example, if currentPlayerId is in context
			console.warn('[EffectProcessor] CreateToken: Controller ID not determined, token may not be created correctly.');
			return;
		}

		if (!controllerId) {
			console.error('[EffectProcessor] CreateToken: Cannot determine controller for the token.');
			return;
		}

		if (!tokenDefinitionId /* && !inlineDefinition */) {
			console.error('[EffectProcessor] CreateToken: No tokenDefinitionId or inline definition provided.');
			return;
		}

		// TODO: Handle inlineDefinition by creating a temporary definition or passing params to ObjectFactory
		const tokenObject = this.gsm.objectFactory.createTokenObjectById(tokenDefinitionId, controllerId);
		if (!tokenObject) {
			console.error(`[EffectProcessor] Failed to create token object from definitionId: ${tokenDefinitionId}`);
			return;
		}

		if (destinationExpeditionType) {
			tokenObject.expeditionAssignment = { playerId: controllerId, type: destinationExpeditionType };
		} else if (destinationExpeditionType === 'source_assigned_or_choice' && sourceObjectForContext) {
			const isSourceGigantic = sourceObjectForContext.currentCharacteristics.isGigantic === true;
			if (isSourceGigantic) {
				// Rule 7.4.4.h: Player must pick. Simplified: default to source's assignment or 'hero'.
				const chosenType = sourceObjectForContext.expeditionAssignment?.type || 'hero';
				tokenObject.expeditionAssignment = { playerId: controllerId, type: chosenType };
				console.log(`[EffectProcessor] CreateToken (Gigantic Source): ${tokenObject.name} assigned to ${chosenType} expedition for ${controllerId}. TODO: Implement player choice.`);
			} else {
				// Not Gigantic, use source's assignment or default.
				const assignedType = sourceObjectForContext.expeditionAssignment?.type || 'hero';
				tokenObject.expeditionAssignment = { playerId: controllerId, type: assignedType };
			}
		}
		 else {
			// Default if no specific type or source-based logic applies
			console.warn(`[EffectProcessor] CreateToken: destinationExpeditionType not specified or context insufficient for ${tokenObject.name}. Assigning to 'hero' by default.`);
			tokenObject.expeditionAssignment = { playerId: controllerId, type: 'hero' };
		}

		this.gsm.state.sharedZones.expedition.add(tokenObject);
		this.gsm.eventBus.publish('objectCreated', { object: tokenObject, zone: this.gsm.state.sharedZones.expedition });
		console.log(`[EffectProcessor] Created token ${tokenObject.name} (ID: ${tokenObject.objectId}) for player ${controllerId} in ${destinationExpeditionType || 'default'} expedition.`);
	}

	/**
	 * Gain Ability (Old Augment)
	 */
	private async effectGainAbility(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const abilityDefinition = step.parameters?.ability as any; // Should be IAbilityDefinition or similar structure

		if (!abilityDefinition) {
			console.warn('[EffectProcessor] effectGainAbility called without ability definition.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				// Create a new ability instance from the definition for this specific target
				const newAbility = this.gsm.objectFactory.createAbility(abilityDefinition, target.objectId);
				if (newAbility) {
					if (!target.currentCharacteristics.grantedAbilities) {
						target.currentCharacteristics.grantedAbilities = [];
					}
					target.currentCharacteristics.grantedAbilities.push(newAbility);
					this.gsm.eventBus.publish('abilityGained', { targetId: target.objectId, abilityId: newAbility.abilityId });
					console.log(`[EffectProcessor] Target ${target.name} gained ability: ${newAbility.text || newAbility.abilityId}.`);
				} else {
					console.error(`[EffectProcessor] Failed to create instance for ability ${abilityDefinition.id || 'unknown'} for target ${target.name}.`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.3 - Augment Counters
	 */
	private async effectAugmentCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined;
		if (!counterType) {
			console.warn('[EffectProcessor] effectAugmentCounters called without counterType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentCount = target.counters.get(counterType);
				if (typeof currentCount === 'number' && currentCount > 0) { // Must have existing counter > 0
					target.counters.set(counterType, currentCount + 1);
					this.gsm.eventBus.publish('counterAugmented', { targetId: target.objectId, counterType, newAmount: currentCount + 1 });
					console.log(`[EffectProcessor] Target ${target.name} augmented ${counterType} counter to ${currentCount + 1}.`);
					if (counterType === CounterType.Boost) {
						(this.gsm.statusUpdater as any).updateObjectStatusBasedOnCounters(target); // Assuming statusUpdater exists
					}
				} else {
					console.log(`[EffectProcessor] Target ${target.name} does not have positive ${counterType} counter(s) to augment.`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.8 - Exchange
	 */
	private async effectExchange(_step: IEffectStep, _sourceObjectForContext: IGameObject | undefined | null, _currentContext: any): Promise<void> {
		console.log(`[EffectProcessor] Exchange not fully implemented.`);
		// Needs complex logic for selecting two sets of targets and swapping their zones/characteristics.
	}

	/**
	 * Rule 7.3.12 - Gain Counters
	 */
	private async effectGainCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined || CounterType.Boost;
		const amount = typeof step.parameters?.amount === 'number' ? step.parameters.amount : 1;

		if (amount <= 0) return; // Gaining 0 or negative counters does nothing.

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const current = target.counters.get(counterType) || 0;
				target.counters.set(counterType, current + amount);
				this.gsm.eventBus.publish('counterGained', { targetId: target.objectId, counterType, amount, newTotal: current + amount });
				console.log(`[EffectProcessor] ${target.name} gained ${amount} ${counterType} counters, new total: ${current + amount}.`);
				if (counterType === CounterType.Boost) {
					(this.gsm.statusUpdater as any).updateObjectStatusBasedOnCounters(target);
				}
			}
		}
	}

	/**
	 * Lose Counters
	 */
	private async effectLoseCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined || CounterType.Boost;
		const amount = typeof step.parameters?.amount === 'number' ? step.parameters.amount : 1;

		if (amount <= 0) return;

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const current = target.counters.get(counterType) || 0;
				const newAmount = Math.max(0, current - amount);
				target.counters.set(counterType, newAmount);
				this.gsm.eventBus.publish('counterLost', { targetId: target.objectId, counterType, amountRemoved: current - newAmount, newTotal: newAmount });
				console.log(`[EffectProcessor] ${target.name} lost ${amount} ${counterType} counters, new total: ${newAmount}.`);
				if (counterType === CounterType.Boost) {
					(this.gsm.statusUpdater as any).updateObjectStatusBasedOnCounters(target);
				}
			}
		}
	}

	/**
	 * Rule 7.3.13 - Gain Status
	 */
	private async effectGainStatus(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const statusType = step.parameters?.statusType as StatusType | undefined;
		if (!statusType) {
			console.warn('[EffectProcessor] GainStatus effect called without statusType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (!target.statuses.has(statusType)) {
					target.statuses.add(statusType);
					this.gsm.eventBus.publish('statusGained', { targetId: target.objectId, statusType });
					console.log(`[EffectProcessor] ${target.name} gained ${statusType} status.`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.15 - Lose Status
	 */
	private async effectLoseStatus(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const statusType = step.parameters?.statusType as StatusType | undefined;
		if (!statusType) {
			console.warn('[EffectProcessor] LoseStatus effect called without statusType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (target.statuses.has(statusType)) {
					target.statuses.delete(statusType);
					this.gsm.eventBus.publish('statusLost', { targetId: target.objectId, statusType });
					console.log(`[EffectProcessor] ${target.name} lost ${statusType} status.`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.21 - Put in Zone (Generic Move)
	 */
	private async effectPutInZone(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		let destinationZoneIdentifier = step.parameters?.destinationZoneIdentifier as ZoneIdentifier | 'source_expeditions_choice' | undefined;
		const sourceObjectForEffect = step.parameters?.sourceObjectForContextOverrideId ? this.gsm.getObject(step.parameters.sourceObjectForContextOverrideId as string) : null; // Assuming step might define its own context source for destination

		if (!destinationZoneIdentifier) {
			console.warn('[EffectProcessor] PutInZone effect called without destinationZoneIdentifier.');
			return;
		}

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentZone = this.gsm.findZoneOfObject(target.objectId);
				let zoneOwnerId = step.parameters?.controllerId as string || target.controllerId;
				let destZone: IZone | null = null;

				if (destinationZoneIdentifier === 'source_expeditions_choice' && sourceObjectForEffect) {
					zoneOwnerId = sourceObjectForEffect.controllerId; // Destination is for the source's controller
					const isSourceGigantic = sourceObjectForEffect.currentCharacteristics.isGigantic === true;
					if (isSourceGigantic) {
						// Rule 7.4.4.h: Player must pick. Simplified: default to source's assignment or 'hero'.
						const chosenType = sourceObjectForEffect.expeditionAssignment?.type || 'hero';
						destZone = this.findZoneByType(zoneOwnerId, ZoneIdentifier.Expedition); // Base expedition zone
						// We need to ensure the object gets the correct expeditionAssignment if destZone is Expedition
						target.expeditionAssignment = { playerId: zoneOwnerId, type: chosenType };
						console.log(`[EffectProcessor] PutInZone (Gigantic Source Dest): ${target.name} will be put in ${chosenType} expedition for ${zoneOwnerId}. TODO: Implement player choice.`);
					} else {
						// Not Gigantic source, use source's assignment or default 'hero'
						const assignedType = sourceObjectForEffect.expeditionAssignment?.type || 'hero';
						destZone = this.findZoneByType(zoneOwnerId, ZoneIdentifier.Expedition);
						target.expeditionAssignment = { playerId: zoneOwnerId, type: assignedType };
					}
				} else if (typeof destinationZoneIdentifier === 'string' && Object.values(ZoneIdentifier).includes(destinationZoneIdentifier as ZoneIdentifier)) {
					destZone = this.findZoneByType(zoneOwnerId, destinationZoneIdentifier as ZoneIdentifier);
				} else {
					console.warn(`[EffectProcessor] PutInZone: Invalid destinationZoneIdentifier: ${destinationZoneIdentifier}`);
					return;
				}

				if (currentZone && destZone) {
					// If moving to expedition, ensure expeditionAssignment is set (handled above for choice case)
					if (destZone.zoneType === ZoneIdentifier.Expedition && !target.expeditionAssignment && sourceObjectForEffect) {
                        // If not set by Gigantic choice logic, means it's a direct move to "Expedition" zone.
                        // Default to source's assignment or hero, if applicable.
                        target.expeditionAssignment = { playerId: zoneOwnerId, type: sourceObjectForEffect.expeditionAssignment?.type || 'hero' };
                    } else if (destZone.zoneType !== ZoneIdentifier.Expedition) {
                        // Clear assignment if moving out of expedition
                        delete target.expeditionAssignment;
                    }

					this.gsm.moveEntity(target.objectId, currentZone, destZone, target.controllerId);
					console.log(`[EffectProcessor] Moved ${target.name} (ID: ${target.objectId}) to ${destZone.id} (intended type: ${destinationZoneIdentifier}).`);
				} else {
					console.warn(`[EffectProcessor] Could not move ${target.name}: currentZone ${currentZone?.id}, destZone ${destZone?.id}`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.18 - Ready
	 */
	private async effectReady(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (target.statuses.has(StatusType.Exhausted)) {
					target.statuses.delete(StatusType.Exhausted);
					this.gsm.eventBus.publish('objectReadied', { targetId: target.objectId });
					console.log(`[EffectProcessor] ${target.name} became ready.`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.10 - Exhaust
	 */
	private async effectExhaust(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (!target.statuses.has(StatusType.Exhausted)) {
					target.statuses.add(StatusType.Exhausted);
					this.gsm.eventBus.publish('objectExhausted', { targetId: target.objectId });
					console.log(`[EffectProcessor] ${target.name} became exhausted.`);
				}
			}
		}
	}

	// --- NEW VERBS START HERE ---

	/**
	 * Rule 7.3.25 - Sacrifice
	 */
	private async effectSacrifice(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const playerOwner = this.gsm.getPlayer(target.ownerId);
				if (!playerOwner) {
					console.warn(`[EffectProcessor] Owner ${target.ownerId} not found for sacrificed object ${target.name}.`);
					continue;
				}
				const currentZone = this.gsm.findZoneOfObject(target.objectId);
				if (!currentZone) {
					console.warn(`[EffectProcessor] Cannot find current zone for sacrificed object ${target.name}.`);
					continue;
				}
				// Sacrifice means move to owner's discard pile.
				this.gsm.moveEntity(target.objectId, currentZone, playerOwner.zones.discardPileZone, target.controllerId);
				this.gsm.eventBus.publish('objectSacrificed', { objectId: target.objectId, definitionId: target.definitionId, fromZoneId: currentZone.id });
				console.log(`[EffectProcessor] ${target.name} (controlled by ${target.controllerId}, owned by ${target.ownerId}) was sacrificed.`);
			}
		}
	}

	/**
	 * Set Characteristic
	 */
	private async effectSetCharacteristic(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const characteristic = step.parameters?.characteristic as string;
		const value = step.parameters?.value; // Can be any type

		if (!characteristic) {
			console.warn('[EffectProcessor] SetCharacteristic: "characteristic" parameter missing.');
			return;
		}

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				// Ensure currentCharacteristics exists
				if (!target.currentCharacteristics) {
					target.currentCharacteristics = { ...target.baseCharacteristics };
				}
				(target.currentCharacteristics as any)[characteristic] = value;
				this.gsm.eventBus.publish('characteristicSet', { targetId: target.objectId, characteristic, value });
				console.log(`[EffectProcessor] Set characteristic ${characteristic}=${value} for ${target.name}.`);
				// Potentially re-evaluate passives if a significant characteristic changed
				// This might be too broad here; consider if specific characteristics trigger this.
				// this.gsm.ruleAdjudicator.applyAllPassiveAbilities();
			}
		}
	}

	/**
	 * Modify Statistics
	 */
	private async effectModifyStatistics(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const statsChange = step.parameters?.statsChange as Partial<Record<'forest'|'mountain'|'water'|'power'|'health', number>>;

		if (!statsChange) {
			console.warn('[EffectProcessor] ModifyStatistics: "statsChange" parameter missing or invalid.');
			return;
		}

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (!target.currentCharacteristics.statistics) {
					target.currentCharacteristics.statistics = { forest: 0, mountain: 0, water: 0, power: 0, health: 0 };
				}
				const stats = target.currentCharacteristics.statistics;
				let changed = false;
				for (const key of Object.keys(statsChange) as Array<keyof typeof statsChange>) {
					if (statsChange[key] !== undefined && typeof stats[key] === 'number') {
						(stats[key] as number) += statsChange[key]!;
						changed = true;
					}
				}
				if (changed) {
					this.gsm.eventBus.publish('statisticsModified', { targetId: target.objectId, newStats: { ...stats } });
					console.log(`[EffectProcessor] Modified statistics for ${target.name}. New stats: F:${stats.forest} M:${stats.mountain} W:${stats.water} P:${stats.power} H:${stats.health}`);
				}
			}
		}
	}

	/**
	 * Change Controller (Simplified)
	 */
	private async effectChangeController(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const newControllerId = step.parameters?.newControllerId as string;
		if (!newControllerId || !this.gsm.getPlayer(newControllerId)) {
			console.warn(`[EffectProcessor] ChangeController: Invalid or missing newControllerId: ${newControllerId}.`);
			return;
		}

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const oldControllerId = target.controllerId;
				target.controllerId = newControllerId;
				// TODO: Full implementation requires moving object to new controller's corresponding zone
				// if it's in a personal zone (e.g. Reserve, Landmark). If in shared (Expedition), just update controllerId.
				// This is a complex operation that GameStateManager should handle via a dedicated method.
				this.gsm.eventBus.publish('controllerChanged', { objectId: target.objectId, newControllerId, oldControllerId });
				console.log(`[EffectProcessor] Changed controller of ${target.name} from ${oldControllerId} to ${newControllerId}. (Zone change logic is TODO)`);
			}
		}
	}

	/**
	 * Rule 7.3.19 - Roll Die
	 */
	private async effectRollDie(step: IEffectStep, _sourceObjectForContext: IGameObject | undefined | null, currentContext: any): Promise<void> {
		const result = Math.floor(Math.random() * 6) + 1;
		const storeAs = step.parameters?.storeAs as string || 'lastDieRoll'; // Key to store result under

		if (currentContext && currentContext._effectRuntimeValues) {
			currentContext._effectRuntimeValues[storeAs] = result;
		} else {
			console.warn("[EffectProcessor] RollDie: Cannot store result, _effectRuntimeValues not on context.");
		}
		this.gsm.eventBus.publish('dieRolled', { result, storedAs: storeAs });
		console.log(`[EffectProcessor] Rolled a die: ${result}. Stored as "${storeAs}".`);
	}

	/**
	 * If Condition (Control Flow)
	 */
	private async effectIfCondition(step: IEffectStep, sourceObjectForContext: IGameObject | undefined | null, currentContext: any, preSelectedTargets?: any[]): Promise<void> {
		const condition = step.parameters?.condition as any; // Define specific condition types
		const then_steps = step.parameters?.then_steps as IEffectStep[] | undefined;
		const else_steps = step.parameters?.else_steps as IEffectStep[] | undefined;

		if (!condition || !then_steps) {
			console.warn('[EffectProcessor] IfCondition: Invalid parameters. "condition" and "then_steps" are required.');
			return;
		}

		let conditionMet = false;
		// TODO: Implement various condition evaluation types
		// Example: { type: 'compare_runtime_value', key: 'lastDieRoll', operator: '>=', value: 4 }
		if (condition.type === 'compare_runtime_value' && currentContext._effectRuntimeValues) {
			const val1 = currentContext._effectRuntimeValues[condition.key];
			const val2 = condition.value;
			// Implement operators: '===', '!==', '>', '<', '>=', '<='
			if (condition.operator === '>=' && val1 >= val2) conditionMet = true;
			if (condition.operator === '===' && val1 === val2) conditionMet = true;
			// Add more operators
		} else if (sourceObjectForContext && condition.type === 'zone_state_check') {
			// Example: condition = { type: 'zone_state_check', zone: 'source_expeditions', check: 'is_behind_opponent', comparisonValue: true }
			//          condition = { type: 'zone_state_check', zone: 'source_expeditions', check: 'object_count', criteria: {...}, operator: '>', value: 0 }
			const zoneSpecifier = condition.zone;
			const checkType = condition.check;
			let resultsFromAllContexts: boolean[] = [];

			let relevantContexts: { playerId: string, type: 'hero' | 'companion' }[] = [];
			if (zoneSpecifier === 'source_expeditions') {
				relevantContexts = this._getEffectiveExpeditionContexts(sourceObjectForContext, 'self');
			} else if (zoneSpecifier === 'source_hero_expedition') {
				relevantContexts.push({playerId: sourceObjectForContext.controllerId, type: 'hero'});
			} else if (zoneSpecifier === 'source_companion_expedition') {
				relevantContexts.push({playerId: sourceObjectForContext.controllerId, type: 'companion'});
			}
			// Add more zoneSpecifiers like 'opposing_expeditions_to_source' if needed for conditions

			if (relevantContexts.length === 0 && (zoneSpecifier === 'source_expeditions' || zoneSpecifier === 'source_hero_expedition' || zoneSpecifier === 'source_companion_expedition')) {
				// If source_expeditions was specified but no valid contexts (e.g. source not in an expedition), condition is likely false.
				conditionMet = false;
			} else if (relevantContexts.length > 0) {
				for (const ctx of relevantContexts) {
					// This is conceptual. Actual checks need specific implementation.
					// E.g., this.gsm.checkExpeditionState(ctx.playerId, ctx.type, checkType, condition.criteria, condition.operator, condition.value)
					const singleContextResult = this.evaluateSingleZoneCondition(ctx, checkType, condition);
					resultsFromAllContexts.push(singleContextResult);
				}

				// Rule 7.4.4.j: "the condition applies to both Expeditions simultaneously" - typically implies AND logic.
				// If only one context (non-Gigantic source), then it's just that one result.
				if (resultsFromAllContexts.length > 0) {
					conditionMet = resultsFromAllContexts.every(r => r === true);
				} else {
					conditionMet = false; // No relevant contexts to check, or no results.
				}
			} else {
				console.warn(`[EffectProcessor] IfCondition: Unhandled zone_state_check for zone specifier: ${zoneSpecifier}`);
				conditionMet = false; // Default to false if the zone cannot be resolved for condition
			}

		} else {
			console.warn(`[EffectProcessor] IfCondition: Unknown condition type "${condition.type}" or missing runtime/source context.`);
		}

		const stepsToExecute = conditionMet ? then_steps : else_steps;

		if (stepsToExecute && stepsToExecute.length > 0) {
			console.log(`[EffectProcessor] IfCondition: Condition was ${conditionMet ? 'MET' : 'NOT MET'}. Executing ${conditionMet ? 'THEN' : 'ELSE'} branch.`);
			// Create a new sub-effect to resolve these steps
			const subEffect: IEffect = {
				steps: stepsToExecute,
				sourceObjectId: sourceObjectForContext?.objectId,
				_triggerPayload: currentContext, // Pass full context along
				_lkiSourceObject: sourceObjectForContext // Pass LKI if available
			};
			// Resolve recursively. Pass original preSelectedTargets if relevant for sub-steps.
			await this.resolveEffect(subEffect, sourceObjectForContext, preSelectedTargets, currentContext);
		} else {
			console.log(`[EffectProcessor] IfCondition: Condition was ${conditionMet ? 'MET' : 'NOT MET'}. No steps in chosen branch or chosen branch is empty.`);
		}
	}

	// Placeholder for actual condition evaluation logic for a single zone context
	private evaluateSingleZoneCondition(
		context: { playerId: string, type: 'hero' | 'companion' },
		checkType: string,
		conditionParams: any
	): boolean {
		// This would contain detailed logic for various 'checkType' like 'is_behind_opponent', 'object_count', etc.
		// For example:
		// if (checkType === 'object_count') {
		//   const objects = this.gsm.getObjectsInExpedition(context.playerId, context.type);
		//   const filteredObjects = objects.filter(obj => matchesCriteria(obj, conditionParams.criteria));
		//   return compare(filteredObjects.length, conditionParams.operator, conditionParams.value);
		// }
		// if (checkType === 'is_behind_opponent') { ... }
		console.warn(`[EffectProcessor.evaluateSingleZoneCondition] Placeholder for: checking ${checkType} in ${context.type} of ${context.playerId} with params ${JSON.stringify(conditionParams)} - returning false by default.`);
		return false;
	}

	/**
	 * Rule 7.4.4.m - Switch Expeditions effect for a character.
	 */
	private async effectSwitchExpedition(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (target.type !== 'Character') { // Assuming only characters can be in expeditions this way
					console.warn(`[EffectProcessor.effectSwitchExpedition] Target ${target.name} is not a Character. Skipping.`);
					continue;
				}
				if (!target.expeditionAssignment) {
					console.warn(`[EffectProcessor.effectSwitchExpedition] Target ${target.name} has no expeditionAssignment. Skipping.`);
					continue;
				}

				const isGigantic = target.currentCharacteristics.isGigantic === true;
				const oldAssignment = target.expeditionAssignment.type;
				const newAssignment = oldAssignment === 'hero' ? 'companion' : 'hero';

				if (isGigantic) {
					// Rule 7.4.4.m: "the card representing it switches Expeditions."
					// "As long as it remains Gigantic, the Character itself does not leave nor join either Expedition."
					// This means no standard leave/join triggers should fire.
					target.expeditionAssignment.type = newAssignment;
					console.log(`[EffectProcessor] Gigantic character ${target.name} (ID: ${target.objectId}) switched its primary expedition assignment from ${oldAssignment} to ${newAssignment}. This does not trigger leave/join events for the Gigantic character itself.`);
					this.gsm.eventBus.publish('giganticAssignmentSwitched', { objectId: target.objectId, newAssignmentType: newAssignment, oldAssignmentType: oldAssignment });
				} else {
					// Non-Gigantic character: This is a standard move between expeditions.
					// This would involve leaving one and joining another, potentially triggering effects.
					// For now, just change assignment. Full move logic might be more complex (e.g. using gsm.moveEntity if zones were distinct).
					// Since expedition is one shared zone, just changing the assignment property is key.
					// However, to trigger "leaves X expedition" and "joins Y expedition", more is needed if those are specific events.
					target.expeditionAssignment.type = newAssignment;
					console.log(`[EffectProcessor] Non-Gigantic character ${target.name} (ID: ${target.objectId}) switched expedition assignment from ${oldAssignment} to ${newAssignment}. TODO: Implement full leave/join trigger logic if distinct from assignment change.`);
					this.gsm.eventBus.publish('expeditionAssignmentSwitched', { objectId: target.objectId, newAssignmentType: newAssignment, oldAssignmentType: oldAssignment });
				}
			}
		}
	}


	// --- END OF NEW VERBS ---

	/**
	 * Type guard to check if a target is a game object
	 */
	private isTargetGameObject(
		target: IGameObject | string | undefined | null
	): target is IGameObject {
		return typeof target === 'object' && target !== null && 'objectId' in target;
	}

	private getValueFromPath(obj: unknown, path: string): unknown {
		if (!obj || typeof obj !== 'object' && typeof obj !== 'function') return undefined; // Check added for function type
		// Safeguard against prototype pollution if path could be malicious (e.g. __proto__)
		if (path.includes('__proto__') || path.includes('constructor') || path.includes('prototype')) {
			return undefined;
		}
		const properties = path.split('.');
		// Ensure 'reduce' is used safely, especially if 'obj' could have unexpected prototypes.
		// However, standard objects (from JSON, or class instances without malicious overrides) should be fine.
		return properties.reduce((prev, curr) => (prev && typeof prev === 'object' && prev[curr] !== undefined) ? prev[curr] : undefined, obj);
	}


	/**
	 * Enhanced target resolution for effect steps.
	 * @param targetSpec The 'targets' field from an IEffectStep.
	 * @param sourceObjectForContext The source of the ability/effect.
	 * @param currentContext Full context including trigger payload and effect runtime values.
	 * @param preSelectedTargets Targets already chosen by the player (e.g. for PlayerActionHandler).
	 * @param targetKey Optional key if the step expects a specific target from a list of pre-selected targets.
	 */
	private async resolveTargetsForStep(
		targetSpec: unknown,
		sourceObjectForContext: IGameObject | undefined | null,
		currentContext: any,
		preSelectedTargets?: any[],
		targetKey?: string
	): Promise<(IGameObject | string)[]> {
		if (!targetSpec) return [];

		// If preSelectedTargets are provided and this step uses a specific key to pick one
		if (targetKey && preSelectedTargets && preSelectedTargets.length > 0) {
			const specificTarget = preSelectedTargets.find(t => t.targetId === targetKey || t.key === targetKey); // Assuming TargetInfo has targetId or key
			if (specificTarget && specificTarget.objectId) {
				const obj = this.gsm.getObject(specificTarget.objectId);
				return obj ? [obj] : [];
			} else if (specificTarget) { // Could be a player ID or other non-object target
				return [specificTarget.objectId]; // Assuming objectId field holds the value
			}
		}
		// If no targetKey, but preSelectedTargets exist, and targetSpec implies "chosen" (e.g. 'chosen_target')
		// This part needs more robust definition of how steps declare they use pre-selected targets.
		// For now, if preSelectedTargets exist and targetSpec isn't a simple string like 'self', assume they are the targets.
		// This is a simplification.
		if (preSelectedTargets && preSelectedTargets.length > 0 && typeof targetSpec !== 'string') {
			return preSelectedTargets.map(t => {
				if (t.objectId) {
					const obj = this.gsm.getObject(t.objectId);
					return obj ? obj : t.objectId; // Return ID if obj not found (could be playerID)
				}
				return t; // If no objectId, could be a direct value/ID
			}).filter(t => t) as (IGameObject | string)[];
		}


		if (typeof targetSpec === 'string') {
			switch (targetSpec.toLowerCase()) {
				case 'self':
					return sourceObjectForContext ? [sourceObjectForContext] : [];
				case 'controller':
					return sourceObjectForContext ? [sourceObjectForContext.controllerId] : [];
				case 'opponent':
					if (sourceObjectForContext) {
						const controllerId = sourceObjectForContext.controllerId;
						const opponents = this.gsm.getPlayerIds().filter(pid => pid !== controllerId);
						return opponents; // Returns array of opponent player IDs
					}
					return [];
				// TODO: 'all_players', 'all_objects_in_zone_X_matching_Y'
				default: // Assume it might be a specific objectId or playerId
					const objById = this.gsm.getObject(targetSpec);
					if (objById) return [objById];
					if (this.gsm.getPlayer(targetSpec)) return [targetSpec];
					console.warn(`[EffectProcessor] Unresolved string target: ${targetSpec}`);
					return [];
			}
		}

		if (typeof targetSpec === 'object' && targetSpec !== null && (targetSpec as any).type) {
			const spec = targetSpec as any;
			switch (spec.type.toLowerCase()) {
				case 'fromtrigger':
				case 'from_trigger': // Alias
					if (spec.path && currentContext) {
						const value = this.getValueFromPath(currentContext, spec.path);
						if (value === undefined) {
							console.warn(`[EffectProcessor] Path '${spec.path}' yielded undefined from context:`, currentContext);
							return [];
						}
						// Standardize to array, handle various resolved value types
						const items = Array.isArray(value) ? value : [value];
						return items.map(item => {
							if (typeof item === 'string') {
								const objItem = this.gsm.getObject(item);
								return objItem ? objItem : item; // Return ID if object not found
							} else if (this.isTargetGameObject(item)) {
								return item;
							}
							console.warn(`[EffectProcessor] fromTrigger: Unhandled item type from path ${spec.path}:`, item);
							return null;
						}).filter(item => item !== null) as (IGameObject | string)[];
					}
					console.warn('[EffectProcessor] "fromTrigger" target type requires a path and active context.');
					return [];
				case 'objects_matching_criteria': // Placeholder for more complex selections
				case 'select': // Alias for criteria-based selection
					console.log(`[EffectProcessor] Complex target selection for type '${spec.type}' with criteria '${JSON.stringify(spec.criteria)}' not yet fully implemented. Requires player choice or advanced filtering.`);
					// Example: Find all characters in controller's hero expedition
					if (sourceObjectForContext && spec.criteria?.zone === 'self_hero_expedition' && spec.criteria?.cardType === 'Character') {
						return this.gsm.getObjectsInExpedition(sourceObjectForContext.controllerId, 'hero')
				.filter(obj => obj.type === 'Character'); // Ensure this method exists and works as expected
					}
		// Rule 7.4.4.f (My Expedition) & 7.4.4.g (Expedition Facing Me)
		if (sourceObjectForContext && spec.criteria?.zone) {
			const targetCardType = spec.criteria.cardType as CardType | undefined; // e.g., 'Character'
			let resolvedTargets: IGameObject[] = [];
			let contexts: { playerId: string, type: 'hero' | 'companion' }[] = [];

			if (spec.criteria.zone === 'source_expeditions') { // Target source's own expedition(s)
				contexts = this._getEffectiveExpeditionContexts(sourceObjectForContext, 'self');
			} else if (spec.criteria.zone === 'opposing_expeditions_to_source') { // Target expedition(s) opposing the source
				contexts = this._getEffectiveExpeditionContexts(sourceObjectForContext, 'opponent');
			}

			for (const ctx of contexts) {
				// Assuming a method like this exists on GSM or can be constructed:
				// gsm.getObjectsInExpedition(playerId, expeditionType, filterCriteria)
				const objectsInExpedition = this.gsm.getObjectsInExpedition(ctx.playerId, ctx.type);
				objectsInExpedition.forEach(obj => {
					if (!targetCardType || obj.type === targetCardType) {
						if (!resolvedTargets.some(rt => rt.objectId === obj.objectId)) { // Avoid duplicates
							resolvedTargets.push(obj);
						}
					}
				});
			}
			if (contexts.length > 0) return resolvedTargets; // Return if we handled it via new specifiers
		}

		// Rule 7.4.4.k ("The Other Expedition" - for a Gigantic source)
		if (sourceObjectForContext?.currentCharacteristics.isGigantic && spec.criteria?.zone === 'source_other_expedition') {
			return []; // Returns an empty list of targets
		}

					// This would involve player choice or more filtering (e.g. based on spec.criteria)
		console.warn(`[EffectProcessor] Complex target selection for type '${spec.type}' with criteria '${JSON.stringify(spec.criteria)}' partially unhandled or fell through.`);
					return [];
				default:
					console.warn(`[EffectProcessor] Unknown target object type: ${spec.type}`);
					return [];
			}
		}
		if (Array.isArray(targetSpec)) { // Assume array of IDs or direct objects
			return targetSpec.map(t => {
				if (typeof t === 'string') {
					const obj = this.gsm.getObject(t);
					return obj ? obj : t;
				}
				return t;
			}).filter(t => t) as (IGameObject | string)[];
		}

		console.warn('[EffectProcessor] Unresolved target specification:', targetSpec);
		return [];
	}


	/**
	 * Finds a zone by type for a player or shared.
	 */
	private findZoneByType(playerIdForContext: string, zoneType: ZoneIdentifier): IZone | null {
		const player = this.gsm.getPlayer(playerIdForContext);

		switch (zoneType) {
			// Player-specific zones
			case ZoneIdentifier.Hand:
				return player?.zones.handZone || null;
			case ZoneIdentifier.Deck:
				return player?.zones.deckZone || null;
			case ZoneIdentifier.DiscardPile: // Corrected from Discard
				return player?.zones.discardPileZone || null;
			case ZoneIdentifier.Mana:
				return player?.zones.manaZone || null;
			case ZoneIdentifier.Reserve:
				return player?.zones.reserveZone || null;
			case ZoneIdentifier.Landmark:
				return player?.zones.landmarkZone || null;
			case ZoneIdentifier.Hero:
				return player?.zones.heroZone || null;

			// Shared zones (don't strictly need playerIdForContext but good for consistency)
			case ZoneIdentifier.Expedition:
				return this.gsm.state.sharedZones.expedition;
			case ZoneIdentifier.Limbo:
				return this.gsm.state.sharedZones.limbo;
			case ZoneIdentifier.Adventure:
				return this.gsm.state.sharedZones.adventure; // Corrected from adventureZone
			default:
				console.warn(`[EffectProcessor] Unknown or unhandled zone type for findZoneByType: ${zoneType}`);
				return null;
		}
	}


	/**
	 * Determines if optional effects should execute
	 */
	private shouldExecuteOptionalEffect(_step: IEffectStep): boolean {
		// TODO: Add player choice mechanism for optional effects
		// For now, always execute optional effects
		return true;
	}

	/**
	 * Reset pending effects queue - for test compatibility
	 */
	public resetPendingEffects(): void {
		this.pendingEffects = [];
		console.log('[EffectProcessor] Reset pending effects queue');
	}

	/**
	 * Resolve all pending effects - for test compatibility
	 */
	public async resolvePendingEffects(): Promise<void> {
		console.log(`[EffectProcessor] Resolving ${this.pendingEffects.length} pending effects`);
		const effectsToResolve = [...this.pendingEffects];
		this.pendingEffects = [];
		
		for (const effect of effectsToResolve) {
			await this.resolveEffect(effect);
		}
	}

	/**
	 * Add effect to pending queue
	 */
	public addPendingEffect(effect: IEffect): void {
		this.pendingEffects.push(effect);
		console.log(`[EffectProcessor] Added pending effect, queue size: ${this.pendingEffects.length}`);
	}

	/**
	 * Helper to determine which expeditions are relevant for a source object, especially if Gigantic.
	 * @param sourceObject The game object whose perspective is being used (e.g., the source of an ability).
	 * @param perspective 'self' for the sourceObject's own expeditions, 'opponent' for expeditions opposing the sourceObject.
	 * @returns An array of expedition contexts, each specifying playerId and type ('hero' or 'companion').
	 */
	private _getEffectiveExpeditionContexts(
		sourceObject: IGameObject,
		perspective: 'self' | 'opponent'
	): { playerId: string, type: 'hero' | 'companion' }[] {
		const contexts: { playerId: string, type: 'hero' | 'companion' }[] = [];
		const isSourceGigantic = sourceObject.currentCharacteristics.isGigantic === true;
		const sourceControllerId = sourceObject.controllerId;

		if (perspective === 'self') {
			if (isSourceGigantic) {
				contexts.push({ playerId: sourceControllerId, type: 'hero' });
				contexts.push({ playerId: sourceControllerId, type: 'companion' });
			} else {
				// Non-Gigantic: use its assigned expedition type, or default if somehow unassigned in an expedition.
				const assignedType = sourceObject.expeditionAssignment?.type;
				if (assignedType) {
					contexts.push({ playerId: sourceControllerId, type: assignedType });
				} else {
					// This case should be rare if objects in expedition always have assignment. Defaulting or error handling needed.
					console.warn(`[EffectProcessor._getEffectiveExpeditionContexts] Non-Gigantic source ${sourceObject.name} in expedition has no specific assignment. Defaulting to 'hero'.`);
					contexts.push({ playerId: sourceControllerId, type: 'hero' });
				}
			}
		} else { // perspective === 'opponent'
			const opponents = this.gsm.getPlayerIds().filter(pid => pid !== sourceControllerId);
			for (const opponentId of opponents) {
				if (isSourceGigantic) {
					// If source is Gigantic, its effect towards opponent considers both opponent expeditions.
					contexts.push({ playerId: opponentId, type: 'hero' });
					contexts.push({ playerId: opponentId, type: 'companion' });
				} else {
					// If source is not Gigantic, it "faces" one expedition of the opponent.
					// This simplistic model assumes hero faces hero, companion faces companion.
					// Real "facing" logic might depend on relative positions or game rules not yet defined here.
					// For now, assume it targets the same type as the source's assignment, or both if source is unassigned/global.
					const assignedType = sourceObject.expeditionAssignment?.type;
					if (assignedType) {
						contexts.push({ playerId: opponentId, type: assignedType }); // e.g. source's hero expedition faces opponent's hero
					} else {
						// If source has no specific expedition (e.g. global effect from a landmark), it might affect both.
						contexts.push({ playerId: opponentId, type: 'hero' });
						contexts.push({ playerId: opponentId, type: 'companion' });
					}
				}
			}
		}
		return contexts;
	}
}
