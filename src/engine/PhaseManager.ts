import type { GameStateManager } from './GameStateManager';
import type { EventBus } from './EventBus';
import { GamePhase } from './types/enums';

export class PhaseManager {
	private gameStateManager: GameStateManager;
	private eventBus: EventBus;

	private phaseOrder: GamePhase[] = [
		GamePhase.Morning,
		GamePhase.Noon,
		GamePhase.Afternoon,
		GamePhase.Dusk,
		GamePhase.Night
	];

	constructor(gameStateManager: GameStateManager, eventBus: EventBus) {
		this.gameStateManager = gameStateManager;
		this.eventBus = eventBus;
	}

	public advancePhase(): void {
		const currentPhase = this.gameStateManager.state.currentPhase;
		const currentIndex = this.phaseOrder.indexOf(currentPhase);
		let nextPhaseIndex = (currentIndex + 1) % this.phaseOrder.length;
		const newPhase = this.phaseOrder[nextPhaseIndex];

		// Special handling for the very first turn (Setup -> Morning -> Noon)
		// According to audit, first morning is skipped.
		if (currentPhase === GamePhase.Setup && newPhase === GamePhase.Morning) {
			this.handleFirstMorning();
			return;
		}

		this.gameStateManager.state.currentPhase = newPhase;

		if (newPhase === GamePhase.Morning) {
			// Day increment should happen before calling setCurrentPhase for Morning
			// to ensure "At Morning of Day X" effects use the correct day.
			this.gameStateManager.state.currentDay++;
		}

		this.gameStateManager.setCurrentPhase(newPhase); // Important: Triggers phase change events

		// Call phase-specific handlers
		switch (newPhase) {
			case GamePhase.Morning:
				this.handleMorning();
				break;
			case GamePhase.Noon:
				this.handleNoon();
				break;
			case GamePhase.Afternoon:
				this.handleAfternoon();
				break;
			case GamePhase.Dusk:
				this.handleDusk();
				break;
			case GamePhase.Night:
				this.handleNight();
				break;
		}
	}

	private handleFirstMorning(): void {
		console.log("PhaseManager: Skipping first Morning phase as per rules, advancing directly to Noon.");
		// Set phase to Noon, then call its handler. Day remains 1.
		this.gameStateManager.state.currentPhase = GamePhase.Noon;
		this.gameStateManager.setCurrentPhase(GamePhase.Noon);
		this.handleNoon();
	}

	private handleMorning(): void {
		// gameStateManager.turnManager.succeedPhase(); // This seems to be for advancing turns within a phase.
		// Morning phase specific actions:
		if (this.gameStateManager.turnManager) {
			this.gameStateManager.turnManager.succeedPhase(); // Rule 4.2.1.b
		} else {
			console.error("PhaseManager: TurnManager not found on GameStateManager during handleMorning.");
		}
		this.gameStateManager.preparePhase(); // Reset per-phase states, untap units, etc.

		this.gameStateManager.state.players.forEach(playerId => {
			this.gameStateManager.drawCards(playerId, 2); // Draw 2 cards
			const player = this.gameStateManager.playerManager.getPlayer(playerId);
			if (player && player.playerExpand) { // Check for Expand mechanic
				this.gameStateManager.manaSystem.expandMana(playerId);
			}
		});
		console.log(`PhaseManager: Morning logic executed for Day ${this.gameStateManager.state.currentDay}.`);
	}

	private handleNoon(): void {
		// "At Noon" effects are triggered by setCurrentPhase(GamePhase.Noon).
		console.log("PhaseManager: Noon logic executed.");
	}

	private handleAfternoon(): void {
		// "At Afternoon" effects are triggered by setCurrentPhase(GamePhase.Afternoon).
		// Actual turn management and exiting Afternoon is handled by TurnManager.
		// Game machine will call turnManager.startAfternoon() when phase becomes Afternoon.
		console.log("PhaseManager: Afternoon. TurnManager is responsible for player turns and exiting the phase.");
	}

	private handleDusk(): void {
		this.gameStateManager.progressPhase(); // Resolve end-of-turn effects, etc.
		console.log("PhaseManager: Dusk logic executed.");
	}

	private handleNight(): void {
		this.gameStateManager.restPhase(); // Resources, cooldowns.
		this.gameStateManager.cleanupPhase(); // Discard excess cards, cleanup board.
		this.gameStateManager.checkVictoryConditions(); // Check if game ends.
		console.log("PhaseManager: Night logic executed.");
		// After Night, if no victory, advancePhase will go to Morning and increment day.
	}
}
