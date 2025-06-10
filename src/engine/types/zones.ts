import type { ICardDefinition, ICardInstance } from './cards';
import type { IGameObject, IEmblemObject } from './objects';
import { CardType, CounterType, StatusType } from './enums';
import type { IAbility, IEffect } from './abilities';

export type ZoneEntity = ICardInstance | IGameObject;

/**
 * Base interface for all game zones.
 * Rule 3
 */
export interface IZone {
    id: string; // e.g., "Player1_Hand"
    zoneType: ZoneIdentifier;
    visibility: 'hidden' | 'visible'; // Rule 3.1.3
    ownerId?: string; // For personal zones (Rule 3.1.2)
    entities: Map<string, ZoneEntity> | ZoneEntity[]; // Allow array for ordered zones like Deck

    add(entity: ZoneEntity): void;
    remove(entityId: string): ZoneEntity | undefined;
    findById(entityId: string): ZoneEntity | undefined;
    getAll(): ZoneEntity[];
    getCount(): number;
}


// ===================================================================================
//  FILE: src/types/game.ts
//  DESCRIPTION: Interfaces for the main game state and player representation.
// ===================================================================================

/**
 * Represents a single player in the game.
 * Rule 1.2.1
 */
export interface IPlayer {
    id: string;
    hero?: IHeroObject;
    zones: {
        deck: IZone;
        hand: IZone;
        discardPile: IZone;
        manaZone: IZone;
        reserve: IZone;
        landmarkZone: IZone;
        heroZone: IZone;
        expedition: IZone; // FIX: Added missing expedition zone
    };
    heroExpeditionPosition: number;
    companionExpeditionPosition: number;
    hasPassedTurn: boolean;
}

/**
 * Encapsulates the entire state of the game at any point in time.
 */
export interface IGameState {
    players: Map<string, IPlayer>;
    sharedZones: {
        adventure: IZone;
        expedition: IZone;
        limbo: IZone;
    };
    currentPhase: GamePhase;
    currentPlayerId: string;
    firstPlayerId: string; // The player who is first for the current Day
    dayNumber: number;
    actionHistory: any[]; // Log actions and events for debugging
}


// ===================================================================================
//  FILE: src/engine/ObjectFactory.ts
//  DESCRIPTION: Creates and manages game objects, enforcing "New Zone, New Object".
// ===================================================================================

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
}