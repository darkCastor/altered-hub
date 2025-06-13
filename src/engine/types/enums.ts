export enum Faction {
	Axiom = 'Axiom',
	Bravos = 'Bravos',
	Lyra = 'Lyra',
	Muna = 'Muna',
	Ordis = 'Ordis',
	Yzmir = 'Yzmir',
	Neutre = 'Neutre' // Added for Neutral cards
}

export enum CardType {
	Character = 'Personnage',
	Emblem = 'Emblem', // Added
	Hero = 'Héros',
	ManaOrb = 'ManaOrb',
	Permanent = 'Permanent',
	Region = 'Region',
	Spell = 'Sort',
	LandmarkPermanent = 'Repère Permanent',
	ExpeditionPermanent = 'Permanent d’Expédition',
	Token = 'Jeton Personnage',
	TokenMana = 'Mana',
	Foiler = 'Foiler'
}

export enum CardSubType {
	// Character SubTypes (Rule 2.2.2.d)
	Soldier = 'Soldier',
	Animal = 'Animal',
	Sorcerer = 'Sorcerer',
	Spirit = 'Spirit', // Example, add as needed from actual card data
	Machine = 'Machine', // Example

	// Permanent SubTypes (Rule 2.2.2.e)
	// These are often tied to zone (Landmark, Expedition) but can be sub-types.
	// Using PermanentZoneType for zone, but sub-type can be distinct if needed.
	// For now, these might overlap with PermanentZoneType or specific card types.

	// Region SubTypes (Rule 2.2.2.f) - Handled by TerrainType

	// Spell SubTypes (Rule 2.2.2.g)
	Attack = 'Attack',
	Skill = 'Skill',
	Event = 'Event', // "Evènement" in French rules
	Chant = 'Chant',

	// Emblem SubTypes (Rule 2.2.2.h) - Handled by IEmblemObject.emblemSubType
	// Reaction = 'Reaction', // Covered by IEmblemObject
	// Ongoing = 'Ongoing',   // Covered by IEmblemObject

	// Other specific sub-types if they arise
	Gear = 'Gear', // For Permanents that are Gear
	Trap = 'Trap' // For Permanents that are Traps
}

export enum PermanentZoneType {
	Expedition = 'Expedition',
	Landmark = 'Landmark'
}

export enum Rarity {
	Common = 'Commun', // Match names from raritiesLookup
	Rare = 'Rare',
	Unique = 'Unique',
	Token = 'Token'
}

export enum GamePhase {
	Setup = 'Setup',
	Morning = 'Morning',
	Noon = 'Noon',
	Afternoon = 'Afternoon',
	Dusk = 'Dusk',
	Night = 'Night',
	Tiebreaker = 'Tiebreaker'
}

export enum StatusType {
	Anchored = 'Anchored', // Rule 2.4.2
	Asleep = 'Asleep', // Rule 2.4.3
	Boosted = 'Boosted', // Rule 2.4.4
	Exhausted = 'Exhausted', // Rule 2.4.5
	Fleeting = 'Fleeting' // Rule 2.4.6
	// FIX: Eternal is a keyword ability (Rule 7.4.3), not a status. It has been removed.
}

export enum CounterType {
	Boost = 'Boost',
	// Example of specific named counters
	Kelon = 'KelonCounter'
}

export enum TerrainType {
	Forest = 'forest',
	Mountain = 'mountain',
	Water = 'water'
}

export enum KeywordAbility {
	Cooldown = 'Cooldown',
	Defender = 'Defender',
	Eternal = 'Eternal',
	Fleeting = 'Fleeting',
	Gigantic = 'Gigantic',
	Scout = 'Scout',
	Seasoned = 'Seasoned',
	Tough = 'Tough'
}

/**
 * Identifies the specific type of a zone.
 * Rule 1.2.3, 3.1
 */
export enum ZoneIdentifier {
	// Shared Zones (Rule 3.1.1, 3.2)
	Adventure = 'Adventure',
	Expedition = 'Expedition',
	Limbo = 'Limbo',

	// Player-specific Zones (Rule 3.1.2, 3.2)
	Deck = 'Deck',
	Hand = 'Hand',
	DiscardPile = 'DiscardPile',
	Mana = 'Mana',
	Reserve = 'Reserve',
	Landmark = 'Landmark',
	Hero = 'Hero'
}

export enum ModifierType {
	ReplaceStep = 'ReplaceStep',
	AddStepBefore = 'AddStepBefore',
	AddStepAfter = 'AddStepAfter'
}

export enum AbilityType {
	QuickAction = 'quick_action',
	Reaction = 'reaction',
	Passive = 'passive',
	Support = 'support', // Rule 2.2.11.e - Support abilities work only in Reserve
	EffectSource = 'effect_source' // For simple effects from spells etc.
}
