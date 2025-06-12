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
		console.log(
			'PhaseManager: Skipping first Morning phase as per rules, advancing directly to Noon.'
		);
		// Set phase to Noon, then call its handler. Day remains 1.
		this.gameStateManager.state.currentPhase = GamePhase.Noon;
		this.gameStateManager.setCurrentPhase(GamePhase.Noon);
		this.handleNoon();
	}

	private async handleMorning(): Promise<void> {
		// gameStateManager.turnManager.succeedPhase(); // This seems to be for advancing turns within a phase.
		// Morning phase specific actions:
		if (this.gameStateManager.turnManager) {
			this.gameStateManager.turnManager.succeedPhase(); // Rule 4.2.1.b
			await this.gameStateManager.resolveReactions();
		} else {
			console.error(
				'PhaseManager: TurnManager not found on GameStateManager during handleMorning.'
			);
		}
		await this.gameStateManager.preparePhase();
		await this.gameStateManager.resolveReactions();

		for (const playerId of this.gameStateManager.getPlayerIds()) { // Iterate using getPlayerIds for safety
			await this.gameStateManager.drawCards(playerId, 2); // Draw 2 cards
			const player = this.gameStateManager.getPlayer(playerId);
			// Assuming player.playerExpand is a flag indicating if player *can* expand,
			// and manaSystem.expandMana handles the choice and card.
			// The original logic for expandMana was a bit off; it should ideally take a chosen card.
			// For now, we'll assume some form of expand logic happens or is initiated here.
			// If expandMana itself is an action that could trigger reactions, it would call resolveReactions internally or after.
			// The key is that after the "Expand" daily effect step for all players, reactions are checked.
			if (player && player.playerExpandChoices && !player.hasExpandedThisTurn) {
				// Simplified: actual expansion would involve player choice.
				// Assuming expandMana is called within a player loop or similar.
				console.log(`PhaseManager: Player ${playerId} to handle expand action.`);
			}
		}
		await this.gameStateManager.resolveReactions(); // After "Draw" and "Expand" daily effects for all players

		console.log(
			`PhaseManager: Morning logic executed for Day ${this.gameStateManager.state.currentDay}.`
		);
	}

	private handleNoon(): void {
		// "At Noon" effects are triggered by setCurrentPhase(GamePhase.Noon).
		console.log('PhaseManager: Noon logic executed.');
	}

	private handleAfternoon(): void {
		// "At Afternoon" effects are triggered by setCurrentPhase(GamePhase.Afternoon).
		// Actual turn management and exiting Afternoon is handled by TurnManager.
		// Game machine will call turnManager.startAfternoon() when phase becomes Afternoon.
		console.log(
			'PhaseManager: Afternoon. TurnManager is responsible for player turns and exiting the phase.'
		);
	}

	private async handleDusk(): Promise<void> {
		await this.gameStateManager.progressPhase();
		await this.gameStateManager.resolveReactions();
		console.log('PhaseManager: Dusk logic executed.');
	}

	private async handleNight(): Promise<void> {
		await this.gameStateManager.restPhase();
		await this.gameStateManager.resolveReactions();
		await this.gameStateManager.cleanupPhase();
		await this.gameStateManager.resolveReactions();
		this.gameStateManager.checkVictoryConditions();
		await this.gameStateManager.resolveReactions();
		console.log('PhaseManager: Night logic executed.');
		// After Night, if no victory, advancePhase will go to Morning and increment day.
	}
}
