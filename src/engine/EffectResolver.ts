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
        
        if (step.targets === 'self' && sourceObjectId) {
            const selfObject = this.gsm.getObject(sourceObjectId);
            if (selfObject) targets.push(selfObject);
        }

        if (targets.length === 0) {
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
                    target.statuses.add(statusToGain);
                    console.log(`[EffectResolver] Object ${target.objectId} ('${target.name}') gained status: ${statusToGain}`);
                    this.gsm.eventBus.publish('statusGained', { targetId: target.objectId, status: statusToGain });
                });
                break;
            default:
                console.warn(`[EffectResolver] Unknown verb: ${step.verb}`);
        }
    }
}