import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IEffect, IEffectStep } from './types/abilities';
import { CounterType, StatusType, CardType, ZoneIdentifier } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Processes effect resolution with all core effect verbs
 * Rule 7.3 - Keyword Actions and core game effects
 */
export class EffectProcessor {
    constructor(private gsm: GameStateManager) {}

    /**
     * Resolves a complete effect with all its steps
     * Rule 1.2.6 - Effects are changes to the game state
     */
    public async resolveEffect(effect: IEffect, sourceObject?: IGameObject): Promise<void> {
        console.log(`[EffectProcessor] Resolving effect with ${effect.steps.length} steps`);
        
        for (const step of effect.steps) {
            try {
                await this.resolveEffectStep(step, sourceObject);
            } catch (error) {
                console.error(`[EffectProcessor] Error resolving step ${step.verb}:`, error);
                // Continue with next step unless critical
            }
        }
    }

    /**
     * Resolves a single effect step based on its verb
     */
    private async resolveEffectStep(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        // Skip optional effects if conditions not met
        if (step.isOptional && !this.shouldExecuteOptionalEffect(step)) {
            console.log(`[EffectProcessor] Skipping optional effect: ${step.verb}`);
            return;
        }

        console.log(`[EffectProcessor] Executing ${step.verb}`);

        switch (step.verb.toLowerCase()) {
            case 'draw':
                await this.effectDraw(step, sourceObject);
                break;
            case 'discard':
                await this.effectDiscard(step, sourceObject);
                break;
            case 'resupply':
                await this.effectResupply(step, sourceObject);
                break;
            case 'moveforward':
            case 'move_forward':
                await this.effectMoveForward(step, sourceObject);
                break;
            case 'movebackward':
            case 'move_backward':
                await this.effectMoveBackward(step, sourceObject);
                break;
            case 'create':
                await this.effectCreate(step, sourceObject);
                break;
            case 'augment':
                await this.effectAugment(step, sourceObject);
                break;
            case 'exchange':
                await this.effectExchange(step, sourceObject);
                break;
            case 'gaincounter':
            case 'gain_counter':
                await this.effectGainCounter(step, sourceObject);
                break;
            case 'losecounter':
            case 'lose_counter':
                await this.effectLoseCounter(step, sourceObject);
                break;
            case 'gainstatus':
            case 'gain_status':
                await this.effectGainStatus(step, sourceObject);
                break;
            case 'losestatus':
            case 'lose_status':
                await this.effectLoseStatus(step, sourceObject);
                break;
            case 'moveto':
            case 'move_to':
                await this.effectMoveTo(step, sourceObject);
                break;
            case 'ready':
                await this.effectReady(step, sourceObject);
                break;
            case 'exhaust':
                await this.effectExhaust(step, sourceObject);
                break;
            default:
                console.warn(`[EffectProcessor] Unknown effect verb: ${step.verb}`);
        }
    }

    /**
     * Rule 7.3.1 - Draw: Each player draws cards equal to the number specified
     */
    private async effectDraw(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const count = step.parameters?.count || 1;

        for (const target of targets) {
            if (typeof target === 'string') {
                // Target is a player ID
                await this.gsm.drawCards(target, count);
                console.log(`[EffectProcessor] Player ${target} drew ${count} cards`);
            }
        }
    }

    /**
     * Rule 7.3.2 - Discard: Players discard specified cards
     */
    private async effectDiscard(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const count = step.parameters?.count || 1;

        for (const target of targets) {
            if (typeof target === 'string') {
                const player = this.gsm.getPlayer(target);
                if (!player) continue;

                // Discard cards from hand
                const handCards = player.zones.hand.getAll().slice(0, count);
                for (const card of handCards) {
                    const cardId = isGameObject(card) ? card.objectId : card.instanceId;
                    this.gsm.moveEntity(
                        cardId,
                        player.zones.hand,
                        player.zones.discardPileZone,
                        target
                    );
                }
                console.log(`[EffectProcessor] Player ${target} discarded ${handCards.length} cards`);
            }
        }
    }

