import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import { StatusType, CardType, CounterType } from './types/enums'; // Removed ZoneIdentifier
import { isGameObject } from './types/objects';
import type { IZone } from './types/zones'; // Added IZone

/**
 * Handles all status effect mechanics and their interactions
 * Rules 2.4.2 through 2.4.6
 */
export class StatusEffectHandler {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Applies status effect when object gains status
	 * Rule 2.4 - Status effects modify object behavior
	 */
	public applyStatusEffect(object: IGameObject, status: StatusType): void {
		object.statuses.add(status);
		console.log(`[StatusHandler] ${object.name} gained ${status} status`);

		// Handle immediate effects of gaining status
		switch (status) {
			case StatusType.Boosted:
				this.handleBoostedGained(object);
				break;
			case StatusType.Fleeting:
				this.handleFleetingGained(object);
				break;
			// Other statuses don't have immediate gain effects
		}
	}

	/**
	 * Removes status effect and handles any removal effects
	 */
	public removeStatusEffect(object: IGameObject, status: StatusType): void {
		if (!object.statuses.has(status)) return;

		object.statuses.delete(status);
		console.log(`[StatusHandler] ${object.name} lost ${status} status`);

		// Handle effects of losing status
		switch (status) {
			case StatusType.Boosted:
				this.handleBoostedLost(object);
				break;
			// Other statuses don't have removal effects
		}
	}

	/**
	 * Rule 2.4.2 - Anchored: During Rest, Anchored Characters are not sent to Reserve
	 * During Rest, Anchored objects lose Anchored.
	 */
	public processAnchoredDuringRest(object: IGameObject): boolean {
		if (!object.statuses.has(StatusType.Anchored)) return false;

		// Remove Anchored status during Rest
		this.removeStatusEffect(object, StatusType.Anchored);

		// Return true to indicate object should not go to Reserve
		console.log(`[StatusHandler] ${object.name} was Anchored, not going to Reserve`);
		return true;
	}

	/**
	 * Rule 2.4.3 - Asleep: During Progress, Asleep Character statistics don't count
	 * During Rest, Asleep objects are not sent to Reserve and lose Asleep.
	 */
	public processAsleepDuringProgress(object: IGameObject): boolean {
		if (!object.statuses.has(StatusType.Asleep)) return false;

		console.log(`[StatusHandler] ${object.name} is Asleep, statistics don't count for Progress`);
		return true; // Statistics should be ignored
	}

	public processAsleepDuringRest(object: IGameObject): boolean {
		if (!object.statuses.has(StatusType.Asleep)) return false;

		// Remove Asleep status during Rest
		this.removeStatusEffect(object, StatusType.Asleep);

		// Return true to indicate object should not go to Reserve
		console.log(`[StatusHandler] ${object.name} was Asleep, not going to Reserve`);
		return true;
	}

	/**
	 * Rule 2.4.4 - Boosted: Object is Boosted if it has at least one boost counter
	 * Status changes automatically when boosts are added/removed
	 */
	public updateBoostedStatus(object: IGameObject): void {
		const boostCounters = object.counters.get(CounterType.Boost) || 0;
		const hasBoosted = object.statuses.has(StatusType.Boosted);

		if (boostCounters > 0 && !hasBoosted) {
			this.applyStatusEffect(object, StatusType.Boosted);
		} else if (boostCounters === 0 && hasBoosted) {
			this.removeStatusEffect(object, StatusType.Boosted);
		}
	}

	/**
	 * Rule 2.4.5 - Exhausted: Exhausted cards in Reserve cannot be played and have no support abilities
	 * Objects that are not exhausted are "ready"
	 */
	public canPlayFromReserve(object: IGameObject): boolean {
		if (object.statuses.has(StatusType.Exhausted)) {
			console.log(`[StatusHandler] Cannot play ${object.name} from Reserve - Exhausted`);
			return false;
		}
		return true;
	}

	public hasSupportAbilities(object: IGameObject): boolean {
		if (object.statuses.has(StatusType.Exhausted)) {
			console.log(`[StatusHandler] ${object.name} has no support abilities - Exhausted`);
			return false;
		}
		return object.abilities.some((ability) => ability.isSupportAbility);
	}

	/**
	 * Rule 2.4.6 - Fleeting: Cards played from Reserve gain Fleeting
	 * Fleeting Characters/Permanents are discarded instead of going to Reserve
	 */
	public applyFleetingOnPlayFromReserve(object: IGameObject): void {
		this.applyStatusEffect(object, StatusType.Fleeting);
		console.log(`[StatusHandler] ${object.name} gained Fleeting from being played from Reserve`);
	}

