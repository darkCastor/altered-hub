import type { GameStateManager } from "./GameStateManager";
import { GamePhase } from "./types/enums";
export class TurnManager {
private gsm: GameStateManager;
private turnOrder: string[];
constructor(gsm: GameStateManager) {
    this.gsm = gsm;
    this.turnOrder = gsm.getPlayerIds();
}

public startAfternoon() {
    this.gsm.setCurrentPhase(GamePhase.Afternoon);
    this.gsm.state.players.forEach(p => p.hasPassedTurn = false);
    // Rule 1.3.2.d: Afternoon starts with the first player.
    this.gsm.state.currentPlayerId = this.gsm.state.firstPlayerId;
    console.log(`[TurnManager] Afternoon phase begins. Turn for ${this.gsm.state.currentPlayerId}.`);
    this.gsm.eventBus.publish('turnAdvanced', { currentPlayerId: this.gsm.state.currentPlayerId });
}

public advanceTurn() {
    if (this.checkPhaseEnd()) {
        console.log("[TurnManager] All players have passed. Afternoon phase is ending.");
        this.gsm.eventBus.publish('afternoonEnded', {});
        return;
    }

    const currentIndex = this.turnOrder.indexOf(this.gsm.state.currentPlayerId);
    let nextIndex = (currentIndex + 1) % this.turnOrder.length;
    
    // Find the next player who has not passed.
    while (this.gsm.getPlayer(this.turnOrder[nextIndex])?.hasPassedTurn) {
        nextIndex = (nextIndex + 1) % this.turnOrder.length;
        // This safety check prevents infinite loops if something goes wrong, though checkPhaseEnd should handle it.
        if (this.turnOrder[nextIndex] === this.gsm.state.currentPlayerId) {
            if (this.checkPhaseEnd()) {
                this.gsm.eventBus.publish('afternoonEnded', {});
                return;
            }
        }
    }
    this.gsm.state.currentPlayerId = this.turnOrder[nextIndex];
    console.log(`[TurnManager] Turn advances to ${this.gsm.state.currentPlayerId}.`);
    this.gsm.eventBus.publish('turnAdvanced', { currentPlayerId: this.gsm.state.currentPlayerId });
}

public playerPasses(playerId: string) {
    const player = this.gsm.getPlayer(playerId);
    if (player) {
        player.hasPassedTurn = true;
        this.gsm.state.actionHistory.push({ action: 'pass', playerId });
        console.log(`[TurnManager] Player ${playerId} has passed.`);
    }
}

/**
 * Checks if the Afternoon phase should end.
 * Rule 4.2.3.e: if all players have passed, Afternoon ends.
 */
private checkPhaseEnd(): boolean {
    return Array.from(this.gsm.state.players.values()).every(p => p.hasPassedTurn);
}}