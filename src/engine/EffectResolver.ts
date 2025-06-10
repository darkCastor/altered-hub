import type { GameStateManager } from './GameStateManager';
import type { IEffect, IEffectStep } from './types/abilities';
import { CounterType, StatusType } from './types/enums';
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
        // Do not return for some verbs that can have no targets, like 'draw'
        if (step.verb !== 'draw' && step.verb !== 'createToken') return; // Example
    }

    switch(step.verb) {
        case 'gainStatus': {
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
        }
        // Implement counter modification verbs
        case 'gainCounter': { // Rule 2.5.f / 7.3.12
            const type = step.parameters?.type as CounterType;
            const amount = step.parameters?.amount as number ?? 1;
            if (!type) {
                 console.error("Effect 'gainCounter' missing type parameter.");
                 return;
            }
            targets.forEach(target => {
                const currentAmount = target.counters.get(type) || 0;
                target.counters.set(type, currentAmount + amount);
                console.log(`[EffectResolver] Object ${target.objectId} gained ${amount} ${type} counter(s). Now has ${currentAmount + amount}.`);
                this.gsm.eventBus.publish('counterGained', { targetId: target.objectId, type, amount });
            });
            break;
        }
        case 'removeCounter': { // Rule 2.5.g
            const type = step.parameters?.type as CounterType;
            const amount = step.parameters?.amount as number ?? 1;
             if (!type) {
                 console.error("Effect 'removeCounter' missing type parameter.");
                 return;
            }
            targets.forEach(target => {
                const currentAmount = target.counters.get(type) || 0;
                if (currentAmount === 0) return;
                const newAmount = Math.max(0, currentAmount - amount);
                if (newAmount > 0) {
                    target.counters.set(type, newAmount);
                } else {
                    target.counters.delete(type);
                }
                console.log(`[EffectResolver] Object ${target.objectId} lost ${amount} ${type} counter(s). Now has ${newAmount}.`);
            });
            break;
        }
        case 'doubleCounters': { // Rule 7.3.6
            const type = step.parameters?.type as CounterType;
             if (!type) {
                 console.error("Effect 'doubleCounters' missing type parameter.");
                 return;
            }
            targets.forEach(target => {
                const currentAmount = target.counters.get(type) || 0;
                if (currentAmount > 0) {
                    target.counters.set(type, currentAmount * 2);
                    console.log(`[EffectResolver] Doubled ${type} counters on ${target.objectId}. Now has ${currentAmount * 2}.`);
                }
            });
            break;
        }
         case 'augment': { // Rule 7.3.3
            const type = step.parameters?.type as CounterType;
             if (!type) {
                 console.error("Effect 'augment' missing type parameter.");
                 return;
            }
            targets.forEach(target => {
                const currentAmount = target.counters.get(type) || 0;
                if (currentAmount > 0) {
                    target.counters.set(type, currentAmount + 1);
                    console.log(`[EffectResolver] Augmented ${type} counter on ${target.objectId}. Now has ${currentAmount + 1}.`);
                }
            });
            break;
        }
        default:
            console.warn(`[EffectResolver] Unknown verb: ${step.verb}`);
    }
}}
