import type { GameStateManager } from "./GameStateManager";
import { GamePhase } from "./types/enums";
export class TurnManager {
private gsm: GameStateManager;
private turnOrder: string[];
constructor(gsm: GameStateManager) {
    this.gsm = gsm;
    this.turnOrder = gsm.getPlayerIds();
}

/**
 * Handles the Succeed daily effect during the Morning phase.
 * Rule 4.2.1.b: The player to the left of the first player becomes the first player.
 */
public succeedPhase() {
    const currentFirstPlayerId = this.gsm.state.firstPlayerId;
    const currentIndex = this.turnOrder.indexOf(currentFirstPlayerId);
    const nextFirstPlayerId = this.turnOrder[(currentIndex + 1) % this.turnOrder.length];
    
    this.gsm.state.firstPlayerId = nextFirstPlayerId;
    console.log(`[TurnManager] Succeed Phase: New first player is ${nextFirstPlayerId}.`);
}

public startAfternoon() {
    this.gsm.setCurrentPhase(GamePhase.Afternoon);
    this.gsm.state.players.forEach(p => p.hasPassedTurn = false);
    // Rule 4.2.3.c: Afternoon starts with the first player of the day.
    this.gsm.state.currentPlayerId = this.gsm.state.firstPlayerId;
    console.log(`[TurnManager] Afternoon phase begins. Turn for ${this.gsm.state.currentPlayerId}.`);
    this.gsm.eventBus.publish('turnAdvanced', { currentPlayerId: this.gsm.state.currentPlayerId });
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
            if (this.checkPhaseEnd()) {
                this.gsm.eventBus.publish('afternoonEnded', {});
                return;
            }
        }
    }
    this.gsm.state.currentPlayerId = this.turnOrder[nextIndex];
    this.gsm.eventBus.publish('turnAdvanced', { currentPlayerId: this.gsm.state.currentPlayerId });
}

public playerPasses(playerId: string) {
    const player = this.gsm.getPlayer(playerId);
    if (player) {
        player.hasPassedTurn = true;
    }
}

private checkPhaseEnd(): boolean {
    return Array.from(this.gsm.state.players.values()).every(p => p.hasPassedTurn);
}}