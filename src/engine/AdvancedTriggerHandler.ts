import type { IGameObject } from './types/objects';
import type { GameStateManager } from './GameStateManager';
import type { IZone } from './types/zones';
import { ZoneIdentifier } from './types/enums';
import { AbilityType } from './types/abilities';
import { isGameObject } from './types/objects';

/**
 * Handles advanced trigger symbols and timing
 * Rule 7.1.1 - Trigger Symbols: ⚇ ⚈ ⚁ At [Phase]
 */
export class AdvancedTriggerHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Processes ⚇ "When entering play" triggers
	 * Rule 7.1.1.a - Triggers when an object enters a visible zone
	 */
	public processEnterPlayTriggers(object: IGameObject, zone: IZone): void {
		console.log(`[TriggerHandler] Processing enter play triggers for ${object.name}`);

		for (const ability of object.abilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === 'enterPlay'
			) {
				// Check if trigger condition is met
				const triggerPayload = { object, zone };
				if (ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(
						`[TriggerHandler] Triggering enter play ability on ${object.name}: ${ability.text}`
					);
					const emblem = this.gsm.objectFactory.createReactionEmblem(
						ability,
						object,
						triggerPayload
					);
					const limboZone = this.gsm.state.sharedZones.limbo;
					limboZone.add(emblem);
					console.log(
						`[TriggerHandler] Created reaction emblem ${emblem.name} (${emblem.id}) for ${object.name} and added to Limbo.`
					);
				}
			}
		}

		// Also check for keyword triggers
		this.gsm.keywordHandler.processKeywordOnEnterPlay(object, zone);
	}

	/**
	 * Processes ⚈ "When leaving play" triggers
	 * Rule 7.1.1.b - Triggers when an object leaves a visible zone
	 */
	public processLeavePlayTriggers(object: IGameObject, fromZone: IZone, toZone: IZone): void {
		console.log(`[TriggerHandler] Processing leave play triggers for ${object.name}`);

		for (const ability of object.abilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === 'leavePlay'
			) {
				const triggerPayload = { object, fromZone, toZone };
				if (ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(
						`[TriggerHandler] Triggering leave play ability on ${object.name}: ${ability.text}`
					);
					const emblem = this.gsm.objectFactory.createReactionEmblem(
						ability,
						object,
						triggerPayload
					);
					const limboZone = this.gsm.state.sharedZones.limbo;
					limboZone.add(emblem);
					console.log(
						`[TriggerHandler] Created reaction emblem ${emblem.name} (${emblem.id}) for ${object.name} and added to Limbo.`
					);
				}
			}
		}
	}

	/**
	 * Processes ⚁ "When going to Reserve" triggers
	 * Rule 7.1.1.c - Triggers specifically when moving to Reserve zone
	 */
	public processGoToReserveTriggers(object: IGameObject, fromZone: IZone): void {
		console.log(`[TriggerHandler] Processing go to reserve triggers for ${object.name}`);

		for (const ability of object.abilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === 'goToReserve'
			) {
				const triggerPayload = { object, fromZone };
				if (ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(
						`[TriggerHandler] Triggering go to reserve ability on ${object.name}: ${ability.text}`
					);
					const emblem = this.gsm.objectFactory.createReactionEmblem(
						ability,
						object,
						triggerPayload
					);
					const limboZone = this.gsm.state.sharedZones.limbo;
					limboZone.add(emblem);
					console.log(
						`[TriggerHandler] Created reaction emblem ${emblem.name} (${emblem.id}) for ${object.name} and added to Limbo.`
					);
				}
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
		for (const ability of object.abilities) {
			if (
				ability.abilityType === AbilityType.Reaction &&
				ability.trigger?.eventType === `at${phaseName}`
			) {
				const triggerPayload = { phase: phaseName, object };
				if (ability.trigger.condition(triggerPayload, object, this.gsm)) {
					console.log(
						`[TriggerHandler] Triggering 'At ${phaseName}' ability from ${object.name}: ${ability.text}`
					);
					const emblem = this.gsm.objectFactory.createReactionEmblem(
						ability,
						object,
						triggerPayload
					);
					const limboZone = this.gsm.state.sharedZones.limbo;
					limboZone.add(emblem);
					console.log(
						`[TriggerHandler] Created reaction emblem ${emblem.name} (${emblem.id}) for ${object.name} (At ${phaseName}) and added to Limbo.`
					);
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
			yield player.zones.discardPile;
			yield player.zones.manaZone;
			yield player.zones.reserve;
			yield player.zones.landmarkZone;
			yield player.zones.heroZone;
			yield player.zones.expedition;
		}
		yield this.gsm.state.sharedZones.adventure;
		yield this.gsm.state.sharedZones.limbo;
	}
}