    /**
     * Rule 7.3.3 - Resupply: Move cards from discard pile to reserve
     */
    private async effectResupply(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const count = step.parameters?.count || 1;

        for (const target of targets) {
            if (typeof target === 'string') {
                const player = this.gsm.getPlayer(target);
                if (!player) continue;

                const discardCards = player.zones.discardPileZone.getAll().slice(0, count);
                for (const card of discardCards) {
                    this.gsm.moveEntity(
                        isGameObject(card) ? card.objectId : card.instanceId,
                        player.zones.discardPileZone,
                        player.zones.reserve,
                        target
                    );
                }
                console.log(`[EffectProcessor] Player ${target} resupplied ${discardCards.length} cards`);
            }
        }
    }

    /**
     * Rule 7.3.4 - Move Forward: Expeditions move forward
     */
    private async effectMoveForward(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const distance = step.parameters?.distance || 1;

        for (const target of targets) {
            if (typeof target === 'string') {
                const player = this.gsm.getPlayer(target);
                if (!player) continue;

                // Move both expeditions forward
                player.heroExpedition.position += distance;
                player.companionExpedition.position += distance;
                console.log(`[EffectProcessor] Player ${target} expeditions moved forward ${distance}`);
            }
        }
    }

    /**
     * Rule 7.3.5 - Move Backward: Expeditions move backward
     */
    private async effectMoveBackward(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const distance = step.parameters?.distance || 1;

        for (const target of targets) {
            if (typeof target === 'string') {
                const player = this.gsm.getPlayer(target);
                if (!player) continue;

                // Move both expeditions backward (minimum 0)
                player.heroExpedition.position = Math.max(0, player.heroExpedition.position - distance);
                player.companionExpedition.position = Math.max(0, player.companionExpedition.position - distance);
                console.log(`[EffectProcessor] Player ${target} expeditions moved backward ${distance}`);
            }
        }
    }

    /**
     * Rule 7.3.6 - Create: Create tokens or emblems
     */
    private async effectCreate(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const tokenType = step.parameters?.tokenType || 'Character';
        const count = step.parameters?.count || 1;

        for (const target of targets) {
            if (typeof target === 'string') {
                const player = this.gsm.getPlayer(target);
                if (!player) continue;

                // TODO: Create token objects
                console.log(`[EffectProcessor] Created ${count} ${tokenType} tokens for ${target}`);
            }
        }
    }

    /**
     * Rule 7.3.7 - Augment: Give objects new abilities
     */
    private async effectAugment(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const ability = step.parameters?.ability;

        for (const target of targets) {
            if (typeof target === 'object' && 'objectId' in target && ability) {
                target.abilities.push(ability);
                console.log(`[EffectProcessor] Augmented ${target.name} with new ability`);
            }
        }
    }

    /**
     * Rule 7.3.8 - Exchange: Swap objects between zones
     */
    private async effectExchange(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        // TODO: Implement object exchange logic
        console.log(`[EffectProcessor] Exchange not fully implemented`);
    }

    /**
     * Gain Counter: Add counters to objects
     */
    private async effectGainCounter(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const counterType = step.parameters?.counterType || CounterType.Boost;
        const amount = step.parameters?.amount || 1;

        for (const target of targets) {
            if (this.isTargetGameObject(target)) {
                const current = target.counters.get(counterType) || 0;
                target.counters.set(counterType, current + amount);
                console.log(`[EffectProcessor] ${target.name} gained ${amount} ${counterType} counters`);
            }
        }
    }

