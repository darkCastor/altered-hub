import type { GameStateManager } from './GameStateManager';
import type { ObjectFactory } from './ObjectFactory';
import type { IGameObject, IEmblemObject } from './types/objects';
import { isGameObject } from './types/objects';
import type { EffectResolver } from './EffectResolver';
import { CardType, StatusType, ZoneIdentifier } from './types/enums';
import { AbilityType, type IAbility } from './types/abilities';

export class ReactionManager {
	private gsm: GameStateManager;
	private objectFactory: ObjectFactory;
	private effectResolver: EffectResolver;

	constructor(gsm: GameStateManager, objectFactory: ObjectFactory, effectResolver: EffectResolver) {
		this.gsm = gsm;
		this.objectFactory = objectFactory;
		this.effectResolver = effectResolver;
	}

	/**
	 * Scans all objects for reactions that are triggered by a given event.
	 * Creates Emblem-Reaction objects in Limbo for each triggered reaction.
	 * Rule 6.3.g, 6.3.d, 6.3.e
	 * @param eventType The type of event that occurred (e.g., 'entityMoved').
	 * @param payload The data associated with the event.
	 */
	public checkForTriggers(eventType: string, payload: unknown): void {
		// --- Part 1: Non-Self-Move Reactions (Rule 6.3.e) ---
		// These reactions must exist and have an active ability *before* the event.
		const allObjects = this.getAllGameObjects();
		for (const object of allObjects) {
			const zone = this.gsm.findZoneOfObject(object.objectId);
			if (!zone) continue;

			for (const ability of object.abilities) {
				if (ability.abilityType !== AbilityType.Reaction || ability.isSelfMove) {
					continue;
				}

				// Check if the ability itself is active based on its location (Rule 2.2.11.g, i, j)
				let isAbilityActive = false;
				const isInPlay = [
					ZoneIdentifier.Expedition,
					ZoneIdentifier.Landmark,
					ZoneIdentifier.Hero
				].includes(zone.zoneType);
				const isInReserve = zone.zoneType === ZoneIdentifier.Reserve;

				if (isInPlay && !ability.isSupportAbility) {
					isAbilityActive = true;
				}
				if (isInReserve && ability.isSupportAbility && !object.statuses.has(StatusType.Exhausted)) {
					isAbilityActive = true;
				}

				if (isAbilityActive && ability.trigger?.eventType === eventType) {
					if (ability.trigger.condition(payload, object, this.gsm)) {
						console.log(
							`[ReactionManager] TRIGGERED (Non-Self-Move): Ability "${ability.text}" on ${object.name} (${object.objectId})`
						);
						this.createAndAddEmblem(ability, object, payload);
					}
				}
			}
		}

		// --- Part 2: Self-Move Reactions (Rule 6.3.d) ---
		// These reactions are checked on the object *after* it has moved.
		// Their abilities activate regardless of the new zone (the trigger condition itself is the filter).
		if (eventType === 'entityMoved' && isGameObject(payload.entity)) {
			const newObject = payload.entity;
			for (const ability of newObject.abilities) {
				if (
					ability.abilityType === AbilityType.Reaction &&
					ability.isSelfMove &&
					ability.trigger?.eventType === eventType
				) {
					if (ability.trigger.condition(payload, newObject, this.gsm)) {
						console.log(
							`[ReactionManager] TRIGGERED (Self-Move): Ability "${ability.text}" on ${newObject.name} (${newObject.objectId})`
						);
						this.createAndAddEmblem(ability, newObject, payload);
					}
				}
			}
		}
	}

	private createAndAddEmblem(ability: IAbility, sourceObject: IGameObject, payload: unknown): void {
		const emblem = this.objectFactory.createReactionEmblem(ability, sourceObject, payload);
		this.gsm.state.sharedZones.limbo.add(emblem);
		console.log(`[ReactionManager] Created Emblem-Reaction ${emblem.objectId} in Limbo.`);
	}

