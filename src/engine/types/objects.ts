
import type { ICardInstance } from './cards';
import type { ICardDefinition } from './cards';
import type { CardType, StatusType, CounterType, PermanentZoneType } from './enums';
import type { IAbility } from './abilities';


/**
 * The base interface for all entities in visible game zones.
 * An "object" is created when a card's representation enters a visible zone.
 * Rule 2.1.a, 2.1.d
 */
export interface IGameObject {
    objectId: string; // Unique runtime ID for this specific object instance
    definitionId: string; // The ID of the card it's based on
    name: string;
    type: CardType;
    subTypes?: string[];
    
    // Characteristics
    baseCharacteristics: Partial<ICardDefinition>;
    currentCharacteristics: Partial<ICardDefinition>;

    ownerId: string;
    controllerId: string;

    timestamp: number; // Unique timestamp assigned on zone entry (Rule 2.2.15, 2.1.d)
    
    statuses: Set<StatusType>; // Rule 2.4
    counters: Map<CounterType, number>; // Rule 2.5
    
    abilities: IAbility[]; // Instantiated abilities for this object
}

// Specializations of IGameObject
export interface ICharacterObject extends IGameObject {
    type: CardType.Character;
}

export interface IPermanentObject extends IGameObject {
    type: CardType.Permanent;
    permanentZoneType: PermanentZoneType;
}

export interface IHeroObject extends IGameObject {
    type: CardType.Hero;
    reserveLimit: number;
    landmarkLimit: number;
}

export interface ISpellObject extends IGameObject {
    type: CardType.Spell;
}

export interface IEmblemObject extends IGameObject {
    type: CardType.Emblem;
    emblemType: 'Reaction' | 'Ongoing';
}

export interface IManaOrbObject extends IGameObject {
    type: CardType.ManaOrb;
}

// Type guard to check if an entity is a full GameObject
export function isGameObject(entity: ICardInstance | IGameObject): entity is IGameObject {
    return (entity as IGameObject).objectId !== undefined;
}
