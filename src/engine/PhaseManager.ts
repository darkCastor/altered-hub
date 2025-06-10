import type { GameStateManager } from './GameStateManager';
import type { TurnManager } from './TurnManager';
import { GamePhase } from './types/enums';
export class PhaseManager {
private gameStateManager: GameStateManager;
private turnManager: TurnManager;
constructor(gsm: GameStateManager, turnManager: TurnManager) {
    this.gameStateManager = gsm;
    this.turnManager = turnManager;

    // Listen for the event that signals the end of the Afternoon phase
    this.gameStateManager.eventBus.subscribe('afternoonEnded', async () => {
        console.log("[PhaseManager] Afternoon has ended. Advancing to Dusk.");
        await this.advancePhase(); // This will now correctly move from Afternoon -> Dusk
    });
}

public async advancePhase() {
    const currentPhase = this.gameStateManager.state.currentPhase;
    let nextPhase: GamePhase | null = null;

    switch (currentPhase) {
        case GamePhase.Setup:
            nextPhase = GamePhase.Morning;
            await this.handleFirstMorning();
            break;
        case GamePhase.Morning:
            // Rule 4.2.1: Morning daily effects for subsequent days.
            console.log("[PhaseManager] Morning phase begins. Processing daily effects.");
            // 1. Succeed (not implemented)
            // 2. Prepare (not implemented)
            // 3. Draw (Rule 4.2.1.d)
            console.log("[PhaseManager] Draw Step: Each player draws two cards.");
            for (const playerId of this.gameStateManager.getPlayerIds()) {
                await this.gameStateManager.drawCards(playerId, 2);
            }
            // 4. Expand (not implemented)
            nextPhase = GamePhase.Noon;
            break;
        case GamePhase.Noon:
            nextPhase = GamePhase.Afternoon;
            this.handleAfternoon(); // This will start the turn loop, not set the next phase directly.
            break;
        case GamePhase.Afternoon:
            // This transition is now handled by the 'afternoonEnded' event listener.
            nextPhase = GamePhase.Dusk;
            // TODO: Implement Dusk daily effect (Progress)
            break;
        case GamePhase.Dusk:
            nextPhase = GamePhase.Night;
            break;
        case GamePhase.Night:
            // Rule 4.2.5: Night phase has Rest, Clean-up, and Check Victory effects.
            await this.gameStateManager.restPhase();
            // TODO: Implement Clean-up and Check Victory
            
            this.gameStateManager.state.dayNumber++;
            this.gameStateManager.eventBus.publish('dayAdvanced', { dayNumber: this.gameStateManager.state.dayNumber });
            nextPhase = GamePhase.Morning;
            break;
        default:
            throw new Error(`Unknown phase: ${currentPhase}`);
    }
    
    if (nextPhase) {
        this.gameStateManager.setCurrentPhase(nextPhase);
    }
}

private async handleFirstMorning() { console.log("Skipping daily effects for the first Morning (Rule 4.1.l)."); }
private handleAfternoon() {
    this.turnManager.startAfternoon();
}}