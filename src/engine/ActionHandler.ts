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

        const objectInLimbo = this.gsm.moveEntity(cardInstance.instanceId, player.zones.hand, this.gsm.state.sharedZones.limbo, playerId) as IGameObject;
        this.costProcessor.pay(playerId, cost);
        const finalObject = this.gsm.moveEntity(objectInLimbo.objectId, this.gsm.state.sharedZones.limbo, destinationZone, playerId) as IGameObject;
        console.log(`[ActionHandler] ${definition.name} entered ${destinationZone.zoneType} as new object ${finalObject.objectId}.`);

        finalObject.abilities.forEach(ability => {
            // Simplified trigger check for demonstration purposes
            if (ability.trigger?.eventType === 'onPlayFromHand') { 
                this.effectResolver.resolve(ability.effect);
            }
        });

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
    }
}
