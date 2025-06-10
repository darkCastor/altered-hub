import type { GameStateManager } from './GameStateManager';
import type { ICost } from './types/abilities';
import { StatusType } from './types/enums';
import type { IGameObject, IManaOrbObject } from './types/objects';
import { isGameObject } from './types/objects';
export class CostProcessor {
constructor(private gsm: GameStateManager) {}
public canPay(playerId: string, cost: ICost): boolean {
    if (cost.mana && cost.mana > 0) {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return false;
        
        // Rule 1.2.5.e: A mana cost is payed by exhausting that many Mana Orbs.
        const readyManaCount = player.zones.manaZone.getAll().filter(orb => {
            if (!isGameObject(orb)) return false;
            return !orb.statuses.has(StatusType.Exhausted);
        }).length;

        if (readyManaCount < cost.mana) {
            console.log(`[Cost] Player ${playerId} cannot pay ${cost.mana} mana. Has ${readyManaCount} ready.`);
            return false;
        }
    }
    // Add checks for other cost types (discard, sacrifice, etc.) here.
    return true;
}

public pay(playerId: string, cost: ICost) {
    if (cost.mana && cost.mana > 0) {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error("Player not found for cost payment");

        // FIX: The original filter was buggy. It should only select ready mana orbs.
        // This now correctly mirrors the logic in canPay.
        const readyMana = player.zones.manaZone.getAll().filter(orb => 
            isGameObject(orb) && !orb.statuses.has(StatusType.Exhausted)
        );
        
        if (readyMana.length < cost.mana) {
            // This should be caught by canPay, but as a safeguard:
            throw new Error(`Insufficient ready mana to pay cost for player ${playerId}.`);
        }
        
        for(let i = 0; i < cost.mana; i++) {
            const manaToExhaust = readyMana[i] as IGameObject;
            manaToExhaust.statuses.add(StatusType.Exhausted);
            console.log(`[Cost] Exhausted mana orb ${manaToExhaust.objectId}`);
        }
        this.gsm.eventBus.publish('manaSpent', { playerId, amount: cost.mana });
    }
    // Add payment logic for other cost types here.
}}