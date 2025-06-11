// src/engine/RuleAdjudicator.ts (New File)

import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IAbility } from './types/abilities';

export class RuleAdjudicator {
    constructor(private gsm: GameStateManager) {}

    /**
     * Re-evaluates and applies all passive abilities in the game.
     * This should be called after any event modifies the game state.
     * Implements Rule 2.3.
     */
    public applyAllPassiveAbilities(): void {
        const allObjects = this.getAllPlayObjects();
        
        // 1. Reset all objects to their base characteristics
        allObjects.forEach(obj => {
            obj.currentCharacteristics = { ...obj.baseCharacteristics };
        });

        // 2. Gather all passive abilities
        // Ensure each ability has its sourceObjectId correctly set to the current object's ID
        // This is critical because obj.abilities might be derived from definitions or prior states.
        const allPassiveAbilities = allObjects.flatMap(obj => {
            return obj.abilities
                .filter(a => a.abilityType === 'passive')
                .map(a => ({ ...a, sourceObjectId: obj.objectId }));
        });

        // 3. Sort abilities based on dependency and then timestamp (Rule 2.3.3)
        //    This is a complex step. You'll need to build a dependency graph.
        const sortedAbilities = this.sortAbilitiesByDependency(allPassiveAbilities);

        // 4. Apply abilities in the sorted order
        for (const ability of sortedAbilities) {
            this.applyAbility(ability);
        }

        console.log('[RuleAdjudicator] Re-applied all passive abilities.');
    }

    private doesADependOnB(abilityA: IAbility, abilityB: IAbility, unappliedAbilities: IAbility[]): boolean {
        // Placeholder - Rule 2.3.2
        // TODO: Implement actual dependency checking logic
        // This will involve checking:
        // - If B removes A (e.g., "loses all abilities")
        // - If B grants A
        // - If B modifies something A depends on (e.g. characteristics)
        // - If B changes the existence/zone of A's source or potential targets
        return false;
    }

    private sortAbilitiesByDependency(abilities: IAbility[]): IAbility[] {
        let unappliedAbilities = [...abilities];
        const sortedAbilities: IAbility[] = [];
        const appliedTimestamps = new Set<number>(); // To handle Rule 2.3.3.d for ties

        while (unappliedAbilities.length > 0) {
            let freeAbilities: IAbility[] = [];

            for (const abilityA of unappliedAbilities) {
                let isFree = true;
                for (const abilityB of unappliedAbilities) {
                    if (abilityA === abilityB) continue;

                    if (this.doesADependOnB(abilityA, abilityB, unappliedAbilities)) {
                        // A depends on B. Is B dependent on A as well (circular)?
                        if (!this.doesADependOnB(abilityB, abilityA, unappliedAbilities)) {
                            isFree = false; // A depends on B, but B does not depend on A
                            break;
                        }
                        // If B also depends on A, it's a circular dependency,
                        // and they are considered "free" relative to each other for timestamp sorting.
                    }
                }
                if (isFree) {
                    freeAbilities.push(abilityA);
                }
            }

            if (freeAbilities.length === 0 && unappliedAbilities.length > 0) {
                // This should ideally not happen if dependency logic is correct,
                // but as a fallback, or if there's an unresolvable circular dependency
                // not handled by timestamp, we might break or add error handling.
                // For now, let's just add the remaining by timestamp to avoid infinite loops.
                console.warn("[RuleAdjudicator] No free abilities found, but unapplied abilities remain. Sorting rest by timestamp.", unappliedAbilities);
                freeAbilities = [...unappliedAbilities];
            }


            // From the "free" abilities, select the one whose source object has the smallest timestamp. (Rule 2.3.3.c)
            // Handle ties using Rule 2.3.3.d (already applied abilities' timestamps) - this is complex.
            // For now, a simple timestamp sort.
            freeAbilities.sort((a, b) => {
                const objA = this.gsm.getObject(a.sourceObjectId!);
                const objB = this.gsm.getObject(b.sourceObjectId!);
                if (!objA || !objB) return 0; // Should not happen if data is consistent
                if (objA.timestamp === objB.timestamp) {
                    // Rule 2.3.3.d - if timestamps are equal, check if one source object's abilities
                    // have already been applied. This part is tricky and might need more state.
                    // For now, a simple secondary sort or arbitrary pick is fine.
                    // A truly compliant solution would need to track which object's abilities
                    // (even if different specific abilities) were chosen in previous steps.
                    // This simplified version might not fully comply with 2.3.3.d for tie-breaking.
                    return 0; // Keep original order for now on ties, or implement a more robust tie-breaker
                }
                return objA.timestamp - objB.timestamp;
            });

            if (freeAbilities.length > 0) {
                const nextAbility = freeAbilities[0];
                sortedAbilities.push(nextAbility);
                unappliedAbilities = unappliedAbilities.filter(a => a !== nextAbility);
                const sourceObject = this.gsm.getObject(nextAbility.sourceObjectId!);
                if (sourceObject) {
                    appliedTimestamps.add(sourceObject.timestamp);
                }
            } else if (unappliedAbilities.length > 0) {
                 // If no ability was selected (e.g. freeAbilities was empty or became empty after filtering)
                 // and there are still unapplied abilities, this indicates a potential issue
                 // or a state where the current simplified dependency logic cannot proceed.
                 // Fallback: Add the one with the smallest timestamp from remaining unapplied to prevent infinite loop.
                 unappliedAbilities.sort((a,b) => {
                    const objA = this.gsm.getObject(a.sourceObjectId!);
                    const objB = this.gsm.getObject(b.sourceObjectId!);
                    if (!objA || !objB) return 0;
                    return objA.timestamp - objB.timestamp;
                 });
                 const fallbackAbility = unappliedAbilities.shift();
                 if(fallbackAbility){
                    sortedAbilities.push(fallbackAbility);
                    const sourceObject = this.gsm.getObject(fallbackAbility.sourceObjectId!);
                    if (sourceObject) {
                        appliedTimestamps.add(sourceObject.timestamp);
                    }
                 }
            }
        }
        return sortedAbilities;
    }
    
