import type { IZone} from './types/zones';
import { ObjectFactory } from './ObjectFactory';
import { GamePhase, ZoneIdentifier, StatusType, CardType } from './types/enums';
import type { EventBus } from './EventBus';
import { BaseZone, HandZone, DiscardPileZone, LimboZone, DeckZone } from './Zone';
import type { IGameObject } from './types/objects';
import type { ICardInstance } from './types/cards';
import type { ZoneEntity } from './types/zones';
import { isGameObject } from './types/objects';
import type { IPlayer, IGameState } from './types/game';
import type { ICardDefinition } from './types/cards';
import { CounterType } from './types/enums';


export class GameStateManager {
    public state: IGameState;
    public objectFactory: ObjectFactory;
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
            
            const heroTempInstance = this.objectFactory.createCardInstance(heroDefinition.id, playerId);
            const heroGameObject = this.objectFactory.createGameObject(heroTempInstance, playerId) as IGameObject;
            
            if (heroDefinition.startingCounters) {
                heroGameObject.counters = new Map(heroDefinition.startingCounters);
                 console.log(`[GSM] Applied starting counters to Hero ${heroGameObject.name}.`);
            }

            player.zones.heroZone.add(heroGameObject);
            
            const nonHeroDeckDefinitions = deckDefinitions.filter(def => def.type !== CardType.Hero);
            const deckCardInstances: ICardInstance[] = nonHeroDeckDefinitions.map(def => {
                return this.objectFactory.createCardInstance(def.id, playerId);
            });
            
            const deckZone = player.zones.deck as DeckZone;
            deckCardInstances.forEach(cardInstance => deckZone.add(cardInstance));
            deckZone.shuffle();
            
            const topCardInstances = deckZone.entities.slice(0, initialManaOrbs);

            for (const cardInstance of topCardInstances) {
                const manaObject = this.moveEntity(
                    cardInstance.instanceId,
                    deckZone,
                    player.zones.manaZone,
                    playerId
                ) as IGameObject;
                
                if (manaObject) {
                    if (manaObject.statuses.has(StatusType.Exhausted)) {
                        manaObject.statuses.delete(StatusType.Exhausted);
                    }
                }
            }
            
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
    
    if (definition.type === CardType.Token && fromZone.zoneType === ZoneIdentifier.Expedition) {
        console.log(`[GSM] Token ${entityId} (${definition.name}) is leaving the Expedition zone and ceases to exist.`);
        this.eventBus.publish('entityCeasedToExist', { entity: sourceEntity, from: fromZone });
        this.state.actionHistory.push({ action: 'entityCeasesToExist', entityId, from: fromZone.zoneType });
        return null;
    }

    let finalDestinationZone = toZone;
    if (toZone.ownerId && toZone.ownerId !== sourceEntity.ownerId) {
        const owner = this.getPlayer(sourceEntity.ownerId);
        if (!owner) throw new Error(`Owner ${sourceEntity.ownerId} of entity ${entityId} not found.`);
        
        const correctZone = Object.values(owner.zones).find(z => z.zoneType === toZone.zoneType);
        if (!correctZone) throw new Error(`Cannot find zone of type ${toZone.zoneType} for owner ${sourceEntity.ownerId}`);
        
        console.log(`[GSM] Redirecting entity ${entityId} to owner's (${sourceEntity.ownerId}) zone ${correctZone.id} instead of ${toZone.id}`);
        finalDestinationZone = correctZone;
    }

    const countersToKeep = new Map<CounterType, number>();
    const sourceGameObject = isGameObject(sourceEntity) ? sourceEntity : undefined;
    
    const isMovingToLosingZone = finalDestinationZone.zoneType === ZoneIdentifier.DiscardPile || finalDestinationZone.visibility === 'hidden';

