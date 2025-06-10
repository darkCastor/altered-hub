import type { IZone} from './types/zones';
import { ObjectFactory } from './ObjectFactory';
import { GamePhase, ZoneIdentifier, StatusType, CardType } from './types/enums';
import type { EventBus } from './EventBus';
import { BaseZone, HandZone, DiscardPileZone, LimboZone, DeckZone } from './Zone';
import type { IGameObject } from './types/objects';
import type { ICardInstance } from './types/cards';
import type { ZoneEntity } from './types/zones';
import { isGameObject } from './types/objects';
import type { IPlayer, IGameState, IExpeditionState, ITerrainStats } from './types/game';
import type { ICardDefinition } from './types/cards';
import { CounterType, KeywordAbility } from './types/enums';
import { KeywordAbilityHandler } from './KeywordAbilityHandler';
import { SupportAbilityHandler } from './SupportAbilityHandler';
import { AdvancedTriggerHandler } from './AdvancedTriggerHandler';


export class GameStateManager {
    public state: IGameState;
    public objectFactory: ObjectFactory;
    public eventBus: EventBus;
    public keywordHandler: KeywordAbilityHandler;
    public supportHandler: SupportAbilityHandler;
    public triggerHandler: AdvancedTriggerHandler;
    private cardDefinitions: Map<string, ICardDefinition>;