    /**
     * Lose Counter: Remove counters from objects
     */
    private async effectLoseCounter(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const counterType = step.parameters?.counterType || CounterType.Boost;
        const amount = step.parameters?.amount || 1;

        for (const target of targets) {
            if (this.isTargetGameObject(target)) {
                const current = target.counters.get(counterType) || 0;
                target.counters.set(counterType, Math.max(0, current - amount));
                console.log(`[EffectProcessor] ${target.name} lost ${amount} ${counterType} counters`);
            }
        }
    }

    /**
     * Gain Status: Add status effects to objects
     */
    private async effectGainStatus(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const statusType = step.parameters?.statusType;

        for (const target of targets) {
            if (this.isTargetGameObject(target) && statusType) {
                target.statuses.add(statusType);
                console.log(`[EffectProcessor] ${target.name} gained ${statusType} status`);
            }
        }
    }

    /**
     * Lose Status: Remove status effects from objects
     */
    private async effectLoseStatus(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const statusType = step.parameters?.statusType;

        for (const target of targets) {
            if (this.isTargetGameObject(target) && statusType) {
                target.statuses.delete(statusType);
                console.log(`[EffectProcessor] ${target.name} lost ${statusType} status`);
            }
        }
    }

    /**
     * Move To: Move objects to specified zones
     */
    private async effectMoveTo(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);
        const destinationZone = step.parameters?.zone;

        for (const target of targets) {
            if (this.isTargetGameObject(target) && destinationZone) {
                const currentZone = this.gsm.findZoneOfObject(target.objectId);
                const destZone = this.findZoneByType(target.controllerId, destinationZone);
                
                if (currentZone && destZone) {
                    this.gsm.moveEntity(target.objectId, currentZone, destZone, target.controllerId);
                    console.log(`[EffectProcessor] Moved ${target.name} to ${destinationZone}`);
                }
            }
        }
    }

    /**
     * Ready: Remove Exhausted status
     */
    private async effectReady(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);

        for (const target of targets) {
            if (this.isTargetGameObject(target)) {
                target.statuses.delete(StatusType.Exhausted);
                console.log(`[EffectProcessor] ${target.name} became ready`);
            }
        }
    }

    /**
     * Exhaust: Add Exhausted status
     */
    private async effectExhaust(step: IEffectStep, sourceObject?: IGameObject): Promise<void> {
        const targets = this.resolveTargets(step.targets, sourceObject);

        for (const target of targets) {
            if (this.isTargetGameObject(target)) {
                target.statuses.add(StatusType.Exhausted);
                console.log(`[EffectProcessor] ${target.name} became exhausted`);
            }
        }
    }

    /**
     * Type guard to check if a target is a game object
     */
    private isTargetGameObject(target: IGameObject | string): target is IGameObject {
        return typeof target === 'object' && 'objectId' in target;
    }

    /**
     * Resolves effect targets based on target specification
     */
    private resolveTargets(targets: any, sourceObject?: IGameObject): (IGameObject | string)[] {
        if (targets === 'self' && sourceObject) {
            return [sourceObject];
        }

        if (targets === 'controller' && sourceObject) {
            return [sourceObject.controllerId];
        }

        if (typeof targets === 'object' && targets.type === 'select') {
            // TODO: Implement complex target selection
            return [];
        }

        return [];
    }

    /**
     * Finds a zone by type for a player
     */
    private findZoneByType(playerId: string, zoneType: string): any {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return null;

        switch (zoneType.toLowerCase()) {
            case 'hand': return player.zones.hand;
            case 'reserve': return player.zones.reserve;
            case 'expedition': return player.zones.expedition;
            case 'landmark': return player.zones.landmarkZone;
            case 'discard': return player.zones.discardPile;
            case 'mana': return player.zones.manaZone;
            case 'hero': return player.zones.heroZone;
            default: return null;
        }
    }

    /**
     * Determines if optional effects should execute
     */
    private shouldExecuteOptionalEffect(step: IEffectStep): boolean {
        // TODO: Add player choice mechanism for optional effects
        // For now, always execute optional effects
        return true;
    }
}