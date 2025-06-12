import { createRxDatabase, addRxPlugin } from 'rxdb';
import type { RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { AlteredCard } from '../types'; // Assuming AlteredCard is the type for card documents
import type { Deck } from './state/deckMachine'; // Assuming Deck is the type for deck documents

// Type Hinting for Collections and Database
export type CardCollection = RxCollection<AlteredCard>;
export type DeckCollection = RxCollection<Deck>;
// TODO: Define UserCollection and CredentialCollection types based on their schemas

export type MyDatabaseCollections = {
	cards: CardCollection;
	decks: DeckCollection;
	// users: UserCollection; // Will be added when schema is implemented
	// credentials: CredentialCollection; // Will be added when schema is implemented
};

export type MyDatabase = RxDatabase<MyDatabaseCollections>;

// Add the DevMode plugin
// In production, you should ensure this plugin is not bundled
// or only enable it based on an environment variable.
addRxPlugin(RxDBDevModePlugin);

let dbInstance: MyDatabase | null = null;

async function initializeDb(): Promise<MyDatabase> {
	if (dbInstance) {
		console.log('[RxDB] Database instance already exists.');
		return dbInstance;
	}

	console.log('[RxDB] Initializing database...');
	try {
		const dexieStorage = getRxStorageDexie();
		const validatedStorage = wrappedValidateAjvStorage({ storage: dexieStorage });

		const db: MyDatabase = await createRxDatabase<MyDatabaseCollections>({
			name: 'alterdeckdb', // chosen database name
			storage: validatedStorage,
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
			},
			// users: { // Will be added when schema is implemented
			// 	schema: userSchema
			// },
			// credentials: { // Will be added when schema is implemented
			// 	schema: credentialSchema
			// }
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
		name: { type: 'string', maxLength: 255 },
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

// TODO: Implement User Schema
// export const userSchema = {
// title: 'user schema',
// version: 0,
// description: 'describes a user',
// primaryKey: 'id',
// type: 'object',
// properties: {
// id: { type: 'string', maxLength: 100 }, // e.g., UUID
// username: { type: 'string', unique: true }, // For login identification
// },
// required: ['id', 'username'],
// indexes: ['username']
// };

// TODO: Implement Credential Schema
// export const credentialSchema = {
// title: 'credential schema',
// version: 0,
// description: 'describes a user credential for WebAuthn',
// primaryKey: 'id',
// type: 'object',
// properties: {
// id: { type: 'string', maxLength: 255 }, // credential ID from authenticator, URL-safe base64
// userId: { type: 'string', ref: 'users', maxLength: 100 }, // Foreign key to User table
// publicKey: { type: 'string' }, // COSE public key (encoded as base64 or hex string for JSON compatibility)
// counter: { type: 'integer' }, // Signature counter
// transports: { // Optional: Information about how the authenticator can be reached
// type: 'array',
// items: { type: 'string' } // e.g., ['internal', 'usb', 'nfc', 'ble']
// },
// backedUp: { type: 'boolean' }, // Indicates if the credential is backed up
// algorithms: { // COSE algorithm identifiers
// type: 'array',
// items: { type: 'integer' } // e.g., [-7 (ES256), -257 (RS256)]
// }
// },
// required: ['id', 'userId', 'publicKey', 'counter'],
// indexes: ['userId']
// };
