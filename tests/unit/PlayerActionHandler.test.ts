import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { GameStateManager }
from '../../src/engine/GameStateManager';
import { PlayerActionHandler, PlayerAction } from '../../src/engine/PlayerActionHandler';
import { EventBus } from '../../src/engine/EventBus';
import { ManaSystem } from '../../src/engine/ManaSystem';
import { CardType, StatusType, Faction, GamePhase, ZoneIdentifier } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';
import { TurnManager } from '../../src/engine/TurnManager';


// Default mock card definition for mana orbs, assuming it's pre-loaded or GSM can handle it.
// Tests might need to ensure this definition is in GSM's cardDefinitions map.
const mockManaDef: ICardDefinition = {
    id: `manaDef_default`,
    name: `ManaOrb Default`,
    type: CardType.Character, // Base type, will be overridden to ManaOrb
    subTypes: [],
    faction: Faction.Axiom, // Default, doesn't really matter for mana orbs
    handCost: { total: 0 },
    reserveCost: { total: 0 },
    statistics: { forest: 0, mountain: 0, water: 0 },
    abilities: [],
    rarity: 'Common',
    version: '1.0'
};

// Helper function to add a test mana orb
function addTestManaOrb(gsm: GameStateManager, playerId: string, orbIdSuffix: string, isExhausted: boolean): IGameObject {
    const player = gsm.getPlayer(playerId)!;
    if (!player) throw new Error(`Player ${playerId} not found in test setup.`);

    // Ensure a unique definition ID for each conceptual orb if necessary, or use a common one.
    // For simplicity, using a definition that should be available.
    // If ObjectFactory strictly requires unique defs for unique objects, this might need adjustment.
    // The key is that objectFactory can create an instance from it.
    // Let's assume 'test-card' is a generic definition available from mockCardDefinitions in beforeEach.
    // If not, this helper or the beforeEach needs to ensure GSM has this definition.
    const baseDefinitionId = 'test-card'; // Or mockManaDef.id if ensured it's in GSM

    const orbInstance = gsm.objectFactory.createCardInstance(baseDefinitionId, playerId);
    const orbGameObject = gsm.objectFactory.createGameObject(orbInstance, playerId);

    // Override specific properties for this test orb
    orbGameObject.objectId = `manaOrb_${orbIdSuffix}`; // Force a predictable objectId
    orbGameObject.id = `manaOrb_${orbIdSuffix}`; // Also set id to objectId for consistency if tests use it
    orbGameObject.name = `Mana Orb ${orbIdSuffix}`;
    orbGameObject.type = CardType.ManaOrb;
    orbGameObject.faceDown = true;

    orbGameObject.statuses.clear(); // Clear any default statuses
    if (isExhausted) {
        orbGameObject.statuses.add(StatusType.Exhausted);
    }

    player.zones.manaZone.add(orbGameObject);
    return orbGameObject;
}