	/**
	 * Processes all currently pending Emblem-Reactions in Limbo,
	 * following initiative order until none are left.
	 * Rule 4.4
	 */
	public async processReactions(): Promise<void> {
		let reactionsInLimbo = this.getReactionsInLimbo();
		if (reactionsInLimbo.length === 0) {
			return;
		}

		console.log(
			`[ReactionManager] Starting reaction processing loop with ${reactionsInLimbo.length} pending reaction(s).`
		);

		let passesInARow = 0;
		const numberOfPlayers = this.gsm.state.players.size; // Corrected to use map size
		let currentReactionPlayerId = this.gsm.state.firstPlayerId; // Start with the first player

		// Rule 4.4.b: The reaction process continues until all players pass in a row or no reactions remain.
		while (reactionsInLimbo.length > 0 && passesInARow < numberOfPlayers) {
			console.log(
				`[ReactionManager] Next to act: Player ${currentReactionPlayerId}. Passes in a row: ${passesInARow}/${numberOfPlayers}. Reactions in limbo: ${reactionsInLimbo.length}`
			);

			const playerReactions = reactionsInLimbo.filter(
				(r) => r.controllerId === currentReactionPlayerId
			);

			if (playerReactions.length > 0) {
				// Player has reactions. Player chooses one to resolve.
				const reactionToResolve = await this.gsm.playerChoosesReaction(currentReactionPlayerId, playerReactions);

				if (!reactionToResolve) {
					// Player chose not to play a reaction (passed).
					console.log(`[ReactionManager] Player ${currentReactionPlayerId} chose to pass.`);
					passesInARow++;
					currentReactionPlayerId = this.gsm.getNextPlayerId(currentReactionPlayerId);
					reactionsInLimbo = this.getReactionsInLimbo(); // Re-fetch before next iteration
					continue; // Next iteration of the while loop.
				}

				// Player chose a reaction to resolve.
				console.log(
					`[ReactionManager] Player ${currentReactionPlayerId} resolves: "${reactionToResolve.name}" (ID: ${reactionToResolve.objectId})`
				);

				// Resolve the reaction and remove it from Limbo
				await this.effectResolver.resolve(reactionToResolve.boundEffect); // Assuming resolve can be async
				this.gsm.state.sharedZones.limbo.remove(reactionToResolve.objectId); // Reaction ceases to exist (Rule 5.4.d)
				console.log(`[ReactionManager] Reaction ${reactionToResolve.objectId} resolved and removed from Limbo.`);

				passesInARow = 0; // Reset passes because an action was taken.

				// Re-fetch reactions in Limbo as the resolved reaction might have triggered new ones.
				reactionsInLimbo = this.getReactionsInLimbo();
				console.log(`[ReactionManager] Reactions re-fetched. Count: ${reactionsInLimbo.length}`);

				// The same player gets priority again (Rule 4.4.b.ii - "Priority returns to the initiative player")
				// So, currentReactionPlayerId does not change yet.
			} else {
				// Player has no reactions available to choose from.
				console.log(`[ReactionManager] Player ${currentReactionPlayerId} has no reactions to choose from or passes.`);
				passesInARow++;
				currentReactionPlayerId = this.gsm.getNextPlayerId(currentReactionPlayerId);
				// Re-fetch reactions in case some appeared for other players, or for loop condition check
				reactionsInLimbo = this.getReactionsInLimbo();
			}
		}

		if (reactionsInLimbo.length > 0 && passesInARow >= numberOfPlayers) {
			console.log(
				`[ReactionManager] Reaction loop ended due to all players passing. ${reactionsInLimbo.length} reaction(s) remain in Limbo unresolved.`
			);
			// These reactions would typically cease to exist or be handled by specific game rules for unresolved reactions.
			// For now, we'll just log. Future: Rule 5.4.d "An Emblem-Reaction that is not played ceases to exist..."
			// This implies they should be removed if the loop ends due to passes.
			reactionsInLimbo.forEach(r => this.gsm.state.sharedZones.limbo.remove(r.objectId));
			console.log('[ReactionManager] Unresolved reactions removed from Limbo due to full pass sequence.');
		} else if (reactionsInLimbo.length === 0) {
			console.log('[ReactionManager] Reaction processing loop finished: No more reactions in Limbo.');
		} else {
			console.log('[ReactionManager] Reaction processing loop finished for other reasons.'); // Should ideally not happen
		}
	}

	private getReactionsInLimbo(): IEmblemObject[] {
		const limboEntities = this.gsm.state.sharedZones.limbo.getAll();
		return limboEntities.filter(
			(e): e is IEmblemObject =>
				isGameObject(e) &&
				e.type === CardType.Emblem &&
				(e as IEmblemObject).emblemSubType === 'Reaction'
		);
	}

	private getAllGameObjects(): IGameObject[] {
		const objects: IGameObject[] = [];
		// Player-specific zones
		this.gsm.state.players.forEach((player) => {
			objects.push(...player.zones.landmarkZone.getAll().filter(isGameObject));
			objects.push(...player.zones.heroZone.getAll().filter(isGameObject));
			objects.push(...player.zones.reserveZone.getAll().filter(isGameObject)); // For support abilities
		});
		// Shared zones
		objects.push(...this.gsm.state.sharedZones.expedition.getAll().filter(isGameObject));
		// Adventure and Limbo zones are generally not sources of reaction abilities from objects within them.
		return objects;
	}
}
