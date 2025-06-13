import type { GameStateManager } from './GameStateManager';
import type { EventBus } from './EventBus';
import { GamePhase } from './types/enums';

export class TurnManager {
	private gsm: GameStateManager;
	private eventBus: EventBus;

	constructor(gameStateManager: GameStateManager, eventBus: EventBus) {
		this.gsm = gameStateManager;
		this.eventBus = eventBus;
		// Set the turnManager instance on GameStateManager
		// This assumes gsm has a public property `turnManager` or a setter method.
		this.gsm.turnManager = this;
	}

	public startAfternoon(): void {
		if (this.gsm.state.players.length === 0) {
			console.warn('TurnManager: startAfternoon called with no players.');
			return;
		}

		// currentPlayerId should be set to firstPlayerId at the start of Afternoon
		this.gsm.state.currentPlayerId = this.gsm.state.firstPlayerId;

		// Reset hasPassedTurn for all players involved in the game
		// Assuming getPlayerIds() and getPlayer() are the correct methods on gsm
		this.gsm.getPlayerIds().forEach((playerId) => {
			const player = this.gsm.getPlayer(playerId);
			if (player) {
				player.hasPassedTurn = false;
			}
		});

		console.log(
			`TurnManager: Afternoon phase started. Current player is: ${this.gsm.state.currentPlayerId}`
		);
		this.eventBus.publish('afternoonPhaseStarted', {
			currentPlayerId: this.gsm.state.currentPlayerId
		});
	}

	public async playerPasses(playerId: string): Promise<void> {
		const player = this.gsm.getPlayer(playerId); // Corrected: gsm.getPlayer directly
		if (!player) {
			console.error(`TurnManager: Player ${playerId} not found to pass turn.`);
			return;
		}

		player.hasPassedTurn = true;
		console.log(`TurnManager: Player ${playerId} has passed their turn.`);
		this.eventBus.publish('playerPassedTurn', { playerId });

		// Resolve reactions after a player passes
		await this.gsm.resolveReactions(this.gsm.state);

		// After a player passes, check if the phase should end
		this.checkPhaseEnd();
	}

	public async advanceTurn(): Promise<void> {
		// This method is called when the current player takes an action that doesn't end their turn,
		// but passes priority to the next player who hasn't passed yet.
		// Or, if the current player was the only one active, they might get another turn.

		const activePlayers = this.gsm.getPlayerIds()
			.map(pid => this.gsm.getPlayer(pid))
			.filter((p): p is IPlayer => !!p && !p.hasPassedTurn);

		if (activePlayers.length === 0) {
			// This should ideally be handled by checkPhaseEnd after the last pass.
			// If advanceTurn is called here, it's likely an edge case or error.
			console.warn(
				'TurnManager: advanceTurn called but no players are active. Checking phase end.'
			);
			this.checkPhaseEnd();
			return;
		}

		const currentPlayerId = this.gsm.state.currentPlayerId;
		// Find the index of the current player within the list of *active* players
		const currentPlayerIndexInActive = activePlayers.findIndex((p) => p.id === currentPlayerId);

		let nextPlayer;
		if (activePlayers.length === 1 && activePlayers[0].id === currentPlayerId) {
			// The current player is the only one left who hasn't passed. They can continue.
			nextPlayer = activePlayers[0];
			console.log(
				`TurnManager: Player ${nextPlayer.id} is the only active player, continues turn.`
			);
		} else {
			// Cycle to the next player in the list of active players
			// If current player is not in active (e.g. just passed), or to move to next:
			let nextPlayerIndex = 0; // Default to first active player
			if (currentPlayerIndexInActive !== -1) {
				// If current player was active
				nextPlayerIndex = (currentPlayerIndexInActive + 1) % activePlayers.length;
			}
			nextPlayer = activePlayers[nextPlayerIndex];
		}

		if (nextPlayer) {
			this.gsm.state.currentPlayerId = nextPlayer.id;
			console.log(
				`TurnManager: Turn advanced. New current player: ${this.gsm.state.currentPlayerId}`
			);
			this.eventBus.publish('turnAdvanced', { currentPlayerId: this.gsm.state.currentPlayerId });
		} else {
			// This should not be reached if activePlayers has entries.
			console.error(
				'TurnManager: Failed to determine next player in advanceTurn despite active players.'
			);
			this.checkPhaseEnd(); // Safety check
		}
	}

	public checkPhaseEnd(): void {
		if (this.gsm.state.currentPhase !== GamePhase.Afternoon) {
			// Only check for end of phase if it's Afternoon
			return;
		}

		const allPlayersPassed = this.gsm.getPlayerIds()
		.map(pid => this.gsm.getPlayer(pid))
		.every((player): player is IPlayer => !!player && player.hasPassedTurn);


		if (allPlayersPassed) {
			console.log('TurnManager: All players have passed in Afternoon. Advancing to next phase.');
			if (this.gsm.phaseManager) {
				this.gsm.phaseManager.advancePhase(); // Triggers phase transition
			} else {
				console.error(
					'TurnManager: PhaseManager instance not found on GameStateManager. Cannot advance phase.'
				);
			}
		}
	}

	public succeedPhase(): void {
		// Called during Morning (as per audit 4.2.1.b) to determine who starts next Afternoon.
		// The first player for the *next* day's Afternoon is the opponent of the current first player.
		const playerIds = this.gsm.getPlayerIds(); // Get array of player IDs
		if (!playerIds || playerIds.length === 0) {
			console.warn('TurnManager: succeedPhase called with no players in state.');
			this.gsm.state.firstPlayerId = ''; // Or handle as an error
			return;
		}
		if (playerIds.length === 1) {
			this.gsm.state.firstPlayerId = playerIds[0]; // Only one player
		} else {
			const currentFirstPlayerId = this.gsm.state.firstPlayerId;
			let currentFirstPlayerIndex = playerIds.indexOf(currentFirstPlayerId);

			if (currentFirstPlayerIndex === -1) {
				// Fallback if currentFirstPlayerId is somehow not in the list
				console.warn(
					`TurnManager: currentFirstPlayerId '${currentFirstPlayerId}' not found in player ID list during succeedPhase. Defaulting to first player in list.`
				);
				currentFirstPlayerIndex = 0; // Default to the first player
				this.gsm.state.firstPlayerId = playerIds[currentFirstPlayerIndex];
			}

			const nextFirstPlayerIndex = (currentFirstPlayerIndex + 1) % playerIds.length;
			this.gsm.state.firstPlayerId = playerIds[nextFirstPlayerIndex];
		}
		console.log(
			`TurnManager: succeedPhase - First player for the next day's Afternoon is now ${this.gsm.state.firstPlayerId}.`
		);
		this.eventBus.publish('nextDayFirstPlayerSet', { firstPlayerId: this.gsm.state.firstPlayerId });
	}
}
