import type { GameStateManager } from './GameStateManager';
import type { IGameObject } from './types/objects';
import type { ITerrainStats } from './types/game'; // Removed IPlayer
import { GamePhase, CardType, StatusType, CounterType } from './types/enums';
import { isGameObject } from './types/objects';
import type { IZone } from './types/zones'; // Added IZone

/**
 * Handles Arena tiebreaker mechanics
 * Rule 4.3 - Tiebreaker procedure when players are tied for victory
 */
export class TiebreakerSystem {
	private isInTiebreaker: boolean = false;
	private tiebreakerPlayers: string[] = [];
	private arenaZone?: IZone | undefined; // Special zone for tiebreaker

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
		if (maxScore < 7) {
			return null; // No one reached the victory threshold
		}

		// Identify all players who achieved a score of 7 or more
		const potentialWinners = playerIds.filter(pid => (playerScores.get(pid) ?? 0) >= 7);

		if (potentialWinners.length === 0) {
			return null; // Should not happen if maxScore >= 7, but as a safeguard
		}

		if (potentialWinners.length === 1) {
			// Only one player scored >= 7, they are the winner.
			return potentialWinners[0];
		}

		// Multiple players scored >= 7. Now check for strict superiority.
		// Sort potential winners by score descending.
		potentialWinners.sort((a, b) => (playerScores.get(b) ?? 0) - (playerScores.get(a) ?? 0));

		const highestScoringPlayer = potentialWinners[0];
		const secondHighestScoringPlayer = potentialWinners[1]; // Exists because potentialWinners.length > 1

		if ((playerScores.get(highestScoringPlayer) ?? 0) > (playerScores.get(secondHighestScoringPlayer) ?? 0)) {
			// One player has a strictly higher score (and both are >= 7)
			return highestScoringPlayer;
		} else {
			// Multiple players tied at the highest score (and score is >= 7)
			// Filter for those who are actually tied at the maxScore among potential winners.
			const actualMaxScore = playerScores.get(highestScoringPlayer) ?? 0;
			const playersAtMaxScore = potentialWinners.filter(pid => (playerScores.get(pid) ?? 0) === actualMaxScore);

			this.initiateTiebreaker(playersAtMaxScore);
			return null; // Tiebreaker in progress
		}
	}

	/**
	 * Initiates the tiebreaker procedure
	 * Rule 4.3.b-c - Setup Arena and move all expeditions
	 */
	private initiateTiebreaker(tiedPlayers: string[]): void {
		console.log(`[Tiebreaker] Initiating tiebreaker between players: ${tiedPlayers.join(', ')}`);
		this.gsm.enterTiebreakerMode(); // This sets up the Arena in GameStateManager

		this.isInTiebreaker = true;
		this.tiebreakerPlayers = tiedPlayers;

		// Expeditions are conceptually in the Arena; actual zone might be shared expedition zone.
		// GameStateManager.enterTiebreakerMode handles visual/logical change of adventure to arena.
		// this.moveExpeditionsToArena(); // Conceptual or handled by GSM

		// Reset expedition positions for Arena combat (Rule 4.3.d - although rule says they keep their position initially)
		// Rule 4.3.d "Expeditions are not sent to Reserve and keep their position on the Adventure track." - This seems to conflict with resetting.
		// However, for Arena stat comparison, their relative position doesn't matter, only their stats.
		// The "Progress" step in tiebreaker (4.3.e) doesn't use positions but total stats.
		// Let's not reset positions, as it might be against 4.3.d. The comparison logic doesn't use it.
		// this.resetExpeditionPositions();

		console.log(`[Tiebreaker] Tiebreaker mode active. Arena is conceptually ready.`);
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
	// private resetExpeditionPositions(): void { // Potentially not needed if Rule 4.3.d means they keep original positions
	// 	for (const playerId of this.tiebreakerPlayers) {
	// 		const player = this.gsm.getPlayer(playerId);
	// 		if (!player) continue;

	// 		// Reset positions to 0 for Arena combat
	// 		player.heroExpedition.position = 0;
	// 		player.companionExpedition.position = 0;
	// 		player.heroExpedition.hasMoved = false;
	// 		player.companionExpedition.hasMoved = false;
	// 	}
	// }

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
		const expeditionZone = this.gsm.state.sharedZones.expedition;

		const playerCharactersInExpedition = expeditionZone.getAll().filter(
			(e): e is IGameObject =>
				isGameObject(e) &&
				e.controllerId === playerId &&
				e.type === CardType.Character
		);

		for (const entity of playerCharactersInExpedition) {
			// Skip Asleep characters (Rule 2.4.3)
			if (entity.statuses.has(StatusType.Asleep)) continue;

			const entityStats = entity.currentCharacteristics.statistics;
			let statMultiplier = 1;

			// Rule 7.4.4.l: A Gigantic Character’s statistics are counted twice in a tiebreaker.
			if (entity.currentCharacteristics.isGigantic === true) {
				statMultiplier = 2;
				console.log(`[TiebreakerSystem] Gigantic character ${entity.name} (Player: ${playerId}) stats counted twice for tiebreaker.`);
			}

			if (entityStats) {
				stats.forest += (entityStats.forest || 0) * statMultiplier;
				stats.mountain += (entityStats.mountain || 0) * statMultiplier;
				stats.water += (entityStats.water || 0) * statMultiplier;
			}

			// Add boost counters (also multiplied if Gigantic)
			const boostCount = entity.counters.get(CounterType.Boost) || 0;
			stats.forest += boostCount * statMultiplier;
			stats.mountain += boostCount * statMultiplier;
			stats.water += boostCount * statMultiplier;
		}
		console.log(`[TiebreakerSystem] Player ${playerId} total Arena Stats: F:${stats.forest}, M:${stats.mountain}, W:${stats.water}`);
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
			const expeditionChars = player.zones.expeditionZone
				.getAll()
				.filter((e) => isGameObject(e) && e.type === CardType.Character) as IGameObject[];

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
