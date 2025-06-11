import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance } from './types/objects';
import { GamePhase, CardType, StatusType } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Handles player actions during Afternoon turns
 * Rule 4.2.3 - Afternoon turn structure
 */
export class PlayerActionHandler {
    constructor(private gsm: GameStateManager) {}

    /**
     * Gets available actions for a player during their turn
     * Rule 4.2.3.d - Players can play a card, play a quick action, or pass
     */
    public getAvailableActions(playerId: string): PlayerAction[] {
        if (this.gsm.state.currentPhase !== GamePhase.Afternoon) {
            return [];
        }

        if (this.gsm.state.currentPlayerId !== playerId) {
            return [];
        }

        const actions: PlayerAction[] = [];
        
        // Always can pass
        actions.push({
            type: 'pass',
            description: 'Pass turn'
        });

        // Check playable cards from hand
        const playableCards = this.getPlayableCardsFromHand(playerId);
        for (const card of playableCards) {
            actions.push({
                type: 'playCard',
                cardId: card.instanceId,
                zone: 'hand',
                description: `Play ${card.definitionId} from hand`
            });
        }

        // Check playable cards from reserve
        const playableFromReserve = this.getPlayableCardsFromReserve(playerId);
        for (const card of playableFromReserve) {
            actions.push({
                type: 'playCard',
                cardId: card.objectId,
                zone: 'reserve',
                description: `Play ${card.name} from reserve`
            });
        }

        // Check available quick actions
        const quickActions = this.getAvailableQuickActions(playerId);
        for (const action of quickActions) {
            actions.push(action);
        }

        return actions;
    }

    /**
     * Executes a player action
     * Rule 4.2.3.e - After action, turn continues or ends based on action type
     */
    public async executeAction(playerId: string, action: PlayerAction): Promise<boolean> {
        if (this.gsm.state.currentPlayerId !== playerId) {
            throw new Error(`Not ${playerId}'s turn`);
        }

        switch (action.type) {
            case 'pass':
                this.gsm.turnManager.playerPasses(playerId);
                console.log(`[PlayerAction] ${playerId} passed their turn`);
                return true; // Turn ends

            case 'playCard':
                await this.playCard(playerId, action.cardId!, action.zone!);
                console.log(`[PlayerAction] ${playerId} played a card`);
                return true; // Turn ends after playing a card

            case 'quickAction':
                await this.executeQuickAction(playerId, action.abilityId!, action.sourceObjectId!);
                console.log(`[PlayerAction] ${playerId} used a quick action`);
                return false; // Turn continues after quick action

            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }

    /**
     * Gets cards that can be played from hand
     * Rule 5.1.1, 5.2 - Card playing requirements
     */
    private getPlayableCardsFromHand(playerId: string): ICardInstance[] {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return [];

        const playableCards: ICardInstance[] = [];
        
        for (const card of player.zones.hand.getAll()) {
            if (this.canPlayCardFromHand(playerId, card as ICardInstance)) {
                playableCards.push(card as ICardInstance);
            }
        }

        return playableCards;
    }

    /**
     * Gets cards that can be played from reserve
     * Rule 2.4.5.c-d - Playing from Reserve
     */
    private getPlayableCardsFromReserve(playerId: string): IGameObject[] {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return [];

        const playableCards: IGameObject[] = [];
        
        for (const entity of player.zones.reserveZone.getAll()) {
            if (isGameObject(entity) && this.canPlayCardFromReserve(playerId, entity)) {
                playableCards.push(entity);
            }
        }

        return playableCards;
    }

    /**
     * Checks if a card can be played from hand
     */
    private canPlayCardFromHand(playerId: string, card: ICardInstance): boolean {
        const definition = this.gsm.getCardDefinition(card.definitionId);
        if (!definition) return false;

        // Check if player can pay hand cost
        return this.canPayManaCost(playerId, definition.handCost);
    }

    /**
     * Checks if a card can be played from reserve
     * Rule 2.4.5.c-d
     */
    private canPlayCardFromReserve(playerId: string, object: IGameObject): boolean {
        // Can't play exhausted cards from reserve
        if (object.statuses.has(StatusType.Exhausted)) {
            return false;
        }

        const definition = this.gsm.getCardDefinition(object.definitionId);
        if (!definition) return false;

        // Check if player can pay reserve cost
        return this.canPayManaCost(playerId, definition.reserveCost);
    }

    /**
     * Checks if player can pay mana cost
     * Rule 1.2.5.e - Mana cost paid by exhausting Mana Orbs
     */
    private canPayManaCost(playerId: string, cost: number): boolean {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return false;

        // Count ready mana orbs
        let readyManaOrbs = 0;
        for (const entity of player.zones.manaZone.getAll()) {
            if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
                readyManaOrbs++;
            }
        }

        return readyManaOrbs >= cost;
    }

