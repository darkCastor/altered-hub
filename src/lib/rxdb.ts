import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import type { AlteredCard } from '../types'; // Assuming AlteredCard is the type for card documents
import type { Deck } from './state/deckMachine'; // Assuming Deck is the type for deck documents

// Type Hinting for Collections and Database
export type CardCollection = RxCollection<AlteredCard>;
export type DeckCollection = RxCollection<Deck>;

export type MyDatabaseCollections = {
	cards: CardCollection;
	decks: DeckCollection;
};

export type MyDatabase = RxDatabase<MyDatabaseCollections>;

// Add the DevMode plugin
// In production, you should ensure this plugin is not bundled
// or only enable it based on an environment variable.
if (import.meta.env.DEV) {
	addRxPlugin(RxDBDevModePlugin);
}

let dbInstance: MyDatabase | null = null;

async function initializeDb(): Promise<MyDatabase> {
	if (dbInstance) {
		console.log('[RxDB] Database instance already exists.');
		return dbInstance;
	}

	console.log('[RxDB] Initializing database...');
	try {
		const db: MyDatabase = await createRxDatabase<MyDatabaseCollections>({
			name: 'alterdeckdb', // chosen database name
			storage: getRxStorageDexie(),
			multiInstance: false, // simpler for now
			ignoreDuplicate: true // useful for HMR
		});
		console.log('[RxDB] Database collections being added...');
		await db.addCollections({
			cards: {
				schema: cardSchema
			},
			decks: {
				schema: deckSchema
			}
		});
		console.log('[RxDB] Database initialized successfully with collections!');
		dbInstance = db;
		return db;
	} catch (error) {
		console.error('[RxDB] Critical error initializing database:', error);
		throw error; // Re-throw to ensure dbPromise rejects
	}
}

// Export a promise that resolves to the database instance.
// This ensures the database is initialized only once.
export const dbPromise: Promise<MyDatabase> = initializeDb();

// Optional: A way to get the instance directly if you are sure it's initialized
export function getDbInstance(): MyDatabase {
	if (!dbInstance) {
		throw new Error('Database not initialized. Ensure dbPromise has resolved.');
	}
	return dbInstance;
}

// Schemas

export const cardSchema = {
	title: 'card schema',
	version: 0,
	description: 'describes an altered card',
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 }, // Example maxLength, adjust if needed
		name: { type: 'string' },
		imageUrl: { type: 'string' },
		qrUrl: { type: 'string' },
		type: { type: 'string' },
		faction: { type: 'string' },
		factionColor: { type: 'string' },
		rarity: { type: 'string' },
		cost: { type: 'integer' },
		recallCost: { type: 'integer' },
		attack: { type: 'integer' },
		health: { type: 'integer' },
		powerM: { type: 'integer' },
		isSuspended: { type: 'boolean' },
		description: { type: 'string' },
		flavorText: { type: 'string' },
		artist: { type: 'string' },
		cardNumber: { type: 'string' },
		keywords: {
			type: 'array',
			items: { type: 'string' }
		}
	},
	required: ['id', 'name', 'type', 'rarity'],
	indexes: ['name', 'type', 'faction', 'rarity'] // Add indexes for frequently queried fields
};

export const deckSchema = {
	title: 'deck schema',
	version: 0,
	description: 'describes a user-created deck',
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		name: { type: 'string' },
		description: { type: 'string' },
		cards: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					cardId: { type: 'string' },
					quantity: { type: 'integer' }
				},
				required: ['cardId', 'quantity']
			}
		},
		heroId: { type: ['string', 'null'] }, // Nullable string
		format: { type: 'string' }, // e.g., 'constructed', 'sealed'
		isValid: { type: 'boolean' },
		createdAt: { type: 'string', format: 'date-time' },
		updatedAt: { type: 'string', format: 'date-time' }
	},
	required: ['id', 'name', 'description', 'cards', 'format', 'isValid', 'createdAt', 'updatedAt'],
	indexes: ['name', 'format', 'updatedAt']
};
