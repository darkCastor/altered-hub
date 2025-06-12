import type { IGameObject, IEmblemObject } from './types/objects'; // Added IEmblemObject
import type { GameStateManager } from './GameStateManager';
import type { IZone } from './types/zones';
import { ZoneIdentifier, CardType } from './types/enums'; // Added CardType
import { AbilityType, type IAbility } from './types/abilities'; // Added IAbility
import { isGameObject } from './types/objects';


/**
 * Handles advanced trigger symbols and timing
 * Rule 7.1.1 - Trigger Symbols: ⚇ ⚈ ⚁ At [Phase]
 * Rule 6.3 - Reactions
 */
export class AdvancedTriggerHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Centralized method to create and queue a reaction emblem if NIF limits allow.
	 * Rule 6.3.l, Rule 1.4.6.c
	 */
	private createEmblemForTriggeredAbility(
		triggeredAbility: IAbility,
		sourceObject: IGameObject,
		eventPayload: any
	): IEmblemObject | null {
		// Initialize reactionActivationsToday if it's undefined
		if (triggeredAbility.reactionActivationsToday === undefined) {
			triggeredAbility.reactionActivationsToday = 0;
		}

		const activationLimit = (this.gsm.config as any)?.nothingIsForeverReactionLimit ?? 100; // Default to 100

		if (triggeredAbility.reactionActivationsToday >= activationLimit) {
			console.log(
				`[TriggerHandler] Reaction NIF limit reached for ability ${triggeredAbility.abilityId} on ${sourceObject.name} (ID: ${sourceObject.objectId}). Not creating emblem.`
			);
			return null;
		}

		triggeredAbility.reactionActivationsToday++;
		console.log(
			`[TriggerHandler] Incrementing reaction count for ability ${triggeredAbility.abilityId} on ${sourceObject.name} to ${triggeredAbility.reactionActivationsToday}.`
		);

		// Create LKI of the source object at the time of triggering
		// This should be a deep enough copy to capture relevant state for the effect.
		// For simplicity, a shallow spread might be used, but be wary of nested objects/arrays.
		const lkiSourceObject = { ...sourceObject, abilities: [...sourceObject.abilities] }; // Example shallow copy, may need deep clone

		const emblem = this.gsm.objectFactory.createReactionEmblem(
			triggeredAbility,
			sourceObject, // The original sourceObject for context like controllerId, ownerId
			eventPayload,
			lkiSourceObject // Pass LKI to be stored on the emblem's effect
		);

		const limboZone = this.gsm.state.sharedZones.limbo;
		limboZone.add(emblem);
		console.log(
			`[TriggerHandler] Created reaction emblem ${emblem.name} (ID: ${emblem.objectId}) for ${sourceObject.name} and added to Limbo.`
		);
		this.gsm.eventBus.publish('reactionEmblemCreated', { emblem, sourceAbility: triggeredAbility, sourceObject, eventPayload });
		return emblem;
	}


	/**
	 * Processes ⚇ "When entering play" triggers
	 * Rule 7.1.1.a - Triggers when an object enters a visible zone
	 */
	public processEnterPlayTriggers(object: IGameObject, zone: IZone): void {
		console.log(`[TriggerHandler] Processing enter play triggers for ${object.name} in zone ${zone.id}`);

		// Combine base and granted abilities for trigger checking
		const allAbilities = [...object.abilities, ...(object.currentCharacteristics.grantedAbilities || [])];

		for (const ability of allAbilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === 'enterPlay' // Specific to this handler
			) {
				const triggerPayload = { object, zone }; // object is the one entering play
				// Conditional Triggers (Rule 6.3.b, 6.3.k)
				if (ability.trigger.condition && !ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(`[TriggerHandler] Condition not met for ability ${ability.abilityId} on ${object.name}.`);
					continue;
				}
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload);
			}
		}
		// Also check for keyword triggers that might be simpler than full reaction abilities
		this.gsm.keywordHandler.processKeywordOnEnterPlay(object, zone);
	}

	/**
	 * Processes ⚈ "When leaving play" triggers
	 * Rule 7.1.1.b - Triggers when an object leaves a visible zone
	 */
	public processLeavePlayTriggers(object: IGameObject, fromZone: IZone, toZone: IZone): void {
		console.log(`[TriggerHandler] Processing leave play triggers for ${object.name} from ${fromZone.id} to ${toZone.id}`);
		const allAbilities = [...object.abilities, ...(object.currentCharacteristics.grantedAbilities || [])];
		for (const ability of allAbilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === 'leavePlay'
			) {
				const triggerPayload = { object, fromZone, toZone };
				if (ability.trigger.condition && !ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(`[TriggerHandler] Condition not met for ability ${ability.abilityId} on ${object.name}.`);
					continue;
				}
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload);
			}
		}
	}

	/**
	 * Processes ⚁ "When going to Reserve" triggers
	 * Rule 7.1.1.c - Triggers specifically when moving to Reserve zone
	 */
	public processGoToReserveTriggers(object: IGameObject, fromZone: IZone): void {
		console.log(`[TriggerHandler] Processing go to reserve triggers for ${object.name} from zone ${fromZone.id}`);
		const allAbilities = [...object.abilities, ...(object.currentCharacteristics.grantedAbilities || [])];
		for (const ability of allAbilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === 'goToReserve'
			) {
				const triggerPayload = { object, fromZone };
				if (ability.trigger.condition && !ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(`[TriggerHandler] Condition not met for ability ${ability.abilityId} on ${object.name}.`);
					continue;
				}
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload);
			}
		}
	}

	/**
	 * Processes "At [Phase]" triggers
	 * Rule 7.1.1.d - Triggers at the start of specific game phases
	 */
	public processPhaseTriggersForPhase(phaseName: string): void {
		console.log(`[TriggerHandler] Processing 'At ${phaseName}' triggers`);

		// Check all objects in visible zones for phase triggers
		for (const zone of this.gsm.getAllVisibleZones()) {
			for (const entity of zone.getAll()) {
				if (isGameObject(entity)) {
					this.processObjectPhaseTriggersForPhase(entity, phaseName);
				}
			}
		}
	}

	/**
	 * Processes phase triggers for a specific object
	 */
	private processObjectPhaseTriggersForPhase(object: IGameObject, phaseName: string): void {
		const allAbilities = [...object.abilities, ...(object.currentCharacteristics.grantedAbilities || [])];
		for (const ability of allAbilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === `at${phaseName}` // e.g., "atMorning", "atNoon"
			) {
				const triggerPayload = { phase: phaseName, objectId: object.objectId };
				if (ability.trigger.condition && !ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(`[TriggerHandler] Condition not met for ability ${ability.abilityId} on ${object.name} for phase ${phaseName}.`);
					continue;
				}
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload);
			}
		}
	}

	/**
	 * A generic handler for any event type published on the EventBus.
	 * Iterates all objects and their abilities to find matching triggers.
	 * Rule 6.3.e - Reactions must exist and be working before the event.
	 * This can be connected to an event bus listener that catches all events or specific ones.
	 */
	public processGenericEventTriggers(eventType: string, eventPayload: any): void {
		console.log(`[TriggerHandler] Processing generic event: ${eventType}`, eventPayload);
		for (const zone of this.getAllVisibleZones()) {
			for (const entity of zone.getAll()) {
				if (isGameObject(entity)) {
					const allAbilities = [...entity.abilities, ...(entity.currentCharacteristics.grantedAbilities || [])];
					for (const ability of allAbilities) {
						if (ability.abilityType === AbilityType.Reaction && ability.trigger?.eventType === eventType) {
							if (ability.trigger.condition && !ability.trigger.condition(eventPayload, entity, this.gsm)) {
								console.log(`[TriggerHandler] Condition not met for ability ${ability.abilityId} on ${entity.name} for event ${eventType}.`);
								continue;
							}
							this.createEmblemForTriggeredAbility(ability, entity, eventPayload);
						}
					}
				}
			}
		}
	}

	/**
	 * Processes movement-related triggers when entities change zones
	 */
	public processMovementTriggers(object: IGameObject, fromZone: IZone, toZone: IZone): void {
		// Determine what type of movement this is
		const isEnteringPlay = toZone.visibility === 'visible' && fromZone.visibility === 'hidden';
		const isLeavingPlay = fromZone.visibility === 'visible' && toZone.visibility === 'hidden';
		const isGoingToReserve = toZone.zoneType === ZoneIdentifier.Reserve;

		if (isEnteringPlay) {
			this.processEnterPlayTriggers(object, toZone);
		}

		if (isLeavingPlay) {
			this.processLeavePlayTriggers(object, fromZone, toZone);
		}

		if (isGoingToReserve && fromZone.visibility === 'visible') {
			this.processGoToReserveTriggers(object, fromZone);
		}
	}

	/**
	 * Gets all visible zones for trigger checking
	 */
	private *getAllVisibleZones(): Generator<IZone> {
		for (const player of this.gsm.state.players.values()) {
			yield player.zones.discardPileZone;
			yield player.zones.manaZone;
			yield player.zones.reserveZone;
			yield player.zones.landmarkZone;
			yield player.zones.heroZone;
			// Expedition zone is shared, so yield it once after players.
		}
		yield this.gsm.state.sharedZones.expedition; // Shared expedition zone
		yield this.gsm.state.sharedZones.adventure;
		yield this.gsm.state.sharedZones.limbo;
		// Potentially other shared zones if they can contain objects with reactions
	}
}
