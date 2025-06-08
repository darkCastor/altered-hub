
import type { AlteredCard } from '@/types';
import cardDataJson from './altered_optimized.json';

// Type assertion for the imported JSON structure
interface AlteredJsonData {
  lookup_tables: {
    rarities: Record<string, { name: string }>;
    factions: Record<string, { name: string; color: string }>;
    card_types: Record<string, { name: string }>;
  };
  cards: Record<string, RawCardData>;
}

interface RawCardData {
  name: string;
  type_ref: string;
  faction_ref?: string;
  rarity_ref: string;
  image_path?: string;
  qr_url?: string;
  main_cost?: number;
  recall_cost?: number;
  power?: {
    m?: number;
    o?: number;
    f?: number;
  };
  description?: string; // Keep if it might appear
  keywords?: string[]; // Keep if it might appear
  artist?: string; // Keep if it might appear
}

const rawData = cardDataJson as AlteredJsonData;
const lookupTables = rawData.lookup_tables;
const rawCardsData = rawData.cards;

export const mockCards: AlteredCard[] = Object.keys(rawCardsData).map((cardId): AlteredCard => {
  const rawCard = rawCardsData[cardId];
  
  const factionName = rawCard.faction_ref && lookupTables.factions[rawCard.faction_ref] 
    ? lookupTables.factions[rawCard.faction_ref].name 
    : undefined;
  const factionColor = rawCard.faction_ref && lookupTables.factions[rawCard.faction_ref]
    ? lookupTables.factions[rawCard.faction_ref].color
    : undefined;
  
  const cardTypeName = lookupTables.card_types[rawCard.type_ref] 
    ? lookupTables.card_types[rawCard.type_ref].name 
    : 'Unknown Type';
    
  const rarityName = lookupTables.rarities[rawCard.rarity_ref]
    ? lookupTables.rarities[rawCard.rarity_ref].name
    : 'Unknown Rarity';

  // Placeholder/fallback for description and keywords if not present
  const description = rawCard.description || `Details for ${rawCard.name}.`;
  const keywords = rawCard.keywords || [];

  return {
    id: cardId,
    name: rawCard.name,
    imageUrl: rawCard.image_path,
    qrUrl: rawCard.qr_url,
    type: cardTypeName,
    faction: factionName,
    factionColor: factionColor,
    rarity: rarityName,
    cost: rawCard.main_cost,
    recallCost: rawCard.recall_cost,
    attack: rawCard.power ? rawCard.power.o : undefined,
    health: rawCard.power ? rawCard.power.f : undefined,
    powerM: rawCard.power ? rawCard.power.m : undefined,
    description: description, 
    keywords: keywords,
    artist: rawCard.artist || undefined,
    // cardNumber could be derived or use cardId if needed elsewhere
  };
});

// Example of a few hardcoded mock cards if the JSON is empty or for testing specific cases
// This part can be removed if altered_optimized.json is always populated and sufficient
if (mockCards.length === 0) {
  // Fallback to a minimal set if JSON processing yields no cards
  mockCards.push(
    {
      id: 'fallback-card-1',
      name: 'Fallback Card Alpha',
      type: 'Character',
      rarity: 'Common',
      faction: 'Neutral',
      cost: 1,
      attack: 1,
      health: 1,
      description: 'A basic fallback card.',
      imageUrl: 'https://placehold.co/300x420.png?text=Alpha',
      keywords: ['Fallback'],
    },
    {
      id: 'fallback-card-2',
      name: 'Fallback Card Beta',
      type: 'Spell',
      rarity: 'Rare',
      faction: 'Neutral',
      cost: 2,
      description: 'A fallback spell.',
      imageUrl: 'https://placehold.co/300x420.png?text=Beta',
      keywords: ['Spell', 'Fallback'],
    }
  );
}
