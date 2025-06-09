export class CostProcessor {
    constructor(private gsm: GameStateManager) {}

    public canPay(playerId: string, cost: ICost): boolean {
        if (cost.mana && cost.mana > 0) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) return false;
            
            const readyManaCount = player.zones.manaZone.getAll().filter(orb => {
                const manaObject = orb as IManaOrbObject;
                return !manaObject.statuses.has(StatusType.Exhausted);
            }).length;

            if (readyManaCount < cost.mana) {
                console.log(`[Cost] Player ${playerId} cannot pay ${cost.mana} mana. Has ${readyManaCount} ready.`);
                return false;
            }
        }
        return true;
    }

    public pay(playerId: string, cost: ICost) {
        if (cost.mana && cost.mana > 0) {
            const player = this.gsm.getPlayer(playerId);
            if (!player) throw new Error("Player not found for cost payment");

            const readyMana = player.zones.manaZone.getAll().filter(orb => 
                !isGameObject(orb) || !orb.statuses.has(StatusType.Exhausted)
            );
            
            for(let i = 0; i < cost.mana; i++) {
                const manaToExhaust = readyMana[i] as IGameObject;
                manaToExhaust.statuses.add(StatusType.Exhausted);
                console.log(`[Cost] Exhausted mana orb ${manaToExhaust.objectId}`);
            }
            this.gsm.eventBus.publish('manaSpent', { playerId, amount: cost.mana });
        }
    }
}