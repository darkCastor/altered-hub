import type { ICardInstance } from './cards';
import type { ICardDefinition } from './cards';

// Re-export for convenience
export type { ICardInstance, ICardDefinition };
import type { CardType, StatusType, CardSubType } from './enums';
import type { IAbility, IEffect } from './abilities';
import { CounterType } from './enums';
import { PermanentZoneType } from './enums';

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
	subTypes?: CardSubType[];

	// Characteristics
	baseCharacteristics: Partial<ICardDefinition>;
	currentCharacteristics: ICurrentCharacteristics;

	ownerId: string;
	controllerId: string;

	timestamp: number; // Unique timestamp assigned on zone entry (Rule 2.2.15, 2.1.d)

	statuses: Set<StatusType>; // Rule 2.4
	counters: Map<CounterType, number>; // Rule 2.5

	abilities: IAbility[]; // Instantiated abilities for this object

	// Custom property to track which expedition a non-Gigantic entity is assigned to.
	// This would ideally be set by CardPlaySystem when the entity enters an expedition.
	expeditionAssignment?: { playerId: string; type: 'Hero' | 'Companion' };
	terrains?: string[]; // Optional field for region-like entities that are GameObjects
	abilityActivationsToday?: Map<string, number>; // Key: abilityId, Value: count
}

/**
 * Extends ICardDefinition with dynamic properties that can change during gameplay.
 */
export interface ICurrentCharacteristics extends Partial<ICardDefinition> {
	// Dynamically granted abilities
	grantedAbilities?: IAbility[];
	// IDs of abilities (both base and granted) that are currently negated for this object
	negatedAbilityIds?: string[];

	// Existing dynamic keyword properties (examples, ensure they are covered if not already)
	isEternal?: boolean;
	hasDefender?: boolean;
	isGigantic?: boolean;
	isSeasoned?: boolean;
	isTough?: number | boolean; // Store the tough value if it's like "Tough N"
	scoutValue?: number;
	isFleeting?: boolean;
	// other dynamic characteristics can be added here
}

// Rule 2.2.1.g, 6.3.g
export interface IEmblemObject extends IGameObject {
	type: CardType.Emblem;
	emblemSubType: 'Reaction' | 'Ongoing'; // Rule 2.2.2.h
	boundEffect: IEffect; // Rule 6.3.h: The effect to resolve, with targets bound from the trigger
	duration?: 'this turn' | 'this Afternoon' | 'this Day'; // Rule 2.2.14
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

export interface IManaOrbObject extends IGameObject {
	type: CardType.ManaOrb;
}

// Type guard to check if an entity is a full GameObject
export function isGameObject(entity: ICardInstance | IGameObject): entity is IGameObject {
	return (entity as IGameObject).objectId !== undefined;
}

/**
 * Checks if a game object should have the Boosted status based on its counters.
 * This enforces Rule 2.4.4.a and 2.4.4.b.
 * @param object The game object to check.
 * @returns True if the object has one or more Boost counters.
 */
export function isBoosted(object: IGameObject): boolean {
	return (object.counters.get(CounterType.Boost) || 0) > 0;
}