    if (sourceGameObject && !isMovingToLosingZone) {
        const fromZoneIsExpeditionOrLandmark = [ZoneIdentifier.Expedition, ZoneIdentifier.Landmark].includes(fromZone.zoneType);
        const fromZoneIsReserveOrLimbo = [ZoneIdentifier.Reserve, ZoneIdentifier.Limbo].includes(fromZone.zoneType);

        if (fromZoneIsReserveOrLimbo) {
            for(const [type, amount] of sourceGameObject.counters.entries()) {
                countersToKeep.set(type, amount);
            }
        } else if (fromZoneIsExpeditionOrLandmark) {
            const isMovingToReserve = finalDestinationZone.zoneType === ZoneIdentifier.Reserve;
            const isSeasoned = sourceGameObject.abilities.some(a => a.keyword === 'Seasoned');

            if (isSeasoned && isMovingToReserve) {
                const boostCount = sourceGameObject.counters.get(CounterType.Boost);
                if (boostCount && boostCount > 0) {
                    countersToKeep.set(CounterType.Boost, boostCount);
                }
            }
        }
    }

    let newEntity: ZoneEntity;
    if (finalDestinationZone.visibility === 'visible') {
        newEntity = this.objectFactory.createGameObject(sourceEntity, controllerId, countersToKeep);
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

public findZoneOfObject(objectId: string): IZone | undefined {
    for (const zone of this.getAllVisibleZones()) {
        if (zone.findById(objectId)) {
            return zone;
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

public async restPhase() {
    console.log('[GSM] Beginning Rest phase.');
    
    for (const player of this.state.players.values()) {
        const expeditionZone = player.zones.expedition;
        const charactersToProcess = expeditionZone.getAll().filter(
            e => isGameObject(e) && e.type === CardType.Character
        ) as IGameObject[];

        for (const char of charactersToProcess) {
            const isEternal = char.abilities.some(ability => ability.keyword === 'Eternal'); 
            
            if (char.statuses.has(StatusType.Anchored) || char.statuses.has(StatusType.Asleep) || isEternal) {
                if (char.statuses.has(StatusType.Anchored)) char.statuses.delete(StatusType.Anchored);
                if (char.statuses.has(StatusType.Asleep)) char.statuses.delete(StatusType.Asleep);
                continue;
            }

            if (char.statuses.has(StatusType.Fleeting)) {
                this.moveEntity(char.objectId, expeditionZone, player.zones.discardPile, char.controllerId);
            } else {
                this.moveEntity(char.objectId, expeditionZone, player.zones.reserve, char.controllerId);
            }
        }
    }
}
public async drawCards(playerId: string, count: number): Promise<void> {
    const player = this.getPlayer(playerId);
    if (!player) {
        console.error(`[GSM:draw] Player not found: ${playerId}`);
        return;
    }

    const deck = player.zones.deck as DeckZone;
    const hand = player.zones.hand;
    const discardPile = player.zones.discardPile as BaseZone;

    for (let i = 0; i < count; i++) {
        if (deck.getCount() === 0) {
            if (discardPile.getCount() > 0) {
                const discardedEntities = Array.from(discardPile.entities.values());
                discardPile.entities.clear(); 

                const cardsToReshuffle: ICardInstance[] = discardedEntities.map(e => {
                    return isGameObject(e)
                        ? this.objectFactory.createCardInstance(e.definitionId, e.ownerId)
                        : (e as ICardInstance);
                });

                deck.addBottom(cardsToReshuffle);
                deck.shuffle();
                this.state.actionHistory.push({ action: 'reshuffle', playerId, count: cardsToReshuffle.length });
            }
        }
        
        if (deck.getCount() === 0) {
            console.log(`[GSM:draw] Deck and discard pile are empty. Player ${playerId} cannot draw a card.`);
            break; 
        }

        const cardToDraw = deck.removeTop();
        if (cardToDraw) {
            hand.add(cardToDraw);
            this.state.actionHistory.push({ action: 'drawCard', playerId, cardId: cardToDraw.instanceId });
            this.eventBus.publish('entityMoved', { entity: cardToDraw, from: deck, to: hand });
        }
    }
}

public async drawCard(playerId: string): Promise<void> {
    await this.drawCards(playerId, 1);
}
}