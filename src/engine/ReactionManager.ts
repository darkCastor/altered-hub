import type { GameStateManager } from './GameStateManager';
import type { ObjectFactory } from './ObjectFactory';
import type { IGameObject, IEmblemObject, ICardInstance } from './types/objects';
import { isGameObject } from './types/objects';
import type { EffectProcessor } from './EffectProcessor';
import { CardType, StatusType, ZoneIdentifier } from './types/enums';
import { AbilityType, type IAbility } from './types/abilities';
import type { IGameState } from './types/gameState';

export class ReactionManager {
	private gameStateManager: GameStateManager;
	private objectFactory: ObjectFactory;
	private effectProcessor: EffectProcessor;

	constructor(gsm: GameStateManager, objectFactory: ObjectFactory, effectProcessor: EffectProcessor) {
		this.gameStateManager = gsm;
		this.objectFactory = objectFactory;
		this.effectProcessor = effectProcessor;
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
			const zone = this.gameStateManager.findZoneOfObject(object.objectId);
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
					if (ability.trigger.condition(payload, object, this.gameStateManager)) {
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
		if (eventType === 'entityMoved' && isGameObject((payload as any).entity)) {
			const newObject = (payload as any).entity as IGameObject;
			for (const ability of newObject.abilities) {
				if (
					ability.abilityType === AbilityType.Reaction &&
					ability.isSelfMove &&
					ability.trigger?.eventType === eventType
				) {
					if (ability.trigger.condition(payload, newObject, this.gameStateManager)) {
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
		this.gameStateManager.state.sharedZones.limbo.add(emblem);
		console.log(`[ReactionManager] Created Emblem-Reaction ${emblem.objectId} in Limbo.`);
	}

	public async resolveReactions(gameState: IGameState): Promise<void> {
		let reactionPlayedInLastFullPass = true;

		while (reactionPlayedInLastFullPass) {
			reactionPlayedInLastFullPass = false;
			let currentPlayerId = gameState.firstPlayerId;
			const playerIds = gameState.players.map(p => p.id);
			if (!playerIds.includes(currentPlayerId)) {
				// Fallback if firstPlayerId is somehow invalid, though this shouldn't happen
				currentPlayerId = playerIds[0];
			}


			for (let i = 0; i < playerIds.length; i++) {
				const reactionsInLimbo = this.getReactionsInLimbo(gameState);
				const playerReactions = reactionsInLimbo.filter(
					(r) => r.controllerId === currentPlayerId
				);

				if (playerReactions.length > 0) {
					// Simplified: Automatically select the first available reaction.
					const reactionToPlay = playerReactions[0];

					console.log(`Player ${currentPlayerId} plays reaction: ${reactionToPlay.definitionId} (Source: ${reactionToPlay.name})`);

					if (reactionToPlay.boundEffect) {
						await this.effectProcessor.resolveEffect(
							gameState,
							reactionToPlay.boundEffect,
							reactionToPlay.controllerId,
							reactionToPlay.sourceObject // Pass the LKI from the emblem
						);
					}

					gameState.sharedZones.limbo.remove(reactionToPlay.objectId);
					this.gameStateManager.eventBus.publish('reactionPlayed', { reaction: reactionToPlay });
					reactionPlayedInLastFullPass = true; // A reaction was played, so loop again

					// Priority might stay with the current player or switch depending on game rules.
					// For this simplified loop, we'll just continue to the next player in order after a reaction.
					// If strict priority return is needed, this logic would need adjustment.
				}

				// Switch to the next player
				const currentIndex = playerIds.indexOf(currentPlayerId);
				currentPlayerId = playerIds[(currentIndex + 1) % playerIds.length];
			}
			// If no reaction was played by any player in this full pass over all players, the loop will terminate.
		}
		// Clean up any remaining reactions if the loop terminates because no one played anything.
		// This is implicitly handled by the loop condition, but if there's a rule for unplayed reactions after everyone passes,
		// it could be added here. The original `processReactions` had logic for this.
        // For now, if reactionPlayedInLastFullPass is false, it means no reactions were played by anyone.
        if (!reactionPlayedInLastFullPass) {
            const remainingReactions = this.getReactionsInLimbo(gameState);
            if (remainingReactions.length > 0) {
                console.log(`[ReactionManager] Reaction loop ended. ${remainingReactions.length} reaction(s) remain in Limbo and will be removed.`);
                remainingReactions.forEach(r => gameState.sharedZones.limbo.remove(r.objectId));
            }
        }
	}

	private getReactionsInLimbo(gameState: IGameState): IEmblemObject[] {
		const limboEntities = gameState.sharedZones.limbo.getAll();
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
		this.gameStateManager.state.players.forEach((player) => {
			objects.push(...player.zones.landmarkZone.getAll().filter(isGameObject));
			objects.push(...player.zones.heroZone.getAll().filter(isGameObject));
			objects.push(...player.zones.reserveZone.getAll().filter(isGameObject)); // For support abilities
		});
		// Shared zones
		objects.push(...this.gameStateManager.state.sharedZones.expedition.getAll().filter(isGameObject));
		// Adventure and Limbo zones are generally not sources of reaction abilities from objects within them.
		return objects;
	}
}
