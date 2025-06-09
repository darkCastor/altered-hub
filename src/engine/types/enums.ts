
export enum Faction {
    Axiom = "Axiom",
    Bravos = "Bravos",
    Lyra = "Lyra",
    Muna = "Muna",
    Ordis = "Ordis",
    Yzmir = "Yzmir",
    Neutre = "Neutre", // Added for Neutral cards
    AX = "Axiom", // Alias for mapping
    BR = "Bravos", // Alias for mapping
    LY = "Lyra",   // Alias for mapping
    MU = "Muna",   // Alias for mapping
    NE = "Neutre", // Alias for mapping
    OR = "Ordis",  // Alias for mapping
    YZ = "Yzmir",  // Alias for mapping
}

export enum CardType {
    Character = "Personnage", // Match names from cardTypesLookup
    Emblem = "Emblem", // Assuming this is a valid engine type, not in JSON lookup
    Hero = "Héros",
    ManaOrb = "ManaOrb", // Assuming, not in JSON lookup as playable card type
    Permanent = "Permanent", // Generic, specific types below will also map to this
    Region = "Region", // Assuming, not in JSON lookup
    Spell = "Sort",
    LandmarkPermanent = "Repère Permanent",
    ExpeditionPermanent = "Permanent d’Expédition",
    Token = "Jeton Personnage",
    // Aliases for mapping
    CHARACTER = "Personnage",
    HERO = "Héros",
    SPELL = "Sort",
    PERMANENT = "Permanent",
    LANDMARK_PERMANENT = "Repère Permanent",
    EXPEDITION_PERMANENT = "Permanent d’Expédition",
    TOKEN = "Jeton Personnage",
    TOKEN_MANA = "Mana", // Though likely filtered out
    FOILER = "Foiler", // Though likely filtered out
}

export enum PermanentZoneType {
    Expedition = "Expedition",
    Landmark = "Landmark",
}

export enum Rarity {
    Common = "Commun", // Match names from raritiesLookup
    Rare = "Rare",
    Unique = "Unique", // Assuming, not directly in JSON lookup but good to have
    Token = "Token", // For token characters
    // Aliases for mapping
    COMMON = "Commun",
    RARE = "Rare",
}

export enum GamePhase {
    Setup = "Setup",
    Morning = "Morning",
    Noon = "Noon",
    Afternoon = "Afternoon",
    Dusk = "Dusk",
    Night = "Night",
    Tiebreaker = "Tiebreaker",
}

export enum StatusType {
    Anchored = "Anchored",
    Asleep = "Asleep",
    Boosted = "Boosted",
    Exhausted = "Exhausted",
    Fleeting = "Fleeting",
    Eternal = "Eternal",
}

export enum CounterType {
    Boost = "Boost",
    // Example of specific named counters
    Kelon = "KelonCounter",
}

/**
 * Identifies the specific type of a zone.
 * Rule 1.2.3, 3.1
 */
export enum ZoneIdentifier {
    // Shared Zones (Rule 3.1.1, 3.2)
    Adventure = "Adventure",
    Expedition = "Expedition",
    Limbo = "Limbo",
    
    // Player-specific Zones (Rule 3.1.2, 3.2)
    Deck = "Deck",
    Hand = "Hand",
    DiscardPile = "DiscardPile",
    Mana = "Mana",
    Reserve = "Reserve",
    Landmark = "Landmark",
    Hero = "Hero",
}
