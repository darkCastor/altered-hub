export class TurnManager {
    private gsm: GameStateManager;
    private turnOrder: string[];

    constructor(gsm: GameStateManager) {
        this.gsm = gsm;
        this.turnOrder = gsm.getPlayerIds();
    }

    public startAfternoon() {
        this.gsm.state.players.forEach(p => p.hasPassedTurn = false);
        this.gsm.state.currentPlayerId = this.gsm.state.firstPlayerId;
        console.log(`[TurnManager] Afternoon phase begins. Turn for ${this.gsm.state.currentPlayerId}.`);
    }

    public advanceTurn() {
        if (this.checkPhaseEnd()) {
            this.gsm.eventBus.publish('afternoonEnded', {});
            return;
        }

        const currentIndex = this.turnOrder.indexOf(this.gsm.state.currentPlayerId);
        let nextIndex = (currentIndex + 1) % this.turnOrder.length;
        
        while (this.gsm.getPlayer(this.turnOrder[nextIndex])?.hasPassedTurn) {
            nextIndex = (nextIndex + 1) % this.turnOrder.length;
            if (this.turnOrder[nextIndex] === this.gsm.state.currentPlayerId) {
                // This state should be caught by checkPhaseEnd, but as a safeguard:
                if (this.checkPhaseEnd()) {
                    this.gsm.eventBus.publish('afternoonEnded', {});
                    return;
                }
            }
        }
        this.gsm.state.currentPlayerId = this.turnOrder[nextIndex];
        console.log(`[TurnManager] Turn advances to ${this.gsm.state.currentPlayerId}.`);
    }
    
    public playerPasses(playerId: string) {
        const player = this.gsm.getPlayer(playerId);
        if (player) {
            player.hasPassedTurn = true;
            this.gsm.state.actionHistory.push({ action: 'pass', playerId });
            console.log(`[TurnManager] Player ${playerId} has passed.`);
        }
    }
    
    private checkPhaseEnd(): boolean {
        return Array.from(this.gsm.state.players.values()).every(p => p.hasPassedTurn);
    }
}
