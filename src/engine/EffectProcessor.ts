import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance } from './types/objects'; // Added ICardInstance
import type { IEffect, IEffectStep, IModifier } from './types/abilities';
import type { IZone } from './types/zones';
import { CardType, CounterType, ModifierType, StatusType, ZoneIdentifier } from './types/enums';
import { isGameObject } from './types/objects';

export class EffectProcessor {
	private pendingEffects: IEffect[] = [];

	constructor(private gsm: GameStateManager) {}

	public async resolveEffect(effect: IEffect, sourceObject?: IGameObject, targets?: any[], triggerContext?: any): Promise<void> {
		const sourceIdForLog = effect.sourceObjectId || sourceObject?.objectId || 'unknown source';
		console.log(
			`[EffectProcessor] Resolving effect from ${sourceIdForLog} with ${effect.steps.length} steps. Trigger: ${triggerContext ? JSON.stringify(triggerContext) : 'none'}`
		);

		const currentContext = {
			...(effect._triggerPayload as object || {}),
			...(triggerContext as object || {}),
			_effectRuntimeValues: {}
		};

		let baseSourceObjectForEffect: IGameObject | undefined | null = sourceObject;
		if (effect._lkiSourceObject) {
			baseSourceObjectForEffect = effect._lkiSourceObject as IGameObject;
		} else if (!baseSourceObjectForEffect && effect.sourceObjectId) {
			baseSourceObjectForEffect = this.gsm.getObject(effect.sourceObjectId);
		}

		for (const step of effect.steps) {
			try {
				let repeatCount = 1;
				const repeatParam = step.parameters?.repeat;
				if (repeatParam) {
					if (typeof repeatParam === 'number') {
						repeatCount = repeatParam;
					} else if (typeof repeatParam === 'string' && currentContext._effectRuntimeValues[repeatParam] !== undefined) {
						repeatCount = Number(currentContext._effectRuntimeValues[repeatParam]);
					}
					repeatCount = Math.max(1, Math.floor(repeatCount));
					if (isNaN(repeatCount)) repeatCount = 1;
				}

				for (let i = 0; i < repeatCount; i++) {
					if (repeatCount > 1) {
						console.log(`[EffectProcessor] Repeating step ${step.verb} (iteration ${i + 1}/${repeatCount})`);
					}
					currentContext._currentIterationIndex = i;
					await this.resolveSingleStep(step, baseSourceObjectForEffect, currentContext, targets);
				}
			} catch (error) {
				console.error(
					`[EffectProcessor] Error resolving original step ${JSON.stringify(step)} for effect from ${sourceIdForLog}:`,
					error
				);
			}
		}

		this.gsm.ruleAdjudicator.applyAllPassiveAbilities();
		await this.gsm.resolveReactions();
	}

	private async resolveSingleStep(
		originalStep: IEffectStep,
		sourceObjectForContext: IGameObject | undefined | null,
		currentContext: any,
		preSelectedTargets?: any[]
	): Promise<boolean> {
		const modifierContext = {
			type: 'EFFECT_STEP' as const,
			step: originalStep,
			sourceObjectOfStep: sourceObjectForContext as IGameObject, // Assuming it will be IGameObject if relevant for modifiers
			effectContext: currentContext
		};

		// Ensure sourceObjectOfStep is valid if context relies on it.
		// If sourceObjectForContext is null/undefined, some criteria might not evaluate correctly.
		// This might require passing a "system" or "game" object if sourceObjectOfStep is truly null.
		if (!modifierContext.sourceObjectOfStep && (originalStep.targets === 'self' || originalStep.targets === 'controller')) {
			// If targets imply a source object but it's null, this step might be problematic anyway.
			// For modifiers, if sourceObjectOfStep is needed by criteria, those would fail.
			// console.warn(`[EffectProcessor] Modifier context created without a sourceObjectOfStep for step: ${originalStep.verb}`);
		}


		const activeModifiers = this.gsm.ruleAdjudicator.getActiveModifiers(modifierContext);

		let stepToExecute = originalStep;
		let stepHasBeenReplaced = false;
		let mainStepExecutedSuccessfully = false;

		// Handle canBeModified on the originalStep
		if (originalStep.canBeModified === false) {
			console.log(`[EffectProcessor] Original step ${originalStep.verb} cannot be modified. Executing directly.`);
			mainStepExecutedSuccessfully = await this.executeStepLogic(originalStep, sourceObjectForContext, currentContext, preSelectedTargets);
			currentContext._effectRuntimeValues[`step_${originalStep.verb}_processed`] = true;
			currentContext._effectRuntimeValues[`step_${originalStep.verb}_did_execute`] = mainStepExecutedSuccessfully;
			return mainStepExecutedSuccessfully;
		}

		// Apply Replacing Modifiers
		const replacingModifiers = activeModifiers.filter(m => m.modifierType === ModifierType.ReplaceStep && m.replacementEffectStep);
		if (replacingModifiers.length > 0) {
			const replacingModifier = replacingModifiers[0]; // Already sorted by priority
			if (replacingModifier.replacementEffectStep) { // Extra check for type safety
				console.log(`[EffectProcessor] Step ${originalStep.verb} from ${sourceObjectForContext?.name || 'system'} is REPLACED by modifier ${replacingModifier.modifierId} (Source: ${replacingModifier.sourceObjectId}).`);
				stepToExecute = replacingModifier.replacementEffectStep;
				stepHasBeenReplaced = true;
				// If the replacement step itself cannot be modified, this needs to be respected by subsequent AddStepBefore/After.
				// The recursive call to resolveSingleStep for AddStepBefore/After will handle this naturally for the additional steps.
			}
		}

		// Execute AddStepBefore Modifiers
		const addBeforeModifiers = activeModifiers.filter(m => m.modifierType === ModifierType.AddStepBefore && m.additionalEffectStep);
		for (const modifier of addBeforeModifiers) { // Assumes already sorted by priority
			if (stepHasBeenReplaced) {
				// Rule 6.2.i: If a step is replaced, additive modifiers that would have applied to the original step do not apply
				// unless their conditions also match the replacement step.
				// For simplicity here, if step was replaced, we skip AddStepBefore that targeted original.
				// A more advanced implementation might re-evaluate modifier.applicationCriteria against stepToExecute.
				console.log(`[EffectProcessor] Skipping AddStepBefore modifier ${modifier.modifierId} as original step was replaced.`);
				continue;
			}
			if (modifier.additionalEffectStep) { // Extra check
				console.log(`[EffectProcessor] Executing AddStepBefore modifier ${modifier.modifierId} (Source: ${modifier.sourceObjectId}) before step ${stepToExecute.verb}.`);
				// The additional step's own `canBeModified` flag will be checked in its own `resolveSingleStep` call.
				await this.resolveSingleStep(modifier.additionalEffectStep, sourceObjectForContext, currentContext, preSelectedTargets);
			}
		}

		// Execute the Main Step (original or replacement)
		if (stepToExecute) { // stepToExecute could potentially be made null by a future modifier type
			// If the stepToExecute (which could be a replacement) itself cannot be modified,
			// this was implicitly handled if it became stepToExecute *from* a replacement modifier.
			// If originalStep was canBeModified: false, we wouldn't be here.
			// If replacementStep is canBeModified: false, AddStepBefore/After targeting *it* would be skipped in their own recursive calls.
			mainStepExecutedSuccessfully = await this.executeStepLogic(stepToExecute, sourceObjectForContext, currentContext, preSelectedTargets);
		}

		// Execute AddStepAfter Modifiers
		const addAfterModifiers = activeModifiers.filter(m => m.modifierType === ModifierType.AddStepAfter && m.additionalEffectStep);
		for (const modifier of addAfterModifiers) { // Assumes already sorted by priority
			if (stepHasBeenReplaced) {
				console.log(`[EffectProcessor] Skipping AddStepAfter modifier ${modifier.modifierId} as original step was replaced.`);
				continue;
			}
			if (modifier.additionalEffectStep) { // Extra check
				console.log(`[EffectProcessor] Executing AddStepAfter modifier ${modifier.modifierId} (Source: ${modifier.sourceObjectId}) after step ${stepToExecute.verb}.`);
				await this.resolveSingleStep(modifier.additionalEffectStep, sourceObjectForContext, currentContext, preSelectedTargets);
			}
		}

		currentContext._effectRuntimeValues[`step_${originalStep.verb}_processed`] = true; // Mark original step as processed
		currentContext._effectRuntimeValues[`step_${originalStep.verb}_did_execute`] = mainStepExecutedSuccessfully; // Reflects if the core logic (original or replacement) ran

		return mainStepExecutedSuccessfully; // Return success of the main executed step (original or replacement)
	}

