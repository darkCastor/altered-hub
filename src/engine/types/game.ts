import type { IHeroObject } from './objects';
import type { IZone } from './zones';
import { GamePhase } from './enums';

/**
 * Terrain statistics for characters/objects
 * Rule 2.2.10, 7.1.2
 */
export interface ITerrainStats {
	forest: number;
	mountain: number;
	water: number;
}

/**
 * Expedition state tracking
 * Rule 7.5.2
 */
export interface IExpeditionState {
	position: number; // Distance from starting region
	canMove: boolean; // Affected by Defender keyword
	hasMoved: boolean; // Tracks if moved this turn
}

/**
 * Extended expedition state for full game tracking
 */
export interface IExtendedExpeditionState {
	heroPosition: number;
	companionPosition: number;
	heroActive: boolean;
	companionActive: boolean;
	heroMovedThisTurn: boolean;
	companionMovedThisTurn: boolean;
	heroStats: ITerrainStats;
	companionStats: ITerrainStats;
}

/**
 * Represents a single player in the game.
 * Rule 1.2.1
 */
export interface IPlayer {
	id: string;
	hero?: IHeroObject;
	zones: {
		deckZone: IZone;
		handZone: IZone;
		discardPileZone: IZone;
		manaZone: IZone;
		reserveZone: IZone;
		landmarkZone: IZone;
		heroZone: IZone;
		// expeditionZone: IZone; // Removed for shared expedition zone
		limboZone: IZone; // Shared reference to game's limbo zone for convenience
		hand: IZone; // Alias for handZone for test compatibility
		reserve: IZone; // Alias for reserveZone for test compatibility
		// expedition: IZone; // Alias for expeditionZone for test compatibility - Removed
		discardPile: IZone; // Alias for discardPileZone for test compatibility
	};
	heroExpedition: IExpeditionState;
	companionExpedition: IExpeditionState;
	expeditionState?: IExtendedExpeditionState;
	hasPassedTurn: boolean;
	hasExpandedThisTurn: boolean;
	currentMana: number; // Current available mana for the player
}

/**
 * Encapsulates the entire state of the game at any point in time.
 */
export interface IGameState {
	players: Map<string, IPlayer>;
	sharedZones: {
		adventure: IZone;
		expedition: IZone;
		limbo: IZone;
	};
	currentPhase: GamePhase;
	currentPlayerId: string;
	firstPlayerId: string; // The player who is first for the current Day
	currentDay: number;
	dayNumber: number;
	firstMorningSkipped: boolean;
	gameEnded: boolean;
	winner?: string;
	tiebreakerMode: boolean;
	playerExpandChoices?: Record<string, boolean>;
	actionHistory: unknown[]; // Log actions and events for debugging
}
