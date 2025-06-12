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
	public async resolveEffect(effect: IEffect, optionalCasterObject?: IGameObject): Promise<void> {
		const sourceIdForLog = effect.sourceObjectId || optionalCasterObject?.id || 'unknown source';
		console.log(
			`[EffectProcessor] Resolving effect from ${sourceIdForLog} with ${effect.steps.length} steps. Trigger: ${effect._triggerPayload ? JSON.stringify(effect._triggerPayload) : 'none'}`
		);

		this.currentTriggerPayload = effect._triggerPayload || null;

		let sourceObjectForContext: IGameObject | undefined | null = undefined;

		if (effect._lkiSourceObject) {
			// If LKI is present on the effect (common for reactions from emblems),
			// it should often be the primary context, especially if the reaction
			// refers to the state of the object as it triggered.
			console.log(`[EffectProcessor] Prioritizing LKI for source object context: ${effect._lkiSourceObject.name} (ID: ${effect._lkiSourceObject.objectId})`);
			sourceObjectForContext = effect._lkiSourceObject as IGameObject; // Treat LKI as the context
		} else if (optionalCasterObject) {
			// If no LKI on effect, but an optionalCasterObject was passed (e.g. for a spell directly cast by an object)
			sourceObjectForContext = optionalCasterObject;
		} else if (effect.sourceObjectId) {
			// If no LKI and no optionalCasterObject, try to find the live object by ID
			// This is relevant for effects that are not from emblems or where LKI wasn't captured.
			const liveSourceObject = this.gsm.getObject(effect.sourceObjectId);
			if (liveSourceObject) {
				sourceObjectForContext = liveSourceObject;
			} else {
				console.warn(`[EffectProcessor] Live source object ${effect.sourceObjectId} not found, and no LKI or optionalCasterObject provided for ${sourceIdForLog}.`);
			}
		}
		// At this point, sourceObjectForContext might still be undefined if no context could be established.
		// Effect steps need to be robust to this.

		try {
			for (const step of effect.steps) {
				try {
					await this.resolveEffectStep(step, sourceObjectForContext);
				} catch (error) {
					console.error(
						`[EffectProcessor] Error resolving step ${JSON.stringify(step)} for effect from ${sourceIdForLog}:`,
						error
					);
				}
			}
		} finally {
			this.currentTriggerPayload = null;
		}
	}

	/**
	 * Resolves a single effect step based on its verb
	 */
	private async resolveEffectStep(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		// Skip optional effects if conditions not met
		if (step.isOptional && !this.shouldExecuteOptionalEffect(step)) {
			console.log(`[EffectProcessor] Skipping optional effect: ${step.verb}`);
			return;
		}

		console.log(
			`[EffectProcessor] Executing ${step.verb} for source ${sourceObjectForContext?.name || 'system'}`
		);

		switch (step.verb.toLowerCase()) {
			case 'draw':
				await this.effectDraw(step, sourceObjectForContext);
				break;
			case 'discard':
				await this.effectDiscard(step, sourceObjectForContext);
				break;
			case 'resupply':
				await this.effectResupply(step, sourceObjectForContext);
				break;
			case 'moveforward':
			case 'move_forward':
				await this.effectMoveForward(step, sourceObjectForContext);
				break;
			case 'movebackward':
			case 'move_backward':
				await this.effectMoveBackward(step, sourceObjectForContext);
				break;
			case 'create':
				await this.effectCreate(step, sourceObjectForContext);
				break;
			case 'gainability': // New verb for the old "augment" functionality
				await this.effectGainAbility(step, sourceObjectForContext);
				break;
			case 'augmentcounter': // New verb for augmenting counters as per Rule 7.3.3
				await this.effectAugmentCounters(step, sourceObjectForContext);
				break;
			case 'augment': // Deprecated: Keep temporarily to catch old usage
				console.warn(
					"[EffectProcessor] Deprecated verb 'augment' used. Use 'gainability' for adding abilities or 'augmentcounter' for counters."
				);
				// Optionally, you could still call the old logic or a specific version:
				// await this.effectGainAbility(step, sourceObjectForContext);
				break;
			case 'exchange':
				await this.effectExchange(step, sourceObjectForContext);
				break;
			case 'gaincounter':
			case 'gain_counter':
				await this.effectGainCounter(step, sourceObjectForContext);
				break;
			case 'losecounter':
			case 'lose_counter':
				await this.effectLoseCounter(step, sourceObjectForContext);
				break;
			case 'gainstatus':
			case 'gain_status':
				await this.effectGainStatus(step, sourceObjectForContext);
				break;
			case 'losestatus':
			case 'lose_status':
				await this.effectLoseStatus(step, sourceObjectForContext);
				break;
			case 'moveto':
			case 'move_to':
				await this.effectMoveTo(step, sourceObjectForContext);
				break;
			case 'ready':
				await this.effectReady(step, sourceObjectForContext);
				break;
			case 'exhaust':
				await this.effectExhaust(step, sourceObjectForContext);
				break;
			default:
				console.warn(`[EffectProcessor] Unknown effect verb: ${step.verb}`);
		}
	}

	/**
	 * Rule 7.3.1 - Draw: Each player draws cards equal to the number specified
	 */
	private async effectDraw(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const count = step.parameters?.count || 1;

		for (const target of targets) {
			if (typeof target === 'string') {
				// Target is a player ID
				await this.gsm.drawCards(target, count);
				console.log(`[EffectProcessor] Player ${target} drew ${count} cards`);
			}
		}
	}

	/**
	 * Rule 7.3.2 - Discard: Players discard specified cards
	 */
	private async effectDiscard(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const count = step.parameters?.count || 1;

		for (const target of targets) {
			if (typeof target === 'string') {
				const player = this.gsm.getPlayer(target);
				if (!player) continue;

				// Discard cards from hand
				const handCards = player.zones.hand.getAll().slice(0, count);
				for (const card of handCards) {
					const cardId = isGameObject(card) ? card.objectId : card.instanceId;
					this.gsm.moveEntity(cardId, player.zones.hand, player.zones.discardPileZone, target);
				}
				console.log(`[EffectProcessor] Player ${target} discarded ${handCards.length} cards`);
			}
		}
	}

	/**
	 * Rule 7.3.3 - Resupply: Move cards from discard pile to reserve
	 */
	private async effectResupply(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const count = step.parameters?.count || 1;

		for (const target of targets) {
			if (typeof target === 'string') { // Target is a player ID
				const player = this.gsm.getPlayer(target);
				if (!player) continue;

				let cardsResuppliedCount = 0;
				for (let i = 0; i < count; i++) {
					// Assume player.zones.deckZone is of type DeckZone which has removeTop, addBottom, shuffle
					const deckZone = player.zones.deckZone as import('./Zone').DeckZone;
					const discardPile = player.zones.discardPileZone;

					if (deckZone.getCount() === 0) {
						if (discardPile.getCount() > 0) {
							const discardedCards = discardPile.getAll();
							discardPile.clear();

							const cardsToReshuffle = discardedCards.map(entity => {
								if (isGameObject(entity)) {
									// Convert IGameObject from discard back to ICardInstance for deck
									return this.gsm.objectFactory.createCardInstance(entity.definitionId, entity.ownerId);
								}
								// Should already be ICardInstance if somehow there, or could be an error/unexpected type
								return entity as import('./types/cards').ICardInstance;
							});

							deckZone.addBottom(cardsToReshuffle);
							deckZone.shuffle();
							console.log(`[EffectProcessor] Player ${target} shuffled discard into deck for Resupply.`);
						}
					}

					if (deckZone.getCount() > 0) {
						// Get the top card's instanceId without removing it yet.
						// moveEntity will handle the removal from deckZone.
						// DeckZone.getAll() should maintain order, [0] is top.
						const allDeckInstances = deckZone.getAll() as import('./types/cards').ICardInstance[];
						const cardToMoveInstance = allDeckInstances[0];

						if (cardToMoveInstance && cardToMoveInstance.instanceId) {
							this.gsm.moveEntity(
								cardToMoveInstance.instanceId,
								deckZone,
								player.zones.reserveZone,
								target
							);
							cardsResuppliedCount++;
						} else {
							// This case implies deckZone had a card, but it was invalid or lacked instanceId.
							console.warn(`[EffectProcessor] Resupply: Deck top card was invalid or missing instanceId for player ${target}.`);
							break; // Stop trying to resupply for this player if deck state is unexpected.
						}
					} else {
						// Deck and discard were empty, or became empty
						console.log(`[EffectProcessor] Player ${target} has no more cards in Deck or Discard to Resupply.`);
						break;
					}
				}
				if (cardsResuppliedCount > 0) {
					console.log(`[EffectProcessor] Player ${target} resupplied ${cardsResuppliedCount} cards from Deck to Reserve.`);
				}
			}
		}
	}

	/**
	 * Rule 7.3.4 - Move Forward: Expeditions move forward
	 */
	private async effectMoveForward(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const distance = step.parameters?.distance || 1;

		for (const target of targets) {
			if (typeof target === 'string') {
				const player = this.gsm.getPlayer(target);
				if (!player) continue;

				// Move both expeditions forward
				player.heroExpedition.position += distance;
				player.companionExpedition.position += distance;
				console.log(`[EffectProcessor] Player ${target} expeditions moved forward ${distance}`);
			}
		}
	}

	/**
	 * Rule 7.3.5 - Move Backward: Expeditions move backward
	 */
	private async effectMoveBackward(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const distance = step.parameters?.distance || 1;

		for (const target of targets) {
			if (typeof target === 'string') {
				const player = this.gsm.getPlayer(target);
				if (!player) continue;

				// Move both expeditions backward (minimum 0)
				player.heroExpedition.position = Math.max(0, player.heroExpedition.position - distance);
				player.companionExpedition.position = Math.max(
					0,
					player.companionExpedition.position - distance
				);
				console.log(`[EffectProcessor] Player ${target} expeditions moved backward ${distance}`);
			}
		}
	}

	/**
	 * Rule 7.3.6 - Create: Create tokens or emblems
	 */
	private async effectCreate(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		// const tokenType = step.parameters?.tokenType || 'Character'; // More specific: definitionId
		const count = step.parameters?.count || 1;
		const definitionId = step.parameters?.definitionId; // This is crucial

		if (!definitionId) {
			console.warn('[EffectProcessor] Create effect called without definitionId.');
			return;
		}

		for (const target of targets) {
			if (typeof target === 'string') {
				const player = this.gsm.getPlayer(target);
				if (!player) continue;

				// TODO: Create token objects
				console.log(`[EffectProcessor] Created ${count} tokens (${definitionId}) for ${target}`);
			}
		}
	}

	/**
	 * Old "Augment" - Rule 7.3.7 (now renamed) - Give objects new abilities
	 */
	private async effectGainAbility(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const ability = step.parameters?.ability; // This should be a full IAbility object

		if (!ability) {
			console.warn('[EffectProcessor] effectGainAbility called without ability.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target) && ability) {
				target.abilities.push(ability);
				console.log(`[EffectProcessor] Target ${target.name} gained new ability via effectGainAbility.`);
			}
		}
	}

	/**
	 * Rule 7.3.3 - Augment (Counters): Increment an existing counter on an object.
	 * "To Augment a counter means to add 1 to a counter an object already has."
	 */
	private async effectAugmentCounters(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const counterType = step.parameters?.counterType as CounterType | undefined;

		if (!counterType) {
			console.warn('[EffectProcessor] effectAugmentCounters called without counterType.');
			return;
		}

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentCount = target.counters.get(counterType);
				if (currentCount !== undefined && currentCount > 0) {
					target.counters.set(counterType, currentCount + 1);
					console.log(
						`[EffectProcessor] Target ${target.name} augmented ${counterType} counter to ${currentCount + 1}.`
					);
				} else {
					console.log(
						`[EffectProcessor] Target ${target.name} does not have (or has 0) ${counterType} counter(s) to augment.`
					);
				}
			}
		}
	}

	/**
	 * Rule 7.3.8 - Exchange: Swap objects between zones
	 */
	private async effectExchange(
		_step: IEffectStep,
		_sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		// TODO: Implement object exchange logic based on parameters (e.g., targetA, targetB, zoneA, zoneB)
		console.log(`[EffectProcessor] Exchange not fully implemented`);
	}

	/**
	 * Gain Counter: Add counters to objects
	 */
	private async effectGainCounter(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const counterType = step.parameters?.counterType || CounterType.Boost;
		const amount = step.parameters?.amount || 1;

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const current = target.counters.get(counterType) || 0;
				target.counters.set(counterType, current + amount);
				console.log(`[EffectProcessor] ${target.name} gained ${amount} ${counterType} counters`);
			}
		}
	}

	/**
	 * Lose Counter: Remove counters from objects
	 */
	private async effectLoseCounter(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const counterType = step.parameters?.counterType || CounterType.Boost;
		const amount = step.parameters?.amount || 1;

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const current = target.counters.get(counterType) || 0;
				target.counters.set(counterType, Math.max(0, current - amount));
				console.log(`[EffectProcessor] ${target.name} lost ${amount} ${counterType} counters`);
			}
		}
	}

	/**
	 * Gain Status: Add status effects to objects
	 */
	private async effectGainStatus(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const statusType = step.parameters?.statusType;
		if (!statusType) {
			console.warn('[EffectProcessor] GainStatus effect called without statusType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target) && statusType) {
				target.statuses.add(statusType);
				console.log(`[EffectProcessor] ${target.name} gained ${statusType} status`);
			}
		}
	}

	/**
	 * Lose Status: Remove status effects from objects
	 */
	private async effectLoseStatus(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const statusType = step.parameters?.statusType;
		if (!statusType) {
			console.warn('[EffectProcessor] LoseStatus effect called without statusType.');
			return;
		}
		for (const target of targets) {
			if (this.isTargetGameObject(target) && statusType) {
				target.statuses.delete(statusType);
				console.log(`[EffectProcessor] ${target.name} lost ${statusType} status`);
			}
		}
	}

	/**
	 * Move To: Move objects to specified zones
	 */
	private async effectMoveTo(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);
		const destinationZoneType = step.parameters?.zone as ZoneIdentifier;

		if (!destinationZoneType) {
			console.warn('[EffectProcessor] MoveTo effect called without destination zone type.');
			return;
		}

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				const currentZone = this.gsm.findZoneOfObject(target.objectId);
				// Determine target player for zone context. If 'self' was resolved to an object, use its controller.
				// If target is a player ID (e.g. from 'controller' target), use that.
				// Fallback to the target's own controller if it's an object.
				const zoneOwnerId = typeof target === 'string' ? target : target.controllerId;

				const destZone = this.findZoneByType(zoneOwnerId, destinationZoneType);

				if (currentZone && destZone) {
					this.gsm.moveEntity(target.objectId, currentZone, destZone, target.controllerId); // Movement uses object's controller for ownership context
					console.log(`[EffectProcessor] Moved ${target.name} to ${destinationZoneType}`);
				}
			}
		}
	}

	/**
	 * Ready: Remove Exhausted status
	 */
	private async effectReady(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				target.statuses.delete(StatusType.Exhausted);
				console.log(`[EffectProcessor] ${target.name} became ready`);
			}
		}
	}

	/**
	 * Exhaust: Add Exhausted status
	 */
	private async effectExhaust(
		step: IEffectStep,
		sourceObjectForContext?: IGameObject | null
	): Promise<void> {
		const targets = this.resolveTargets(step.targets, sourceObjectForContext);

		for (const target of targets) {
			if (this.isTargetGameObject(target)) {
				target.statuses.add(StatusType.Exhausted);
				console.log(`[EffectProcessor] ${target.name} became exhausted`);
			}
		}
	}

	/**
	 * Type guard to check if a target is a game object
	 */
	private isTargetGameObject(
		target: IGameObject | string | undefined | null
	): target is IGameObject {
		return typeof target === 'object' && target !== null && 'objectId' in target;
	}

	/**
	 * Helper to get a value from a nested object using a dot-separated path.
	 * Example: getValueFromPath(payload, 'object.id')
	 */
	private getValueFromPath(obj: unknown, path: string): unknown {
		if (!obj || typeof obj !== 'object') return undefined;
		const properties = path.split('.');
		return properties.reduce((prev, curr) => prev && prev[curr], obj);
	}

	/**
	 * Resolves effect targets based on target specification
	 */
	private resolveTargets(
		targets: unknown,
		sourceObjectForContext?: IGameObject | null
	): (IGameObject | string)[] {
		if (!targets) return [];

		if (typeof targets === 'string') {
			switch (targets.toLowerCase()) {
				case 'self':
					return sourceObjectForContext ? [sourceObjectForContext] : [];
				case 'controller':
					return sourceObjectForContext ? [sourceObjectForContext.controllerId] : [];
				// TODO: Add 'opponent', 'all_players', 'all_objects_in_zone' etc.
				default: {
					// Assume it might be a specific objectId or playerId if it's a string not matching keywords
					const objById = this.gsm.getObject(targets);
					if (objById) return [objById];
					// Could be a player ID if not an object ID
					if (this.gsm.getPlayer(targets)) return [targets];
					console.warn(
						`[EffectProcessor] Unresolved string target that is not 'self', 'controller', a known object ID, or a player ID: ${targets}`
					);
					return [];
				}
			}
		}

		if (typeof targets === 'object' && targets.type) {
			switch (targets.type.toLowerCase()) {
				case 'fromtrigger':
					if (targets.path && this.currentTriggerPayload) {
						const value = this.getValueFromPath(this.currentTriggerPayload, targets.path);
						if (value === undefined) {
							console.warn(
								`[EffectProcessor] Path '${targets.path}' yielded undefined from trigger payload:`,
								this.currentTriggerPayload
							);
							return [];
						}
						if (typeof value === 'string') {
							// Assume it's an ID
							const objFromPayloadId = this.gsm.getObject(value);
							return objFromPayloadId ? [objFromPayloadId] : [value]; // Return ID if object not found, could be player ID
						} else if (this.isTargetGameObject(value)) {
							// If payload directly contains an object
							return [value];
						} else if (Array.isArray(value)) {
							// If payload path points to an array of items
							return value
								.map((item) => {
									if (typeof item === 'string') {
										const objItem = this.gsm.getObject(item);
										return objItem ? objItem : item;
									} else if (this.isTargetGameObject(item)) {
										return item;
									}
									return null;
								})
								.filter((item) => item !== null) as (IGameObject | string)[];
						}
						console.warn(
							`[EffectProcessor] Unhandled value type from trigger payload path ${targets.path}:`,
							value
						);
						return [];
					}
					console.warn(
						'[EffectProcessor] "fromTrigger" target type requires a path and active trigger payload.'
					);
					return [];
				case 'select': // Placeholder for more complex selections
					console.log(
						`[EffectProcessor] Complex target selection for type '${targets.type}' with criteria '${targets.criteria}' not yet fully implemented.`
					);
					// This would involve player choice, filtering objects based on criteria (e.g. targets.criteria)
					return [];
				default:
					console.warn(`[EffectProcessor] Unknown target object type: ${targets.type}`);
					return [];
			}
		}

		// If targets is an array, assume it's an array of IDs or IGameObjects
		if (Array.isArray(targets)) {
			return targets
				.map((t) => {
					if (typeof t === 'string') {
						const obj = this.gsm.getObject(t);
						return obj ? obj : t; // Return ID if not found (could be player ID)
					}
					return t;
				})
				.filter((t) => t !== null && t !== undefined) as (IGameObject | string)[];
		}

		console.warn('[EffectProcessor] Unresolved target specification:', targets);
		return [];
	}

	/**
	 * Finds a zone by type for a player
	 */
	private findZoneByType(playerId: string, zoneType: ZoneIdentifier): IZone | null {
		// Return type should be IZone | null
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			console.warn(`[EffectProcessor] Player not found for findZoneByType: ${playerId}`);
			return null;
		}

		switch (zoneType) {
			case ZoneIdentifier.Hand:
				return player.zones.handZone;
			case ZoneIdentifier.Reserve:
				return player.zones.reserveZone;
			case ZoneIdentifier.Expedition:
				return player.zones.expeditionZone;
			case ZoneIdentifier.Landmark:
				return player.zones.landmarkZone;
			case ZoneIdentifier.Discard:
				return player.zones.discardPileZone;
			case ZoneIdentifier.Mana:
				return player.zones.manaZone;
			case ZoneIdentifier.Hero:
				return player.zones.heroZone;
			case ZoneIdentifier.Limbo:
				return this.gsm.state.sharedZones.limbo;
			case ZoneIdentifier.Adventure:
				return this.gsm.state.sharedZones.adventureZone;
			default:
				console.warn(
					`[EffectProcessor] Unknown or unhandled zone type for findZoneByType: ${zoneType}`
				);
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
}