	// This new method contains the original switch-case logic
	private async executeStepLogic(
		stepToExecute: IEffectStep,
		sourceObjectForContext: IGameObject | undefined | null,
		currentContext: any,
		preSelectedTargets?: any[]
	): Promise<boolean> {
		let verbExecutionSuccessful = true; // Assume success, specific verbs can set to false

		if (stepToExecute.isOptional && stepToExecute.canBeModified !== false) { // Re-check optional if it's a replacement step that's optional
			const controller = sourceObjectForContext?.controllerId || this.gsm.state.currentPlayerId;
			// If originalStep was optional and skipped, we wouldn't reach here for its logic.
			// This check is for if the stepToExecute (e.g. a replacement) is itself optional.
			const alreadyProcessedOptionalChoiceKey = `_optional_choice_made_for_${stepToExecute.verb}_${sourceObjectForContext?.objectId}`;
			if (!currentContext[alreadyProcessedOptionalChoiceKey]) { // Avoid re-prompting for the same optional replacement step
				const shouldExecute = await this.gsm.actionHandler.promptForOptionalStepChoice(controller, stepToExecute);
				currentContext[alreadyProcessedOptionalChoiceKey] = true; // Mark that choice has been made for this instance
				if (!shouldExecute) {
					console.log(`[EffectProcessor] Player ${controller} chose NOT to execute optional (replacement/modified) effect step: ${stepToExecute.verb}`);
					return false; // Optional step skipped
				}
			}
		}

		const targetsForThisStep = await this.resolveTargetsForStep(stepToExecute.targets, sourceObjectForContext, currentContext, preSelectedTargets, stepToExecute.parameters?.targetKey);

		console.log(
			`[EffectProcessor - executeStepLogic] Executing ${stepToExecute.verb} for source ${sourceObjectForContext?.name || 'system'}, targeting: ${targetsForThisStep.map(t => (isGameObject(t) ? t.name : t)).join(', ')}`
		);

		switch (stepToExecute.verb.toLowerCase()) {
			case 'choose_mode':
				verbExecutionSuccessful = await this.effectChooseMode(stepToExecute, sourceObjectForContext, currentContext, preSelectedTargets);
				break;
			case 'draw':
			case 'draw_cards':
				await this.effectDrawCards(stepToExecute, targetsForThisStep);
				break;
			case 'discard':
			case 'discard_cards':
				await this.effectDiscardCards(stepToExecute, targetsForThisStep);
				break;
			case 'resupply':
				await this.effectResupply(stepToExecute, targetsForThisStep);
				break;
			case 'move_forward':
				await this.effectMoveExpeditionForward(stepToExecute, targetsForThisStep);
				break;
			case 'move_backward':
				await this.effectMoveExpeditionBackward(stepToExecute, targetsForThisStep);
				break;
			case 'create_token':
				await this.effectCreateToken(stepToExecute, sourceObjectForContext, currentContext);
				break;
			case 'gainability':
				await this.effectGainAbility(stepToExecute, targetsForThisStep);
				break;
			case 'augment_counters': // Renamed from augmentcounter for consistency
			case 'augmentcounter':
				await this.effectAugmentCounters(stepToExecute, targetsForThisStep);
				break;
			case 'double_counters':
				await this.effectDoubleCounters(stepToExecute, targetsForThisStep);
				break;
			case 'exchange_boosts':
				await this.effectExchangeBoosts(stepToExecute, targetsForThisStep);
				break;
			case 'exchange_objects':
				await this.effectExchangeObjects(stepToExecute, targetsForThisStep);
				break;
			case 'exchange': // Generic exchange, might be deprecated for specific ones
				await this.effectExchange(stepToExecute, sourceObjectForContext, currentContext);
				break;
			case 'gain_counters':
				await this.effectGainCounters(stepToExecute, targetsForThisStep);
				break;
			case 'lose_counters':
				await this.effectLoseCounters(stepToExecute, targetsForThisStep);
				break;
			case 'spend_counters':
				verbExecutionSuccessful = await this.effectSpendCounters(stepToExecute, targetsForThisStep);
				break;
			case 'gain_status':
				await this.effectGainStatus(stepToExecute, targetsForThisStep);
				break;
			case 'lose_status':
				await this.effectLoseStatus(stepToExecute, targetsForThisStep);
				break;
			case 'put_in_zone':
			case 'move_to':
				await this.effectPutInZone(stepToExecute, targetsForThisStep);
				break;
			case 'ready':
				await this.effectReady(stepToExecute, targetsForThisStep);
				break;
			case 'exhaust':
				await this.effectExhaust(stepToExecute, targetsForThisStep);
				break;
			case 'sacrifice':
				await this.effectSacrifice(stepToExecute, targetsForThisStep);
				break;
			case 'set_characteristic':
				await this.effectSetCharacteristic(stepToExecute, targetsForThisStep);
				break;
			case 'modify_statistics':
				await this.effectModifyStatistics(stepToExecute, targetsForThisStep);
				break;
			case 'change_controller':
				await this.effectChangeController(stepToExecute, targetsForThisStep);
				break;
			case 'roll_die':
				await this.effectRollDie(stepToExecute, sourceObjectForContext, currentContext);
				break;
			case 'if_condition':
				verbExecutionSuccessful = await this.effectIfCondition(stepToExecute, sourceObjectForContext, currentContext, preSelectedTargets);
				break;
			case 'play_for_free':
				await this.effectPlayCardForFree(stepToExecute, sourceObjectForContext, currentContext);
				break;
			case 'switch_expedition':
				await this.effectSwitchExpedition(stepToExecute, targetsForThisStep);
				break;
			default:
				console.warn(`[EffectProcessor - executeStepLogic] Unknown effect verb: ${stepToExecute.verb}`);
				verbExecutionSuccessful = false;
		}
		return verbExecutionSuccessful;
	}

