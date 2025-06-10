import type { GameStateManager } from './GameStateManager';
import type { IGameObject, ICardInstance } from './types/objects';
import type { ICardDefinition } from './types/cards';
import type { TerrainCost } from './ManaSystem';
import { CardType, StatusType, PermanentZoneType, ZoneIdentifier } from './types/enums';
import { isGameObject } from './types/objects';

/**
 * Handles complete card playing mechanics with costs and target selection
 * Rules 5.1.2, 5.2.1-5.2.4
 */
export class CardPlaySystem {
    constructor(private gsm: GameStateManager) {}

    /**
     * Plays a card with complete cost handling and effect resolution
     * Rule 5.1.2 - Playing process includes cost payment and effect resolution
     */
    public async playCard(
        playerId: string, 
        cardId: string, 
        fromZone: 'hand' | 'reserve',
        options?: CardPlayOptions
    ): Promise<void> {
        console.log(`[CardPlay] Player ${playerId} playing card ${cardId} from ${fromZone}`);

        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        // Get source zone and card
        const sourceZone = fromZone === 'hand' ? player.zones.hand : player.zones.reserve;
        const card = sourceZone.findById(cardId);
        if (!card) throw new Error(`Card ${cardId} not found in ${fromZone}`);

        const definition = this.gsm.getCardDefinition(card.definitionId);
        if (!definition) throw new Error(`Definition not found for ${card.definitionId}`);

        // Validate can play
        this.validateCanPlay(playerId, card, fromZone, definition);

        // Determine and pay cost
        const cost = this.calculateCost(definition, fromZone, options);
        await this.payCost(playerId, cost, options);

        // Determine destination and play effects
        await this.executeCardPlay(playerId, card, definition, fromZone, options);

        console.log(`[CardPlay] Successfully played ${definition.name}`);
    }

    /**
     * Validates that a card can be played
     */
    private validateCanPlay(
        playerId: string,
        card: ICardInstance | IGameObject,
        fromZone: 'hand' | 'reserve',
        definition: ICardDefinition
    ): void {
        // Check if playing from Reserve
        if (fromZone === 'reserve' && isGameObject(card)) {
            const statusResult = this.gsm.statusHandler.checkStatusInteraction(card, 'playFromReserve');
            if (!statusResult.canPlay) {
                throw new Error(`Cannot play ${definition.name} from Reserve - exhausted`);
            }
        }

        // Check timing restrictions
        if (this.gsm.state.currentPhase !== 'Afternoon') {
            throw new Error(`Can only play cards during Afternoon phase`);
        }

        // Check if it's player's turn
        if (this.gsm.state.currentPlayerId !== playerId) {
            throw new Error(`Not ${playerId}'s turn`);
        }

        // TODO: Add more validation (zone restrictions, abilities that prevent playing, etc.)
    }

    /**
     * Calculates the cost to play a card including modifiers
     * Rule 5.1.2.d-e - Cost alterations and modifications
     */
    private calculateCost(
        definition: ICardDefinition,
        fromZone: 'hand' | 'reserve',
        options?: CardPlayOptions
    ): TerrainCost {
        const baseCost = fromZone === 'hand' ? definition.handCost : definition.reserveCost;
        
        // For now, treat all costs as generic mana
        // TODO: Add terrain-specific cost support
        let finalCost = this.gsm.manaSystem.createGenericTerrainCost(baseCost);

        // Apply Scout keyword cost modification
        if (options?.useScoutCost && options.scoutValue !== undefined) {
            finalCost = this.gsm.manaSystem.createGenericTerrainCost(options.scoutValue);
        }

        // TODO: Apply other cost modifications (support abilities, passive effects, etc.)

        return finalCost;
    }

    /**
     * Pays the cost for playing a card
     */
    private async payCost(playerId: string, cost: TerrainCost, options?: CardPlayOptions): Promise<void> {
        // Use the enhanced mana system for terrain-aware cost payment
        await this.gsm.manaSystem.payTerrainCost(playerId, cost);
    }

