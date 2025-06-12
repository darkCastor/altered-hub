export enum Faction {
	Axiom = 'Axiom',
	Bravos = 'Bravos',
	Lyra = 'Lyra',
	Muna = 'Muna',
	Ordis = 'Ordis',
	Yzmir = 'Yzmir',
	Neutre = 'Neutre', // Added for Neutral cards
	AX = 'Axiom', // Alias for mapping
	BR = 'Bravos', // Alias for mapping
	LY = 'Lyra', // Alias for mapping
	MU = 'Muna', // Alias for mapping
	NE = 'Neutre', // Alias for mapping
	OR = 'Ordis', // Alias for mapping
	YZ = 'Yzmir' // Alias for mapping
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
	// Aliases for mapping
	CHARACTER = 'Personnage',
	HERO = 'Héros',
	SPELL = 'Sort',
	PERMANENT = 'Permanent',
	EMBLEM = 'Emblem', // Added
	LANDMARK_PERMANENT = 'Repère Permanent',
	EXPEDITION_PERMANENT = 'Permanent d’Expédition',
	TOKEN = 'Jeton Personnage',
	TOKEN_MANA = 'Mana',
	FOILER = 'Foiler'
}

export enum PermanentZoneType {
	Expedition = 'Expedition',
	Landmark = 'Landmark'
}

export enum Rarity {
	Common = 'Commun', // Match names from raritiesLookup
	Rare = 'Rare',
	Unique = 'Unique',
	Token = 'Token',
	// Aliases for mapping
	COMMON = 'Commun',
	RARE = 'Rare'
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
