import type { ICardDefinition, ICardInstance } from './types/cards';
import type { IGameObject, IEmblemObject } from './types/objects';
import { CardType, CounterType, StatusType } from './types/enums';
import type { IAbility, IEffect } from './types/abilities';
import { isGameObject } from './types/objects';

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

    /**
     * Creates a game object directly from a card definition
     * Convenience method for testing and game initialization
     */
    public createCard(definitionId: string, ownerId: string): IGameObject {
        const cardInstance = this.createCardInstance(definitionId, ownerId);
        return this.createGameObject(cardInstance, ownerId);
    }

    public createGameObject(
        source: ICardInstance | IGameObject, 
        controllerId: string,
        initialCounters?: Map<CounterType, number> // Allow specifying initial counters
    ): IGameObject {
        const definition = this.cardDefinitions.get(source.definitionId);
        if (!definition) {
            throw new Error(`Card definition not found: ${source.definitionId}`);
        }

        const baseCharacteristics = { ...definition };
        
        const instantiatedAbilities = definition.abilities.map(ability => ({ ...ability }));

        const newObject: IGameObject = {
            id: (source as ICardInstance).instanceId || ObjectFactory.createUniqueId(), // Ensure 'id' is populated
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
            counters: new Map<CounterType, number>(), // Default to empty map
            abilities: [],
        };
        
        // Apply initial counters if provided by the GameStateManager.
        if (initialCounters) {
            newObject.counters = new Map(initialCounters);
        }

        // Correctly copy statuses from the source if it was an object (e.g., in Limbo/Reserve).
        if (isGameObject(source)) {
            newObject.statuses = new Set(source.statuses);
        }

        newObject.abilities = instantiatedAbilities.map(ability => ({
            ...ability,
            sourceObjectId: newObject.objectId,
            effect: { ...ability.effect, sourceObjectId: newObject.objectId }
        }));


        return newObject;
    }

    public createReactionEmblem(sourceAbility: IAbility, sourceObject: IGameObject, triggerPayload: any): IEmblemObject {
        if (!sourceAbility.sourceObjectId) {
            throw new Error("Cannot create emblem from an ability not bound to an object.");
        }
    
        // Bind the trigger payload and original source to the effect for later resolution
        const boundEffect: IEffect = {
            ...sourceAbility.effect,
            sourceObjectId: sourceObject.objectId, 
            _triggerPayload: triggerPayload 
        };
    
        const emblem: IEmblemObject = {
            objectId: ObjectFactory.createUniqueId(),
            definitionId: `emblem-reaction-${sourceAbility.abilityId}`,
            name: `Reaction: ${sourceAbility.text}`,
            type: CardType.Emblem,
            emblemSubType: 'Reaction', // Rule 2.2.2.m
            baseCharacteristics: {},
            currentCharacteristics: {},
            ownerId: sourceObject.ownerId,
            controllerId: sourceObject.controllerId,
            timestamp: ObjectFactory.getNewTimestamp(),
            statuses: new Set(),
            counters: new Map(),
            abilities: [],
            boundEffect: boundEffect,
        };
    
        return emblem;
    }
}
