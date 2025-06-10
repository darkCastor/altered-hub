import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IAbility } from './types/abilities';
import { CardType } from './types/enums';
import { AbilityType } from './types/abilities';
import { isGameObject } from './types/objects';

/**
 * Manages passive ability application order and dependency resolution
 * Rule 2.3 - Passive abilities modify characteristics and rules
 */
export class PassiveAbilityManager {
    private dependencyGraph: Map<string, string[]> = new Map();
    private appliedAbilities: Set<string> = new Set();

    constructor(private gsm: GameStateManager) {}

    /**
     * Applies all passive abilities in correct dependency order
     * Rule 2.3.2 - Dependency resolution for passive abilities
     */
    public applyAllPassiveAbilities(): void {
        console.log('[PassiveManager] Applying all passive abilities');
        
        // Clear previous applications
        this.appliedAbilities.clear();
        this.buildDependencyGraph();
        
        // Get all objects with passive abilities
        const objectsWithPassives = this.getAllObjectsWithPassiveAbilities();
        
        // Sort by timestamp for dependency resolution
        objectsWithPassives.sort((a, b) => a.timestamp - b.timestamp);
        
        // Apply abilities in dependency order
        for (const object of objectsWithPassives) {
            this.applyObjectPassiveAbilities(object);
        }
        
        console.log(`[PassiveManager] Applied passive abilities for ${objectsWithPassives.length} objects`);
    }

    /**
     * Applies passive abilities for a specific object
     * Rule 2.3.1 - Base characteristics vs current characteristics
     */
    public applyObjectPassiveAbilities(object: IGameObject): void {
        // Start with base characteristics
        object.currentCharacteristics = { ...object.baseCharacteristics };
        
        // Apply all passive abilities affecting this object
        for (const ability of object.abilities) {
            if (ability.abilityType === AbilityType.Passive) {
                this.applyPassiveAbility(object, ability);
            }
        }
        
        // Apply external passive abilities affecting this object
        this.applyExternalPassiveAbilities(object);
        
        // Update automatic statuses based on modified characteristics
        this.gsm.statusHandler.updateAutomaticStatuses(object);
    }

    /**
     * Applies a single passive ability
     */
    private applyPassiveAbility(object: IGameObject, ability: IAbility): void {
        const abilityId = `${object.objectId}-${ability.abilityId}`;
        
        if (this.appliedAbilities.has(abilityId)) {
            return; // Already applied
        }
        
        console.log(`[PassiveManager] Applying passive ability: ${ability.text}`);
        
        // Apply the passive effect based on the ability type
        this.executePassiveEffect(object, ability);
        
        this.appliedAbilities.add(abilityId);
    }

    /**
     * Executes the effect of a passive ability
     */
    private executePassiveEffect(object: IGameObject, ability: IAbility): void {
        // Parse and apply passive effects
        // This would typically involve modifying characteristics
        
        if (ability.effect && ability.effect.steps) {
            for (const step of ability.effect.steps) {
                this.applyPassiveEffectStep(object, step);
            }
        }
        
        // Handle keyword passive abilities
        if (ability.isKeyword && ability.keyword) {
            this.applyKeywordPassiveEffect(object, ability);
        }
    }

    /**
     * Applies a passive effect step
     */
    private applyPassiveEffectStep(object: IGameObject, step: any): void {
        switch (step.verb?.toLowerCase()) {
            case 'modify_statistics':
                this.modifyStatistics(object, step.parameters);
                break;
            case 'modify_cost':
                this.modifyCost(object, step.parameters);
                break;
            case 'grant_ability':
                this.grantAbility(object, step.parameters);
                break;
            case 'modify_limit':
                this.modifyLimit(object, step.parameters);
                break;
            default:
                console.log(`[PassiveManager] Unknown passive effect: ${step.verb}`);
        }
    }

    /**
     * Applies keyword passive effects
     */
    private applyKeywordPassiveEffect(object: IGameObject, ability: IAbility): void {
        switch (ability.keyword) {
            case 'Tough':
                // Tough affects targeting (handled elsewhere)
                break;
            case 'Defender':
                // Defender affects expedition movement (handled elsewhere)
                break;
            case 'Gigantic':
                // Gigantic affects expedition presence (handled elsewhere)
                break;
            default:
                // Other keyword passives
                break;
        }
    }

    /**
     * Modifies object statistics
     */
    private modifyStatistics(object: IGameObject, parameters: any): void {
        if (!object.currentCharacteristics.statistics) {
            object.currentCharacteristics.statistics = { forest: 0, mountain: 0, water: 0 };
        }
        
        const stats = object.currentCharacteristics.statistics;
        
        if (parameters.forest !== undefined) {
            stats.forest += parameters.forest;
        }
        if (parameters.mountain !== undefined) {
            stats.mountain += parameters.mountain;
        }
        if (parameters.water !== undefined) {
            stats.water += parameters.water;
        }
        
        console.log(`[PassiveManager] Modified ${object.name} statistics`);
    }

