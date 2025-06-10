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
    public checkForTriggers(eventType: string, payload: any): void {
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
                const isInPlay = [ZoneIdentifier.Expedition, ZoneIdentifier.Landmark, ZoneIdentifier.Hero].includes(zone.zoneType);
                const isInReserve = zone.zoneType === ZoneIdentifier.Reserve;

                if (isInPlay && !ability.isSupportAbility) {
                    isAbilityActive = true;
                }
                if (isInReserve && ability.isSupportAbility && !object.statuses.has(StatusType.Exhausted)) {
                    isAbilityActive = true;
                }

                if (isAbilityActive && ability.trigger?.eventType === eventType) {
                    if (ability.trigger.condition(payload, object, this.gsm)) {
                        console.log(`[ReactionManager] TRIGGERED (Non-Self-Move): Ability "${ability.text}" on ${object.name} (${object.objectId})`);
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
                if (ability.abilityType === AbilityType.Reaction && ability.isSelfMove && ability.trigger?.eventType === eventType) {
                    if (ability.trigger.condition(payload, newObject, this.gsm)) {
                        console.log(`[ReactionManager] TRIGGERED (Self-Move): Ability "${ability.text}" on ${newObject.name} (${newObject.objectId})`);
                        this.createAndAddEmblem(ability, newObject, payload);
                    }
                }
            }
        }
    }
    
    private createAndAddEmblem(ability: IAbility, sourceObject: IGameObject, payload: any): void {
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

        console.log(`[ReactionManager] Starting reaction processing loop with ${reactionsInLimbo.length} pending reaction(s).`);

        while (reactionsInLimbo.length > 0) {
            // In a multi-player game, we would cycle through players in initiative order.
            // For now, we assume the current player resolves all their reactions first.
            const initiativePlayerId = this.gsm.state.currentPlayerId; 
            const playerReactions = reactionsInLimbo.filter(r => r.controllerId === initiativePlayerId);

            if (playerReactions.length === 0) {
                // This can happen if the other player has reactions but the current player doesn't.
                // A full implementation would advance to the next player in initiative order.
                console.log(`[ReactionManager] Player ${initiativePlayerId} has no reactions to resolve. Breaking loop for now.`);
                break; 
            }
            
            // Player chooses one to resolve. For now, we take the first.
            const reactionToResolve = playerReactions[0]; 
            console.log(`[ReactionManager] Player ${initiativePlayerId} resolves: "${reactionToResolve.name}"`);

            this.effectResolver.resolve(reactionToResolve.boundEffect);
            this.gsm.state.sharedZones.limbo.remove(reactionToResolve.objectId); // Reaction ceases to exist (Rule 5.4.d)

            // After one reaction resolves, we must check for new reactions triggered by it.
            // This is a recursive or iterative process. For simplicity, we just re-fetch the list.
            reactionsInLimbo = this.getReactionsInLimbo();
        }

        console.log(`[ReactionManager] Reaction processing loop finished.`);
    }

    private getReactionsInLimbo(): IEmblemObject[] {
        const limboEntities = this.gsm.state.sharedZones.limbo.getAll();
        return limboEntities.filter(
            (e): e is IEmblemObject => isGameObject(e) && e.type === CardType.Emblem && e.emblemSubType === 'Reaction'
        );
    }
    
    private getAllGameObjects(): IGameObject[] {
        const objects: IGameObject[] = [];
        this.gsm.state.players.forEach(player => {
            // In-Play zones
            objects.push(...player.zones.expedition.getAll().filter(isGameObject));
            objects.push(...player.zones.landmarkZone.getAll().filter(isGameObject));
            objects.push(...player.zones.heroZone.getAll().filter(isGameObject));
            // Reserve zone (for support abilities)
            objects.push(...player.zones.reserve.getAll().filter(isGameObject));
        });
        return objects;
    }
}