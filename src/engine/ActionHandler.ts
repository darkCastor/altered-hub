import type { GameStateManager } from './GameStateManager';
import type { TurnManager } from './TurnManager';
import type { ReactionManager } from './ReactionManager';
import { CostProcessor } from './CostProcessor';
import { EffectResolver } from './EffectResolver';
import type { IZone} from './types/zones';
import type { ICardInstance } from './types/cards';
import type { ICost } from './types/abilities';
import { CardType, StatusType } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Handles high-level player actions, orchestrating the various managers
 * and processors to ensure rules are followed.
 */
export class ActionHandler {
    private gsm: GameStateManager;
    private turnManager: TurnManager;
    private reactionManager: ReactionManager;
    private costProcessor: CostProcessor;
    private effectResolver: EffectResolver;

    constructor(gsm: GameStateManager, turnManager: TurnManager, reactionManager: ReactionManager) {
        this.gsm = gsm;
        this.turnManager = turnManager;
        this.reactionManager = reactionManager;
        this.effectResolver = new EffectResolver(gsm); 
        this.costProcessor = new CostProcessor(gsm);
    }

    /**
     * Executes the complex process of a player playing a card from their hand.
     * Follows the procedure outlined in Rule 5.1.2.
     * @param playerId The ID of the player performing the action.
     * @param cardInstanceId The ID of the card instance in the player's hand.
     * @param expeditionId The target expedition, if the card is a Character or Expedition Permanent.
     */
    public async tryPlayCardFromHand(playerId: string, cardInstanceId: string, expeditionId?: string): Promise<void> {
        console.log(`[ActionHandler] Player ${playerId} is attempting to play card ${cardInstanceId} from hand.`);

        // --- 1. Validation and Declaration of Intent ---
        const player = this.gsm.getPlayer(playerId);
        if (!player || this.gsm.state.currentPlayerId !== playerId) {
            console.error(`[ActionHandler] FAILED: It is not ${playerId}'s turn.`);
            return;
        }

        const cardInstance = player.zones.hand.findById(cardInstanceId) as ICardInstance;
        if (!cardInstance) {
            console.error(`[ActionHandler] FAILED: Card ${cardInstanceId} not found in player's hand.`);
            return;
        }

        const definition = this.gsm.getCardDefinition(cardInstance.definitionId);
        if (!definition) {
            console.error(`[ActionHandler] FAILED: Card definition not found for ${cardInstance.definitionId}.`);
            return;
        }
        
        const cost: ICost = { mana: definition.handCost };

        if (!this.costProcessor.canPay(playerId, cost)) {
            console.error(`[ActionHandler] FAILED: Player ${playerId} cannot pay the costs for ${definition.name}.`);
            return;
        }
        console.log(`[ActionHandler] Intent to play ${definition.name} is valid.`);

        // --- 2. Move to Limbo (Rule 5.1.2.g) ---
        const limboMovePayload = this.gsm.moveEntity(cardInstance.instanceId, player.zones.hand, this.gsm.state.sharedZones.limbo, playerId);
        if (!limboMovePayload) {
             console.error(`[ActionHandler] FAILED: Card ${cardInstance.instanceId} could not be moved to Limbo.`);
             return;
        }
        this.reactionManager.checkForTriggers('entityMoved', limboMovePayload);
        await this.reactionManager.processReactions();

        const objectInLimbo = this.gsm.state.sharedZones.limbo.findById(limboMovePayload.newId);
        if (!objectInLimbo || !isGameObject(objectInLimbo)) {
            console.warn(`[ActionHandler] Card ${definition.name} was removed from Limbo by a reaction before it could resolve. Aborting action.`);
            this.turnManager.advanceTurn();
            return;
        }
        
        // --- 3. Pay Costs (Rule 5.1.2.h) ---
        if (!this.costProcessor.canPay(playerId, cost)) {
            console.error(`[ActionHandler] FAILED: Cost became unpayable after reactions. Returning card to hand.`);
            this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, player.zones.hand, playerId);
            return;
        }
        this.costProcessor.pay(playerId, cost);
        console.log(`[ActionHandler] Costs for ${definition.name} paid.`);

        // --- 4. Resolution (Rule 5.1.2.i) ---
        let finalDestinationZone: IZone;
        switch (definition.type) {
            case CardType.Character:
            case CardType.ExpeditionPermanent:
                const targetExpedition = player.zones.expedition; // FIX: Correctly access player's expedition zone
                if (!targetExpedition) {
                     console.error(`[ActionHandler] FAILED: Target expedition for player ${playerId} not found.`);
                     this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, player.zones.hand, playerId);
                     return;
                }
                finalDestinationZone = targetExpedition;
                break;

            case CardType.LandmarkPermanent:
                finalDestinationZone = player.zones.landmarkZone;
                break;

            case CardType.Spell:
                 const isFleeting = objectInLimbo.statuses.has(StatusType.Fleeting);
                 finalDestinationZone = isFleeting ? player.zones.discardPile : player.zones.reserve;
                 break;

            default:
                 console.error(`[ActionHandler] FAILED: Unknown card type resolution: ${definition.type}.`);
                 this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, player.zones.hand, playerId);
                 return;
        }
        
        const finalMovePayload = this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, finalDestinationZone, playerId);
        console.log(`[ActionHandler] ${definition.name} is moving from Limbo to ${finalDestinationZone.zoneType}.`);

        if (finalMovePayload) {
            this.reactionManager.checkForTriggers('entityMoved', finalMovePayload);
            await this.reactionManager.processReactions();
        }
        
        console.log(`[ActionHandler] Action to play ${definition.name} is complete.`);

        // --- 5. End of Turn Effect ---
        this.turnManager.advanceTurn();
    }

    /**
     * Handles a player passing their turn.
     * @param playerId The ID of the player passing.
     */
    public async tryPass(playerId: string): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player || this.gsm.state.currentPlayerId !== playerId) {
            console.error(`[ActionHandler] FAILED: It is not ${playerId}'s turn to pass.`);
            return;
        }

        console.log(`[ActionHandler] Player ${playerId} passes the turn.`);
        this.turnManager.playerPasses(playerId);
        this.turnManager.advanceTurn();
    }
}