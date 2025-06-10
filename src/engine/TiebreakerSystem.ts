import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { IPlayer, ITerrainStats } from './types/game';
import { GamePhase, CardType, StatusType, CounterType } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Handles Arena tiebreaker mechanics
 * Rule 4.3 - Tiebreaker procedure when players are tied for victory
 */
export class TiebreakerSystem {
    private isInTiebreaker: boolean = false;
    private tiebreakerPlayers: string[] = [];
    private arenaZone?: any; // Special zone for tiebreaker

    constructor(private gsm: GameStateManager) {}

    /**
     * Checks if a tiebreaker should be initiated
     * Rule 4.3.a - Tiebreaker occurs when multiple players reach victory threshold
     */
    public checkForTiebreaker(): string | null {
        const playerIds = Array.from(this.gsm.state.players.keys());
        const playerScores = new Map<string, number>();
        
        // Calculate total expedition distances
        for (const playerId of playerIds) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) continue;
            
            const totalDistance = player.heroExpedition.position + player.companionExpedition.position;
            playerScores.set(playerId, totalDistance);
        }
        
        const maxScore = Math.max(...Array.from(playerScores.values()));
        
        // Check if victory threshold reached
        if (maxScore >= 7) {
            const winners = playerIds.filter(pid => playerScores.get(pid) === maxScore);
            
            if (winners.length === 1) {
                return winners[0]; // Clear winner
            } else {
                // Initiate tiebreaker
                this.initiateTiebreaker(winners);
                return null; // Tiebreaker in progress
            }
        }
        
        return null; // No winner yet
    }

    /**
     * Initiates the tiebreaker procedure
     * Rule 4.3.b-c - Setup Arena and move all expeditions
     */
    private initiateTiebreaker(tiedPlayers: string[]): void {
        console.log(`[Tiebreaker] Initiating tiebreaker between players: ${tiedPlayers.join(', ')}`);
        
        this.isInTiebreaker = true;
        this.tiebreakerPlayers = tiedPlayers;
        
        // Create Arena zone (conceptually - all expeditions in same zone)
        this.setupArena();
        
        // Move all expeditions to Arena
        this.moveExpeditionsToArena();
        
        // Reset expedition positions for Arena combat
        this.resetExpeditionPositions();
        
        console.log(`[Tiebreaker] Arena setup complete. Beginning tiebreaker turns.`);
    }

    /**
     * Sets up the Arena for tiebreaker combat
     * Rule 4.3.b - Arena is a single zone containing all expeditions
     */
    private setupArena(): void {
        // In the actual implementation, you might create a special zone
        // For now, we'll track this conceptually
        console.log(`[Tiebreaker] Arena created for ${this.tiebreakerPlayers.length} players`);
    }

    /**
     * Moves all expeditions to the Arena
     * Rule 4.3.c - All expeditions are placed in the Arena
     */
    private moveExpeditionsToArena(): void {
        for (const playerId of this.tiebreakerPlayers) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) continue;
            
            // Conceptually move expeditions to Arena
            // In practice, expeditions stay in their zones but are considered "in Arena"
            console.log(`[Tiebreaker] Player ${playerId} expeditions moved to Arena`);
        }
    }

    /**
     * Resets expedition positions for Arena combat
     */
    private resetExpeditionPositions(): void {
        for (const playerId of this.tiebreakerPlayers) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) continue;
            
            // Reset positions to 0 for Arena combat
            player.heroExpedition.position = 0;
            player.companionExpedition.position = 0;
            player.heroExpedition.hasMoved = false;
            player.companionExpedition.hasMoved = false;
        }
    }

    /**
     * Processes Progress during tiebreaker
     * Rule 4.3.d-e - Modified Progress rules for Arena combat
     */
    public processTiebreakerProgress(): string | null {
        if (!this.isInTiebreaker) return null;
        
        console.log(`[Tiebreaker] Processing Arena Progress`);
        
        const terrainResults = this.calculateArenaTerrainWinners();
        
        // Check if any player wins by having more terrain types with greater stats
        const winner = this.determineArenaWinner(terrainResults);
        
        if (winner) {
            this.endTiebreaker(winner);
            return winner;
        }
        
        // Continue tiebreaker if no clear winner
        return null;
    }

    /**
     * Calculates terrain winners in Arena combat
     * Rule 4.3.e - Compare statistics for each terrain type
     */
    private calculateArenaTerrainWinners(): Map<string, string> {
        const terrainWinners = new Map<string, string>();
        const playerTerrainStats = new Map<string, ITerrainStats>();
        
        // Calculate total terrain stats for each player
        for (const playerId of this.tiebreakerPlayers) {
            const stats = this.calculatePlayerArenaStats(playerId);
            playerTerrainStats.set(playerId, stats);
        }
        
        // Determine winner for each terrain type
        for (const terrain of ['forest', 'mountain', 'water']) {
            let maxStat = -1;
            let winner = '';
            let tied = false;
            
            for (const playerId of this.tiebreakerPlayers) {
                const stats = playerTerrainStats.get(playerId);
                if (!stats) continue;
                
                const terrainValue = Math.max(0, stats[terrain as keyof ITerrainStats]);
                
                if (terrainValue > maxStat) {
                    maxStat = terrainValue;
                    winner = playerId;
                    tied = false;
                } else if (terrainValue === maxStat && maxStat > 0) {
                    tied = true;
                }
            }
            
            if (!tied && winner && maxStat > 0) {
                terrainWinners.set(terrain, winner);
                console.log(`[Tiebreaker] ${winner} wins ${terrain} terrain with ${maxStat}`);
            }
        }
        
        return terrainWinners;
    }

    /**
     * Calculates total Arena stats for a player
     */
    private calculatePlayerArenaStats(playerId: string): ITerrainStats {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return { forest: 0, mountain: 0, water: 0 };
        
        const stats: ITerrainStats = { forest: 0, mountain: 0, water: 0 };
        
        // Include stats from all Characters in expeditions
        for (const entity of player.zones.expedition.getAll()) {
            if (isGameObject(entity) && entity.type === CardType.Character) {
                // Skip Asleep characters (Rule 2.4.3)
                if (entity.statuses.has(StatusType.Asleep)) continue;
                
                const entityStats = entity.currentCharacteristics.statistics;
                if (entityStats) {
                    stats.forest += entityStats.forest || 0;
                    stats.mountain += entityStats.mountain || 0;
                    stats.water += entityStats.water || 0;
                }
                
                // Add boost counters
                const boostCount = entity.counters.get(CounterType.Boost) || 0;
                stats.forest += boostCount;
                stats.mountain += boostCount;
                stats.water += boostCount;
            }
        }
        
        return stats;
    }

    /**
     * Determines Arena winner based on terrain victories
     * Rule 4.3.e - Player with more terrain victories wins
     */
    private determineArenaWinner(terrainWinners: Map<string, string>): string | null {
        const playerWins = new Map<string, number>();
        
        // Count terrain victories for each player
        for (const playerId of this.tiebreakerPlayers) {
            playerWins.set(playerId, 0);
        }
        
        for (const winner of terrainWinners.values()) {
            const currentWins = playerWins.get(winner) || 0;
            playerWins.set(winner, currentWins + 1);
        }
        
        // Find player with most terrain victories
        let maxWins = 0;
        let winner = null;
        let tied = false;
        
        for (const [playerId, wins] of playerWins.entries()) {
            if (wins > maxWins) {
                maxWins = wins;
                winner = playerId;
                tied = false;
            } else if (wins === maxWins && wins > 0) {
                tied = true;
            }
        }
        
        if (!tied && winner && maxWins > 0) {
            console.log(`[Tiebreaker] ${winner} wins Arena with ${maxWins} terrain victories`);
            return winner;
        }
        
        console.log(`[Tiebreaker] No clear Arena winner, continuing tiebreaker`);
        return null;
    }

    /**
     * Ends the tiebreaker and declares winner
     */
    private endTiebreaker(winner: string): void {
        console.log(`[Tiebreaker] Tiebreaker ended. Winner: ${winner}`);
        
        this.isInTiebreaker = false;
        this.tiebreakerPlayers = [];
        
        // Restore normal game state
        this.restoreFromArena();
        
        // Publish game end event
        // this.gsm.eventBus.publish('gameEnded', { winner, reason: 'tiebreaker' });
        console.log(`[Tiebreaker] Game ended via tiebreaker - Winner: ${winner}`);
    }

    /**
     * Restores game state from Arena
     */
    private restoreFromArena(): void {
        // Clean up Arena state
        // Move expeditions back to normal zones (conceptually)
        console.log(`[Tiebreaker] Restored game state from Arena`);
    }

    /**
     * Checks if currently in tiebreaker mode
     */
    public isInTiebreakerMode(): boolean {
        return this.isInTiebreaker;
    }

    /**
     * Gets current tiebreaker players
     */
    public getTiebreakerPlayers(): string[] {
        return [...this.tiebreakerPlayers];
    }

    /**
     * Processes tiebreaker-specific phase effects
     */
    public processTiebreakerPhase(phase: GamePhase): void {
        if (!this.isInTiebreaker) return;
        
        switch (phase) {
            case GamePhase.Dusk:
                // Process Arena Progress instead of normal Progress
                this.processTiebreakerProgress();
                break;
            case GamePhase.Night:
                // Modified Rest rules for Arena
                this.processTiebreakerRest();
                break;
        }
    }

    /**
     * Processes Rest phase during tiebreaker
     * Rule 4.3.f - Modified Rest rules for Arena
     */
    private processTiebreakerRest(): void {
        console.log(`[Tiebreaker] Processing Arena Rest`);
        
        // Characters in Arena follow normal Rest rules
        // but positions don't change since all are in Arena
        for (const playerId of this.tiebreakerPlayers) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) continue;
            
            // Process character status effects but don't move to Reserve
            // since Arena combat continues
            const expeditionChars = player.zones.expedition.getAll().filter(
                e => isGameObject(e) && e.type === CardType.Character
            ) as IGameObject[];
            
            for (const char of expeditionChars) {
                // Remove temporary statuses
                if (char.statuses.has(StatusType.Anchored)) {
                    char.statuses.delete(StatusType.Anchored);
                }
                if (char.statuses.has(StatusType.Asleep)) {
                    char.statuses.delete(StatusType.Asleep);
                }
            }
        }
    }
}