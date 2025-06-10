import type { ICardDefinition, ICardInstance } from './engine/types/cards';
import type { IEmblemObject, IGameObject } from './engine/types/objects';
import type { IAbility, IEffect } from './engine/types/abilities';
import { CardType, StatusType, CounterType } from './engine/types/enums';

/**
 * Responsible for creating new instances of game objects.
 * This is central to enforcing the "New Zone, New Object" Golden Rule.
 * Rule 1.4.4, 2.1.d
 */
export class ObjectFactory {
    private static nextId = 0;
    private static nextTimestamp = 0;

    private cardDefinitions: Map<string, ICardDefinition>;

    constructor(definitions: Map<string, ICardDefinition>) {
        this.cardDefinitions = definitions;
    }

    public static createUniqueId(): string {
        return `instance-${this.nextId++}`;
    }

    public static getNewTimestamp(): number {
        return this.nextTimestamp++;
    }

    public createCardInstance(definitionId: string, ownerId: string): ICardInstance {
        if (!this.cardDefinitions.has(definitionId)) {
            throw new Error(`Card definition not found: ${definitionId}`);
        }
        return {
            instanceId: ObjectFactory.createUniqueId(),
            definitionId,
            ownerId,
        };
    }

    public createGameObject(source: ICardInstance | IGameObject, controllerId: string): IGameObject {
        const definition = this.cardDefinitions.get(source.definitionId);
        if (!definition) {
            throw new Error(`Card definition not found: ${source.definitionId}`);
        }

        const baseCharacteristics = { ...definition };
        const instantiatedAbilities = definition.abilities.map(ability => ({ ...ability }));

        const newObject: IGameObject = {
            objectId: ObjectFactory.createUniqueId(),
            definitionId: source.definitionId,
            name: definition.name,
            type: definition.type,
            subTypes: definition.subTypes,
            baseCharacteristics,
            currentCharacteristics: { ...baseCharacteristics },
            ownerId: source.ownerId,
            controllerId: controllerId,
            timestamp: ObjectFactory.getNewTimestamp(),
            statuses: new Set<StatusType>(),
            counters: new Map<CounterType, number>(),
            abilities: [],
        };

        newObject.abilities = instantiatedAbilities.map(ability => ({
            ...ability,
            sourceObjectId: newObject.objectId,
            effect: { ...ability.effect, sourceObjectId: newObject.objectId }
        }));

        return newObject;
    }
    
    // FIX: Added the missing method
    public createReactionEmblem(sourceAbility: IAbility, sourceObject: IGameObject, triggerPayload: any): IEmblemObject {
        const boundEffect: IEffect = {
            ...sourceAbility.effect,
            sourceObjectId: sourceObject.objectId,
            _triggerPayload: triggerPayload,
        };

        const emblem: IEmblemObject = {
            objectId: ObjectFactory.createUniqueId(), // FIX: Use static context
            definitionId: `emblem-${sourceObject.definitionId}-${sourceAbility.abilityId}`,
            name: `Reaction: ${sourceAbility.text}`,
            type: CardType.Emblem,
            emblemSubType: 'Reaction', // FIX: Use emblemSubType instead of emblemType
            baseCharacteristics: {},
            currentCharacteristics: {},
            ownerId: sourceObject.ownerId,
            controllerId: sourceObject.controllerId,
            timestamp: ObjectFactory.getNewTimestamp(),
            statuses: new Set(),
            counters: new Map(),
            abilities: [],
            boundEffect,
        };

        return emblem;
    }
}