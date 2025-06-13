import { PhaseManager } from '../../PhaseManager';
import type { GameStateManager } from '../../GameStateManager';
import { Player } from '../../Player';
import type { PlayerActionHandler } from '../../PlayerActionHandler';
import { ObjectStore } from '../../ObjectStore';
import { EventBus } from '../../EventBus';
import { RuleAdjudicator } from '../../RuleAdjudicator';
import { TurnManager } from '../../TurnManager';
import type { CardDefinition, ICardInstance, IGameObject, IExpandChoice } from '../../types/objects';
import { CardType, GamePhase, ZoneIdentifier } from '../../types/enums';
import { EffectProcessor } from '../../EffectProcessor';
import { CardPlaySystem } from '../../CardPlaySystem';
import { StatusHandler } from '../../StatusHandler';

jest.mock('../../PlayerActionHandler');
jest.mock('../../RuleAdjudicator');
jest.mock('../../TurnManager');
jest.mock('../../EffectProcessor');
jest.mock('../../CardPlaySystem');
jest.mock('../../StatusHandler');


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


describe('PhaseManager', () => {
    let phaseManager: PhaseManager;
    let gsm: GameStateManager;
    let player1: Player;
    let player2: Player;
    let objectStore: ObjectStore;
    let eventBus: EventBus;
    let ruleAdjudicator: RuleAdjudicator;
    let turnManager: TurnManager;
    let effectProcessor: EffectProcessor;
    let cardPlaySystem: CardPlaySystem;
    let statusHandler: StatusHandler;
    let mockResolveReactions: jest.SpyInstance;
    let mockApplyPassives: jest.SpyInstance;

    const cardDefHandP1: CardDefinition = { id: 'handP1Def', name: 'P1 Hand Card', type: CardType.Character, cost: { scout: 1 } };
    const cardDefHandP2: CardDefinition = { id: 'handP2Def', name: 'P2 Hand Card', type: CardType.Character, cost: { scout: 1 } };
    const cardDefExpeditionP1: CardDefinition = { id: 'expP1Def', name: 'P1 Expedition Card', type: CardType.Expedition };


    beforeEach(() => {
        eventBus = new EventBus(); // Real EventBus
        objectStore = new ObjectStore(eventBus);
        statusHandler = new StatusHandler(objectStore, eventBus);
        ruleAdjudicator = new RuleAdjudicator(objectStore, eventBus, statusHandler);
        turnManager = new TurnManager(eventBus, ['p1', 'p2']);

        player1 = new Player('p1', 'Player 1', objectStore, eventBus);
        player2 = new Player('p2', 'Player 2', objectStore, eventBus);

        objectStore.addPlayer(player1);
        objectStore.addPlayer(player2);

        objectStore.registerCardDefinition(cardDefHandP1);
        objectStore.registerCardDefinition(cardDefHandP2);
        objectStore.registerCardDefinition(cardDefExpeditionP1);

        gsm = new GameStateManager(
            objectStore,
            eventBus,
            ruleAdjudicator,
            mockPlayerActionHandler as PlayerActionHandler,
            turnManager,
            statusHandler
        );
        effectProcessor = new EffectProcessor(gsm);
        cardPlaySystem = new CardPlaySystem(gsm);
        gsm.effectProcessor = effectProcessor;
        gsm.cardPlaySystem = cardPlaySystem;

        phaseManager = new PhaseManager(gsm, eventBus, turnManager);

        gsm.initializeGame(['p1', 'p2'], {});
        gsm.startGame();
        gsm.state.firstPlayerId = 'p1';
        gsm.state.currentPlayerId = 'p1';

        mockResolveReactions = jest.spyOn(gsm, 'resolveReactions').mockResolvedValue(undefined);
        mockApplyPassives = jest.spyOn(ruleAdjudicator, 'applyAllPassiveAbilities').mockImplementation(() => {});

    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('handleMorning', () => {
        it('should process expand choices in initiative order with reactions', async () => {
            const cardP1Hand = objectStore.createCardInstance('handP1Def', 'p1', ZoneIdentifier.Hand) as ICardInstance;
            player1.zones.handZone.add(objectStore.getObject(cardP1Hand.instanceId) as IGameObject);
            const cardP2Hand = objectStore.createCardInstance('handP2Def', 'p2', ZoneIdentifier.Hand) as ICardInstance;
            player2.zones.handZone.add(objectStore.getObject(cardP2Hand.instanceId) as IGameObject);

            const p1ExpeditionCard = objectStore.createCardInstance('expP1Def', 'p1', ZoneIdentifier.Expedition) as ICardInstance;
            (objectStore.getObject(p1ExpeditionCard.instanceId) as IGameObject).expeditionAssignment = {playerId: 'p1', type: 'hero'};
            gsm.state.sharedZones.expedition.add(objectStore.getObject(p1ExpeditionCard.instanceId) as IGameObject);


            const p1Choice: IExpandChoice = { cardToExpand: cardP1Hand.instanceId, expeditionCardId: p1ExpeditionCard.instanceId, isPass: false };
            const p2Choice: IExpandChoice = { cardToExpand: cardP2Hand.instanceId, expeditionCardId: '', isPass: false }; // P2 might not have expedition out yet

            let p1PromptOrder = 0;
            let p2PromptOrder = 0;
            let p1ReactionOrder = 0;
            let p2ReactionOrder = 0;
            let callOrder = 0;

            mockPlayerActionHandler.promptPlayerForExpandChoice.mockImplementation(async (playerId) => {
                callOrder++;
                if (playerId === 'p1') {
                    p1PromptOrder = callOrder;
                    return p1Choice;
                }
                if (playerId === 'p2') {
                    p2PromptOrder = callOrder;
                    // Simulate P2 having an expedition card appear or choosing one if logic allows
                    // For this test, assume P2 can expand to a general area or a newly created one if needed.
                    // The core is initiative order, so P2's specific valid choice details are secondary here.
                    // Let's assume P2 chooses to expand to a valid target.
                    const dummyExpeditionForP2 = objectStore.createCardInstance('expP1Def', 'p2', ZoneIdentifier.Expedition) as ICardInstance;
                    (objectStore.getObject(dummyExpeditionForP2.instanceId) as IGameObject).expeditionAssignment = {playerId: 'p2', type: 'hero'};
                    gsm.state.sharedZones.expedition.add(objectStore.getObject(dummyExpeditionForP2.instanceId) as IGameObject);
                    p2Choice.expeditionCardId = dummyExpeditionForP2.instanceId;
                    return p2Choice;
                }
                return { cardToExpand: '', expeditionCardId: '', isPass: true };
            });

            mockResolveReactions.mockImplementation(async () => {
                callOrder++;
                // Check if it's P1's turn for reaction by seeing if P1 has expanded but P2 hasn't been prompted yet
                if (p1PromptOrder > 0 && p2PromptOrder === 0) {
                    p1ReactionOrder = callOrder;
                     // Simulate P1's reaction: e.g., P1 draws a card
                    eventBus.publish('simulatedReactionP1', {playerId: 'p1'});
                } else if (p2PromptOrder > 0) { // P2's turn for reaction
                    p2ReactionOrder = callOrder;
                }
                return Promise.resolve();
            });

            await phaseManager.handleMorning();

            expect(p1PromptOrder).toBe(1);
            expect(player1.zones.playZone.contains(cardP1Hand.instanceId)).toBe(true);
            expect(p1ReactionOrder).toBeGreaterThan(p1PromptOrder);

            expect(p2PromptOrder).toBeGreaterThan(p1ReactionOrder);
            expect(player2.zones.playZone.contains(cardP2Hand.instanceId)).toBe(true);
            expect(p2ReactionOrder).toBeGreaterThan(p2PromptOrder);

            expect(mockApplyPassives).toHaveBeenCalledTimes(2); // Once after each player's action
            expect(mockResolveReactions).toHaveBeenCalledTimes(2); // Once after each player's action
        });
    });
});
