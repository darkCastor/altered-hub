import type { GameStateManager } from './GameStateManager';
import type { TurnManager } from './TurnManager';
import { CostProcessor } from './CostProcessor';
import { EffectResolver } from './EffectResolver';
import type { IZone, ICardInstance, IGameObject } from './types/zones';
import type { ICost } from './types/abilities';
import { CardType, StatusType, ZoneIdentifier } from './types/enums';
export class ActionHandler {
private gsm: GameStateManager;
private costProcessor: CostProcessor;
private effectResolver: EffectResolver;
private turnManager: TurnManager;
constructor(gsm: GameStateManager, turnManager: TurnManager) {
    this.gsm = gsm;
    this.turnManager = turnManager;
    this.costProcessor = new CostProcessor(gsm);
    this.effectResolver = new EffectResolver(gsm);
}

public async tryPlayCardFromHand(playerId: string, cardInstanceId: string, destinationZone: IZone) {
    console.log(`[ActionHandler] ${playerId} attempting to play card ${cardInstanceId}...`);
    const player = this.gsm.getPlayer(playerId);
    if (!player || this.gsm.state.currentPlayerId !== playerId) {
        console.error(`[ActionHandler] FAILED: It is not ${playerId}'s turn.`);
        return;
    }
    
    const cardInstance = player.zones.hand.findById(cardInstanceId) as ICardInstance;
    if (!cardInstance) {
        console.error(`[ActionHandler] FAILED: Card ${cardInstanceId} not in hand.`);
        return;
    }

    const definition = this.gsm.getCardDefinition(cardInstance.definitionId);
    if (!definition) throw new Error("Card definition not found.");

    const cost: ICost = { mana: definition.handCost };

    if (!this.costProcessor.canPay(playerId, cost)) {
        console.error(`[ActionHandler] FAILED: Cannot pay costs for ${definition.name}.`);
        return;
    }

    // Rule 5.1.2.a: The process of playing a card has four parts: declare intent, move to Limbo, pay costs, and resolution.

    // 1. Move to Limbo. The card becomes a GameObject.
    const objectInLimbo = this.gsm.moveEntity(cardInstance.instanceId, player.zones.hand, this.gsm.state.sharedZones.limbo, playerId) as IGameObject;
    
    // 2. Pay costs.
    this.costProcessor.pay(playerId, cost);

    // 3. Resolution (move from Limbo and resolve triggers).
    // Rule 5.1.2.j: Reactions are activated by the step where the card leaves Limbo.
    
    // The final destination is determined by card type.
    let finalDestination = destinationZone;
    if (definition.type === CardType.Spell) {
        // Rule 5.2.4.b: Spells go to Reserve (or Discard if Fleeting).
        const isFleeting = objectInLimbo.statuses.has(StatusType.Fleeting); // This would be set by other effects or if played from reserve.
        finalDestination = isFleeting ? player.zones.discardPile : player.zones.reserve;
    }

    const finalObject = this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, finalDestination, playerId) as IGameObject;
    
    if (!finalObject) {
        // The object may have ceased to exist (e.g., a token leaving the expedition zone, though this is an unlikely scenario for "play from hand").
        console.log(`[ActionHandler] Card ${definition.name} did not resolve to a final object.`);
    } else {
         console.log(`[ActionHandler] ${definition.name} entered ${finalDestination.zoneType} as new object ${finalObject.objectId}.`);

        // 4. Resolve abilities triggered by the card being "played".
        finalObject.abilities.forEach(ability => {
            // Rule 1.1.6.f / 7.1.1.b: The 'h' symbol means "When I am played from Hand".
            if (ability.trigger?.eventType === 'onPlayFromHand') { // This is a simplification of the full trigger system.
                this.effectResolver.resolve(ability.effect);
            }
        });

        // Post-resolution effects for spells.
        if (definition.type === CardType.Spell) {
            // Rule 5.2.4.b: If a spell has Cooldown, it becomes exhausted in Reserve.
            // This would require a "hasCooldown" property on the definition.
            // Example: if (definition.hasCooldown && finalObject.zone.zoneType === ZoneIdentifier.Reserve) { finalObject.statuses.add(StatusType.Exhausted) }
        }
    }
    
    // After the action is complete, advance the turn
    this.turnManager.advanceTurn();
}

public async tryPass(playerId: string) {
    if (this.gsm.state.currentPlayerId !== playerId) {
        console.error(`[ActionHandler] FAILED: It is not ${playerId}'s turn to pass.`);
        return;
    }
    this.turnManager.playerPasses(playerId);
    this.turnManager.advanceTurn();
}}