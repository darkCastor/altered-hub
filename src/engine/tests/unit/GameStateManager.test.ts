import { GameStateManager } from '../../GameStateManager';
import type { IPlayer } from '../../types/game';
import type { PlayerActionHandler } from '../../PlayerActionHandler';
import type { ICardDefinition, ICardInstance, IGameObject } from '../../types/objects';
import { CardType, GamePhase, ZoneIdentifier } from '../../types/enums';
import { EventBus } from '../../EventBus';
import { RuleAdjudicator } from '../../RuleAdjudicator';
import { TurnManager } from '../../TurnManager';
import { Zone } from '../../Zone';
import { EffectProcessor } from '../../EffectProcessor';
import { CardPlaySystem } from '../../CardPlaySystem';
import { StatusEffectHandler } from '../../StatusEffectHandler';


jest.mock('../../PlayerActionHandler');
jest.mock('../../EventBus');
jest.mock('../../RuleAdjudicator');
jest.mock('../../TurnManager');
jest.mock('../../EffectProcessor');
jest.mock('../../CardPlaySystem');
jest.mock('../../StatusEffectHandler');


const mockPlayerActionHandler = {
    playerChoosesObjectsToKeep: jest.fn(),
    promptForOptionalStepChoice: jest.fn(),
    promptForModeChoice: jest.fn(),
    promptForCardChoice: jest.fn(),
    promptForExpeditionChoice: jest.fn(),
    promptForPlayerChoice: jest.fn(),
    chooseTargetForEffect: jest.fn(),
    promptPlayerForExpandChoice: jest.fn(),
    promptPlayerForScoutChoice: jest.fn(),
} as jest.Mocked<PlayerActionHandler>;


