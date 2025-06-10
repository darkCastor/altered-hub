import type { IZone} from './types/zones';
import { ObjectFactory } from './ObjectFactory'; // Assuming ObjectFactory is in its own file
import { GamePhase, ZoneIdentifier, StatusType, CardType } from './types/enums';
import type { EventBus } from './EventBus';
import { BaseZone, HandZone, DiscardPileZone, LimboZone, DeckZone } from './Zone';
import type { ICardInstance, IGameObject, ZoneEntity } from './types/objects';
import { isGameObject } from './types/objects';
import type { IPlayer, IGameState } from './types/game'; // Assuming these are in game.ts
import type { ICardDefinition } from './types/cards';

export class GameStateManager {
    public state: IGameState;
    private objectFactory: ObjectFactory;
    public eventBus: EventBus;
    private cardDefinitions: Map<string, ICardDefinition>;

    constructor(playerIds: string[], cardDefinitions: ICardDefinition[], eventBus: EventBus) {
        this.cardDefinitions = new Map(cardDefinitions.map(def => [def.id, def]));
        this.objectFactory = new ObjectFactory(this.cardDefinitions);
        this.eventBus = eventBus;
        this.state = this.initializeGameState(playerIds);
    }

private initializeGameState(playerIds: string[]): IGameState {
    const players = new Map<string, IPlayer>();
    playerIds.forEach(pid => {
        players.set(pid, {
            id: pid,
            zones: {
                deck: new DeckZone(`${pid}-deck`, pid),
                hand: new HandZone(`${pid}-hand`, pid),
                discardPile: new DiscardPileZone(`${pid}-discard`, pid),
                manaZone: new BaseZone(`${pid}-mana`, ZoneIdentifier.Mana, 'visible', pid),
                reserve: new BaseZone(`${pid}-reserve`, ZoneIdentifier.Reserve, 'visible', pid),
                landmarkZone: new BaseZone(`${pid}-landmark`, ZoneIdentifier.Landmark, 'visible', pid),
                heroZone: new BaseZone(`${pid}-hero`, ZoneIdentifier.Hero, 'visible', pid),
                // Rule 1.2.3.c defines player-specific Hero and Companion Expeditions.
                // This model uses a single expedition zone per player for simplicity.
                expedition: new BaseZone(`${pid}-expedition`, ZoneIdentifier.Expedition, 'visible', pid), 
            },
            heroExpeditionPosition: 0,
            companionExpeditionPosition: 0,
            hasPassedTurn: false,
        });
    });

    return {
        players,
        sharedZones: {
            adventure: new BaseZone("shared-adventure", ZoneIdentifier.Adventure, 'visible'),
            // The main expedition zone is now player-specific. This could be a staging area or deprecated.
            expedition: new BaseZone("shared-expedition-deprecated", ZoneIdentifier.Expedition, 'visible'), 
            limbo: new LimboZone(),
        },
        currentPhase: GamePhase.Setup,
        currentPlayerId: playerIds[0],
        firstPlayerId: playerIds[0],
        dayNumber: 1,
        actionHistory: [],
    };
}

