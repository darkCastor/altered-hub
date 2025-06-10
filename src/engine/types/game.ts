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
    heroExpeditionPosition: number;
    companionExpeditionPosition: number;
    hasPassedTurn: boolean;
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