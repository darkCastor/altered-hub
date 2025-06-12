import type { IAbility } from './abilities';
import type { CardType, Faction, Rarity, PermanentZoneType, CounterType } from './enums';

/**
 * Represents the static, immutable data of a card as printed.
 * Rule 2.2
 */
export interface ICardDefinition {
	id: string; // Unique ID for the card definition, e.g., "BTG-001-C"
	name: string; // Rule 2.2.4
	type: CardType; // Rule 2.2.1
	subTypes?: string[]; // Rule 2.2.2
	rarity?: Rarity; // Rule 2.2.5
	version?: string; // Rule 2.2.6
	handCost: number; // Rule 2.2.7 - Changed to non-optional, defaulting to 0 if undefined
	reserveCost: number; // Rule 2.2.8 - Changed to non-optional, defaulting to 0 if undefined
	faction?: Faction; // Rule 2.2.9
	statistics?: { forest: number; mountain: number; water: number }; // Rule 2.2.10
	abilities: IAbility[]; // Structured abilities
	abilitiesText?: string; // Raw text for display
	reserveLimit?: number; // For Heroes (Rule 2.2.12)
	landmarkLimit?: number; // For Heroes (Rule 2.2.13)
	permanentZoneType?: PermanentZoneType; // For Permanents (Rule 2.2.3)
	startingCounters?: Map<CounterType, number>; // Rule 2.5.e - For heroes that start with counters

	// Fields for passive ability effects
	isGigantic?: boolean; // Rule 7.4.4
	hasDefender?: boolean; // Rule 7.4.2
	isEternal?: boolean; // Rule 7.4.3
}

/**
 * Represents a specific copy of a card in a hidden zone (Hand, Deck).
 * It is not an "object" per the rules.
 * Rule 2.1.j: "Cards in hidden zones are not objects."
 */
export interface ICardInstance {
	instanceId: string; // Unique ID for this specific copy
	definitionId: string; // The ID of the card it represents
	ownerId: string;
	terrains?: string[]; // Optional field for region-like entities
}
