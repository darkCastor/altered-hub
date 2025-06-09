export enum Faction {
    Axiom = "Axiom",
    Bravos = "Bravos",
    Lyra = "Lyra",
    Muna = "Muna",
    Ordis = "Ordis",
    Yzmir = "Yzmir",
}

export enum CardType {
    Character = "Character",
    Emblem = "Emblem",
    Hero = "Hero",
    ManaOrb = "ManaOrb",
    Permanent = "Permanent",
    Region = "Region",
    Spell = "Spell",
}

export enum PermanentZoneType {
    Expedition = "Expedition",
    Landmark = "Landmark",
}

export enum Rarity {
    Common = "Common",
    Rare = "Rare",
    Unique = "Unique",
    Token = "Token",
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