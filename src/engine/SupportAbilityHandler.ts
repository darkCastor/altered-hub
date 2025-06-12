import type { IGameObject } from './types/objects';
import type { GameStateManager } from './GameStateManager';
import { StatusType } from './types/enums';
import { AbilityType } from './types/abilities';
import { isGameObject } from './types/objects';

/**
 * Handles Support abilities that work only in Reserve zone
 * Rule 2.2.11.e, 2.4.5.e
 */
export class SupportAbilityHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Gets all active support abilities from all players' reserves
	 * Rule 2.2.11.e: Support abilities only work in Reserve and only when ready
	 */
	public getActiveSupportAbilities(): IGameObject[] {
		const activeSupportObjects: IGameObject[] = [];

		for (const player of this.gsm.state.players.values()) {
			const reserveZone = player.zones.reserve;

			for (const entity of reserveZone.getAll()) {
				if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
					// Check if this object has support abilities
					const hasSupportAbilities = entity.abilities.some(
						(ability) => ability.abilityType === AbilityType.Support || ability.isSupportAbility
					);

					if (hasSupportAbilities) {
						activeSupportObjects.push(entity);
					}
				}
			}
		}

		return activeSupportObjects;
	}

	/**
	 * Processes all active support abilities for a given game event
	 * This would be called by the event system when relevant events occur
	 */
	public processSupportAbilities(eventType: string, eventPayload: unknown): void {
		const activeSupportObjects = this.getActiveSupportAbilities();

		for (const supportObject of activeSupportObjects) {
			for (const ability of supportObject.abilities) {
				if (
					(ability.abilityType === AbilityType.Support || ability.isSupportAbility) &&
					ability.abilityType === AbilityType.Reaction &&
					ability.trigger?.eventType === eventType
				) {
					// Check if trigger condition is met
					if (ability.trigger.condition(eventPayload, supportObject, this.gsm)) {
						console.log(`[SupportHandler] Triggering support ability from ${supportObject.name}`);
						// TODO: Execute the ability effect
						// this.gsm.effectResolver.resolveEffect(ability.effect, supportObject);
					}
				}
			}
		}
	}

	/**
	 * Applies passive support abilities that modify game rules
	 * These are checked when relevant calculations are made
	 */
	public applySupportModifiers(baseValue: unknown, _context: string): unknown {
		const activeSupportObjects = this.getActiveSupportAbilities();
		let modifiedValue = baseValue;

		for (const supportObject of activeSupportObjects) {
			for (const ability of supportObject.abilities) {
				if (
					(ability.abilityType === AbilityType.Support || ability.isSupportAbility) &&
					ability.abilityType === AbilityType.Passive
				) {
					// TODO: Apply support modifiers based on context
					// This would modify costs, statistics, etc.
					console.log(`[SupportHandler] Applying support modifier from ${supportObject.name}`);
				}
			}
		}

		return modifiedValue;
	}

	/**
	 * Checks if support abilities are available for quick actions
	 * Rule 2.2.11.e: Support abilities work only when ready in Reserve
	 */
	public getAvailableSupportQuickActions(playerId: string): IGameObject[] {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return [];

		const availableActions: IGameObject[] = [];
		const reserveZone = player.zones.reserve;

		for (const entity of reserveZone.getAll()) {
			if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
				const hasQuickActionSupport = entity.abilities.some(
					(ability) =>
						(ability.abilityType === AbilityType.Support || ability.isSupportAbility) &&
						ability.abilityType === AbilityType.QuickAction
				);

				if (hasQuickActionSupport) {
					availableActions.push(entity);
				}
			}
		}

		return availableActions;
	}
}
