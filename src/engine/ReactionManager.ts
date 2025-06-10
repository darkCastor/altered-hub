import type { GameStateManager } from './GameStateManager';
import type { ObjectFactory } from '../ObjectFactory';
import type { IGameObject, IEmblemObject } from './types/objects';
import { isGameObject } from './types/objects';
import type { EffectResolver } from './EffectResolver';
import { AbilityType, CardType } from './types/enums';

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
     * Rule 6.3.g
     * @param eventType The type of event that occurred (e.g., 'entityMoved').
     * @param payload The data associated with the event.
     */
    public checkForTriggers(eventType: string, payload: any): void {
        const allObjects = this.getAllObjectsInPlay();

        for (const object of allObjects) {
            for (const ability of object.abilities) {
                if (ability.abilityType !== AbilityType.Reaction || !ability.trigger || ability.trigger.eventType !== eventType) {
                    continue;
                }

                const isSelfMove = ability.isSelfMove;
                if (isSelfMove && payload.entity.objectId !== object.objectId) {
                    continue;
                }

                if (ability.trigger.condition(payload, object, this.gsm)) {
                    console.log(`[ReactionManager] TRIGGERED: Ability "${ability.text}" on ${object.name} (${object.objectId})`);
                    
                    const emblem = this.objectFactory.createReactionEmblem(ability, object, payload); // FIX: Now correctly calls the method
                    this.gsm.state.sharedZones.limbo.add(emblem);
                    console.log(`[ReactionManager] Created Emblem-Reaction ${emblem.objectId} in Limbo.`);
                }
            }
        }
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
            const initiativePlayerId = this.gsm.state.currentPlayerId;
            const playerReactions = reactionsInLimbo.filter(r => r.controllerId === initiativePlayerId);

            if (playerReactions.length === 0) {
                console.log(`[ReactionManager] Player ${initiativePlayerId} has no reactions to resolve. Breaking loop.`);
                break;
            }
            
            const reactionToResolve = playerReactions[0];
            console.log(`[ReactionManager] Player ${initiativePlayerId} resolves: "${reactionToResolve.name}"`);

            this.effectResolver.resolve(reactionToResolve.boundEffect);
            this.gsm.state.sharedZones.limbo.remove(reactionToResolve.objectId);

            reactionsInLimbo = this.getReactionsInLimbo();
        }

        console.log(`[ReactionManager] Reaction processing loop finished.`);
    }

    private getReactionsInLimbo(): IEmblemObject[] {
        const limboEntities = this.gsm.state.sharedZones.limbo.getAll();
        return limboEntities.filter(
            (e): e is IEmblemObject => isGameObject(e) && e.type === CardType.Emblem && (e as IEmblemObject).emblemSubType === 'Reaction' // FIX: Check emblemSubType on casted object
        );
    }
    
    private getAllObjectsInPlay(): IGameObject[] {
        const objects: IGameObject[] = [];
        this.gsm.state.players.forEach(player => {
            objects.push(...player.zones.expedition.getAll().filter(isGameObject)); // FIX: Correctly access expedition zone
            objects.push(...player.zones.landmarkZone.getAll().filter(isGameObject));
            objects.push(...player.zones.heroZone.getAll().filter(isGameObject));
        });
        this.gsm.state.players.forEach(player => {
             objects.push(...player.zones.reserve.getAll().filter(isGameObject));
        });

        return objects;
    }
}