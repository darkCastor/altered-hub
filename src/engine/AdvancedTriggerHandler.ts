import type { IGameObject, IEmblemObject } from './types/objects'; // Added IEmblemObject
import type { GameStateManager } from './GameStateManager';
import type { IZone } from './types/zones';
import { ZoneIdentifier, CardType, StatusType } from './types/enums'; // Added CardType, StatusType
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
		eventPayload: any,
		eventType: string // Added eventType to help determine zone for scope check
	): IEmblemObject | null {

		// Determine the zone to use for scope checking
		let zoneIdForScopeCheck: ZoneIdentifier | undefined;
		const isLeaveEvent = eventType === 'leavePlay' || eventType === 'goToReserve' || eventPayload?.fromZone?.zoneType;

		if (isLeaveEvent && eventPayload?.fromZone?.zoneType) {
			zoneIdForScopeCheck = eventPayload.fromZone.zoneType;
		} else if (eventPayload?.zone?.zoneType && (eventType === 'enterPlay' || eventType === 'objectEntersZone')) { // objectEntersZone is hypothetical
			zoneIdForScopeCheck = eventPayload.zone.zoneType;
		}
		 else {
			const currentZone = this.gsm.findZoneOfObject(sourceObject.objectId);
			zoneIdForScopeCheck = currentZone?.zoneType;
		}

		if (!this._canAbilityTrigger(triggeredAbility, sourceObject, zoneIdForScopeCheck, eventType)) {
			console.log(`[TriggerHandler] Scope check failed for ability ${triggeredAbility.abilityId} on ${sourceObject.name} in zone ${zoneIdForScopeCheck}. Not creating emblem.`);
			return null;
		}

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

		// ObjectFactory.createReactionEmblem is responsible for creating the LKI
		// of the sourceObject (the object that possesses the ability).
		// If eventPayload contains other objects whose LKI is needed for the reaction's
		// effect or for complex trigger conditions not handled before this point,
		// then eventPayload should be structured to hold those LKIs.
		// For now, we assume ObjectFactory handles sourceObject's LKI and payload is as-is.

		const emblem = this.gsm.objectFactory.createReactionEmblem(
			triggeredAbility,
			sourceObject, // Pass the live sourceObject; ObjectFactory will snapshot it for LKI.
			eventPayload
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
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload, 'enterPlay');
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
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload, 'leavePlay');
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
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload, 'goToReserve');
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
				this.createEmblemForTriggeredAbility(ability, object, triggerPayload, `at${phaseName}`);
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
							this.createEmblemForTriggeredAbility(ability, entity, eventPayload, eventType);
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

	/**
	 * Helper function to check if an ability can trigger based on its source object's zone and type.
	 */
	private _canAbilityTrigger(
		ability: IAbility,
		sourceObject: IGameObject,
		zoneIdForScopeCheck: ZoneIdentifier | undefined,
		eventType: string // eventType might be used for more nuanced LKI later if needed
	): boolean {
		if (zoneIdForScopeCheck === undefined) {
			console.warn(`[TriggerHandler._canAbilityTrigger] Zone for scope check is undefined for ${sourceObject.name} (event: ${eventType}). Denying trigger.`);
			return false; // Cannot determine scope if zone is unknown
		}

		if (zoneIdForScopeCheck === ZoneIdentifier.ReserveZone) {
			if (ability.isSupportAbility) {
				// For support abilities in reserve, check if the source object is exhausted.
				// This uses the current status of the sourceObject. If LKI of status is needed,
				// it would have to be passed or retrieved from lkiSourceObject if available.
				return !sourceObject.statuses.has(StatusType.Exhausted);
			} else {
				// Non-support abilities cannot trigger from Reserve.
				return false;
			}
		} else if (sourceObject.type === CardType.Hero) {
			// Hero abilities trigger only if the hero is in the HeroZone.
			return zoneIdForScopeCheck === ZoneIdentifier.HeroZone;
		} else {
			// Non-Hero objects' abilities (that are not support abilities, handled above)
			// trigger only if they are in Expedition or LandmarkZone.
			return zoneIdForScopeCheck === ZoneIdentifier.Expedition || zoneIdForScopeCheck === ZoneIdentifier.LandmarkZone;
		}
		// Default to false if none of the above permissive conditions are met.
		// This line is technically unreachable due to prior conditions but good for safety.
		// return false;
	}
}
