import type { GameStateManager } from './GameStateManager';
import type { IEffect, IEffectStep } from './types/abilities';
import { StatusType } from './types/enums';
import type { IGameObject } from './types/objects';
export class EffectResolver {
constructor(private gsm: GameStateManager) {}
public resolve(effect: IEffect) {
    console.log(`[EffectResolver] Resolving effect from source ${effect.sourceObjectId}`);
    for (const step of effect.steps) {
        this.resolveStep(step, effect.sourceObjectId);
    }
}

private resolveStep(step: IEffectStep, sourceObjectId?: string) {
    let targets: IGameObject[] = [];
    
    // This block will grow as more target types are supported.
    if (step.targets === 'self' && sourceObjectId) {
        const selfObject = this.gsm.getObject(sourceObjectId);
        if (selfObject) targets.push(selfObject);
    }

    // Rule 1.2.6.f / 6.5.h: If part of an effect cannot happen (e.g., no valid targets), the rest still happens.
    if (targets.length === 0 && step.targets !== 'controller') { // controller/player targets are handled differently
        console.warn(`[EffectResolver] No valid targets found for verb ${step.verb}`);
        return;
    }

    switch(step.verb) {
        case 'gainStatus':
            const statusToGain = step.parameters?.status as StatusType;
            if (!statusToGain) {
                console.error("Effect 'gainStatus' missing status parameter.");
                return;
            }
            targets.forEach(target => {
                // Rule 2.4.1.f: An object that already has a status cannot gain that status.
                if (target.statuses.has(statusToGain)) {
                    console.log(`[EffectResolver] Object ${target.objectId} already has status ${statusToGain}.`);
                } else {
                    target.statuses.add(statusToGain);
                    console.log(`[EffectResolver] Object ${target.objectId} ('${target.name}') gained status: ${statusToGain}`);
                    this.gsm.eventBus.publish('statusGained', { targetId: target.objectId, status: statusToGain });
                }
            });
            break;
        default:
            console.warn(`[EffectResolver] Unknown verb: ${step.verb}`);
    }
}}