    constructor(playerIds: string[], cardDefinitions: ICardDefinition[], eventBus: EventBus) {
        this.cardDefinitions = new Map(cardDefinitions.map(def => [def.id, def]));
        this.objectFactory = new ObjectFactory(this.cardDefinitions);
        this.eventBus = eventBus;
        this.keywordHandler = new KeywordAbilityHandler(this);
        this.supportHandler = new SupportAbilityHandler(this);
        this.triggerHandler = new AdvancedTriggerHandler(this);
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
            heroExpedition: { position: 0, canMove: true, hasMoved: false },
            companionExpedition: { position: 0, canMove: true, hasMoved: false },
            hasPassedTurn: false,
            hasExpandedThisTurn: false,
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

public resetExpandFlags(): void {
    for (const player of this.state.players.values()) {
        player.hasExpandedThisTurn = false;
    }
    console.log('[GSM] Reset expand flags for all players.');
}

    public initializeBoard(
        playerDeckDefinitionsMap: Map<string, ICardDefinition[]>,
        startingHandSize: number,
        initialManaOrbs: number
    ) {
        this.state.players.forEach((player, playerId) => {
            const deckDefinitions = playerDeckDefinitionsMap.get(playerId);
            if (!deckDefinitions) {
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
                
                if (manaObject && manaObject.statuses.has(StatusType.Exhausted)) {
                    manaObject.statuses.delete(StatusType.Exhausted);
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
        this.eventBus.publish('entityCeasedToExist', { entity: sourceEntity, from: fromZone });
        return null;
    }

    let finalDestinationZone = toZone;
    if (toZone.ownerId && toZone.ownerId !== sourceEntity.ownerId) {
        const owner = this.getPlayer(sourceEntity.ownerId);
        if (!owner) throw new Error(`Owner ${sourceEntity.ownerId} of entity ${entityId} not found.`);
        const correctZone = Object.values(owner.zones).find(z => z.zoneType === toZone.zoneType);
        if (!correctZone) throw new Error(`Cannot find zone of type ${toZone.zoneType} for owner ${sourceEntity.ownerId}`);
        finalDestinationZone = correctZone;
    }

// --- REPLACE THIS ENTIRE BLOCK ---
    const countersToKeep = new Map<CounterType, number>();
    const sourceGameObject = isGameObject(sourceEntity) ? sourceEntity : undefined;
    const isMovingToLosingZone = finalDestinationZone.zoneType === ZoneIdentifier.DiscardPile || finalDestinationZone.visibility === 'hidden';

    if (sourceGameObject && !isMovingToLosingZone) {
        const fromZoneIsExpeditionOrLandmark = [ZoneIdentifier.Expedition, ZoneIdentifier.Landmark].includes(fromZone.zoneType);
        const fromZoneIsReserveOrLimbo = [ZoneIdentifier.Reserve, ZoneIdentifier.Limbo].includes(fromZone.zoneType);

        if (fromZoneIsReserveOrLimbo) {
            // Rule 2.5.k: Objects from Reserve/Limbo keep counters (unless going to discard/hidden)
            for(const [type, amount] of sourceGameObject.counters.entries()) {
                countersToKeep.set(type, amount);
            }
        } else if (fromZoneIsExpeditionOrLandmark) {
            const isMovingToReserve = finalDestinationZone.zoneType === ZoneIdentifier.Reserve;
            // Rule 7.4.6.b: Check for Seasoned keyword when moving to Reserve
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
// --- END OF REPLACEMENT ---

    let newEntity: ZoneEntity;
    if (finalDestinationZone.visibility === 'visible') {
        newEntity = this.objectFactory.createGameObject(sourceEntity, controllerId, countersToKeep);
    } else {
         newEntity = isGameObject(sourceEntity) ? this.objectFactory.createCardInstance(sourceEntity.definitionId, sourceEntity.ownerId) : sourceEntity;
    }

    finalDestinationZone.add(newEntity);
    
    // Process keyword abilities and triggers for the move
    if (isGameObject(newEntity)) {
        this.keywordHandler.processKeywordOnLeavePlay(newEntity, fromZone, finalDestinationZone);
        this.triggerHandler.processMovementTriggers(newEntity, fromZone, finalDestinationZone);
    }
    
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
    this.eventBus.publish('phaseChanged', { phase });
    
    // Process "At [Phase]" triggers
    this.triggerHandler.processPhaseTriggersForPhase(phase);
}

/**
 * Handles the Prepare daily effect during the Morning phase.
 * Rule 4.2.1.c: Readies all exhausted cards and objects.
 */
public async preparePhase(): Promise<void> {
    console.log('[GSM] Beginning Prepare phase.');
    for (const player of this.state.players.values()) {
        const zonesToReady = [
            player.zones.heroZone,
            player.zones.expedition,
            player.zones.landmarkZone,
            player.zones.manaZone,
            player.zones.reserve,
        ];

        for (const zone of zonesToReady) {
            for (const entity of zone.getAll()) {
                if (isGameObject(entity) && entity.statuses.has(StatusType.Exhausted)) {
                    entity.statuses.delete(StatusType.Exhausted);
                    console.log(`[GSM] Readied ${entity.name} in ${zone.zoneType} for player ${player.id}.`);
                }
            }
        }
    }
}

/**
 * Handles the Rest daily effect during the Night phase.
 * Rule 4.2.5.b
 */
public async restPhase() {
    console.log('[GSM] Beginning Rest phase.');
    
    for (const player of this.state.players.values()) {
        const expeditionZone = player.zones.expedition;
        const charactersToProcess = expeditionZone.getAll().filter(
            e => isGameObject(e) && e.type === CardType.Character
        ) as IGameObject[];

        // Check if any expedition moved forward this turn
        const anyExpeditionMoved = player.heroExpedition.hasMoved || player.companionExpedition.hasMoved;

        for (const char of charactersToProcess) {
            // Handle status removal first (Rule 2.4.2, 2.4.3)
            if (char.statuses.has(StatusType.Anchored)) {
                char.statuses.delete(StatusType.Anchored);
                continue; // Anchored characters don't go to Reserve
            }
            
            if (char.statuses.has(StatusType.Asleep)) {
                char.statuses.delete(StatusType.Asleep);
                continue; // Asleep characters don't go to Reserve
            }

            // Check for Eternal keyword (Rule 7.4.3)
            if (this.keywordHandler.isEternal(char)) {
                continue; // Eternal characters don't go to Reserve
            }

            // Only characters in expeditions that moved go to Reserve
            if (anyExpeditionMoved) {
                if (char.statuses.has(StatusType.Fleeting)) {
                    this.moveEntity(char.objectId, expeditionZone, player.zones.discardPile, char.controllerId);
                } else {
                    this.moveEntity(char.objectId, expeditionZone, player.zones.reserve, char.controllerId);
                }
            }
        }
    }
}

/**
 * Handles the Clean-up daily effect during the Night phase.
 * Rule 4.2.5.c: Players discard/sacrifice down to their limits.
 */
public async cleanupPhase(): Promise<void> {
    console.log('[GSM] Beginning Clean-up phase.');
    for (const player of this.state.players.values()) {
        const hero = player.zones.heroZone.getAll()[0] as IGameObject | undefined;
        const reserveLimit = hero?.baseCharacteristics.reserveLimit ?? 2;
        const landmarkLimit = hero?.baseCharacteristics.landmarkLimit ?? 2;

        // Clean-up Reserve
        const reserveZone = player.zones.reserve;
        while(reserveZone.getCount() > reserveLimit) {
            // TODO: Add player choice. For now, discard the last card.
            const cardToDiscard = reserveZone.getAll().pop() as IGameObject;
            if(cardToDiscard) {
                console.log(`[GSM] ${player.id} is over reserve limit, discarding ${cardToDiscard.name}.`);
                this.moveEntity(cardToDiscard.objectId, reserveZone, player.zones.discardPile, player.id);
            }
        }

        // Clean-up Landmarks (Sacrifice)
        const landmarkZone = player.zones.landmarkZone;
        while(landmarkZone.getCount() > landmarkLimit) {
            // TODO: Add player choice. For now, sacrifice the last card.
            const cardToSacrifice = landmarkZone.getAll().pop() as IGameObject;
            if(cardToSacrifice) {
                console.log(`[GSM] ${player.id} is over landmark limit, sacrificing ${cardToSacrifice.name}.`);
                this.moveEntity(cardToSacrifice.objectId, landmarkZone, player.zones.discardPile, player.id);
            }
        }
    }
}


/**
 * Calculates the terrain statistics for an expedition
 * Rule 4.2.4, 7.1.2
 */
public calculateExpeditionStats(playerId: string, expeditionType: 'hero' | 'companion'): ITerrainStats {
    const player = this.getPlayer(playerId);
    if (!player) return { forest: 0, mountain: 0, water: 0 };

    const expeditionZone = player.zones.expedition;
    const stats: ITerrainStats = { forest: 0, mountain: 0, water: 0 };

    for (const entity of expeditionZone.getAll()) {
        if (isGameObject(entity) && entity.type === CardType.Character) {
            // Skip if Character has Asleep status during Progress (Rule 2.4.3)
            if (entity.statuses.has(StatusType.Asleep)) continue;

            // Get base statistics
            const entityStats = entity.currentCharacteristics.statistics;
            if (entityStats) {
                stats.forest += entityStats.forest || 0;
                stats.mountain += entityStats.mountain || 0; 
                stats.water += entityStats.water || 0;
            }

            // Add boost counters (Rule 2.5.1.b)
            const boostCount = entity.counters.get(CounterType.Boost) || 0;
            stats.forest += boostCount;
            stats.mountain += boostCount;
            stats.water += boostCount;
        }
    }

    return stats;
}

/**
 * Handles the Progress daily effect during Dusk phase
 * Rule 4.2.4.c-j
 */
public async progressPhase(): Promise<void> {
    console.log('[GSM] Beginning Progress phase.');

    for (const player of this.state.players.values()) {
        // Reset movement flags
        player.heroExpedition.hasMoved = false;
        player.companionExpedition.hasMoved = false;
        player.heroExpedition.canMove = true;
        player.companionExpedition.canMove = true;

        // Check for Defender keyword (Rule 7.4.2)
        const movementRestrictions = this.keywordHandler.checkDefenderRestrictions(player.id);
        player.heroExpedition.canMove = movementRestrictions.hero;
        player.companionExpedition.canMove = movementRestrictions.companion;

        if (!player.heroExpedition.canMove || !player.companionExpedition.canMove) {
            console.log(`[GSM] Player ${player.id} expeditions cannot move due to Defender.`);
            continue;
        }

        // Calculate expedition statistics
        const heroStats = this.calculateExpeditionStats(player.id, 'hero');
        const companionStats = this.calculateExpeditionStats(player.id, 'companion');

        // Find opponent (for 2-player game)
        const opponents = Array.from(this.state.players.values()).filter(p => p.id !== player.id);
        
        for (const opponent of opponents) {
            const oppHeroStats = this.calculateExpeditionStats(opponent.id, 'hero');
            const oppCompanionStats = this.calculateExpeditionStats(opponent.id, 'companion');

            // Hero expedition vs opponent hero expedition
            if (this.expeditionShouldMove(heroStats, oppHeroStats) && player.heroExpedition.canMove) {
                player.heroExpedition.position++;
                player.heroExpedition.hasMoved = true;
                console.log(`[GSM] Player ${player.id} hero expedition moved to position ${player.heroExpedition.position}`);
            }

            // Companion expedition vs opponent companion expedition  
            if (this.expeditionShouldMove(companionStats, oppCompanionStats) && player.companionExpedition.canMove) {
                player.companionExpedition.position++;
                player.companionExpedition.hasMoved = true;
                console.log(`[GSM] Player ${player.id} companion expedition moved to position ${player.companionExpedition.position}`);
            }
        }
    }
}

/**
 * Determines if an expedition should move forward based on statistics comparison
 * Rule 4.2.4.e: "An expedition moves forward if it has a greater positive total for at least one terrain"
 */
private expeditionShouldMove(myStats: ITerrainStats, opponentStats: ITerrainStats): boolean {
    const myForest = Math.max(0, myStats.forest);
    const myMountain = Math.max(0, myStats.mountain);  
    const myWater = Math.max(0, myStats.water);

    const oppForest = Math.max(0, opponentStats.forest);
    const oppMountain = Math.max(0, opponentStats.mountain);
    const oppWater = Math.max(0, opponentStats.water);

    return (myForest > oppForest) || (myMountain > oppMountain) || (myWater > oppWater);
}

public async drawCards(playerId: string, count: number): Promise<void> {
    const player = this.getPlayer(playerId);
    if (!player) {
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
            }
        }
        
        if (deck.getCount() === 0) {
            break; 
        }

        const cardToDraw = deck.removeTop();
        if (cardToDraw) {
            hand.add(cardToDraw);
            this.eventBus.publish('entityMoved', { entity: cardToDraw, from: deck, to: hand });
        }
    }
}

/**
 * Checks victory conditions after Night phase
 * Rule 4.2.5.d
 */
public checkVictoryConditions(): string | null {
    console.log('[GSM] Checking victory conditions.');
    
    const playerIds = Array.from(this.state.players.keys());
    const playerScores = new Map<string, number>();
    
    // Calculate total expedition distances for each player
    for (const playerId of playerIds) {
        const player = this.getPlayer(playerId);
        if (!player) continue;
        
        const totalDistance = player.heroExpedition.position + player.companionExpedition.position;
        playerScores.set(playerId, totalDistance);
        console.log(`[GSM] Player ${playerId} total expedition distance: ${totalDistance}`);
    }
    
    // Find the maximum score
    const maxScore = Math.max(...Array.from(playerScores.values()));
    
    // Check if any player has reached victory threshold (≥7) and has the highest score
    if (maxScore >= 7) {
        const winners = playerIds.filter(pid => playerScores.get(pid) === maxScore);
        
        if (winners.length === 1) {
            console.log(`[GSM] Player ${winners[0]} wins with score ${maxScore}!`);
            return winners[0];
        } else {
            console.log('[GSM] Tie detected, proceeding to tiebreaker.');
            // TODO: Implement tiebreaker rules
            return null;
        }
    }
    
    return null; // No winner yet
}
}