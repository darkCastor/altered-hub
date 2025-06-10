import type { GameStateManager } from './GameStateManager';
import type { TurnManager } from './TurnManager';
import { GamePhase } from './types/enums';
import { isGameObject } from './types/objects';
export class PhaseManager {
private gameStateManager: GameStateManager;
private turnManager: TurnManager;
constructor(gsm: GameStateManager, turnManager: TurnManager) {
    this.gameStateManager = gsm;
    this.turnManager = turnManager;

    this.gameStateManager.eventBus.subscribe('afternoonEnded', async () => {
        await this.advancePhase();
    });
}

public async advancePhase() {
    const currentPhase = this.gameStateManager.state.currentPhase;
    let nextPhase: GamePhase;

    switch (currentPhase) {
        case GamePhase.Setup:
            nextPhase = GamePhase.Morning;
            this.gameStateManager.setCurrentPhase(nextPhase);
            await this.handleFirstMorning();
            break;

        case GamePhase.Morning:
            nextPhase = GamePhase.Noon;
            this.gameStateManager.setCurrentPhase(nextPhase);
            // TODO: Handle "At Noon" reactions
            break;

        case GamePhase.Noon:
            nextPhase = GamePhase.Afternoon;
            this.gameStateManager.setCurrentPhase(nextPhase);
            this.turnManager.startAfternoon();
            // Afternoon is driven by player actions and the 'afternoonEnded' event.
            break;

        case GamePhase.Afternoon: // This is triggered by the 'afternoonEnded' event
            nextPhase = GamePhase.Dusk;
            this.gameStateManager.setCurrentPhase(nextPhase);
            await this.handleDusk();
            await this.advancePhase(); // Auto-advance from dusk to night
            break;

        case GamePhase.Dusk:
            nextPhase = GamePhase.Night;
            this.gameStateManager.setCurrentPhase(nextPhase);
            await this.handleNight();
            await this.advancePhase(); // Auto-advance from night to next morning
            break;

        case GamePhase.Night:
            this.gameStateManager.state.dayNumber++;
            this.gameStateManager.eventBus.publish('dayAdvanced', { dayNumber: this.gameStateManager.state.dayNumber });
            
            nextPhase = GamePhase.Morning;
            this.gameStateManager.setCurrentPhase(nextPhase);
            await this.handleSubsequentMorning();
            await this.advancePhase(); // Auto-advance to noon
            break;

        default:
            throw new Error(`Unknown phase: ${currentPhase}`);
    }
}

/** Rule 4.1.l: The first Morning is skipped. */
private async handleFirstMorning() {
    console.log("[PhaseManager] Skipping daily effects for the first Morning (Rule 4.1.l).");
    this.gameStateManager.resetExpandFlags();
}

/** Rule 4.2.1: Morning daily effects for Day 2+ */
private async handleSubsequentMorning() {
    console.log(`[PhaseManager] Day ${this.gameStateManager.state.dayNumber} Morning Phase begins.`);
    // 1. Succeed
    this.turnManager.succeedPhase();
    // 2. Prepare
    await this.gameStateManager.preparePhase();
    // 3. Draw
    for (const playerId of this.gameStateManager.getPlayerIds()) {
        await this.gameStateManager.drawCards(playerId, 2);
    }
    this.gameStateManager.resetExpandFlags();
    // 4. Expand
    await this.handleExpandPhase();
}

/** Rule 4.2.4: Dusk daily effect */
private async handleDusk() {
    console.log("[PhaseManager] Dusk Phase begins.");
    // 1. Progress
    await this.gameStateManager.progressPhase();
}

/** Rule 4.2.5: Night daily effects */
private async handleNight() {
    console.log("[PhaseManager] Night Phase begins.");
    // 1. Rest
    await this.gameStateManager.restPhase();
    // 2. Clean-up
    await this.gameStateManager.cleanupPhase();
    // 3. Check Victory
    const winner = this.gameStateManager.checkVictoryConditions();
    if (winner) {
        // this.gameStateManager.eventBus.publish('gameEnded', { winner, reason: 'victory' });
        console.log(`[PhaseManager] Game ended - Winner: ${winner}`);
        return;
    }
}

/** Rule 4.2.1.e: Expand phase - players may put cards face-down in Mana zone */
private async handleExpandPhase() {
    console.log("[PhaseManager] Expand Phase begins.");
    
    for (const playerId of this.gameStateManager.getPlayerIds()) {
        const player = this.gameStateManager.getPlayer(playerId);
        if (!player || player.hasExpandedThisTurn) continue;
        
        // TODO: Add player choice mechanism
        // For now, auto-expand if hand has cards
        const handZone = player.zones.hand;
        if (handZone.getCount() > 0) {
            const cardToExpand = handZone.getAll()[0]; // Take first card
            if (cardToExpand) {
                const cardId = isGameObject(cardToExpand) ? cardToExpand.objectId : cardToExpand.instanceId;
                this.gameStateManager.moveEntity(
                    cardId,
                    handZone,
                    player.zones.manaZone,
                    playerId
                );
                player.hasExpandedThisTurn = true;
                console.log(`[PhaseManager] Player ${playerId} expanded a card to mana.`);
            }
        }
    }
}
}