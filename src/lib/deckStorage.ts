import type { Deck, DeckDoc } from './state/deckMachine';

const STORAGE_KEY = 'altered-hub-decks';

// Helper to convert between Deck and DeckDoc formats
function fromDocToDeck(doc: DeckDoc): Deck {
	return {
		...doc,
		createdAt: new Date(doc.createdAt),
		updatedAt: new Date(doc.updatedAt)
	};
}

function fromDeckToDoc(deck: Deck): DeckDoc {
	return {
		...deck,
		createdAt: deck.createdAt.toISOString(),
		updatedAt: deck.updatedAt.toISOString()
	};
}

// Load decks from localStorage
export function loadDecks(): Deck[] {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		
		const deckDocs: DeckDoc[] = JSON.parse(stored);
		return deckDocs.map(fromDocToDeck);
	} catch (error) {
		console.error('Error loading decks from localStorage:', error);
		return [];
	}
}

// Save decks to localStorage
function saveDecks(decks: Deck[]): void {
	try {
		const deckDocs = decks.map(fromDeckToDoc);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(deckDocs));
	} catch (error) {
		console.error('Error saving decks to localStorage:', error);
		throw error;
	}
}

// Save a single deck (upsert)
export function saveDeck(deck: Deck): Deck {
	const decks = loadDecks();
	const index = decks.findIndex(d => d.id === deck.id);
	
	if (index >= 0) {
		decks[index] = deck;
	} else {
		decks.push(deck);
	}
	
	saveDecks(decks);
	return deck;
}

// Delete a deck by ID
export function deleteDeck(deckId: string): { id: string } {
	const decks = loadDecks();
	const filteredDecks = decks.filter(d => d.id !== deckId);
	
	if (filteredDecks.length === decks.length) {
		throw new Error('Deck not found for deletion');
	}
	
	saveDecks(filteredDecks);
	return { id: deckId };
}

// Get a single deck by ID
export function getDeckById(deckId: string): Deck | null {
	const decks = loadDecks();
	return decks.find(d => d.id === deckId) || null;
}