	private async effectChooseMode(step: IEffectStep, sourceObjectForContext: IGameObject | undefined | null, currentContext: any, preSelectedTargets?: any[]): Promise<boolean> {
		const controllerId = sourceObjectForContext?.controllerId || this.gsm.state.currentPlayerId;
		const modes = step.parameters?.modes as { [choiceKey: string]: IEffectStep[] } | undefined;
		const chooseCount = typeof step.parameters?.chooseCount === 'number' ? step.parameters.chooseCount : 1;
		const promptText = step.parameters?.prompt as string || 'Choose mode(s):';

		if (!modes || Object.keys(modes).length === 0) {
			console.warn('[EffectProcessor.effectChooseMode] No modes defined for CHOOSE_MODE verb.');
			return false;
		}

		const chosenModeKeys = await this.gsm.actionHandler.promptForModeChoice(
			controllerId,
			promptText,
			Object.keys(modes),
			chooseCount
		);

		if (chosenModeKeys.length === 0) {
			console.log(`[EffectProcessor.effectChooseMode] Player ${controllerId} chose no modes or choice was invalid.`);
			return false;
		}

		let allChosenModesAttempted = true;
		for (const modeKey of chosenModeKeys) {
			const modeSteps = modes[modeKey];
			if (modeSteps && modeSteps.length > 0) {
				console.log(`[EffectProcessor.effectChooseMode] Executing chosen mode: ${modeKey}`);
				const subEffect: IEffect = {
					steps: modeSteps,
					sourceObjectId: sourceObjectForContext?.objectId,
					_triggerPayload: currentContext._triggerPayload,
					_lkiSourceObject: sourceObjectForContext
				};
				await this.resolveEffect(subEffect, sourceObjectForContext, preSelectedTargets, currentContext);
			} else {
				console.warn(`[EffectProcessor.effectChooseMode] No steps found for chosen mode key: ${modeKey}`);
				allChosenModesAttempted = false;
			}
		}
		return allChosenModesAttempted;
	}

