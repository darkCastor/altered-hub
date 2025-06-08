export interface AlteredCard {
  id: string;
  name: string;
  imageUrl?: string; // URL to the card image
  type: string; // e.g., Character, Spell, Item, Location
  rarity: 'Common' | 'Rare' | 'Epic' | 'Unique' | 'Token';
  faction?: string; // e.g., Ordis, Muna, Yzmir
  cost?: number;
  attack?: number;
  health?: number;
  description: string; // Card text, abilities
  flavorText?: string;
  artist?: string;
  cardNumber?: string; // e.g., "001/250"
  keywords?: string[];
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  cards: AlteredCard[]; // Could also be an array of card IDs and quantities
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  hero?: AlteredCard; // Main hero card if applicable
  faction?: string;
}

export interface Look {
  id: string;
  name: string;
  description?: string;
  cards: AlteredCard[]; // Cards forming the visual combination
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

// For storing card quantities in decks/looks
export interface CardInCollection {
  card: AlteredCard;
  quantity: number;
}

export interface DeckListItem {
  id: string;
  name: string;
  cardCount: number;
  updatedAt: string;
  heroImageUrl?: string;
}

export interface LookListItem {
  id: string;
  name: string;
  cardCount: number;
  updatedAt: string;
  previewImageUrls?: string[];
}
