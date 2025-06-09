
import type { IGameState, IPlayer, ICardInstance, IGameObject, ZoneEntity, IZone, ICardDefinition } from './types/zones';
import { ObjectFactory } from './types/zones'; // Added import
import { GamePhase, ZoneIdentifier, StatusType, CounterType, CardType, PermanentZoneType } from './types/enums';
import type { EventBus } from './EventBus';
import { BaseZone, HandZone, DiscardPileZone, LimboZone } from './Zone'; // Assuming these are correctly imported or defined

// Type guard to check if an entity is a full GameObject
export function isGameObject(entity: ICardInstance | IGameObject): entity is IGameObject {
    return (entity as IGameObject).objectId !== undefined;
}


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
                expedition: new BaseZone("shared-expedition", ZoneIdentifier.Expedition, 'visible'),
                limbo: new LimboZone(),
            },
            currentPhase: GamePhase.Setup,
            currentPlayerId: playerIds[0],
            firstPlayerId: playerIds[0],
            dayNumber: 1,
            actionHistory: [],
        };
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
        }
        yield this.state.sharedZones.adventure;
        yield this.state.sharedZones.expedition;
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
