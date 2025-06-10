import type { GameStateManager } from './GameStateManager';
import type { ICost } from './types/abilities';
import { StatusType } from './types/enums';
import type { IGameObject } from './types/objects';
import { isGameObject } from './types/objects';

export class CostProcessor {
    constructor(private gsm: GameStateManager) {}

    public canPay(playerId: string, cost: ICost, sourceObjectId?: string): boolean {
        if (cost.mana && cost.mana > 0) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) return false;
            
            const readyManaCount = player.zones.manaZone.getAll().filter(orb => {
                if (!isGameObject(orb)) return false;
                return !orb.statuses.has(StatusType.Exhausted);
            }).length;

            if (readyManaCount < cost.mana) {
                console.log(`[Cost] Player ${playerId} cannot pay ${cost.mana} mana. Has ${readyManaCount} ready.`);
                return false;
            }
        }

        if (cost.exhaustSelf) {
            if (!sourceObjectId) {
                console.error(`[Cost] exhaustSelf cost requires a sourceObjectId, but none was provided.`);
                return false;
            }
            const sourceObject = this.gsm.getObject(sourceObjectId);
            if (!sourceObject) {
                console.error(`[Cost] Could not find source object ${sourceObjectId} to check exhaustSelf cost.`);
                return false;
            }
            if (sourceObject.statuses.has(StatusType.Exhausted)) {
                console.log(`[Cost] Cannot pay exhaustSelf cost; object ${sourceObjectId} is already exhausted.`);
                return false;
            }
        }
        // Add checks for other cost types (discard, sacrifice, etc.) here.
        return true;
    }

    public pay(playerId: string, cost: ICost, sourceObjectId?: string) {
        if (cost.mana && cost.mana > 0) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) throw new Error("Player not found for cost payment");

            const readyMana = player.zones.manaZone.getAll().filter(orb => 
                isGameObject(orb) && !orb.statuses.has(StatusType.Exhausted)
            );
            
            if (readyMana.length < cost.mana) {
                throw new Error(`Insufficient ready mana to pay cost for player ${playerId}.`);
            }
            
            for(let i = 0; i < cost.mana; i++) {
                const manaToExhaust = readyMana[i] as IGameObject;
                manaToExhaust.statuses.add(StatusType.Exhausted);
                console.log(`[Cost] Exhausted mana orb ${manaToExhaust.objectId}`);
            }
            this.gsm.eventBus.publish('manaSpent', { playerId, amount: cost.mana });
        }

        if (cost.exhaustSelf) {
            if (!sourceObjectId) {
                throw new Error("Cannot pay exhaustSelf cost without a sourceObjectId.");
            }
            const sourceObject = this.gsm.getObject(sourceObjectId);
            if (!sourceObject) {
                throw new Error(`Could not find source object ${sourceObjectId} to pay exhaustSelf cost.`);
            }
            if (sourceObject.statuses.has(StatusType.Exhausted)) {
                throw new Error(`Cannot pay exhaustSelf cost; object ${sourceObjectId} is already exhausted.`);
            }
            sourceObject.statuses.add(StatusType.Exhausted);
            console.log(`[Cost] Exhausted object ${sourceObject.objectId} ('${sourceObject.name}') to pay a cost.`);
        }
        // Add payment logic for other cost types here.
    }
}