    /**
     * Executes the actual card play with all effects
     */
    private async executeCardPlay(
        playerId: string,
        card: ICardInstance | IGameObject,
        definition: ICardDefinition,
        fromZone: 'hand' | 'reserve',
        options?: CardPlayOptions
    ): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        switch (definition.type) {
            case CardType.Character:
                await this.playCharacter(playerId, card, definition, fromZone, options);
                break;
            case CardType.Permanent:
                await this.playPermanent(playerId, card, definition, fromZone, options);
                break;
            case CardType.Spell:
                await this.playSpell(playerId, card, definition, fromZone, options);
                break;
            default:
                throw new Error(`Cannot play card type: ${definition.type}`);
        }
    }

    /**
     * Rule 5.2.1 - Playing a Character
     */
    private async playCharacter(
        playerId: string,
        card: ICardInstance | IGameObject,
        definition: ICardDefinition,
        fromZone: 'hand' | 'reserve',
        options?: CardPlayOptions
    ): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        const sourceZone = fromZone === 'hand' ? player.zones.hand : player.zones.reserve;
        const destinationZone = player.zones.expedition;

        // Move character to expedition
        const playedCharacter = this.gsm.moveEntity(
            isGameObject(card) ? card.objectId : card.instanceId,
            sourceZone,
            destinationZone,
            playerId
        ) as IGameObject;

        // Apply Fleeting if played from Reserve
        if (fromZone === 'reserve') {
            this.gsm.statusHandler.applyFleetingOnPlayFromReserve(playedCharacter);
        }

        // TODO: Handle expedition selection for characters
        // TODO: Trigger "when entering play" abilities
        
        console.log(`[CardPlay] Character ${definition.name} entered expedition`);
    }

    /**
     * Rule 5.2.2 and 5.2.3 - Playing Expedition/Landmark Permanents
     */
    private async playPermanent(
        playerId: string,
        card: ICardInstance | IGameObject,
        definition: ICardDefinition,
        fromZone: 'hand' | 'reserve',
        options?: CardPlayOptions
    ): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        const sourceZone = fromZone === 'hand' ? player.zones.hand : player.zones.reserve;
        
        // Determine destination based on permanent type
        let destinationZone;
        if (definition.permanentZoneType === PermanentZoneType.Landmark) {
            destinationZone = player.zones.landmarkZone;
        } else {
            destinationZone = player.zones.expedition;
        }

        // Move permanent to appropriate zone
        const playedPermanent = this.gsm.moveEntity(
            isGameObject(card) ? card.objectId : card.instanceId,
            sourceZone,
            destinationZone,
            playerId
        ) as IGameObject;

        // Apply Fleeting if played from Reserve
        if (fromZone === 'reserve') {
            this.gsm.statusHandler.applyFleetingOnPlayFromReserve(playedPermanent);
        }

        // TODO: Trigger "when entering play" abilities
        
        console.log(`[CardPlay] Permanent ${definition.name} entered ${destinationZone.zoneType}`);
    }

    /**
     * Rule 5.2.4 - Playing a Spell Card
     */
    private async playSpell(
        playerId: string,
        card: ICardInstance | IGameObject,
        definition: ICardDefinition,
        fromZone: 'hand' | 'reserve',
        options?: CardPlayOptions
    ): Promise<void> {
        const player = this.gsm.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found`);

        // Spells resolve immediately then go to appropriate zone
        console.log(`[CardPlay] Resolving spell ${definition.name}`);

        // Resolve spell effects
        for (const ability of definition.abilities) {
            if (ability.effect) {
                await this.gsm.effectProcessor.resolveEffect(ability.effect);
            }
        }

        // Determine where spell goes after resolution
        const sourceZone = fromZone === 'hand' ? player.zones.hand : player.zones.reserve;
        let destinationZone;

        // Check for Cooldown keyword
        const hasCooldown = definition.abilities.some(
            ability => ability.isKeyword && ability.keyword === 'Cooldown'
        );

        if (hasCooldown) {
            // Cooldown spells go to Reserve and become exhausted
            destinationZone = player.zones.reserve;
        } else {
            // Normal spells go to discard
            destinationZone = player.zones.discardPile;
        }

        const resolvedSpell = this.gsm.moveEntity(
            isGameObject(card) ? card.objectId : card.instanceId,
            sourceZone,
            destinationZone,
            playerId
        ) as IGameObject;

        // Apply Cooldown exhaustion if needed
        if (hasCooldown && destinationZone === player.zones.reserve) {
            this.gsm.statusHandler.applyStatusEffect(resolvedSpell, StatusType.Exhausted);
        }

        console.log(`[CardPlay] Spell ${definition.name} resolved and went to ${destinationZone.zoneType}`);
    }

    /**
     * Gets all cards that can be played by a player
     */
    public getPlayableCards(playerId: string): PlayableCard[] {
        const player = this.gsm.getPlayer(playerId);
        if (!player) return [];

        const playableCards: PlayableCard[] = [];

        // Check hand cards
        for (const card of player.zones.hand.getAll()) {
            const definition = this.gsm.getCardDefinition(card.definitionId);
            if (definition && this.canPlayCard(playerId, card, 'hand', definition)) {
                playableCards.push({
                    card: card as ICardInstance,
                    definition,
                    fromZone: 'hand',
                    cost: this.calculateCost(definition, 'hand')
                });
            }
        }

        // Check reserve cards
        for (const entity of player.zones.reserve.getAll()) {
            if (isGameObject(entity)) {
                const definition = this.gsm.getCardDefinition(entity.definitionId);
                if (definition && this.canPlayCard(playerId, entity, 'reserve', definition)) {
                    playableCards.push({
                        card: entity,
                        definition,
                        fromZone: 'reserve',
                        cost: this.calculateCost(definition, 'reserve')
                    });
                }
            }
        }

        return playableCards;
    }

    /**
     * Checks if a specific card can be played
     */
    private canPlayCard(
        playerId: string,
        card: ICardInstance | IGameObject,
        fromZone: 'hand' | 'reserve',
        definition: ICardDefinition
    ): boolean {
        try {
            this.validateCanPlay(playerId, card, fromZone, definition);
            const cost = this.calculateCost(definition, fromZone);
            return this.gsm.manaSystem.canPayTerrainCost(playerId, cost);
        } catch {
            return false;
        }
    }

    /**
     * Handles target selection for cards/abilities
     * TODO: Implement comprehensive target selection system
     */
    public selectTargets(
        playerId: string,
        targetCriteria: any,
        maxTargets: number = 1
    ): (IGameObject | string)[] {
        // Placeholder for target selection
        // This would integrate with a UI system for player choices
        return [];
    }
}

export interface CardPlayOptions {
    targets?: (IGameObject | string)[];
    expeditionChoice?: 'hero' | 'companion';
    useScoutCost?: boolean;
    scoutValue?: number;
    additionalCosts?: any[];
}

export interface PlayableCard {
    card: ICardInstance | IGameObject;
    definition: ICardDefinition;
    fromZone: 'hand' | 'reserve';
    cost: TerrainCost;
}