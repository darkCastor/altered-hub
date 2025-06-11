import type { AlteredCard } from '$types';
import { allCards, getCardById } from '$data/cards';

export interface DeckValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	stats: DeckStats;
}

export interface DeckStats {
	totalCards: number;
	heroCount: number;
	factionBreakdown: { [faction: string]: number };
	rarityBreakdown: { [rarity: string]: number };
	copyViolations: Array<{ cardName: string; count: number }>;
}

export interface DeckCard {
	cardId: string;
	quantity: number;
}

export type DeckFormat = 'constructed' | 'limited';

export class DeckValidator {
	private format: DeckFormat;

	constructor(format: DeckFormat = 'constructed') {
		this.format = format;
	}

	validate(cards: DeckCard[], heroId?: string): DeckValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];
		const stats = this.calculateStats(cards, heroId);

		// Validate based on format
		if (this.format === 'constructed') {
			this.validateConstructed(cards, heroId, stats, errors, warnings);
		} else {
			this.validateLimited(cards, heroId, stats, errors, warnings);
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
			stats
		};
	}

	private validateConstructed(
		cards: DeckCard[],
		heroId: string | undefined,
		stats: DeckStats,
		errors: string[],
		warnings: string[]
	): void {
		// Rule 1.1.4.b - Hero Requirement
		if (!heroId) {
			errors.push('A constructed deck must include exactly 1 Hero');
		} else if (stats.heroCount !== 1) {
			errors.push('A constructed deck must include exactly 1 Hero');
		}

		// Rule 1.1.4.c - Minimum Deck Size (39 other cards + 1 hero = 40 total)
		const nonHeroCards = stats.totalCards - stats.heroCount;
		if (nonHeroCards < 39) {
			errors.push(`A constructed deck must include at least 39 non-Hero cards (currently ${nonHeroCards})`);
		}

		// Rule 1.1.4.d - Faction Restrictions
		if (heroId) {
			const hero = getCardById(heroId);
			if (hero && hero.faction) {
				const otherFactions = Object.keys(stats.factionBreakdown).filter(
					faction => faction !== hero.faction && stats.factionBreakdown[faction] > 0
				);
				if (otherFactions.length > 0) {
					errors.push(`All cards must be the same faction as the Hero (${hero.faction}). Found cards from: ${otherFactions.join(', ')}`);
				}
			}
		}

		// Rule 1.1.4.e - Copy Restrictions (max 3 cards with same name)
		stats.copyViolations.forEach(violation => {
			errors.push(`Maximum 3 copies of "${violation.cardName}" allowed (currently ${violation.count})`);
		});

		// Rule 1.1.4.f - Rare Card Restrictions (max 15 rare cards)
		const rareCount = stats.rarityBreakdown['Rare'] || 0;
		if (rareCount > 15) {
			errors.push(`Maximum 15 rare cards allowed (currently ${rareCount})`);
		}

		// Rule 1.1.4.g - Unique Card Restrictions (max 3 unique cards)
		const uniqueCount = stats.rarityBreakdown['Unique'] || 0;
		if (uniqueCount > 3) {
			errors.push(`Maximum 3 unique cards allowed (currently ${uniqueCount})`);
		}

		// Performance warnings
		if (stats.totalCards > 60) {
			warnings.push('Large deck size may affect consistency');
		}
	}

	private validateLimited(
		cards: DeckCard[],
		heroId: string | undefined,
		stats: DeckStats,
		errors: string[],
		warnings: string[]
	): void {
		// Rule 1.1.5.b - Hero Requirement (max 1 Hero)
		if (stats.heroCount > 1) {
			errors.push('A limited deck can include at most 1 Hero');
		}

		// Rule 1.1.5.c - Minimum Deck Size (29 non-Hero cards)
		const nonHeroCards = stats.totalCards - stats.heroCount;
		if (nonHeroCards < 29) {
			errors.push(`A limited deck must include at least 29 non-Hero cards (currently ${nonHeroCards})`);
		}

		// Rule 1.1.5.d - Faction Restrictions (max 3 factions, Hero counts as one)
		const factionCount = Object.keys(stats.factionBreakdown).filter(
			faction => stats.factionBreakdown[faction] > 0
		).length;

		if (factionCount > 3) {
			const factions = Object.keys(stats.factionBreakdown).filter(
				faction => stats.factionBreakdown[faction] > 0
			);
			errors.push(`Maximum 3 factions allowed in limited format (currently ${factionCount}: ${factions.join(', ')})`);
		}

		// No copy or rarity restrictions in limited format, but warn about multiple copies
		// Check for multiple copies (in limited format, check manually since copyViolations only tracks constructed violations)
		const cardNameCounts: { [name: string]: number } = {};
		cards.forEach(deckCard => {
			const card = getCardById(deckCard.cardId);
			if (card) {
				cardNameCounts[card.name] = (cardNameCounts[card.name] || 0) + deckCard.quantity;
			}
		});

		const hasMultipleCopies = Object.values(cardNameCounts).some(count => count > 3);
		if (hasMultipleCopies) {
			warnings.push('Multiple copies of the same card - consider deck diversity');
		}
	}

	private calculateStats(cards: DeckCard[], heroId?: string): DeckStats {
		const stats: DeckStats = {
			totalCards: 0,
			heroCount: 0,
			factionBreakdown: {},
			rarityBreakdown: {},
			copyViolations: []
		};

		// Count Hero
		if (heroId) {
			const hero = getCardById(heroId);
			if (hero) {
				stats.heroCount = 1;
				stats.totalCards = 1;
				if (hero.faction) {
					stats.factionBreakdown[hero.faction] = (stats.factionBreakdown[hero.faction] || 0) + 1;
				}
				// if (hero.rarity) {
				// 	stats.rarityBreakdown[hero.rarity] = (stats.rarityBreakdown[hero.rarity] || 0) + 1;
				// }
			}
		}

		// Track card names for copy violations
		const cardNameCounts: { [name: string]: number } = {};

		// Count main deck cards
		cards.forEach(deckCard => {
			const card = getCardById(deckCard.cardId);
			if (!card) return;

			const quantity = deckCard.quantity;
			stats.totalCards += quantity;

			// Count by faction
			if (card.faction) {
				stats.factionBreakdown[card.faction] = (stats.factionBreakdown[card.faction] || 0) + quantity;
			}

			// Count by rarity
			if (card.rarity) {
				stats.rarityBreakdown[card.rarity] = (stats.rarityBreakdown[card.rarity] || 0) + quantity;
			}

			// Track card name counts for copy restrictions
			cardNameCounts[card.name] = (cardNameCounts[card.name] || 0) + quantity;
		});

		// Check for copy violations (only in constructed format)
		if (this.format === 'constructed') {
			Object.entries(cardNameCounts).forEach(([cardName, count]) => {
				if (count > 3) {
					stats.copyViolations.push({ cardName, count });
				}
			});
		}

		return stats;
	}

	setFormat(format: DeckFormat): void {
		this.format = format;
	}

	getFormat(): DeckFormat {
		return this.format;
	}

	// Helper method to check if a card can be added to the deck
	canAddCard(cards: DeckCard[], cardId: string, heroId?: string): { canAdd: boolean; reason?: string } {
		const card = getCardById(cardId);
		if (!card) {
			return { canAdd: false, reason: 'Card not found' };
		}

		// Check faction restrictions for constructed
		if (this.format === 'constructed' && heroId) {
			const hero = getCardById(heroId);
			if (hero && hero.faction && card.faction && card.faction !== hero.faction) {
				return { canAdd: false, reason: `Card faction (${card.faction}) must match Hero faction (${hero.faction})` };
			}
		}

		// Check if adding this card would violate copy restrictions (same name)
		if (this.format === 'constructed') {
			// Count all cards with the same name as the card we're trying to add
			let sameNameCount = 0;
			cards.forEach(deckCard => {
				const existingCard = getCardById(deckCard.cardId);
				if (existingCard && existingCard.name === card.name) {
					sameNameCount += deckCard.quantity;
				}
			});

			if (sameNameCount >= 3) {
				return { canAdd: false, reason: `Maximum 3 copies of "${card.name}" allowed` };
			}
		}

		// Check rarity restrictions for constructed
		if (this.format === 'constructed') {
			const existingCard = cards.find(c => c.cardId === cardId);
			const tempCards = existingCard 
				? cards.map(c => c.cardId === cardId ? { ...c, quantity: c.quantity + 1 } : c)
				: [...cards, { cardId, quantity: 1 }];
			
			const tempStats = this.calculateStats(tempCards, heroId);
			
			if (card.rarity === 'Rare' && tempStats.rarityBreakdown['Rare'] > 15) {
				return { canAdd: false, reason: 'Maximum 15 rare cards allowed' };
			}
			
			if (card.rarity === 'Unique' && tempStats.rarityBreakdown['Unique'] > 3) {
				return { canAdd: false, reason: 'Maximum 3 unique cards allowed' };
			}
		}

		return { canAdd: true };
	}
}

// Export a default validator instance
export const deckValidator = new DeckValidator();