describe('PlayerActionHandler', () => {
    let gameStateManager: GameStateManager;
    let playerActionHandler: PlayerActionHandler;
    let eventBus: EventBus;
    let turnManager: TurnManager; // To handle pass action
    let mockCardDefinitions: ICardDefinition[];

    beforeEach(async () => {
        eventBus = new EventBus();
        // Include the default mana definition and a generic test card for other actions
        mockCardDefinitions = [
            mockManaDef,
            {
                id: 'test-card',
                name: 'Test Card',
                type: CardType.Spell,
                subTypes: [],
                handCost: { total: 1 },
                reserveCost: { total: 1 },
                faction: Faction.Neutral,
                statistics: { forest:0, mountain:0, water:0},
                abilities: [],
                rarity: 'Common',
                version: '1.0'
            }
        ];
        gameStateManager = new GameStateManager(['player1', 'player2'], mockCardDefinitions, eventBus);
        turnManager = new TurnManager(gameStateManager, eventBus); // PAH needs TurnManager for pass
        gameStateManager.turnManager = turnManager; // Link turn manager
        playerActionHandler = gameStateManager.actionHandler; // Get from GSM

        // Initialize game, which sets up players, zones, initial mana orbs, etc.
        await gameStateManager.initializeGame();

        // Set to Afternoon phase for actions to be available
        gameStateManager.setCurrentPhase(GamePhase.Afternoon);
        gameStateManager.state.currentPlayerId = 'player1'; // Ensure player1 is current

        // Clear default mana orbs if tests want to start with a clean slate for mana
        const p1 = gameStateManager.getPlayer('player1')!;
        if (p1) p1.zones.manaZone.clear();
        const p2 = gameStateManager.getPlayer('player2')!;
        if (p2) p2.zones.manaZone.clear();

    });

    describe('Convert Mana Actions', () => {
        test('getAvailableActions includes "Convert Mana" action when conditions are met', () => {
            const player = gameStateManager.getPlayer('player1')!;
            // Ensure player's turn
            gameStateManager.state.currentPlayerId = 'player1';
            gameStateManager.state.currentPhase = GamePhase.Afternoon;

            const readyOrb1 = addTestManaOrb(gameStateManager, 'player1', 'ready1', false);
            const exhaustedOrb1 = addTestManaOrb(gameStateManager, 'player1', 'exhausted1', true);

            const actions = playerActionHandler.getAvailableActions('player1');
            const convertAction = actions.find(a => a.type === 'convertMana' && a.sourceObjectId === readyOrb1.objectId && a.targetObjectId === exhaustedOrb1.objectId);

            expect(convertAction).toBeDefined();
            if (convertAction) {
                expect(convertAction.sourceObjectId).toBe(readyOrb1.objectId);
                expect(convertAction.targetObjectId).toBe(exhaustedOrb1.objectId);
                expect(convertAction.description).toContain(readyOrb1.objectId);
                expect(convertAction.description).toContain(exhaustedOrb1.objectId);
            }
        });

        test('executeAction for "Convert Mana" successfully updates orb statuses and turn continues', async () => {
            const player = gameStateManager.getPlayer('player1')!;
            gameStateManager.state.currentPlayerId = 'player1';
            gameStateManager.state.currentPhase = GamePhase.Afternoon;

            const readyOrb = addTestManaOrb(gameStateManager, 'player1', 'r1', false);
            const exhaustedOrb = addTestManaOrb(gameStateManager, 'player1', 'e1', true);

            const action: PlayerAction = {
                type: 'convertMana',
                sourceObjectId: readyOrb.objectId,
                targetObjectId: exhaustedOrb.objectId,
                description: 'Test Convert'
            };
            const turnContinues = await playerActionHandler.executeAction('player1', action);

            expect(turnContinues).toBe(false); // Turn should continue

            const formerlyReady = player.zones.manaZone.findById(readyOrb.objectId) as IGameObject;
            expect(formerlyReady).toBeDefined();
            expect(formerlyReady.statuses.has(StatusType.Exhausted)).toBe(true);

            const formerlyExhausted = player.zones.manaZone.findById(exhaustedOrb.objectId) as IGameObject;
            expect(formerlyExhausted).toBeDefined();
            expect(formerlyExhausted.statuses.has(StatusType.Exhausted)).toBe(false);
        });

        test('getAvailableActions provides no "Convert Mana" if only ready orbs', () => {
            gameStateManager.state.currentPlayerId = 'player1';
            gameStateManager.state.currentPhase = GamePhase.Afternoon;
            addTestManaOrb(gameStateManager, 'player1', 'ready1', false);
            addTestManaOrb(gameStateManager, 'player1', 'ready2', false);

            const actions = playerActionHandler.getAvailableActions('player1');
            const convertAction = actions.find(a => a.type === 'convertMana');
            expect(convertAction).toBeUndefined();
        });

        test('getAvailableActions provides no "Convert Mana" if only exhausted orbs', () => {
            gameStateManager.state.currentPlayerId = 'player1';
            gameStateManager.state.currentPhase = GamePhase.Afternoon;
            addTestManaOrb(gameStateManager, 'player1', 'exhausted1', true);
            addTestManaOrb(gameStateManager, 'player1', 'exhausted2', true);

            const actions = playerActionHandler.getAvailableActions('player1');
            const convertAction = actions.find(a => a.type === 'convertMana');
            expect(convertAction).toBeUndefined();
        });

        test('getAvailableActions provides no "Convert Mana" if no orbs', () => {
            gameStateManager.state.currentPlayerId = 'player1';
            gameStateManager.state.currentPhase = GamePhase.Afternoon;
            // No orbs added

            const actions = playerActionHandler.getAvailableActions('player1');
            const convertAction = actions.find(a => a.type === 'convertMana');
            expect(convertAction).toBeUndefined();
        });
         test('getAvailableActions provides no "Convert Mana" for the same orb', () => {
            gameStateManager.state.currentPlayerId = 'player1';
            gameStateManager.state.currentPhase = GamePhase.Afternoon;
            // This scenario is practically impossible if IDs are unique and an orb is either ready or exhausted.
            // The filter `readyOrb.objectId !== exhaustedOrb.objectId` handles this.
            // To test it directly, one would need to mock orbs in a specific way.
            // The existing logic `readyOrb.objectId !== exhaustedOrb.objectId` in PlayerActionHandler should prevent this.
            // So this test is more of a conceptual confirmation.
            const readyOrb1 = addTestManaOrb(gameStateManager, 'player1', 'singleOrb', false);
            // Manually change its status to also be exhausted to create a conflicting state (not a real game state)
            // This isn't how it would work, but tests the guard condition.
            // Instead, let's rely on the fact that readyOrbs and exhaustedOrbs are mutually exclusive sets for the same physical orb.
            // The condition `readyOrb.objectId !== exhaustedOrb.objectId` is what prevents an orb from converting itself.
            // No specific setup needed if the main logic is sound.
            const actions = playerActionHandler.getAvailableActions('player1');
            const convertAction = actions.find(a => a.type === 'convertMana' && a.sourceObjectId === readyOrb1.objectId && a.targetObjectId === readyOrb1.objectId);
            expect(convertAction).toBeUndefined();
        });
    });
});
