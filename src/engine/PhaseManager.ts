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
                nextPhase = GamePhase.Noon;
                break;
            case GamePhase.Noon:
                nextPhase = GamePhase.Afternoon;
                this.handleAfternoon(); // This will start the turn loop, not set the next phase directly.
                break;
            case GamePhase.Afternoon:
                // This transition is now handled by the 'afternoonEnded' event listener.
                nextPhase = GamePhase.Dusk;
                break;
            case GamePhase.Dusk:
                nextPhase = GamePhase.Night;
                break;
            case GamePhase.Night:
                this.gameStateManager.state.dayNumber++;
                nextPhase = GamePhase.Morning;
                // await this.handleMorning();
                break;
            default:
                throw new Error(`Unknown phase: ${currentPhase}`);
        }
        
        if (nextPhase) {
            this.gameStateManager.setCurrentPhase(nextPhase);
        }
    }
    
    private async handleFirstMorning() { console.log("Skipping daily effects for the first Morning."); }
    private handleAfternoon() {
        this.turnManager.startAfternoon();
    }
}