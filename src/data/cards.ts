import type { AlteredCard } from '$types';
import rawCardData from './altered_optimized.json';

// Keep existing raw type interfaces
interface RawPower {
	m?: number;
	o?: number;
	f?: number;
}

interface RawCardEntry {
	name: string;
	type_ref: string;
	faction_ref?: string;
	rarity_ref: string;
	image_path?: string;
	qr_url?: string;
	main_cost?: number;
	recall_cost?: number;
	is_suspended?: boolean; // Added to match JSON
	power?: RawPower;
	description?: string;
	flavorText?: string;
	artist?: string;
	card_number?: string;
	keywords?: string[];
}

interface RawLookupTables {
	rarities: { [key: string]: { name: string } };
	factions: { [key: string]: { name: string; color: string } };
	card_types: { [key: string]: { name: string } };
}

interface RawAlteredDataSet {
	meta: object;
	lookup_tables: RawLookupTables;
	cards: { [id: string]: RawCardEntry };
}

const typedRawCardData = rawCardData as RawAlteredDataSet;

const processedCards: AlteredCard[] = Object.entries(typedRawCardData.cards).map(
	([id, rawCard]) => {
		const cardTypeInfo = typedRawCardData.lookup_tables.card_types[rawCard.type_ref];
		const type = cardTypeInfo ? cardTypeInfo.name : rawCard.type_ref;

		let faction: string | undefined = undefined;
		let factionColor: string | undefined = undefined;
		if (rawCard.faction_ref) {
			const factionInfo = typedRawCardData.lookup_tables.factions[rawCard.faction_ref];
			if (factionInfo) {
				faction = factionInfo.name;
				factionColor = factionInfo.color;
			} else {
				faction = rawCard.faction_ref;
			}
		}

		const rarityInfo = typedRawCardData.lookup_tables.rarities[rawCard.rarity_ref];
		const rarity = rarityInfo ? rarityInfo.name : rawCard.rarity_ref;

		let description = rawCard.description;
		if (
			!description &&
			type !== typedRawCardData.lookup_tables.card_types.TOKEN_MANA?.name &&
			type !== typedRawCardData.lookup_tables.card_types.FOILER?.name
		) {
			// description = `This is ${rawCard.name}, a ${rarity} ${type} card${faction ? ` of the ${faction} faction` : ''}.`;
		}

		const keywords = rawCard.keywords || [];

		return {
			id,
			name: rawCard.name,
			imageUrl: rawCard.image_path,
			qrUrl: rawCard.qr_url,
			type,
			faction,
			factionColor,
			rarity,
			cost: rawCard.main_cost,
			recallCost: rawCard.recall_cost,
			attack: rawCard.power?.o,
			health: rawCard.power?.f,
			powerM: rawCard.power?.m,
			isSuspended: rawCard.is_suspended ?? false, // Map is_suspended, default to false
			description,
			flavorText: rawCard.flavorText,
			artist: rawCard.artist,
			cardNumber: rawCard.card_number,
			keywords
		};
	}
);

// --- JSON-based Card Access ---

export function getAllCards(): AlteredCard[] {
	return processedCards;
}

export function getCardById(id: string): AlteredCard | null {
	return processedCards.find((card) => card.id === id) || null;
}

export function searchCards(query: string): AlteredCard[] {
	if (!query.trim()) return processedCards;

	const normalizedQuery = query.toLowerCase().trim();
	return processedCards.filter(
		(card) =>
			card.name.toLowerCase().includes(normalizedQuery) ||
			card.type.toLowerCase().includes(normalizedQuery) ||
			(card.faction && card.faction.toLowerCase().includes(normalizedQuery)) ||
			card.rarity.toLowerCase().includes(normalizedQuery) ||
			(card.description && card.description.toLowerCase().includes(normalizedQuery)) ||
			(card.keywords &&
				card.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery)))
	);
}

export function filterCards(filters: {
	faction?: string;
	type?: string;
	rarity?: string;
	cost?: number;
	minCost?: number;
	maxCost?: number;
}): AlteredCard[] {
	return processedCards.filter((card) => {
		if (filters.faction && card.faction !== filters.faction) return false;
		if (filters.type && card.type !== filters.type) return false;
		if (filters.rarity && card.rarity !== filters.rarity) return false;
		if (filters.cost !== undefined && card.cost !== filters.cost) return false;
		if (filters.minCost !== undefined && (card.cost === undefined || card.cost < filters.minCost))
			return false;
		if (filters.maxCost !== undefined && (card.cost === undefined || card.cost > filters.maxCost))
			return false;
		return true;
	});
}

// Static JSON lookups
export const factionsLookup = typedRawCardData.lookup_tables.factions;
export const raritiesLookup = typedRawCardData.lookup_tables.rarities;
export const cardTypesLookup = typedRawCardData.lookup_tables.card_types;
