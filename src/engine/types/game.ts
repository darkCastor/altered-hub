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
 * Represents a single player in the game.
 * Rule 1.2.1
 */
export interface IPlayer {
    id: string;
    hero?: IHeroObject;
    zones: {
        deck: IZone;
        hand: IZone;
        discardPile: IZone;
        manaZone: IZone;
        reserve: IZone;
        landmarkZone: IZone;
        heroZone: IZone;
        expedition: IZone;
    };
    heroExpedition: IExpeditionState;
    companionExpedition: IExpeditionState;
    hasPassedTurn: boolean;
    hasExpandedThisTurn: boolean;
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
    dayNumber: number;
    actionHistory: any[]; // Log actions and events for debugging
}