describe('GameStateManager', () => {
    let gsm: GameStateManager;
    let player1: IPlayer;
    let player2: IPlayer;
    let objectStore: ObjectStore;
    let eventBus: EventBus;
    let ruleAdjudicator: RuleAdjudicator;
    let turnManager: TurnManager;
    let effectProcessor: EffectProcessor;
    let cardPlaySystem: CardPlaySystem;
    let statusHandler: StatusHandler;

    const cardDefReserveLimit: CardDefinition = { id: 'heroDef', name: 'Hero', type: CardType.Hero, characteristics: { reserve: 1 } };
    const cardDefA: CardDefinition = { id: 'cardADef', name: 'Card A', type: CardType.Character, cost: { scout: 1 } };
    const cardDefB: CardDefinition = { id: 'cardBDef', name: 'Card B', type: CardType.Character, cost: { scout: 1 } };
    const cardDefC: CardDefinition = { id: 'cardCDef', name: 'Card C', type: CardType.Character, cost: { scout: 1 } };
    const cardDefX: CardDefinition = { id: 'cardXDef', name: 'Card X', type: CardType.Character, cost: { scout: 1 } };
    const cardDefY: CardDefinition = { id: 'cardYDef', name: 'Card Y', type: CardType.Character, cost: { scout: 1 } };
    const cardDefZ: CardDefinition = { id: 'cardZDef', name: 'Card Z', type: CardType.Character, cost: { scout: 1 } };

    beforeEach(() => {
        eventBus = new EventBus();
        objectStore = new ObjectStore(eventBus);
        statusHandler = new StatusHandler(objectStore, eventBus);
        ruleAdjudicator = new RuleAdjudicator(objectStore, eventBus, statusHandler);
        turnManager = new TurnManager(eventBus, ['p1', 'p2']);
        effectProcessor = new EffectProcessor({} as GameStateManager); // Will be replaced by actual gsm
        cardPlaySystem = new CardPlaySystem({} as GameStateManager); // Will be replaced by actual gsm


        player1 = new Player('p1', 'Player 1', objectStore, eventBus);
        player2 = new Player('p2', 'Player 2', objectStore, eventBus);

        objectStore.addPlayer(player1);
        objectStore.addPlayer(player2);

        objectStore.registerCardDefinition(cardDefReserveLimit);
        objectStore.registerCardDefinition(cardDefA);
        objectStore.registerCardDefinition(cardDefB);
        objectStore.registerCardDefinition(cardDefC);
        objectStore.registerCardDefinition(cardDefX);
        objectStore.registerCardDefinition(cardDefY);
        objectStore.registerCardDefinition(cardDefZ);

        gsm = new GameStateManager(
            objectStore,
            eventBus,
            ruleAdjudicator,
            mockPlayerActionHandler as PlayerActionHandler,
            turnManager,
            statusHandler
        );
        effectProcessor['gsm'] = gsm;
        cardPlaySystem['gsm'] = gsm;
        gsm.effectProcessor = effectProcessor;
        gsm.cardPlaySystem = cardPlaySystem;


        gsm.initializeGame(['p1', 'p2'], { p1: ['heroDef'], p2: ['heroDef'] });
        gsm.startGame();
        gsm.state.firstPlayerId = 'p1';
        gsm.state.currentPlayerId = 'p1';
        gsm.state.currentPhase = GamePhase.Cleanup;


        const hero1 = player1.zones.heroZone.getObjectsByDefinitionId('heroDef')[0] as IGameObject;
        const hero2 = player2.zones.heroZone.getObjectsByDefinitionId('heroDef')[0] as IGameObject;

        if(hero1) objectStore.updateObjectCharacteristics(hero1.objectId, { reserve: 1 });
        if(hero2) objectStore.updateObjectCharacteristics(hero2.objectId, { reserve: 1 });

    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('cleanupPhase', () => {
        it('should process reserve limit cleanup in initiative order and move excess cards to discard', async () => {
            const cardA_P1 = objectStore.createCardInstance('cardADef', 'p1', ZoneIdentifier.Reserve) as ICardInstance;
            const cardB_P1 = objectStore.createCardInstance('cardBDef', 'p1', ZoneIdentifier.Reserve) as ICardInstance;
            const cardC_P1 = objectStore.createCardInstance('cardCDef', 'p1', ZoneIdentifier.Reserve) as ICardInstance;
            player1.zones.reserveZone.add(objectStore.getObject(cardA_P1.instanceId) as IGameObject);
            player1.zones.reserveZone.add(objectStore.getObject(cardB_P1.instanceId) as IGameObject);
            player1.zones.reserveZone.add(objectStore.getObject(cardC_P1.instanceId) as IGameObject);

            const cardX_P2 = objectStore.createCardInstance('cardXDef', 'p2', ZoneIdentifier.Reserve) as ICardInstance;
            const cardY_P2 = objectStore.createCardInstance('cardYDef', 'p2', ZoneIdentifier.Reserve) as ICardInstance;
            const cardZ_P2 = objectStore.createCardInstance('cardZDef', 'p2', ZoneIdentifier.Reserve) as ICardInstance;
            player2.zones.reserveZone.add(objectStore.getObject(cardX_P2.instanceId) as IGameObject);
            player2.zones.reserveZone.add(objectStore.getObject(cardY_P2.instanceId) as IGameObject);
            player2.zones.reserveZone.add(objectStore.getObject(cardZ_P2.instanceId) as IGameObject);

            const p1KeepOrder: Record<string, number> = {};
            const p2KeepOrder: Record<string, number> = {};
            let callCount = 0;

            mockPlayerActionHandler.playerChoosesObjectsToKeep.mockImplementation(async (playerId, objects, limit, reason) => {
                callCount++;
                if (playerId === 'p1') {
                    p1KeepOrder[playerId] = callCount;
                    return objects.filter(obj => obj.definitionId === 'cardADef');
                }
                if (playerId === 'p2') {
                    p2KeepOrder[playerId] = callCount;
                    return objects.filter(obj => obj.definitionId === 'cardXDef');
                }
                return [];
            });

            await gsm.cleanupPhase();

            expect(p1KeepOrder['p1']).toBe(1);
            expect(p2KeepOrder['p2']).toBe(2);

            expect(player1.zones.reserveZone.getAll().length).toBe(1);
            expect(player1.zones.reserveZone.contains(cardA_P1.instanceId)).toBe(true);
            expect(player1.zones.discardPileZone.contains(cardB_P1.instanceId)).toBe(true);
            expect(player1.zones.discardPileZone.contains(cardC_P1.instanceId)).toBe(true);

            expect(player2.zones.reserveZone.getAll().length).toBe(1);
            expect(player2.zones.reserveZone.contains(cardX_P2.instanceId)).toBe(true);
            expect(player2.zones.discardPileZone.contains(cardY_P2.instanceId)).toBe(true);
            expect(player2.zones.discardPileZone.contains(cardZ_P2.instanceId)).toBe(true);
        });
    });
});
