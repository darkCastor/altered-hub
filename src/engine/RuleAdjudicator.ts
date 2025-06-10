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
        const allPassiveAbilities = allObjects.flatMap(obj => 
            obj.abilities.filter(a => a.abilityType === 'passive')
        );

        // 3. Sort abilities based on dependency and then timestamp (Rule 2.3.3)
        //    This is a complex step. You'll need to build a dependency graph.
        const sortedAbilities = this.sortAbilitiesByDependency(allPassiveAbilities);

        // 4. Apply abilities in the sorted order
        for (const ability of sortedAbilities) {
            this.applyAbility(ability);
        }

        console.log('[RuleAdjudicator] Re-applied all passive abilities.');
    }

    private sortAbilitiesByDependency(abilities: IAbility[]): IAbility[] {
        // TODO: Implement dependency graph and topological sort.
        // For now, we just sort by timestamp as a placeholder.
        return abilities.sort((a, b) => {
            const objA = this.gsm.getObject(a.sourceObjectId!);
            const objB = this.gsm.getObject(b.sourceObjectId!);
            if (!objA || !objB) return 0;
            return objA.timestamp - objB.timestamp;
        });
    }
    
    private applyAbility(ability: IAbility): void {
        // TODO: Implement the logic for each passive ability's effect.
        // e.g., if (ability.text.includes('gain Gigantic')) { ... }
    }

    private getAllPlayObjects(): IGameObject[] {
        // ... logic to get all objects from Expedition and Landmark zones ...
        return [];
    }
}