    /**
     * Modifies card costs
     */
    private modifyCost(object: IGameObject, parameters: any): void {
        if (parameters.handCost !== undefined) {
            object.currentCharacteristics.handCost = 
                (object.currentCharacteristics.handCost || 0) + parameters.handCost;
        }
        if (parameters.reserveCost !== undefined) {
            object.currentCharacteristics.reserveCost = 
                (object.currentCharacteristics.reserveCost || 0) + parameters.reserveCost;
        }
        
        console.log(`[PassiveManager] Modified ${object.name} costs`);
    }

    /**
     * Grants additional abilities
     */
    private grantAbility(object: IGameObject, parameters: any): void {
        if (parameters.ability) {
            object.abilities.push(parameters.ability);
            console.log(`[PassiveManager] Granted ability to ${object.name}`);
        }
    }

    /**
     * Modifies limits (reserve, landmark)
     */
    private modifyLimit(object: IGameObject, parameters: any): void {
        if (parameters.reserveLimit !== undefined) {
            object.currentCharacteristics.reserveLimit = 
                (object.currentCharacteristics.reserveLimit || 0) + parameters.reserveLimit;
        }
        if (parameters.landmarkLimit !== undefined) {
            object.currentCharacteristics.landmarkLimit = 
                (object.currentCharacteristics.landmarkLimit || 0) + parameters.landmarkLimit;
        }
        
        console.log(`[PassiveManager] Modified ${object.name} limits`);
    }

    /**
     * Applies external passive abilities from other objects
     */
    private applyExternalPassiveAbilities(targetObject: IGameObject): void {
        // Check all other objects for abilities that affect this object
        for (const zone of this.getAllVisibleZones()) {
            for (const entity of zone.getAll()) {
                if (isGameObject(entity) && entity.objectId !== targetObject.objectId) {
                    this.checkExternalAbilities(entity, targetObject);
                }
            }
        }
    }

    /**
     * Checks if one object has abilities affecting another
     */
    private checkExternalAbilities(sourceObject: IGameObject, targetObject: IGameObject): void {
        for (const ability of sourceObject.abilities) {
            if (ability.abilityType === AbilityType.Passive && this.abilityAffectsTarget(ability, targetObject)) {
                this.applyExternalPassiveAbility(sourceObject, targetObject, ability);
            }
        }
    }

    /**
     * Checks if an ability affects a target object
     */
    private abilityAffectsTarget(ability: IAbility, target: IGameObject): boolean {
        // This would check ability targeting criteria
        // For now, return false (no external passive abilities implemented)
        return false;
    }

    /**
     * Applies an external passive ability
     */
    private applyExternalPassiveAbility(source: IGameObject, target: IGameObject, ability: IAbility): void {
        console.log(`[PassiveManager] Applying external passive from ${source.name} to ${target.name}`);
        this.executePassiveEffect(target, ability);
    }

    /**
     * Gets all objects with passive abilities
     */
    private getAllObjectsWithPassiveAbilities(): IGameObject[] {
        const objects: IGameObject[] = [];
        
        for (const zone of this.getAllVisibleZones()) {
            for (const entity of zone.getAll()) {
                if (isGameObject(entity) && this.hasPassiveAbilities(entity)) {
                    objects.push(entity);
                }
            }
        }
        
        return objects;
    }

    /**
     * Checks if an object has passive abilities
     */
    private hasPassiveAbilities(object: IGameObject): boolean {
        return object.abilities.some(ability => ability.abilityType === AbilityType.Passive);
    }

    /**
     * Builds dependency graph for ability application order
     * Rule 2.3.2 - Dependencies determine application order
     */
    private buildDependencyGraph(): void {
        this.dependencyGraph.clear();
        
        // For now, use timestamp order (Rule 2.3.3)
        // More complex dependency resolution would be implemented here
        
        const allObjects = this.getAllObjectsWithPassiveAbilities();
        
        for (const object of allObjects) {
            this.dependencyGraph.set(object.objectId, []);
        }
        
        // TODO: Add actual dependency detection based on ability interactions
    }

    /**
     * Resolves dependencies using topological sort
     * Rule 2.3.3 - Order of application when dependencies exist
     */
    private resolveDependencies(objects: IGameObject[]): IGameObject[] {
        // For now, sort by timestamp (Rule 2.3.3)
        // More sophisticated dependency resolution would be implemented here
        return objects.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Recalculates all passive abilities when game state changes
     */
    public recalculatePassiveAbilities(): void {
        console.log('[PassiveManager] Recalculating all passive abilities');
        
        // Reset all objects to base characteristics
        for (const zone of this.getAllVisibleZones()) {
            for (const entity of zone.getAll()) {
                if (isGameObject(entity)) {
                    entity.currentCharacteristics = { ...entity.baseCharacteristics };
                }
            }
        }
        
        // Reapply all passive abilities
        this.applyAllPassiveAbilities();
    }

    /**
     * Handles when an object enters or leaves play
     */
    public onObjectZoneChange(object: IGameObject, fromZone: any, toZone: any): void {
        // Recalculate passive abilities when objects move between visible zones
        const fromVisible = fromZone?.visibility === 'visible';
        const toVisible = toZone?.visibility === 'visible';
        
        if (fromVisible !== toVisible) {
            // Object entering or leaving visible zones
            this.recalculatePassiveAbilities();
        }
    }

    /**
     * Gets all visible zones for passive ability checking
     */
    private *getAllVisibleZones(): Generator<any> {
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