    private applyAbility(ability: IAbility): void {
        if (!ability.sourceObjectId) return;

        const sourceObject = this.gsm.getObject(ability.sourceObjectId);
        if (!sourceObject) {
            console.warn(`[RuleAdjudicator] Source object ${ability.sourceObjectId} not found for ability ${ability.abilityId}`);
            return;
        }

        // For now, assume the target of keyword abilities is the source object itself.
        // This will need to be expanded for abilities that target other objects.
        const targetObject = sourceObject;

        if (!targetObject.currentCharacteristics) {
            // This should not happen if objects are initialized correctly
            targetObject.currentCharacteristics = { ...targetObject.baseCharacteristics };
        }

        // Apply effects based on ability name or a specific tag/keyword
        // This will need to become more sophisticated.
        // Using ability.keyword as per the prompt's suggestion for IAbility type.

        if (ability.keyword) {
            switch (ability.keyword) {
                case 'Gigantic': // Assuming KeywordAbility enum or string literal
                    targetObject.currentCharacteristics.isGigantic = true;
                    console.log(`[RuleAdjudicator] Applied Gigantic to ${targetObject.name} (${targetObject.objectId})`);
                    break;
                case 'Defender':
                    targetObject.currentCharacteristics.hasDefender = true;
                    console.log(`[RuleAdjudicator] Applied Defender to ${targetObject.name} (${targetObject.objectId})`);
                    break;
                case 'Eternal':
                    targetObject.currentCharacteristics.isEternal = true;
                    console.log(`[RuleAdjudicator] Applied Eternal to ${targetObject.name} (${targetObject.objectId})`);
                    break;
                // Add more keyword cases here as they are defined
                default:
                    // console.log(`[RuleAdjudicator] Passive ability ${ability.abilityId} (Keyword: ${ability.keyword}) has no specific application logic yet.`);
                    break;
            }
        } else {
            // Handle non-keyword passive abilities if any (e.g. based on text or other properties)
            // For now, we are focusing on keywords.
            // console.log(`[RuleAdjudicator] Passive ability ${ability.abilityId} (no keyword) has no specific application logic yet.`);
        }
    }

    private getAllPlayObjects(): IGameObject[] {
        const objects: IGameObject[] = [];
        // Iterate over the values (IPlayer objects) of the Map
        for (const player of this.gsm.state.players.values()) {
            // Corrected to lowercase 'expedition' and 'landmark'
            if (player.zones.expedition) {
                objects.push(...player.zones.expedition.getAll());
            }
            if (player.zones.landmarkZone) {
                objects.push(...player.zones.landmarkZone.getAll());
            }
        }
        return objects;
    }
}