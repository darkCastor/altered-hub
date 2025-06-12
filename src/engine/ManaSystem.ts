import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { ITerrainStats } from './types/game';
import { TerrainType, StatusType, CardType, CounterType } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Handles terrain-based mana providing system
 * Rule 2.2.10 - Character statistics provide terrain-based mana
 */
export class ManaSystem {
	constructor(private gsm: GameStateManager) {}

	/**
	 * Gets available mana for a player including terrain bonuses
	 * Rule 2.2.10 - Characters provide terrain-based mana through their statistics
	 */
	public getAvailableMana(playerId: string): ManaPool {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			return { total: 0, forest: 0, mountain: 0, water: 0, orbs: 0 };
		}

		// Base mana from Mana Orbs
		const baseMana = this.getManaFromOrbs(playerId);

		// Terrain mana from Characters in expedition and hero zones
		const terrainMana = this.getTerrainManaFromCharacters(playerId);

		return {
			total: baseMana + terrainMana.forest + terrainMana.mountain + terrainMana.water,
			forest: terrainMana.forest,
			mountain: terrainMana.mountain,
			water: terrainMana.water,
			orbs: baseMana
		};
	}

	/**
	 * Gets base mana from ready Mana Orbs
	 * Rule 3.2.9.e - Mana orbs can be exhausted to provide mana
	 */
	public getManaFromOrbs(playerId: string): number {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return 0;

		let availableOrbs = 0;

		for (const entity of player.zones.manaZone.getAll()) {
			if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
				availableOrbs++;
			}
		}

		return availableOrbs;
	}

	/**
	 * Gets terrain-based mana from Characters
	 * Rule 2.2.10 - Character statistics provide terrain mana
	 */
	public getTerrainManaFromCharacters(playerId: string): ITerrainStats {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			return { forest: 0, mountain: 0, water: 0 };
		}

		const terrainMana: ITerrainStats = { forest: 0, mountain: 0, water: 0 };

		// Check hero zone - Heroes and Characters provide terrain mana
		for (const entity of player.zones.heroZone.getAll()) {
			if (
				isGameObject(entity) &&
				(entity.type === CardType.Hero || entity.type === CardType.Character)
			) {
				const heroStats = this.getCharacterTerrainStats(entity);
				this.addTerrainStats(terrainMana, heroStats);
			}
		}

		// Check expedition zone - Characters provide terrain mana
		for (const entity of player.zones.expeditionZone.getAll()) {
			if (isGameObject(entity) && entity.type === CardType.Character) {
				const charStats = this.getCharacterTerrainStats(entity);
				this.addTerrainStats(terrainMana, charStats);
			}
		}

		// Check landmark zone for Permanents that might provide mana
		for (const entity of player.zones.landmarkZone.getAll()) {
			if (isGameObject(entity) && entity.type === CardType.Permanent) {
				const permStats = this.getCharacterTerrainStats(entity);
				this.addTerrainStats(terrainMana, permStats);
			}
		}

		return terrainMana;
	}

	/**
	 * Gets terrain statistics from a character/object
	 */
	private getCharacterTerrainStats(object: IGameObject): ITerrainStats {
		// Get base statistics from the definition via object factory
		const definition = this.gsm.getCardDefinition(object.definitionId);
		const baseStats = definition?.statistics || { forest: 0, mountain: 0, water: 0 };
		const stats: ITerrainStats = { ...baseStats };

		// Add boost counters to all terrain types (Rule 2.5.1.b)
		const boostCount = object.counters.get(CounterType.Boost) || 0;
		stats.forest += boostCount;
		stats.mountain += boostCount;
		stats.water += boostCount;

		return stats;
	}

	/**
	 * Adds terrain stats together
	 */
	private addTerrainStats(target: ITerrainStats, source: ITerrainStats): void {
		target.forest += source.forest;
		target.mountain += source.mountain;
		target.water += source.water;
	}

	/**
	 * Checks if player can pay a cost with specific terrain requirements
	 * Extended mana system with terrain-specific costs
	 */
	public canPayTerrainCost(playerId: string, cost: TerrainCost): boolean {
		const availableMana = this.getAvailableMana(playerId);

		// Check if we have enough total mana
		const totalRequired = cost.generic + cost.forest + cost.mountain + cost.water;
		if (availableMana.total < totalRequired) {
			return false;
		}

		// Check terrain-specific requirements
		if (cost.forest > availableMana.forest) return false;
		if (cost.mountain > availableMana.mountain) return false;
		if (cost.water > availableMana.water) return false;

		return true;
	}

	/**
	 * Pays a terrain-specific cost
	 */
	public async payTerrainCost(playerId: string, cost: TerrainCost): Promise<void> {
		if (!this.canPayTerrainCost(playerId, cost)) {
			throw new Error(`Cannot pay terrain cost: ${JSON.stringify(cost)}`);
		}

		const player = this.gsm.getPlayer(playerId);
		if (!player) throw new Error(`Player ${playerId} not found`);

		// For now, exhaust mana orbs equal to total cost
		// TODO: Implement more sophisticated terrain-specific payment
		const totalCost = cost.generic + cost.forest + cost.mountain + cost.water;
		let remainingCost = totalCost;

		for (const entity of player.zones.manaZone.getAll()) {
			if (remainingCost <= 0) break;

			if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
				this.gsm.statusHandler.applyStatusEffect(entity, StatusType.Exhausted);
				remainingCost--;
				console.log(`[ManaSystem] Exhausted mana orb for terrain cost`);
			}
		}

		if (remainingCost > 0) {
			throw new Error(`Could not pay full terrain cost`);
		}
	}

	/**
	 * Gets terrain mana breakdown for display
	 */
	public getManaBreakdown(playerId: string): ManaBreakdown {
		const player = this.gsm.getPlayer(playerId);
		if (!player) {
			return {
				orbs: { ready: 0, exhausted: 0 },
				characters: { forest: 0, mountain: 0, water: 0 },
				total: { forest: 0, mountain: 0, water: 0, generic: 0 }
			};
		}

		// Count mana orbs
		let readyOrbs = 0;
		let exhaustedOrbs = 0;
		for (const entity of player.zones.manaZone.getAll()) {
			if (isGameObject(entity)) {
				if (entity.statuses.has(StatusType.Exhausted)) {
					exhaustedOrbs++;
				} else {
					readyOrbs++;
				}
			}
		}

		// Get character terrain stats
		const characterMana = this.getTerrainManaFromCharacters(playerId);

		return {
			orbs: { ready: readyOrbs, exhausted: exhaustedOrbs },
			characters: characterMana,
			total: {
				forest: characterMana.forest,
				mountain: characterMana.mountain,
				water: characterMana.water,
				generic: readyOrbs
			}
		};
	}

	/**
	 * Converts terrain cost to generic mana cost for simple payment
	 */
	public terrainCostToGeneric(cost: TerrainCost): number {
		return cost.generic + cost.forest + cost.mountain + cost.water;
	}

	/**
	 * Creates a terrain cost from a simple mana cost
	 */
	public createGenericTerrainCost(amount: number): TerrainCost {
		return {
			generic: amount,
			forest: 0,
			mountain: 0,
			water: 0
		};
	}

	/**
	 * Rule 3.2.9.b: Add a card to mana zone face-down and exhausted
	 */
	public addCardToMana(playerId: string, cardId: string): boolean {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return false;

		// Find the card in player's hand - try multiple ID fields
		const handCard = player.zones.handZone.getAll().find((c) => {
			if (isGameObject(c)) {
				return c.objectId === cardId || c.id === cardId || c.definitionId === cardId;
			} else {
				return c.instanceId === cardId || c.id === cardId || c.definitionId === cardId;
			}
		});

		if (!handCard) return false;

		// Use the correct entity ID for movement
		const entityId = isGameObject(handCard) ? handCard.objectId : handCard.instanceId;

		// Move card to mana zone via GameStateManager
		try {
			const movedCard = this.gsm.moveEntity(
				entityId,
				player.zones.handZone,
				player.zones.manaZone,
				playerId
			);

			// Apply Rule 3.2.9.b and 3.2.9.c to the moved card
			// Always search for the card in mana zone since moveEntity creates a new object
			const cardInMana = player.zones.manaZone.getAll().find((c) => {
				if (isGameObject(c)) {
					return c.definitionId === handCard.definitionId;
				}
				return false;
			});

			if (isGameObject(cardInMana)) {
				cardInMana.faceDown = true; // Rule 3.2.9.b
				cardInMana.statuses.add(StatusType.Exhausted); // Rule 3.2.9.b
				cardInMana.type = CardType.ManaOrb; // Rule 3.2.9.c
			}

			return true;
		} catch (error) {
			console.error('Failed to add card to mana:', error);
			return false;
		}
	}

	/**
	 * Rule 3.2.9.e: Convert mana by exhausting one orb to ready another
	 */
	public convertMana(playerId: string, sourceOrbId: string, targetOrbId: string): boolean {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return false;

		const manaZone = player.zones.manaZone;
		const sourceOrb = manaZone
			.getAll()
			.find((c) => (isGameObject(c) ? c.objectId : c.instanceId) === sourceOrbId);
		const targetOrb = manaZone
			.getAll()
			.find((c) => (isGameObject(c) ? c.objectId : c.instanceId) === targetOrbId);

		if (!isGameObject(sourceOrb) || !isGameObject(targetOrb)) return false;
		if (sourceOrb.statuses.has(StatusType.Exhausted)) return false; // Source must be ready

		// Exhaust source, ready target
		sourceOrb.statuses.add(StatusType.Exhausted);
		targetOrb.statuses.delete(StatusType.Exhausted);

		return true;
	}

	/**
	 * Rule 3.2.9.f: Pay X mana by exhausting X Mana Orbs
	 */
	public payMana(playerId: string, amount: number): { success: boolean; error?: string } {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return { success: false, error: 'Player not found' };

		const availableMana = this.getManaFromOrbs(playerId);
		if (availableMana < amount) {
			return { success: false, error: 'Insufficient mana' };
		}

		// Exhaust the required number of ready orbs
		let remaining = amount;
		const manaOrbs = player.zones.manaZone.getAll();

		for (const orb of manaOrbs) {
			if (remaining <= 0) break;
			if (isGameObject(orb) && !orb.statuses.has(StatusType.Exhausted)) {
				orb.statuses.add(StatusType.Exhausted);
				remaining--;
			}
		}

		return { success: true };
	}

	/**
	 * Check if player can pay a specific cost
	 */
	public canPayCost(
		playerId: string,
		cost: { total: number; forest: number; mountain: number; water: number }
	): boolean {
		const availableMana = this.getAvailableMana(playerId);

		return (
			availableMana.total >= cost.total &&
			availableMana.forest >= cost.forest &&
			availableMana.mountain >= cost.mountain &&
			availableMana.water >= cost.water
		);
	}

	/**
	 * Pay a complex cost with terrain requirements
	 */
	public payComplexCost(
		playerId: string,
		cost: { total: number; forest: number; mountain: number; water: number }
	): {
		success: boolean;
		payment?: { forestUsed: number; mountainUsed: number; waterUsed: number; orbsUsed: number };
		error?: string;
	} {
		if (!this.canPayCost(playerId, cost)) {
			return { success: false, error: 'Insufficient mana' };
		}

		// For simplicity, use orbs for generic cost
		const genericCost = cost.total - cost.forest - cost.mountain - cost.water;
		const payResult = this.payMana(playerId, genericCost);

		if (!payResult.success) {
			return { success: false, error: payResult.error };
		}

		return {
			success: true,
			payment: {
				forestUsed: cost.forest,
				mountainUsed: cost.mountain,
				waterUsed: cost.water,
				orbsUsed: genericCost
			}
		};
	}

	/**
	 * Pay generic cost using available mana
	 */
	public payGenericCost(
		playerId: string,
		cost: { total: number; forest: number; mountain: number; water: number }
	): { success: boolean; error?: string } {
		return this.payMana(playerId, cost.total);
	}

	/**
	 * Rule 4.2.1.e: Expand - add card from hand to mana
	 */
	public expandMana(playerId: string, cardId: string): { success: boolean; error?: string } {
		const player = this.gsm.getPlayer(playerId);
		if (!player) return { success: false, error: 'Player not found' };

		if (player.hasExpandedThisTurn) {
			return { success: false, error: 'Already expanded this turn' };
		}

		// Find the card in hand using the correct ID field
		const handCard = player.zones.handZone.getAll().find((c) => {
			if (isGameObject(c)) {
				return c.objectId === cardId || c.id === cardId;
			} else {
				return c.instanceId === cardId || c.id === cardId;
			}
		});

		if (!handCard) {
			return { success: false, error: 'Card not found in hand' };
		}

		// Use the correct ID for the move operation
		const entityId = isGameObject(handCard) ? handCard.objectId : handCard.instanceId;
		const result = this.addCardToMana(playerId, entityId);
		if (result) {
			player.hasExpandedThisTurn = true;
			return { success: true };
		}

		return { success: false, error: 'Failed to expand' };
	}
}

export interface ManaPool {
	total: number;
	forest: number;
	mountain: number;
	water: number;
	orbs: number;
}

export interface TerrainCost {
	generic: number; // Can be paid with any mana
	forest: number; // Must be paid with Forest mana
	mountain: number; // Must be paid with Mountain mana
	water: number; // Must be paid with Water mana
}

export interface ManaBreakdown {
	orbs: {
		ready: number;
		exhausted: number;
	};
	characters: ITerrainStats;
	total: {
		forest: number;
		mountain: number;
		water: number;
		generic: number;
	};
}
