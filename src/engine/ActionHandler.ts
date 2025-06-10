import type { GameStateManager } from './GameStateManager';
import type { TurnManager } from './TurnManager';
import type { ReactionManager } from './ReactionManager';
import { CostProcessor } from './CostProcessor';
import { EffectResolver } from './EffectResolver';
import type { IZone} from './types/zones';
import type { ICardInstance } from './types/cards';
import type { ICost } from './types/abilities';
import { CardType, StatusType, ZoneIdentifier } from './types/enums';
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
            throw new Error(`It is not ${playerId}'s turn.`);
        }

        const cardInstance = player.zones.hand.findById(cardInstanceId) as ICardInstance;
        if (!cardInstance) {
            throw new Error(`Card ${cardInstanceId} not found in player's hand.`);
        }

        const definition = this.gsm.getCardDefinition(cardInstance.definitionId);
        if (!definition) {
            throw new Error(`Card definition not found for ${definition.name}.`);
        }
        
        const cost: ICost = { mana: definition.handCost };

        if (!this.costProcessor.canPay(playerId, cost)) {
            throw new Error(`Player ${playerId} cannot pay the costs for ${definition.name}.`);
        }
        console.log(`[ActionHandler] Intent to play ${definition.name} is valid.`);

        // --- 2. Move to Limbo (Rule 5.1.2.g) ---
        const limboMoveResult = this.gsm.moveEntity(cardInstance.instanceId, player.zones.hand, this.gsm.state.sharedZones.limbo, playerId);
        if (!limboMoveResult) {
             throw new Error(`Card ${cardInstance.instanceId} could not be moved to Limbo.`);
        }
        const limboMovePayload = { entity: limboMoveResult, from: player.zones.hand, to: this.gsm.state.sharedZones.limbo };
        this.reactionManager.checkForTriggers('entityMoved', limboMovePayload);
        await this.reactionManager.processReactions();

        const objectInLimboId = isGameObject(limboMoveResult) ? limboMoveResult.objectId : limboMoveResult.instanceId;
        const objectInLimbo = this.gsm.state.sharedZones.limbo.findById(objectInLimboId);
        
        if (!objectInLimbo || !isGameObject(objectInLimbo)) {
            console.warn(`[ActionHandler] Card ${definition.name} was removed from Limbo by a reaction before it could resolve. Aborting action.`);
            this.turnManager.advanceTurn();
            return;
        }
        
        // --- 3. Pay Costs (Rule 5.1.2.h) ---
        if (!this.costProcessor.canPay(playerId, cost)) {
            console.error(`[ActionHandler] Cost became unpayable after reactions. Returning card to hand.`);
            this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, player.zones.hand, playerId);
            // NOTE: Do not advance turn, player action failed.
            return;
        }
        this.costProcessor.pay(playerId, cost);
        console.log(`[ActionHandler] Costs for ${definition.name} paid.`);

        // --- 4. Resolution (Rule 5.1.2.i) ---
        let finalDestinationZone: IZone;
        switch (definition.type) {
            case CardType.Character:
            case CardType.ExpeditionPermanent:
                const targetExpeditionZone = this.gsm.state.players.get(playerId)?.zones.expedition;
                if (!targetExpeditionZone) {
                    throw new Error(`Target expedition for player ${playerId} not found.`);
                }
                finalDestinationZone = targetExpeditionZone;
                break;
            case CardType.LandmarkPermanent:
                finalDestinationZone = player.zones.landmarkZone;
                break;
            case CardType.Spell:
                 const isFleeting = objectInLimbo.statuses.has(StatusType.Fleeting);
                 finalDestinationZone = isFleeting ? player.zones.discardPile : player.zones.reserve;
                 break;
            default:
                 this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, player.zones.hand, playerId);
                 throw new Error(`Unknown card type resolution: ${definition.type}.`);
        }
        
        console.log(`[ActionHandler] ${definition.name} is moving from Limbo to ${finalDestinationZone.zoneType}.`);
        const finalMoveResult = this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, finalDestinationZone, playerId);

        if (finalMoveResult) {
            const finalMovePayload = { entity: finalMoveResult, from: this.gsm.state.sharedZones.limbo, to: finalDestinationZone };
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
            throw new Error(`It is not ${playerId}'s turn to pass.`);
        }
        if (player.hasPassedTurn) {
            throw new Error(`Player ${playerId} has already passed.`);
        }

        console.log(`[ActionHandler] Player ${playerId} passes the turn.`);
        this.turnManager.playerPasses(playerId);
        this.turnManager.advanceTurn();
    }
}