	private async effectDrawCards(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;
		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (playerId) {
				await this.gsm.drawCards(playerId, count);
			}
		}
	}

	private async effectDiscardCards(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;
		const specificCardIds = step.parameters?.cardIds as string[] | undefined;
		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (!playerId) continue;
			const player = this.gsm.getPlayer(playerId);
			if (!player) continue;
			const handCards = player.zones.handZone.getAll();
			const cardsToDiscard: (IGameObject | ICardInstance)[] = [];
			if (specificCardIds) {
				for (const cardId of specificCardIds) {
					const foundCard = handCards.find(c => (isGameObject(c) ? c.objectId : c.instanceId) === cardId);
					if (foundCard) cardsToDiscard.push(foundCard);
				}
			} else {
				cardsToDiscard.push(...handCards.slice(0, count));
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

	private async effectResupply(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;
		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (!playerId) continue;
			let resuppliedCount = 0;
			for (let i = 0; i < count; i++) {
				const cardMoved = await this.gsm.resupplyPlayer(playerId);
				if (cardMoved) resuppliedCount++; else break;
			}
			if (resuppliedCount > 0) {
				this.gsm.eventBus.publish('cardsResupplied', { playerId, count: resuppliedCount });
				console.log(`[EffectProcessor] Player ${playerId} resupplied ${resuppliedCount} cards.`);
			}
		}
	}

	private async effectMoveExpedition(step: IEffectStep, targets: (IGameObject | string)[], direction: 1 | -1): Promise<void> {
		if (this.gsm.state.tiebreakerMode) {
			console.log("[EffectProcessor] Cannot move expeditions during Tiebreaker Arena mode.");
			return;
		}
		const count = typeof step.parameters?.count === 'number' ? step.parameters.count : 1;
		const distance = count * direction;
		const targetExpeditionType = step.parameters?.targetExpeditionType as 'hero' | 'companion' | 'both' | undefined;

		for (const target of targets) {
			const playerId = typeof target === 'string' ? target : isGameObject(target) ? target.controllerId : null;
			if (!playerId) continue;
			const player = this.gsm.getPlayer(playerId);
			if (!player) continue;

			const maxPos = this.gsm.getAdventureMaxPosition();
			const adventureRegions = this.gsm.state.sharedZones.adventure.getAll();

			const moveSingleExpedition = (expType: 'hero' | 'companion') => {
				const expState = expType === 'hero' ? player.expeditionState.hero : player.expeditionState.companion;
				const oldPos = expState.position;
				expState.position = Math.max(0, Math.min(maxPos, expState.position + distance));

				if (expState.position !== oldPos) {
					console.log(`[EffectProcessor] Player ${playerId} ${expType} expedition moved by ${distance} to ${expState.position}.`);
					this.gsm.eventBus.publish('expeditionMoved', { playerId, type: expType, newPosition: expState.position, distance });
					// Reveal Tumult card if moving forward into its region
					if (direction > 0 && expState.position < adventureRegions.length) {
						const enteredRegion = adventureRegions[expState.position] as IGameObject; // Assuming regions are GameObjects
						if (enteredRegion && enteredRegion.type === CardType.Region && enteredRegion.subTypes?.includes('Tumult') && enteredRegion.faceDown) {
							enteredRegion.faceDown = false;
							this.gsm.eventBus.publish('tumultRevealed', { regionId: enteredRegion.objectId });
							console.log(`[EffectProcessor] Tumult card ${enteredRegion.name} at position ${expState.position} revealed.`);
						}
					}
				}
			};
			if (targetExpeditionType === 'hero' || targetExpeditionType === 'both' || !targetExpeditionType) {
				moveSingleExpedition('hero');
			}
			if (targetExpeditionType === 'companion' || targetExpeditionType === 'both' || !targetExpeditionType) {
				moveSingleExpedition('companion');
			}
		}
	}

	private async effectMoveExpeditionForward(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		await this.effectMoveExpedition(step, targets, 1);
	}

	private async effectMoveExpeditionBackward(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		await this.effectMoveExpedition(step, targets, -1);
	}

	private async effectCreateToken(step: IEffectStep, sourceObjectForContext: IGameObject | undefined | null, currentContext: any): Promise<void> {
		const tokenDefinitionId = step.parameters?.tokenDefinitionId as string;
		let destinationExpeditionType = step.parameters?.destinationExpeditionType as 'hero' | 'companion' | 'source_assigned_or_choice' | undefined;
		let controllerId = step.parameters?.controllerId as string | undefined;

		if (!controllerId && sourceObjectForContext) {
			controllerId = sourceObjectForContext.controllerId;
		} else if (!controllerId && currentContext.currentPlayerId) {
			controllerId = currentContext.currentPlayerId;
		} else if (!controllerId) {
			console.warn('[EffectProcessor] CreateToken: Controller ID not determined.');
			return;
		}

		if (!tokenDefinitionId) {
			console.error('[EffectProcessor] CreateToken: No tokenDefinitionId provided.');
			return;
		}

		const definition = this.gsm.getCardDefinition(tokenDefinitionId);
		if (!definition || definition.type !== CardType.Token) {
			console.error(`[EffectProcessor] CreateToken: Definition ID ${tokenDefinitionId} is not for a Token card type or definition missing.`);
			return;
		}

		const tokenObject = this.gsm.objectFactory.createCard(tokenDefinitionId, controllerId) as IGameObject; // createCard returns IGameObject
		if (!tokenObject) {
			console.error(`[EffectProcessor] Failed to create token object from definitionId: ${tokenDefinitionId} using createCard.`);
			return;
		}

		if (definition.subTypes?.includes('Character')) { // Assuming Character tokens go to expedition
			const playerController = this.gsm.getPlayer(controllerId);
			if (!playerController) {
				console.error(`[EffectProcessor] CreateToken: Controller ${controllerId} not found.`);
				return;
			}
			if (destinationExpeditionType && destinationExpeditionType !== 'source_assigned_or_choice') {
				tokenObject.expeditionAssignment = { playerId: controllerId, type: destinationExpeditionType };
			} else if (destinationExpeditionType === 'source_assigned_or_choice' && sourceObjectForContext) {
				const isSourceGigantic = sourceObjectForContext.currentCharacteristics.isGigantic === true;
				if (isSourceGigantic) {
					const chosenType = await this.gsm.actionHandler.promptForExpeditionChoice(controllerId, `Choose expedition for token ${tokenObject.name} from Gigantic source ${sourceObjectForContext.name}`);
					tokenObject.expeditionAssignment = { playerId: controllerId, type: chosenType };
				} else {
					const assignedType = sourceObjectForContext.expeditionAssignment?.type || 'hero';
					tokenObject.expeditionAssignment = { playerId: controllerId, type: assignedType };
				}
			} else {
				const chosenType = await this.gsm.actionHandler.promptForExpeditionChoice(controllerId, `Choose expedition for token ${tokenObject.name}`);
				tokenObject.expeditionAssignment = { playerId: controllerId, type: chosenType };
			}
			this.gsm.state.sharedZones.expedition.add(tokenObject);
			this.gsm.eventBus.publish('objectCreated', { object: tokenObject, zone: this.gsm.state.sharedZones.expedition });
			console.log(`[EffectProcessor] Created token ${tokenObject.name} (ID: ${tokenObject.objectId}) for player ${controllerId} in ${tokenObject.expeditionAssignment?.type} expedition.`);
		} else {
			// Handle other token types if they go to different zones or have no zone (e.g. Mana tokens if they are objects)
			console.warn(`[EffectProcessor] CreateToken: Token ${tokenObject.name} is not a Character token. Zone placement logic needed.`);
		}
	}

	private async effectGainAbility(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const abilityDefinition = step.parameters?.ability as any;
		if (!abilityDefinition) {
			console.warn('[EffectProcessor] effectGainAbility called without ability definition.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
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

	private async effectAugmentCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined;
		const amountToAugment = typeof step.parameters?.amount === 'number' ? step.parameters.amount : 1; // Default to augmenting by 1

		if (!counterType) {
			console.warn('[EffectProcessor] effectAugmentCounters called without counterType.');
			return;
		}
		if (amountToAugment <= 0) return;

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentCount = target.counters.get(counterType) || 0;
				if (currentCount > 0) {
					this.gsm.addCounters(target.objectId, counterType, amountToAugment);
				} else {
					console.log(`[EffectProcessor] Target ${target.name} does not have positive ${counterType} counter(s) to augment.`);
				}
			}
		}
	}

	private async effectDoubleCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined;
		if (!counterType) {
			console.warn('[EffectProcessor] effectDoubleCounters called without counterType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentCount = target.counters.get(counterType) || 0;
				if (currentCount > 0) {
					this.gsm.addCounters(target.objectId, counterType, currentCount);
				} else {
					console.log(`[EffectProcessor] Target ${target.name} has no ${counterType} counters to double.`);
				}
			}
		}
	}

	private async effectExchangeBoosts(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		if (targets.length !== 2 || !this.isTargetGameObject(targets[0]) || !this.isTargetGameObject(targets[1])) {
			console.warn('[EffectProcessor] effectExchangeBoosts requires exactly two game object targets.');
			return;
		}
		const charA = targets[0] as IGameObject;
		const charB = targets[1] as IGameObject;

		const boostA = charA.counters.get(CounterType.Boost) || 0;
		const boostB = charB.counters.get(CounterType.Boost) || 0;

		const totalBoost = boostA + boostB;
		const avgBoost = Math.floor(totalBoost / 2);
		// const remainder = totalBoost % 2; // Could be used if one char should get the extra

		const changeA = boostA - avgBoost; // Positive if A loses, negative if A gains
		const changeB = boostB - avgBoost; // Positive if B loses, negative if B gains

		if (changeA > 0) this.gsm.removeCounters(charA.objectId, CounterType.Boost, changeA);
		else if (changeA < 0) this.gsm.addCounters(charA.objectId, CounterType.Boost, -changeA);

		if (changeB > 0) this.gsm.removeCounters(charB.objectId, CounterType.Boost, changeB);
		else if (changeB < 0) this.gsm.addCounters(charB.objectId, CounterType.Boost, -changeB);

		console.log(`[EffectProcessor] Exchanged Boosts: ${charA.name} (now ${charA.counters.get(CounterType.Boost) || 0}), ${charB.name} (now ${charB.counters.get(CounterType.Boost) || 0})`);
	}

	private async effectExchangeObjects(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		// This is highly complex due to different zones, ownership, control, attachments.
		// Requires a robust GameStateManager.swapObjects(objA, objB) method.
		console.warn('[EffectProcessor] effectExchangeObjects is not fully implemented due to complexity.');
	}

	private async effectExchange(_step: IEffectStep, _sourceObjectForContext: IGameObject | undefined | null, _currentContext: any): Promise<void> {
		console.log(`[EffectProcessor] Generic Exchange not fully implemented.`);
	}

	private async effectGainCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined || CounterType.Boost;
		const amount = typeof step.parameters?.amount === 'number' ? step.parameters.amount : 1;
		if (amount <= 0) return;
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				this.gsm.addCounters(target.objectId, counterType, amount);
			}
		}
	}

	private async effectLoseCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const counterType = step.parameters?.counterType as CounterType | undefined || CounterType.Boost;
		const amount = typeof step.parameters?.amount === 'number' ? step.parameters.amount : 1;
		if (amount <= 0) return;
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				this.gsm.removeCounters(target.objectId, counterType, amount);
			}
		}
	}

	private async effectSpendCounters(step: IEffectStep, targets: (IGameObject | string)[]): Promise<boolean> {
		const counterType = step.parameters?.counterType as CounterType | undefined;
		const amount = typeof step.parameters?.amount === 'number' ? step.parameters.amount : 1;

		if (!counterType || amount <= 0) {
			console.warn('[EffectProcessor] effectSpendCounters: Invalid parameters for counterType or amount.');
			return false;
		}
		let allTargetsPaid = true;
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentAmount = target.counters.get(counterType) || 0;
				if (currentAmount >= amount) {
					this.gsm.removeCounters(target.objectId, counterType, amount);
				} else {
					console.warn(`[EffectProcessor] Target ${target.name} could not spend ${amount} of ${counterType}. Has ${currentAmount}.`);
					allTargetsPaid = false; // If any target cannot pay, the "spend" effect might behave differently based on rules (e.g., fails entirely or partially)
				}
			} else {
				allTargetsPaid = false; // Non-game object target cannot spend counters
			}
		}
		return allTargetsPaid; // Indicates if all targeted payments were successful
	}


	private async effectGainStatus(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const statusType = step.parameters?.statusType as StatusType | undefined;
		if (!statusType) {
			console.warn('[EffectProcessor] GainStatus effect called without statusType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (!target.statuses.has(statusType)) {
					this.gsm.statusHandler.applyStatusEffect(target, statusType);
				}
			}
		}
	}

	private async effectLoseStatus(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const statusType = step.parameters?.statusType as StatusType | undefined;
		if (!statusType) {
			console.warn('[EffectProcessor] LoseStatus effect called without statusType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (target.statuses.has(statusType)) {
					this.gsm.statusHandler.removeStatusEffect(target, statusType);
				}
			}
		}
	}

	private async effectPutInZone(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		let destinationZoneIdentifier = step.parameters?.destinationZoneIdentifier as ZoneIdentifier | 'source_expeditions_choice' | undefined;
		const sourceObjectForEffect = step.parameters?.sourceObjectForContextOverrideId ? this.gsm.getObject(step.parameters.sourceObjectForContextOverrideId as string) : null;

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
					zoneOwnerId = sourceObjectForEffect.controllerId;
					const isSourceGigantic = sourceObjectForEffect.currentCharacteristics.isGigantic === true;
					if (isSourceGigantic) {
						const chosenType = await this.gsm.actionHandler.promptForExpeditionChoice(zoneOwnerId, `Choose expedition for ${target.name} from Gigantic source ${sourceObjectForEffect.name}`);
						destZone = this.findZoneByType(zoneOwnerId, ZoneIdentifier.Expedition);
						target.expeditionAssignment = { playerId: zoneOwnerId, type: chosenType };
					} else {
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
					if (destZone.zoneType === ZoneIdentifier.Expedition && !target.expeditionAssignment && sourceObjectForEffect) {
                        target.expeditionAssignment = { playerId: zoneOwnerId, type: sourceObjectForEffect.expeditionAssignment?.type || 'hero' };
                    } else if (destZone.zoneType !== ZoneIdentifier.Expedition) {
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

	private async effectReady(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (target.statuses.has(StatusType.Exhausted)) {
					this.gsm.statusHandler.removeStatusEffect(target, StatusType.Exhausted);
				}
			}
		}
	}

	private async effectExhaust(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (!target.statuses.has(StatusType.Exhausted)) {
					this.gsm.statusHandler.applyStatusEffect(target, StatusType.Exhausted);
				}
			}
		}
	}

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
				this.gsm.moveEntity(target.objectId, currentZone, playerOwner.zones.discardPileZone, target.controllerId);
				this.gsm.eventBus.publish('objectSacrificed', { objectId: target.objectId, definitionId: target.definitionId, fromZoneId: currentZone.id });
				console.log(`[EffectProcessor] ${target.name} (controlled by ${target.controllerId}, owned by ${target.ownerId}) was sacrificed.`);
			}
		}
	}

	private async effectSetCharacteristic(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		const characteristic = step.parameters?.characteristic as string;
		const value = step.parameters?.value;
		if (!characteristic) {
			console.warn('[EffectProcessor] SetCharacteristic: "characteristic" parameter missing.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (!target.currentCharacteristics) {
					target.currentCharacteristics = { ...target.baseCharacteristics };
				}
				(target.currentCharacteristics as any)[characteristic] = value;
				this.gsm.eventBus.publish('characteristicSet', { targetId: target.objectId, characteristic, value });
				console.log(`[EffectProcessor] Set characteristic ${characteristic}=${value} for ${target.name}.`);
			}
		}
	}

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
				this.gsm.eventBus.publish('controllerChanged', { objectId: target.objectId, newControllerId, oldControllerId });
				console.log(`[EffectProcessor] Changed controller of ${target.name} from ${oldControllerId} to ${newControllerId}. (Zone change logic is TODO)`);
			}
		}
	}

	private async effectRollDie(step: IEffectStep, _sourceObjectForContext: IGameObject | undefined | null, currentContext: any): Promise<void> {
		const result = Math.floor(Math.random() * 6) + 1;
		const storeAs = step.parameters?.storeAs as string || 'lastDieRoll';
		if (currentContext && currentContext._effectRuntimeValues) {
			currentContext._effectRuntimeValues[storeAs] = result;
		} else {
			console.warn("[EffectProcessor] RollDie: Cannot store result, _effectRuntimeValues not on context.");
		}
		this.gsm.eventBus.publish('dieRolled', { result, storedAs: storeAs });
		console.log(`[EffectProcessor] Rolled a die: ${result}. Stored as "${storeAs}".`);
	}

	private async effectIfCondition(step: IEffectStep, sourceObjectForContext: IGameObject | undefined | null, currentContext: any, preSelectedTargets?: any[]): Promise<boolean> {
		const condition = step.parameters?.condition as any;
		const then_steps = step.parameters?.then_steps as IEffectStep[] | undefined;
		const else_steps = step.parameters?.else_steps as IEffectStep[] | undefined;

		if (!condition || !then_steps) {
			console.warn('[EffectProcessor] IfCondition: Invalid parameters. "condition" and "then_steps" are required.');
			return false;
		}

		let conditionMet = false;
		if (condition.type === 'compare_runtime_value' && currentContext._effectRuntimeValues) {
			const val1 = currentContext._effectRuntimeValues[condition.key];
			const val2 = condition.value;
			if (condition.operator === '>=' && val1 >= val2) conditionMet = true;
			else if (condition.operator === '<=' && val1 <= val2) conditionMet = true;
			else if (condition.operator === '>' && val1 > val2) conditionMet = true;
			else if (condition.operator === '<' && val1 < val2) conditionMet = true;
			else if (condition.operator === '===' && val1 === val2) conditionMet = true;
			else if (condition.operator === '!==' && val1 !== val2) conditionMet = true;
			else console.warn(`[EffectProcessor] IfCondition: Unknown operator ${condition.operator} for compare_runtime_value`);
		} else if (condition.type === 'check_step_execution' && currentContext._effectRuntimeValues) {
			const stepStatusKey = condition.key as string;
			if (currentContext._effectRuntimeValues[stepStatusKey] === condition.value) {
				conditionMet = true;
			}
		} else if (sourceObjectForContext && condition.type === 'zone_state_check') {
			const zoneSpecifier = condition.zone;
			const checkType = condition.check;
			let resultsFromAllContexts: boolean[] = [];
			let relevantContexts: { playerId: string, type: 'hero' | 'companion' }[] = [];

			if (zoneSpecifier === 'source_expeditions') {
				relevantContexts = this._getEffectiveExpeditionContexts(sourceObjectForContext, 'self');
			} else if (zoneSpecifier === 'source_hero_expedition' && sourceObjectForContext) {
				relevantContexts.push({playerId: sourceObjectForContext.controllerId, type: 'hero'});
			} else if (zoneSpecifier === 'source_companion_expedition' && sourceObjectForContext) {
				relevantContexts.push({playerId: sourceObjectForContext.controllerId, type: 'companion'});
			}

			if (relevantContexts.length > 0) {
				for (const ctx of relevantContexts) {
					const singleContextResult = this.evaluateSingleZoneCondition(ctx, checkType, condition);
					resultsFromAllContexts.push(singleContextResult);
				}
				conditionMet = resultsFromAllContexts.length > 0 && resultsFromAllContexts.every(r => r === true);
			} else {
				conditionMet = false;
			}
		} else {
			console.warn(`[EffectProcessor] IfCondition: Unknown condition type "${condition.type}" or missing runtime/source context.`);
		}

		const stepsToExecute = conditionMet ? then_steps : else_steps;
		let branchExecuted = false;
		if (stepsToExecute && stepsToExecute.length > 0) {
			console.log(`[EffectProcessor] IfCondition: Condition was ${conditionMet ? 'MET' : 'NOT MET'}. Executing ${conditionMet ? 'THEN' : 'ELSE'} branch.`);
			const subEffect: IEffect = {
				steps: stepsToExecute,
				sourceObjectId: sourceObjectForContext?.objectId,
				_triggerPayload: currentContext,
				_lkiSourceObject: sourceObjectForContext
			};
			await this.resolveEffect(subEffect, sourceObjectForContext, preSelectedTargets, currentContext);
			branchExecuted = true;
		} else {
			console.log(`[EffectProcessor] IfCondition: Condition was ${conditionMet ? 'MET' : 'NOT MET'}. No steps in chosen branch or chosen branch is empty.`);
		}
		return branchExecuted;
	}

	private async effectPlayCardForFree(step: IEffectStep, sourceObjectForContext: IGameObject | undefined | null, currentContext: any): Promise<void> {
		const cardId = step.parameters?.cardId as string; // instanceId or objectId
		const fromZoneIdentifier = step.parameters?.fromZone as ZoneIdentifier;
		const playerId = step.parameters?.playerId as string || sourceObjectForContext?.controllerId || currentContext?.currentPlayerId;

		if (!cardId || !fromZoneIdentifier || !playerId) {
			console.warn('[EffectProcessor.effectPlayCardForFree] Missing parameters: cardId, fromZoneIdentifier, or playerId.');
			return;
		}
		// Additional parameters for playCard like selectedExpeditionType, targets might need to be passed or determined.
		// For simplicity, assuming no complex targeting or expedition choice needed for the free play here.
		await this.gsm.cardPlaySystem.playCard(playerId, cardId, fromZoneIdentifier, undefined, undefined, undefined, 0); // Pass 0 for scoutRawCost to imply free
		console.log(`[EffectProcessor] Player ${playerId} playing card ${cardId} from ${fromZoneIdentifier} for free.`);
	}

	private evaluateSingleZoneCondition(
		context: { playerId: string, type: 'hero' | 'companion' },
		checkType: string,
		conditionParams: any
	): boolean {
		console.warn(`[EffectProcessor.evaluateSingleZoneCondition] Placeholder for: checking ${checkType} in ${context.type} of ${context.playerId} with params ${JSON.stringify(conditionParams)} - returning false by default.`);
		return false;
	}

	private async effectSwitchExpedition(step: IEffectStep, targets: (IGameObject | string)[]): Promise<void> {
		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				if (target.type !== CardType.Character) {
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
					target.expeditionAssignment.type = newAssignment;
					console.log(`[EffectProcessor] Gigantic character ${target.name} (ID: ${target.objectId}) switched its primary expedition assignment from ${oldAssignment} to ${newAssignment}. This does not trigger leave/join events for the Gigantic character itself.`);
					this.gsm.eventBus.publish('giganticAssignmentSwitched', { objectId: target.objectId, newAssignmentType: newAssignment, oldAssignmentType: oldAssignment });
				} else {
					target.expeditionAssignment.type = newAssignment;
					console.log(`[EffectProcessor] Non-Gigantic character ${target.name} (ID: ${target.objectId}) switched expedition assignment from ${oldAssignment} to ${newAssignment}. TODO: Implement full leave/join trigger logic if distinct from assignment change.`);
					this.gsm.eventBus.publish('expeditionAssignmentSwitched', { objectId: target.objectId, newAssignmentType: newAssignment, oldAssignmentType: oldAssignment });
				}
			}
		}
	}

	private isTargetGameObject(
		target: IGameObject | string | undefined | null
	): target is IGameObject {
		return typeof target === 'object' && target !== null && 'objectId' in target;
	}

	private getValueFromPath(obj: unknown, path: string): unknown {
		if (!obj || typeof obj !== 'object' && typeof obj !== 'function') return undefined;
		if (path.includes('__proto__') || path.includes('constructor') || path.includes('prototype')) {
			return undefined;
		}
		const properties = path.split('.');
		return properties.reduce((prev, curr) => (prev && typeof prev === 'object' && prev[curr] !== undefined) ? prev[curr] : undefined, obj);
	}

	private async resolveTargetsForStep(
		targetSpec: unknown,
		sourceObjectForContext: IGameObject | undefined | null,
		currentContext: any,
		preSelectedTargets?: any[],
		targetKey?: string
	): Promise<(IGameObject | string)[]> {
		if (!targetSpec) return [];

		if (targetKey && preSelectedTargets && preSelectedTargets.length > 0) {
			const specificTarget = preSelectedTargets.find(t => t.targetId === targetKey || t.key === targetKey);
			if (specificTarget && specificTarget.objectId) {
				const obj = this.gsm.getObject(specificTarget.objectId);
				return obj ? [obj] : [];
			} else if (specificTarget) {
				return [specificTarget.objectId];
			}
		}
		if (preSelectedTargets && preSelectedTargets.length > 0 && typeof targetSpec !== 'string') {
			return preSelectedTargets.map(t => {
				if (t.objectId) {
					const obj = this.gsm.getObject(t.objectId);
					return obj ? obj : t.objectId;
				}
				return t;
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
						return opponents;
					}
					return [];
				default:
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
				case 'from_trigger':
					if (spec.path && currentContext) {
						const value = this.getValueFromPath(currentContext, spec.path);
						if (value === undefined) {
							console.warn(`[EffectProcessor] Path '${spec.path}' yielded undefined from context:`, currentContext);
							return [];
						}
						const items = Array.isArray(value) ? value : [value];
						return items.map(item => {
							if (typeof item === 'string') {
								const objItem = this.gsm.getObject(item);
								return objItem ? objItem : item;
							} else if (this.isTargetGameObject(item)) {
								return item;
							}
							console.warn(`[EffectProcessor] fromTrigger: Unhandled item type from path ${spec.path}:`, item);
							return null;
						}).filter(item => item !== null) as (IGameObject | string)[];
					}
					console.warn('[EffectProcessor] "fromTrigger" target type requires a path and active context.');
					return [];
				case 'objects_matching_criteria':
				case 'select':
					// console.log(`[EffectProcessor] Complex target selection for type '${spec.type}' with criteria '${JSON.stringify(spec.criteria)}'.`);
					if (sourceObjectForContext && spec.criteria?.zone === 'self_hero_expedition' && spec.criteria?.cardType === CardType.Character) {
						return this.gsm.getObjectsInExpedition(sourceObjectForContext.controllerId, 'hero')
							.filter(obj => obj.type === CardType.Character);
					}
					if (sourceObjectForContext && spec.criteria?.zone === 'self_companion_expedition' && spec.criteria?.cardType === CardType.Character) {
						return this.gsm.getObjectsInExpedition(sourceObjectForContext.controllerId, 'companion')
							.filter(obj => obj.type === CardType.Character);
					}

					if (sourceObjectForContext && spec.criteria?.zone) {
						const targetCardType = spec.criteria.cardType as CardType | undefined;
						let resolvedTargets: IGameObject[] = [];
						let contexts: { playerId: string, type: 'hero' | 'companion' }[] = [];

						if (spec.criteria.zone === 'source_expeditions') { // Player's own hero and/or companion based on source
							contexts = this._getEffectiveExpeditionContexts(sourceObjectForContext, 'self');
						} else if (spec.criteria.zone === 'opposing_expeditions_to_source') { // Opponent's expeditions relative to source
							contexts = this._getEffectiveExpeditionContexts(sourceObjectForContext, 'opponent');
						} else if (spec.criteria.zone === 'all_expeditions') { // All expeditions of all players
							this.gsm.getPlayerIds().forEach(pid => {
								contexts.push({ playerId: pid, type: 'hero' });
								contexts.push({ playerId: pid, type: 'companion' });
							});
						}
						// Add more specific zone contexts if needed, e.g., 'controller_hero_expedition'

						for (const ctx of contexts) {
							const objectsInExpedition = this.gsm.getObjectsInExpedition(ctx.playerId, ctx.type);
							objectsInExpedition.forEach(obj => {
								if (!targetCardType || obj.type === targetCardType) {
									// Ensure not to add duplicates if a Gigantic character matches multiple contexts
									if (!resolvedTargets.some(rt => rt.objectId === obj.objectId)) {
										resolvedTargets.push(obj);
									}
								}
							});
						}
						if (contexts.length > 0) {
							// TODO: Further filtering based on spec.criteria (e.g. specific keywords, stats, etc.)
							// For now, just returning based on zone and card type.
							return resolvedTargets;
						}
					}

					// Fallback for unhandled or more complex criteria
					console.warn(`[EffectProcessor] Complex target selection for type '${spec.type}' with criteria '${JSON.stringify(spec.criteria)}' requires player choice or more specific unhandled logic.`);
					return [];
				default:
					console.warn(`[EffectProcessor] Unknown target object type: ${spec.type}`);
					return [];
			}
		}
		if (Array.isArray(targetSpec)) {
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

	private findZoneByType(playerIdForContext: string, zoneType: ZoneIdentifier): IZone | null {
		const player = this.gsm.getPlayer(playerIdForContext);
		switch (zoneType) {
			case ZoneIdentifier.Hand: return player?.zones.handZone || null;
			case ZoneIdentifier.Deck: return player?.zones.deckZone || null;
			case ZoneIdentifier.DiscardPile: return player?.zones.discardPileZone || null;
			case ZoneIdentifier.Mana: return player?.zones.manaZone || null;
			case ZoneIdentifier.Reserve: return player?.zones.reserveZone || null;
			case ZoneIdentifier.Landmark: return player?.zones.landmarkZone || null;
			case ZoneIdentifier.Hero: return player?.zones.heroZone || null;
			case ZoneIdentifier.Expedition: return this.gsm.state.sharedZones.expedition;
			case ZoneIdentifier.Limbo: return this.gsm.state.sharedZones.limbo;
			case ZoneIdentifier.Adventure: return this.gsm.state.sharedZones.adventure;
			default:
				console.warn(`[EffectProcessor] Unknown or unhandled zone type for findZoneByType: ${zoneType}`);
				return null;
		}
	}

	private async shouldExecuteOptionalEffect(step: IEffectStep, currentContext: any): Promise<boolean> {
		const controllerId = (currentContext.sourceObjectForContext as IGameObject)?.controllerId || this.gsm.state.currentPlayerId;
		return await this.gsm.actionHandler.promptForOptionalStepChoice(controllerId, step);
	}

	public resetPendingEffects(): void {
		this.pendingEffects = [];
		console.log('[EffectProcessor] Reset pending effects queue');
	}

	public async resolvePendingEffects(): Promise<void> {
		console.log(`[EffectProcessor] Resolving ${this.pendingEffects.length} pending effects`);
		const effectsToResolve = [...this.pendingEffects];
		this.pendingEffects = [];
		for (const effect of effectsToResolve) {
			await this.resolveEffect(effect);
		}
	}

	public addPendingEffect(effect: IEffect): void {
		this.pendingEffects.push(effect);
		console.log(`[EffectProcessor] Added pending effect, queue size: ${this.pendingEffects.length}`);
	}

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
				const assignedType = sourceObject.expeditionAssignment?.type;
				if (assignedType) {
					contexts.push({ playerId: sourceControllerId, type: assignedType });
				} else {
					console.warn(`[EffectProcessor._getEffectiveExpeditionContexts] Non-Gigantic source ${sourceObject.name} in expedition has no specific assignment. Defaulting to 'hero'.`);
					contexts.push({ playerId: sourceControllerId, type: 'hero' });
				}
			}
		} else {
			const opponents = this.gsm.getPlayerIds().filter(pid => pid !== sourceControllerId);
			for (const opponentId of opponents) {
				if (isSourceGigantic) {
					contexts.push({ playerId: opponentId, type: 'hero' });
					contexts.push({ playerId: opponentId, type: 'companion' });
				} else {
					const assignedType = sourceObject.expeditionAssignment?.type;
					if (assignedType) {
						contexts.push({ playerId: opponentId, type: assignedType });
					} else {
						contexts.push({ playerId: opponentId, type: 'hero' });
						contexts.push({ playerId: opponentId, type: 'companion' });
					}
				}
			}
		}
		return contexts;
	}
}
