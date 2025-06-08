
export interface AlteredCard {
  id: string; // from the key in "cards" object e.g. "ALT_ALIZE_A_AX_35_C"
  name: string;
  imageUrl?: string; // from image_path
  qrUrl?: string; // from qr_url
  type: string; // from lookup_tables.card_types[type_ref].name
  faction?: string; // from lookup_tables.factions[faction_ref].name
  factionColor?: string; // from lookup_tables.factions[faction_ref].color
  rarity: string; // from lookup_tables.rarities[rarity_ref].name - Will be a string like "Commun", "Rare"
  cost?: number; // from main_cost
  recallCost?: number; // from recall_cost
  attack?: number; // from power.o
  health?: number; // from power.f
  powerM?: number; // from power.m

  // These were in the old type, but may not be in the new JSON for all cards.
  description?: string;
  flavorText?: string;
  artist?: string;
  cardNumber?: string; 
  keywords?: string[];
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  cards: AlteredCard[]; 
  createdAt: string; 
  updatedAt: string; 
  hero?: AlteredCard; 
  faction?: string;
}

export interface Look {
  id: string;
  name: string;
  description?: string;
  cards: AlteredCard[]; 
  createdAt: string; 
  updatedAt: string; 
}

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
