
import type { IGameState, IPlayer, ICardInstance, IGameObject, ZoneEntity, IZone, ICardDefinition } from './types/zones';
import { ObjectFactory } from './types/zones';
import { GamePhase, ZoneIdentifier, StatusType, CounterType, CardType, PermanentZoneType } from './types/enums';
import type { EventBus } from './EventBus';
import { BaseZone, HandZone, DiscardPileZone, LimboZone } from './Zone';
import { isGameObject } from './types/objects';


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
                    deck: new BaseZone(`${pid}-deck`, ZoneIdentifier.Deck, 'hidden', pid),
                    hand: new HandZone(`${pid}-hand`, pid),
                    discardPile: new DiscardPileZone(`${pid}-discard`, pid),
                    manaZone: new BaseZone(`${pid}-mana`, ZoneIdentifier.Mana, 'visible', pid),
                    reserve: new BaseZone(`${pid}-reserve`, ZoneIdentifier.Reserve, 'visible', pid),
                    landmarkZone: new BaseZone(`${pid}-landmark`, ZoneIdentifier.Landmark, 'visible', pid),
                    heroZone: new BaseZone(`${pid}-hero`, ZoneIdentifier.Hero, 'visible', pid),
                    expedition: new BaseZone(`${pid}-expedition`, ZoneIdentifier.Expedition, 'visible', pid), // Added player-specific expedition zone
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
                // Shared expedition zone might be deprecated if player-specific ones are primary
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

    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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

            if (!this.cardDefinitions.has(heroDefinition.id)) {
                this.cardDefinitions.set(heroDefinition.id, heroDefinition);
            }
            const heroTempInstance = this.objectFactory.createCardInstance(heroDefinition.id, playerId);
            const heroGameObject = this.objectFactory.createGameObject(heroTempInstance, playerId) as IGameObject;
            player.zones.heroZone.add(heroGameObject);
            console.log(`[GSM] Placed Hero ${heroGameObject.name} in ${player.zones.heroZone.id}`);

            const nonHeroDeckDefinitions = deckDefinitions.filter(def => def.type !== CardType.Hero);
            let deckCardInstances: ICardInstance[] = nonHeroDeckDefinitions.map(def => {
                if (!this.cardDefinitions.has(def.id)) {
                    this.cardDefinitions.set(def.id, def);
                }
                return this.objectFactory.createCardInstance(def.id, playerId);
            });

            deckCardInstances = this.shuffleArray(deckCardInstances);

            deckCardInstances.forEach(cardInstance => {
                player.zones.deck.add(cardInstance);
            });
            console.log(`[GSM] Player ${playerId} deck initialized with ${player.zones.deck.getCount()} cards.`);

            for (let i = 0; i < startingHandSize; i++) {
                const allDeckCards = player.zones.deck.getAll();
                if (allDeckCards.length > 0) {
                    const cardToDraw = allDeckCards[0] as ICardInstance;
                    this.moveEntity(cardToDraw.instanceId, player.zones.deck, player.zones.hand, playerId);
                } else {
                    console.warn(`[GSM] Player ${playerId} ran out of cards to draw for initial hand.`);
                    break;
                }
            }
            console.log(`[GSM] Player ${playerId} drew ${player.zones.hand.getCount()} cards for starting hand.`);

            for (let i = 0; i < initialManaOrbs; i++) {
                const manaOrbDefId = `mana_orb_definition_generic_${playerId}_${i}`;
                if (!this.cardDefinitions.has(manaOrbDefId)) {
                    this.cardDefinitions.set(manaOrbDefId, {
                        id: manaOrbDefId, name: "Mana Orb", type: CardType.ManaOrb, handCost: 0, reserveCost: 0, abilities: []
                    });
                }
                const manaOrbTempInstance = this.objectFactory.createCardInstance(manaOrbDefId, playerId);
                const manaOrbGameObject = this.objectFactory.createGameObject(manaOrbTempInstance, playerId);
                player.zones.manaZone.add(manaOrbGameObject);
            }
            console.log(`[GSM] Player ${playerId} initialized with ${player.zones.manaZone.getCount()} mana orbs.`);
        });
    }


    public moveEntity(entityId: string, fromZone: IZone, toZone: IZone, controllerId: string): IGameObject | ICardInstance {
        const sourceEntity = fromZone.remove(entityId);
        if (!sourceEntity) {
            throw new Error(`Entity ${entityId} not found in zone ${fromZone.id}.`);
        }

        let newEntity: ZoneEntity;

        if (toZone.visibility === 'visible') {
            newEntity = this.objectFactory.createGameObject(sourceEntity, controllerId);
        } else {
             if (isGameObject(sourceEntity)) {
                 newEntity = this.objectFactory.createCardInstance(sourceEntity.definitionId, sourceEntity.ownerId);
             } else {
                 newEntity = sourceEntity;
             }
        }

        toZone.add(newEntity);
        this.state.actionHistory.push({ action: 'moveEntity', entityId, from: fromZone.zoneType, to: toZone.zoneType, newId: isGameObject(newEntity) ? newEntity.objectId : newEntity.instanceId });
        this.eventBus.publish('entityMoved', { entity: newEntity, from: fromZone, to: toZone });
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
            yield player.zones.expedition; // Added player expedition to visible zones
        }
        yield this.state.sharedZones.adventure;
        // yield this.state.sharedZones.expedition; // Deprecated if player-specific
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
}