    /**
     * Plays a card from specified zone
     */
    private async playCard(playerId: string, cardId: string, fromZone: string): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        let sourceZone;
        let isFromReserve = false;

        switch (fromZone) {
            case 'hand':
                sourceZone = player.zones.hand;
                break;
            case 'reserve':
                sourceZone = player.zones.reserve;
                isFromReserve = true;
                break;
            default:
                throw new Error(`Cannot play card from zone: ${fromZone}`);
        }

        const card = sourceZone.findById(cardId);
        if (!card) throw new Error(`Card ${cardId} not found in ${fromZone}`);

        const definition = this.gsm.getCardDefinition(card.definitionId);
        if (!definition) throw new Error(`Definition not found for ${card.definitionId}`);

        // Pay cost
        const cost = isFromReserve ? definition.reserveCost : definition.handCost;
        await this.payManaCost(playerId, cost);

        // Determine destination zone based on card type
        let destinationZone;
        switch (definition.type) {
            case CardType.Character:
                destinationZone = player.zones.expedition;
                break;
            case CardType.Permanent:
                destinationZone = definition.permanentZoneType === 'Landmark' 
                    ? player.zones.landmarkZone 
                    : player.zones.expedition;
                break;
            case CardType.Spell:
                // Spells resolve and may go to Reserve or discard
                destinationZone = player.zones.reserve; // Simplified
                break;
            default:
                throw new Error(`Cannot play card type: ${definition.type}`);
        }

        // Move card
        this.gsm.moveEntity(cardId, sourceZone, destinationZone, playerId);

        // Handle Fleeting status for cards played from Reserve
        if (isFromReserve && isGameObject(card)) {
            card.statuses.add(StatusType.Fleeting);
        }
    }

    /**
     * Pays mana cost by exhausting mana orbs
     */
    private async payManaCost(playerId: string, cost: number): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        let remainingCost = cost;
        
        for (const entity of player.zones.manaZone.getAll()) {
            if (remainingCost <= 0) break;
            
            if (isGameObject(entity) && !entity.statuses.has(StatusType.Exhausted)) {
                entity.statuses.add(StatusType.Exhausted);
                remainingCost--;
                console.log(`[PlayerAction] Exhausted mana orb for ${playerId}`);
            }
        }

        if (remainingCost > 0) {
            throw new Error(`Insufficient mana: needed ${cost}, could only pay ${cost - remainingCost}`);
        }
    }

    /**
     * Gets available quick actions
     */
    private getAvailableQuickActions(playerId: string): PlayerAction[] {
        // TODO: Implement quick action detection
        // Check support abilities, object abilities, etc.
        return [];
    }

    /**
     * Executes a quick action
     */
    private async executeQuickAction(playerId: string, abilityId: string, sourceObjectId: string): Promise<void> {
        // TODO: Implement quick action execution
        console.log(`[PlayerAction] Executing quick action ${abilityId} from ${sourceObjectId}`);
    }
}

export interface PlayerAction {
    type: 'playCard' | 'quickAction' | 'pass';
    cardId?: string;
    zone?: string;
    abilityId?: string;
    sourceObjectId?: string;
    description: string;
}