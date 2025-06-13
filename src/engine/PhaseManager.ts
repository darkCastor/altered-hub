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
		await this.gameStateManager.preparePhase(); // This includes resetting expand flags
		await this.gameStateManager.resolveReactions();

		// Morning Step 1: Draw cards (Rule 4.2.1.d)
		for (const playerId of this.gameStateManager.getPlayerIdsInInitiativeOrder(
			this.gameStateManager.state.firstPlayerId
		)) {
			await this.gameStateManager.drawCards(playerId, 2); // Draw 2 cards
			// Note: Drawing cards can trigger reactions, which should be handled by drawCards or GameStateManager.
			// For now, assuming drawCards and subsequent resolveReactions handle this.
			// If not, a resolveReactions() might be needed after each player draws or after all draw.
		}
		// Resolve reactions after all players have drawn.
		await this.gameStateManager.resolveReactions();

		// Morning Step 2: Expand (Rule 4.2.1.e)
		// Iterate through each player (respecting initiative order).
		for (const playerId of this.gameStateManager.getPlayerIdsInInitiativeOrder(
			this.gameStateManager.state.firstPlayerId
		)) {
			const player = this.gameStateManager.getPlayer(playerId);
			if (player && !player.hasExpandedThisTurn) {
				// PlayerActionHandler.getAvailableExpandAction already checks if player can expand (has cards, hasn't expanded).
				// Now, we prompt for choice.
				if (!player.hasExpandedThisTurn && player.zones.handZone.getCount() > 0) {
					const choice =
						await this.gameStateManager.actionHandler.promptPlayerForExpandChoice(playerId);

					if (choice.cardToExpandId) {
						try {
							await this.gameStateManager.playerActionHandler.executeExpandAction(
								playerId,
								choice.cardToExpandId
							);
							console.log(
								`[PhaseManager] Player ${playerId} successfully expanded card ${choice.cardToExpandId}.`
							);
							// Resolve reactions AFTER each individual expand action. (Rule 4.2.1.e)
							await this.gameStateManager.resolveReactions();
						} catch (error) {
							console.error(
								`[PhaseManager] Error during expand action for player ${playerId} with card ${choice.cardToExpandId}:`,
								error
							);
						}
					} else {
						console.log(
							`[PhaseManager] Player ${playerId} chose not to expand or had no cards (choice was null).`
						);
					}
				} else {
					console.log(
						`[PhaseManager] Player ${playerId} has already expanded or has no cards in hand.`
					);
				}
			}
		}
		// Note: The rule 4.2.1.e says "After a player resolves this daily effect, check for reactions."
		// This implies reactions are checked after each expansion, which is handled above.
		// A final resolveReactions for the Morning phase itself might be needed after all steps.

		// Morning Step 3: Other Morning daily effects (if any) would go here.

		// Final resolution for the Morning phase before moving on.
		await this.gameStateManager.resolveReactions();

		// Process "At Noon" triggers before officially transitioning to Noon phase
		// This is because setCurrentPhase(Noon) will be called by advancePhase later.
		// If Noon triggers need to happen at the very end of morning actions:
		console.log(
			`PhaseManager: Morning logic executed for Day ${this.gameStateManager.state.currentDay}. Processing 'At Noon' triggers before advancing.`
		);
		await this.gameStateManager.triggerHandler.processPhaseTriggersForPhase(GamePhase.Noon);
		await this.gameStateManager.resolveReactions();
	}

	private handleNoon(): void {
		// "At Noon" effects are primarily triggered by setCurrentPhase(GamePhase.Noon) called from advancePhase
		// or handleFirstMorning. This method is for any additional specific Noon logic if needed.
		console.log('PhaseManager: Noon logic executed.');
	}

	private handleAfternoon(): void {
		// "At Afternoon" effects are triggered by setCurrentPhase(GamePhase.Afternoon).
		console.log('PhaseManager: Afternoon. TurnManager will now be initialized for the phase.');
		if (this.gameStateManager.turnManager) {
			this.gameStateManager.turnManager.startAfternoon();
		} else {
			console.error(
				'PhaseManager: TurnManager not found on GameStateManager during handleAfternoon.'
			);
		}
	}

	private async handleDusk(): Promise<void> {
		await this.gameStateManager.progressPhase();
		await this.gameStateManager.resolveReactions(); // Reactions after Progress daily effect
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