    public initializeBoard(
        playerDeckDefinitionsMap: Map<string, ICardDefinition[]>,
        startingHandSize: number,
        initialManaOrbs: number
    ) {
        this.state.players.forEach((player, playerId) => {
            const deckDefinitions = playerDeckDefinitionsMap.get(playerId);
            if (!deckDefinitions) {
                console.warn(`No deck definitions found for player ${playerId}. Skipping deck initialization.`);
                return;
            }
            const heroDefinition = deckDefinitions.find(def => def.type === CardType.Hero);
            if (!heroDefinition) {
                console.error(`Player ${playerId}'s deck must contain exactly one Hero. Hero not found.`);
                return;
            }
            if (!this.cardDefinitions.has(heroDefinition.id)) this.cardDefinitions.set(heroDefinition.id, heroDefinition);
            const heroTempInstance = this.objectFactory.createCardInstance(heroDefinition.id, playerId);
            const heroGameObject = this.objectFactory.createGameObject(heroTempInstance, playerId) as IGameObject;
            player.zones.heroZone.add(heroGameObject);
            console.log(`[GSM] Placed Hero ${heroGameObject.name} in ${player.zones.heroZone.id}`);
            
            const nonHeroDeckDefinitions = deckDefinitions.filter(def => def.type !== CardType.Hero);
            const deckCardInstances: ICardInstance[] = nonHeroDeckDefinitions.map(def => {
                if (!this.cardDefinitions.has(def.id)) this.cardDefinitions.set(def.id, def);
                return this.objectFactory.createCardInstance(def.id, playerId);
            });
            
            const deckZone = player.zones.deck as DeckZone;
            deckCardInstances.forEach(cardInstance => deckZone.add(cardInstance));
            deckZone.shuffle();
            console.log(`[GSM] Player ${playerId} deck initialized with ${deckZone.getCount()} cards.`);
                
      console.log(`[GSM] Player ${playerId} is placing ${initialManaOrbs} mana orbs from their deck.`);
            
            // We need to get the instance IDs of the top cards without removing them yet.
            const topCardInstances = deckZone.entities.slice(0, initialManaOrbs);

            for (const cardInstance of topCardInstances) {
                // Now, we call moveEntity. It will handle removing the card from the deck
                // and creating the new Mana Orb object in the mana zone.
                const manaObject = this.moveEntity(
                    cardInstance.instanceId,
                    deckZone,
                    player.zones.manaZone,
                    playerId
                ) as IGameObject;
                
                // Rule 4.1.k specifies they are READY. Rule 3.2.9.b implies they might enter exhausted.
                // We must ensure they are ready, overriding any default.
                if (manaObject) { // Check if the move was successful
                    if (manaObject.statuses.has(StatusType.Exhausted)) {
                        manaObject.statuses.delete(StatusType.Exhausted);
                    }
                    console.log(`[GSM] Mana orb ${manaObject.objectId} is ready.`);
                }
            }
            
            // Rule 4.1.j: Each player draws six cards.
            this.drawCards(playerId, startingHandSize);

    });
}


public moveEntity(entityId: string, fromZone: IZone, toZone: IZone, controllerId: string): IGameObject | ICardInstance | null {
    const sourceEntity = fromZone.remove(entityId);
    if (!sourceEntity) {
        throw new Error(`Entity ${entityId} not found in zone ${fromZone.id}.`);
    }

    const definition = this.getCardDefinition(sourceEntity.definitionId);
    if (!definition) throw new Error(`Definition not found for ${sourceEntity.definitionId}`);
    
    // Rule 2.1.e: Tokens leaving the Expedition zone cease to exist.
    if (definition.type === CardType.Token && fromZone.zoneType === ZoneIdentifier.Expedition) {
        console.log(`[GSM] Token ${entityId} (${definition.name}) is leaving the Expedition zone and ceases to exist.`);
        this.eventBus.publish('entityCeasedToExist', { entity: sourceEntity, from: fromZone });
        this.state.actionHistory.push({ action: 'entityCeasesToExist', entityId, from: fromZone.zoneType });
        return null;
    }

    let finalDestinationZone = toZone;
    // Rule 1.4.3 / 3.1.2.c: If a card would move to a personal zone of another player, it moves to its owner's corresponding zone instead.
    if (toZone.ownerId && toZone.ownerId !== sourceEntity.ownerId) {
        const owner = this.getPlayer(sourceEntity.ownerId);
        if (!owner) throw new Error(`Owner ${sourceEntity.ownerId} of entity ${entityId} not found.`);
        
        const correctZone = Object.values(owner.zones).find(z => z.zoneType === toZone.zoneType);
        if (!correctZone) throw new Error(`Cannot find zone of type ${toZone.zoneType} for owner ${sourceEntity.ownerId}`);
        
        console.log(`[GSM] Redirecting entity ${entityId} to owner's (${sourceEntity.ownerId}) zone ${correctZone.id} instead of ${toZone.id}`);
        finalDestinationZone = correctZone;
    }

    let newEntity: ZoneEntity;
    if (finalDestinationZone.visibility === 'visible') {
        newEntity = this.objectFactory.createGameObject(sourceEntity, controllerId);
    } else {
         newEntity = isGameObject(sourceEntity) ? this.objectFactory.createCardInstance(sourceEntity.definitionId, sourceEntity.ownerId) : sourceEntity;
    }

    finalDestinationZone.add(newEntity);
    this.state.actionHistory.push({ action: 'moveEntity', entityId, from: fromZone.zoneType, to: finalDestinationZone.zoneType, newId: isGameObject(newEntity) ? newEntity.objectId : newEntity.instanceId });
    this.eventBus.publish('entityMoved', { entity: newEntity, from: fromZone, to: finalDestinationZone });
    return newEntity;
}

public getCardDefinition(id: string): ICardDefinition | undefined {
    return this.cardDefinitions.get(id);
}

public getObject(id: string): IGameObject | undefined {
    for (const zone of this.getAllVisibleZones()) {
        const entity = zone.findById(id);
        if (entity && isGameObject(entity)) {
            return entity;
        }
    }
    return undefined;
}

private *getAllVisibleZones(): Generator<IZone> {
        for (const player of this.state.players.values()) {
            yield player.zones.discardPile;
            yield player.zones.manaZone;
            yield player.zones.reserve;
            yield player.zones.landmarkZone;
            yield player.zones.heroZone;
            yield player.zones.expedition;
        }
        yield this.state.sharedZones.adventure;
        yield this.state.sharedZones.limbo;
}

public getPlayer(id: string): IPlayer | undefined {
    return this.state.players.get(id);
}

public getPlayerIds(): string[] {
    return Array.from(this.state.players.keys());
}

public setCurrentPhase(phase: GamePhase) {
    this.state.currentPhase = phase;
    this.state.actionHistory.push({ action: 'phaseChange', phase });
    this.eventBus.publish('phaseChanged', { phase });
}

/**
 * Handles the Rest daily effect during the Night phase.
 * Rule 4.2.5.b
 */
public async restPhase() {
    console.log('[GSM] Beginning Rest phase.');
    // In a full implementation, we would need to know which expeditions moved forward.
    // For this implementation, we will apply the Rest effect to all characters in all player expeditions.
    
    for (const player of this.state.players.values()) {
        const expeditionZone = player.zones.expedition;
        // We must copy the array of characters to avoid issues with modifying the collection while iterating.
        const charactersToProcess = expeditionZone.getAll().filter(
            e => isGameObject(e) && e.type === CardType.Character
        ) as IGameObject[];

   for (const char of charactersToProcess) {
        // Check for the "Eternal" passive ability (Rule 7.4.3.b)
        const isEternal = char.abilities.some(ability => ability.text.includes('Eternal')); // Simple text check, a keyword property would be better
        
        // Rule 2.4.2 (Anchored), 2.4.3 (Asleep), 7.4.3.b (Eternal) prevent moving to Reserve.
        if (char.statuses.has(StatusType.Anchored) || char.statuses.has(StatusType.Asleep) || isEternal) {
            console.log(`[GSM] Character ${char.name} is not sent to Reserve due to a status/ability.`);
            // Rule 2.4.2, 2.4.3: During Rest, lose Anchored/Asleep status.
            if (char.statuses.has(StatusType.Anchored)) char.statuses.delete(StatusType.Anchored);
            if (char.statuses.has(StatusType.Asleep)) char.statuses.delete(StatusType.Asleep);
            continue;
        }

            // Rule 2.4.6.d: If a Fleeting character would go to Reserve, it is discarded instead.
            if (char.statuses.has(StatusType.Fleeting)) {
                console.log(`[GSM] Fleeting Character ${char.name} is discarded instead of sent to Reserve.`);
                this.moveEntity(char.objectId, expeditionZone, player.zones.discardPile, char.controllerId);
            } else {
                console.log(`[GSM] Character ${char.name} is sent to Reserve.`);
                this.moveEntity(char.objectId, expeditionZone, player.zones.reserve, char.controllerId);
            }
        }
    }
}
/**
 * Handles drawing cards for a player, including deck-out reshuffle.
 * Rules: 7.3.7 (Draw), 3.2.2.d (Reshuffle), 3.2.2.e (Empty Draw)
 * @param playerId The ID of the player drawing.
 * @param count The number of cards to draw.
 */
public async drawCards(playerId: string, count: number): Promise<void> {
    const player = this.getPlayer(playerId);
    if (!player) {
        console.error(`[GSM:draw] Player not found: ${playerId}`);
        return;
    }

    const deck = player.zones.deck as DeckZone;
    const hand = player.zones.hand;
    const discardPile = player.zones.discardPile as BaseZone;

    console.log(`[GSM:draw] Player ${playerId} attempts to draw ${count} card(s).`);

    for (let i = 0; i < count; i++) {
        // Rule 3.2.2.d: If deck is empty, reshuffle discard pile.
        if (deck.getCount() === 0) {
            console.log(`[GSM:draw] Deck is empty. Checking discard pile for reshuffle.`);
            if (discardPile.getCount() > 0) {
                const discardedEntities = Array.from(discardPile.entities.values());
                discardPile.entities.clear(); // Clear the discard pile

                // Convert GameObjects from discard back to CardInstances for the hidden deck zone
                const cardsToReshuffle: ICardInstance[] = discardedEntities.map(e => {
                    return isGameObject(e)
                        ? this.objectFactory.createCardInstance(e.definitionId, e.ownerId)
                        : (e as ICardInstance);
                });

                // Add to deck and shuffle
                deck.addBottom(cardsToReshuffle);
                deck.shuffle();

                console.log(`[GSM:draw] Reshuffled ${cardsToReshuffle.length} cards from discard pile into deck.`);
                this.state.actionHistory.push({ action: 'reshuffle', playerId, count: cardsToReshuffle.length });
            }
        }
        
        // Rule 3.2.2.e: If deck is still empty after reshuffle attempt, draw fails.
        if (deck.getCount() === 0) {
            console.log(`[GSM:draw] Deck and discard pile are empty. Player ${playerId} cannot draw a card.`);
            break; // Stop trying to draw
        }

        // Perform the draw by moving the top card of the deck to the hand.
        const cardToDraw = deck.removeTop();
        if (cardToDraw) {
            hand.add(cardToDraw);
            
            // Log action and publish event
            this.state.actionHistory.push({ action: 'drawCard', playerId, cardId: cardToDraw.instanceId });
            this.eventBus.publish('entityMoved', { entity: cardToDraw, from: deck, to: hand });

            const cardName = this.getCardDefinition(cardToDraw.definitionId)?.name || 'Unknown Card';
            console.log(`[GSM:draw] Player ${playerId} drew ${cardName}.`);
        }
    }
}

/**
 * Convenience method to draw a single card. Rule 7.3.7.b.
 * @param playerId The ID of the player drawing.
 */
public async drawCard(playerId: string): Promise<void> {
    await this.drawCards(playerId, 1);
}
}