	public processFleetingDuringRest(object: IGameObject): 'discard' | 'reserve' | 'stay' {
		if (!object.statuses.has(StatusType.Fleeting)) {
			return 'reserve'; // Normal behavior
		}

		// Fleeting objects go to discard instead of Reserve
		console.log(`[StatusHandler] ${object.name} is Fleeting, going to discard instead of Reserve`);
		return 'discard';
	}

	/**
	 * Processes all status effects during phase transitions
	 */
	public processStatusEffectsDuringPhase(phase: string): void {
		console.log(`[StatusHandler] Processing status effects for ${phase} phase`);

		switch (phase.toLowerCase()) {
			case 'morning':
				this.processStatusEffectsDuringMorning();
				break;
			case 'dusk':
				this.processStatusEffectsDuringDusk();
				break;
			case 'night':
				this.processStatusEffectsDuringNight();
				break;
		}
	}

	/**
	 * Morning phase status processing (during Prepare)
	 * Rule 4.2.1.c - Ready all exhausted cards and objects
	 */
	private processStatusEffectsDuringMorning(): void {
		for (const zone of this.getAllVisibleZones()) {
			for (const entity of zone.getAll()) {
				if (isGameObject(entity) && entity.statuses.has(StatusType.Exhausted)) {
					this.removeStatusEffect(entity, StatusType.Exhausted);
					console.log(`[StatusHandler] ${entity.name} became ready during Prepare`);
				}
			}
		}
	}

	/**
	 * Dusk phase status processing (during Progress)
	 */
	private processStatusEffectsDuringDusk(): void {
		// Status effects are checked during expedition progress calculation
		// This is handled in the Progress phase logic
	}

	/**
	 * Night phase status processing (during Rest)
	 */
	private processStatusEffectsDuringNight(): void {
		for (const player of this.gsm.state.players.values()) {
			const expeditionZone = player.zones.expeditionZone;

			for (const entity of expeditionZone.getAll()) {
				if (isGameObject(entity) && entity.type === CardType.Character) {
					// Process Anchored and Asleep statuses
					const wasAnchored = this.processAnchoredDuringRest(entity);
					const wasAsleep = this.processAsleepDuringRest(entity);

					// These statuses prevent going to Reserve
					if (wasAnchored || wasAsleep) {
						continue;
					}
				}
			}
		}
	}

	/**
	 * Checks if an object should be affected by status during specific events
	 */
	public checkStatusInteraction(object: IGameObject, event: string): StatusInteractionResults {
		const results: StatusInteractionResults = {};

		switch (event) {
			case 'progress':
				results.ignoreStats = this.processAsleepDuringProgress(object);
				break;
			case 'rest':
				results.anchored = this.processAnchoredDuringRest(object);
				results.asleep = this.processAsleepDuringRest(object);
				results.fleetingDestination = this.processFleetingDuringRest(object);
				break;
			case 'playFromReserve':
				results.canPlay = this.canPlayFromReserve(object);
				break;
			case 'supportCheck':
				results.hasSupport = this.hasSupportAbilities(object);
				break;
		}

		return results;
	}

	/**
	 * Handles automatic status updates based on game state changes
	 */
	public updateAutomaticStatuses(object: IGameObject): void {
		// Update Boosted status based on boost counters
		this.updateBoostedStatus(object);

		// TODO: Add other automatic status updates as needed
	}

	/**
	 * Handle effects when Boosted status is gained
	 */
	private handleBoostedGained(_object: IGameObject): void {
		// Boosted status is automatic based on counters, no additional effects
	}

	/**
	 * Handle effects when Boosted status is lost
	 */
	private handleBoostedLost(_object: IGameObject): void {
		// Boosted status is automatic based on counters, no additional effects
	}

	/**
	 * Handle effects when Fleeting status is gained
	 */
	private handleFleetingGained(_object: IGameObject): void {
		// Fleeting affects Rest behavior, no immediate effects
	}

	/**
	 * Gets all visible zones for status processing
	 */
	private *getAllVisibleZones(): Generator<IZone> {
		for (const player of this.gsm.state.players.values()) {
			yield player.zones.discardPileZone;
			yield player.zones.manaZone;
			yield player.zones.reserveZone;
			yield player.zones.landmarkZone;
			yield player.zones.heroZone;
			yield player.zones.expeditionZone;
		}
		yield this.gsm.state.sharedZones.adventure;
		yield this.gsm.state.sharedZones.limbo;
	}
}

interface StatusInteractionResults {
	ignoreStats?: boolean;
	anchored?: boolean;
	asleep?: boolean;
	fleetingDestination?: 'discard' | 'reserve' | 'stay';
	canPlay?: boolean;
	hasSupport?: boolean;
}
