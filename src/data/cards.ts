import type { AlteredCard } from '$types';
import rawCardData from './altered_optimized.json';
import { dbPromise, type MyDatabase } from '$lib/rxdb'; // Import RxDB promise and types

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

// --- RxDB Integration ---

let populateCalled = false; // Flag to ensure populate is called only once

async function populateCardsIfEmpty(db: MyDatabase): Promise<void> {
	if (populateCalled) return;
	populateCalled = true;

	try {
		const cardCount = await db.cards.count().exec();
		if (cardCount === 0) {
			console.log('[RxDB] Card database is empty. Seeding data...');
			// The 'processedCards' variable holds the data from the JSON, already transformed.
			await db.cards.bulkInsert(processedCards);
			console.log('[RxDB] Card data successfully seeded.');
		} else {
			console.log('[RxDB] Card data already exists.');
		}
	} catch (error) {
		console.error('[RxDB] Error during card population or count:', error);
		throw error; // Re-throw to ensure cardsReadyPromise rejects
	}
}

// Promise to ensure DB is initialized and cards are potentially populated
const initializeAndPopulateDb = async (): Promise<void> => {
	const db = await dbPromise;
	await populateCardsIfEmpty(db);
};

export const cardsReadyPromise: Promise<void> = initializeAndPopulateDb();

export async function getAllCards(): Promise<AlteredCard[]> {
	await cardsReadyPromise;
	const db = await dbPromise; // dbPromise should be resolved if cardsReadyPromise is
	try {
		const allCardDocs = await db.cards.find().exec();
		return allCardDocs.map((doc) => doc.toJSON());
	} catch (error) {
		console.error('[RxDB] Error fetching all cards:', error);
		throw error; // Propagate error to UI
	}
}

export async function getCardById(id: string): Promise<AlteredCard | null> {
	await cardsReadyPromise;
	const db = await dbPromise;
	try {
		const cardDoc = await db.cards.findOne(id).exec();
		return cardDoc ? cardDoc.toJSON() : null;
	} catch (error) {
		console.error(`[RxDB] Error fetching card by ID ${id}:`, error);
		throw error; // Propagate error to UI
	}
}

// Keep these lookups loading from static JSON for now as per instructions
export const factionsLookup = typedRawCardData.lookup_tables.factions;
export const raritiesLookup = typedRawCardData.lookup_tables.rarities;
export const cardTypesLookup = typedRawCardData.lookup_tables.card_types;
