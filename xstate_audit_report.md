# XState Audit Report

## Current XState Usage

This document outlines the utilization of XState for managing state within the `deckMachine.ts` and `gameMachine.ts` components of the project.

### Deck Machine (`src/lib/state/deckMachine.ts`)

The `deckMachine` leverages XState to manage the lifecycle of deck creation, editing, validation, and interaction with persistent storage.

**Core States:**
The machine transitions through several key states:
-   `initializing`: The initial state responsible for loading existing decks from storage.
-   `idle`: Represents a stable state where the system is ready for user interaction, such as creating a new deck or editing an existing one.
-   `editing`: The primary state for deck modification. Users can add/remove cards, set a hero, change the deck format, and trigger validation.
-   `saving`: An intermediary state entered when a request to save the current deck is made. It invokes an actor to handle the asynchronous save operation.
-   `deleting`: An intermediary state for handling deck deletion, invoking an actor for the asynchronous deletion process.
-   `errorLoading`: A state entered if the initial loading of decks fails.
-   `error`: A general error state for other runtime errors (e.g., save/delete failures if not handled by transitioning back to `editing` or `idle` with an error message in context).

**Key Events & Actions:**
-   **Deck Management:**
    -   `LOAD_DECKS`: Triggers the `initializing` state to (re)load decks.
    -   `CREATE_DECK`: Transitions to `editing` and uses the `createDeck` action to instantiate a new deck object in the context. It initializes the deck structure, sets default values (like 'constructed' format), and performs an initial validation.
    -   `EDIT_DECK`: Transitions to `editing`, using `assignCurrentDeckFromLoaded` to load an existing deck into `currentDeck` for modification and validates it.
    -   `DELETE_DECK`: Transitions to the `deleting` state to initiate deck removal.
    -   `SAVE_DECK`: Transitions to `saving` if the `hasDeckToSave` guard passes.
-   **Deck Modification (primarily in `editing` state):**
    -   `ADD_CARD`: Uses the `addCard` action. This action checks validation rules (e.g., copy limits, faction compatibility via `deckValidator.canAddCard`) before adding/updating card quantity. It then re-validates the deck.
    -   `REMOVE_CARD`: Uses the `removeCard` action to remove a card and re-validates.
    -   `UPDATE_CARD_QUANTITY`: Uses `updateCardQuantity` to change a card's quantity, enforcing limits and re-validating.
    -   `SET_HERO`: Uses `setHero` to assign a hero card and re-validates.
    -   `SET_FORMAT`: Uses `setFormat` to change the deck's format (e.g., 'constructed', 'limited') and re-validates.
-   **Validation & Storage Interaction (Actors):**
    -   `VALIDATE_DECK`: Explicitly triggers the `validateCurrentDeck` action to re-assess the `currentDeck`'s validity using `deckValidator`. The result (including errors and stats) is stored in `validationResult`, and `currentDeck.isValid` is updated.
    -   **Actors for Asynchronous Operations:**
        -   `loadDecksFromStorage`: Invoked in the `initializing` state. On success (`DECKS_LOADED`), `assignDecksToContext` updates the context. On error (`DECK_LOAD_FAILED`), `assignLoadErrorToContext` handles it.
        -   `saveDeckToStorage`: Invoked in the `saving` state with `context.currentDeck` as input. On success (`DECK_SAVED`), `assignSavedDeckToContext` updates the context. On error (`DECK_SAVE_FAILED`), `assignSaveErrorToContext` is called, and the machine typically transitions back to `editing`.
        -   `deleteDeckFromStorage`: Invoked in the `deleting` state with `event.deckId` as input. On success (`DECK_DELETED`), `assignDeletedDeckToContext` updates the context. On error (`DECK_DELETE_FAILED`), `assignDeleteErrorToContext` handles it.
-   **UI Interaction:**
    -   `SEARCH_CARDS`: Updates `searchQuery` in context via `setSearchQuery`.
    -   `APPLY_FILTERS`: Updates `filters` in context via `applyDeckFilters`.
    -   `CLEAR_FILTERS`: Resets `filters` and `searchQuery` via `clearDeckFilters`.

**Context Management:**
The machine's `context` stores:
-   `decks`: An array of all loaded `Deck` objects.
-   `currentDeck`: The `Deck` object currently being edited or created.
-   `validationResult`: Stores the output from `deckValidator`, including errors, warnings, and statistics.
-   `isLoading`: Boolean flag for asynchronous operations.
-   `error`: Stores error messages.
-   `searchQuery`, `filters`: For UI card searching/filtering.

**Guards:**
-   `hasDeckToSave`: Ensures `currentDeck` is not null before attempting to save.
-   `isCurrentDeckValid`: (Mentioned as a consideration) Could be used to only allow saving valid decks.
-   `canAddCard`: Uses `deckValidator.canAddCard` to check if a card can be added based on game rules before the `addCard` action is executed.

### Game Machine (`src/lib/state/gameMachine.ts`)

The `gameMachine` orchestrates the core game logic, managing initialization, phase transitions, player actions, and a reaction system.

**Core States:**
-   `idle`: The initial state before game setup.
-   `initializing`: State for setting up core game engine components (GameStateManager, EventBus, etc.) and loading card definitions.
-   `playing`: The main state where gameplay occurs. This is a parent state with nested states for managing turns and actions.
    -   `waitingForAction`: Default sub-state within `playing`, awaiting player input like playing a card or passing a turn.
    -   `processingCard`: Briefly entered after a `PLAY_CARD` event to handle card playing logic.
    -   `advancingPhase`: Handles the logic for moving between game phases (Morning, Afternoon, etc.).
    -   `checkingReactions`: A critical nested state machine responsible for managing the reaction loop.
        -   `evaluatingLimbo`: Determines if there are reactions to process, who has initiative, and if there are multiple choices.
        -   `awaitingReactionChoice`: If a player has multiple reactions, waits for their `CHOOSE_REACTION_TO_PLAY` event.
        -   `resolvingReaction`: Resolves the chosen or automatically selected reaction.
    -   `gameFlowContinuationPoint`: A transient state to clear reaction context and loop back to `waitingForAction`.
-   `gameEnded`: State entered when the game concludes.
-   `error`: A general error state.

**Key Events & Actions:**
-   **Game Setup:**
    -   `INITIALIZE_GAME`: Transitions to `initializing`. The `initializeCoreEngine` action creates instances of `GameStateManager`, `EventBus`, `PhaseManager`, `TurnManager`, and `CardPlaySystem`, storing them in context.
    -   `LOAD_CARD_DEFINITIONS`: The `loadCardDefinitions` action processes an array of card definitions, populating `context.cardDefinitions` and informing `GameStateManager`.
    -   `START_GAME`: Transitions to `playing` if `isGameInitialized` guard passes. `triggerGameStartInitialization` action tells `GameStateManager` to perform its game start routines.
-   **Gameplay Loop (within `playing` state):**
    -   `PLAY_CARD`: If `canPlayCard` guard passes (checks phase, current player), transitions to `processingCard`. The `playCard` action delegates to `context.cardPlaySystem.playCard`. After this, it transitions to `checkingReactions`.
    -   `ADVANCE_PHASE`: If `canAdvancePhase` guard passes, transitions to `advancingPhase`. The `advancePhase` action calls `context.phaseManager.advancePhase()`. If it's the start of the Afternoon phase, `startAfternoonPhase` is also called. Then proceeds to `checkingReactions`.
    -   `PASS_TURN`: (Primarily in Afternoon phase) Transitions to `checkingReactions`. The `passTurn` action calls `context.turnManager.playerPasses()`.
    -   `SELECT_CARD`: Updates `selectedCard` in context via `selectCard` action.
-   **Reaction System (within `checkingReactions` state):**
    -   `evaluateLimbo` (action): Checks `gameStateManager.state.sharedZones.limbo` for reaction objects. Determines initiative, counts available reactions for the initiative player.
    -   `CHOOSE_REACTION_TO_PLAY`: If multiple reactions are available for the initiative player, this event triggers the `setChosenReaction` action to mark the `nextReactionToResolve`.
    -   `passReactionInitiative` (action): If the current initiative player has no reactions or chooses to pass, this action updates `reactionInitiativePlayerId` and increments `reactionInitiativePassCount`.
    -   `resolveNextReaction` (action): If a reaction is set to be resolved (either chosen or only one available), this action uses `gameStateManager.effectProcessor.resolveEffect` to apply its effect and removes it from limbo.
    -   `clearReactionContext` (action): Resets reaction-specific context variables when the reaction loop concludes.
-   **Game Conclusion:**
    -   `END_GAME`: Transitions to `gameEnded`.
    -   `RESET_GAME`: Transitions from `gameEnded` or `error` back to `idle`, calling the `resetGame` action to clear the entire context.

**Context Management:**
The `gameMachine` context is extensive, holding:
-   Instances of core engine modules: `gameStateManager`, `eventBus`, `phaseManager`, `turnManager`, `cardPlaySystem`.
-   Game state data: `cardDefinitions`, `players`, `currentPlayer`, `currentPhase`, `currentDay`.
-   UI/Action related: `selectedCard`, `selectedDeck`.
-   Error state: `error`.
-   Reaction loop variables: `pendingReactionsCount`, `initiativePlayerReactions`, `nextReactionToResolve`, `reactionInitiativePlayerId`, `reactionInitiativePassCount`.

**Guards:**
-   `isGameInitialized`: Ensures core components are set up before starting the game.
-   `canPlayCard`: Checks if conditions are met for a player to play a card (e.g., correct phase, player's turn).
-   `canAdvancePhase`: Checks if the game can move to the next phase.
-   Reaction system guards:
    -   `multipleReactionsAvailable`: True if the initiative player has more than one reaction to choose from.
    -   `hasSingleReactionForInitiativePlayer`: True if there's exactly one reaction for the current initiative player (auto-proceed).
    -   `hasNextReactionToResolve`: True if `nextReactionToResolve` is set.
    -   `canPassReactionInitiative`: Determines if initiative can be passed to the next player.
    -   `noReactionsAtAllOrAllPassed`: Checks if the reaction loop should terminate (either no reactions left or all players have passed).

### Role of Test Files

The test files (`tests/unit/DeckMachine.test.ts`, `tests/unit/DeckMachineDirect.test.ts`, `tests/unit/DeckMachineRealCards.test.ts`) are crucial for ensuring the `deckMachine` operates as expected.

-   **Core Testing Mechanism:** They primarily use `createActor` from XState to create an instance of the `deckMachine`.
-   **Event-Driven Tests:** Tests are conducted by sending various events (e.g., `CREATE_DECK`, `ADD_CARD`, `SET_HERO`, `VALIDATE_DECK`) to the actor.
-   **Snapshot Assertions:** After sending events, assertions are made on the actor's snapshot (`actor.getSnapshot()`). This involves checking:
    -   The current `value` (state) of the machine (e.g., `expect(snapshot.value).toBe('editing')`).
    -   The `context` of the machine (e.g., `expect(snapshot.context.currentDeck?.name).toBe('Test Deck')`, `expect(snapshot.context.validationResult?.isValid).toBe(true)`).
    -   Presence or absence of errors (`snapshot.context.error`).
-   **Variety of Scenarios:**
    -   `DeckMachine.test.ts`: Appears to focus on general functionality, state transitions, and validation logic, possibly using simplified or mocked card data initially. It tests various actions like adding, removing, updating cards, setting heroes, changing formats, and validating decks under different conditions (e.g., constructed vs. limited formats).
    -   `DeckMachineDirect.test.ts`: Contains more specific and direct tests for actions, context immutability, and detailed validation rules (like unique card limits, rare card limits, neutral card rules) for both "constructed" and "limited" formats. It utilizes a vi-mocked `../../src/data/cards` to provide controlled card data for these specific rule checks.
    -   `DeckMachineRealCards.test.ts`: Specifically tests the deck machine using actual card IDs and data (presumably from `altered_optimized.json`). This helps ensure the machine integrates correctly with real card attributes like faction, rarity, and name, especially for rules like faction restrictions, copy limits with same-name cards, and format-dependent behaviors.

These tests collectively verify the machine's logic, actions, guards, and context manipulations across a wide range of inputs and scenarios, including edge cases and error conditions, ensuring its reliability for deck management.

## Potential Areas for XState Improvement

This section outlines potential areas where XState utilization can be enhanced within the project, based on the current codebase (`deckMachine.ts`, `gameMachine.ts`) and XState best practices. These suggestions aim to improve clarity, maintainability, and robustness of the game logic.

### General Best Practices & Opportunities

*   **Actor Model for Complex Processes:** While actors are used for async storage operations in `deckMachine` and considered for game actions, further embracing the actor model for complex, self-contained processes within `gameMachine` could be beneficial. For instance, a long-running card effect with multiple steps or player choices could be spawned as its own actor.
*   **Separation of Concerns (UI vs. Game Logic):** Ensure a clear distinction between machines managing core game logic and those managing UI presentation. While not explicitly detailed in the provided files, if UI state becomes complex, consider spawning dedicated UI machines from the game logic machines rather than overloading game machine contexts with UI-specific flags.
*   **Stronger Typing and Event Specificity:** Continue rigorous use of TypeScript for context and events. Consider using more specific event types where applicable (e.g., instead of a generic `ERROR` event, `ERROR_NETWORK`, `ERROR_VALIDATION`) to allow for more targeted error handling states.
*   **State Granularity:** Evaluate if some states in `gameMachine` could be broken down further for clarity, especially if a single state handles many conditional transitions or complex entry/exit actions.

### 1. Game Setup and Configuration

The current `gameMachine` handles initialization after receiving `INITIALIZE_GAME` and `START_GAME` events. This could be expanded:

*   **Game Mode Selection:**
    *   A higher-level "application shell" machine or a pre-game setup machine could manage choices like "Player vs. Player," "Player vs. AI," "Tutorial."
    *   This machine could then configure and invoke the main `gameMachine` with appropriate context (e.g., player types, AI difficulty).
    *   **Example:**
        ```
        SetupMachine -> on PvP_SELECTED -> invoke gameMachine with { players: [human, human] }
        SetupMachine -> on PvE_SELECTED -> invoke gameMachine with { players: [human, ai_easy] }
        ```
*   **Deck Selection & Pre-Game Checks:**
    *   The `START_GAME` event currently takes a `deckId`. This process could be more integrated. A setup phase within `gameMachine` or a parent machine could involve:
        *   States for `awaitingPlayer1Deck`, `awaitingPlayer2Deck`.
        *   Invoking the `deckMachine` (or a simplified version) to load and validate the selected deck for the game.
        *   Ensuring both players have valid decks before transitioning to `playing`.
*   **Custom Rules/Modifiers:**
    *   If the game supports variants (e.g., "no heroes," "fast mana"), these could be parameters in the `gameMachine`'s context, set during the setup phase.
    *   Guards and actions within `gameMachine` could then reference these rules to alter behavior (e.g., `guard: 'isHeroPlayAllowed'`, `action: 'applyFastManaRule'`).

### 2. Player Input and Interactions

`gameMachine` currently handles `PLAY_CARD` and a reaction system. More complex interactions could be modeled:

*   **Targeting Systems:**
    *   The `PLAY_CARD` event includes an optional `targetId`. For effects requiring multi-targeting or conditional targeting (e.g., "Choose a unit, then choose an enemy unit"), the `processingCard` state could become a parent state:
        *   `processingCard.awaitingTarget1`, `processingCard.awaitingTarget2`.
        *   Events like `SELECT_TARGET { targetId: '...' }` would advance these states.
        *   The context would store chosen targets until all are selected and the effect can resolve.
        *   This could involve spawning a short-lived "targeting" actor/machine.
*   **Mulligan Phase:**
    *   Before the first turn, a dedicated `mulligan` state could be introduced in `gameMachine` after `initializing` and deck setup but before `playing.waitingForAction`.
    *   This state would have events like `CONFIRM_HAND`, `REQUEST_MULLIGAN`.
    -   Actions would handle redrawing cards and updating player hands in `GameStateManager`.
*   **Resolving Choices from Card Effects:**
    *   The current reaction system is good for "respond to action" scenarios. For card effects that present a player with a choice (e.g., "Choose one: Draw a card or Deal 2 damage"), the `gameMachine` could enter a `waitingForChoice` sub-state.
    *   **Context:** `context.pendingChoice = { type: 'DRAW_OR_DAMAGE', options: ['draw', 'damage'], sourceCardId: '...' }`.
    *   **Events:** `RESOLVE_CHOICE { choice: 'draw' }`.
    *   This is more explicit than using the generic limbo/reaction system for choices that aren't reactions to game actions but part of an effect's resolution. This could be managed by a spawned actor invoked by the `CardPlaySystem` or `EffectProcessor` when such a choice is needed.

### 3. AI Opponent Logic

If AI opponents are planned:

*   **AI Behavior Machines:**
    *   Each AI agent could run its own instance of an "AI behavior" state machine.
    *   This machine would receive events from the `gameMachine` (e.g., `OPPONENT_TURN_START`, `GAME_STATE_UPDATED`).
    *   Its states could represent different decision-making modes: `evaluatingBoard`, `choosingCardToPlay`, `choosingTarget`, `requestingAction`.
    *   Actions in this AI machine would ultimately send events back to the `gameMachine` (e.g., `PLAY_CARD`, `PASS_TURN`).
*   **Difficulty Levels/Personalities:**
    *   Different AI personalities or difficulty levels could be implemented as:
        *   Separate, distinct AI behavior machines.
        *   The same machine with different configurations (e.g., different timers for "thinking," different risk-assessment parameters in context, different sub-routines/actors for decision making).
*   **Integration with `gameMachine`:**
    *   When it's the AI's turn, the `gameMachine` could send an event to the AI's machine instance. The `gameMachine` would then wait for the AI to send back its chosen action.

### 4. Error Handling and Recovery

The current machines have general `error` states. This can be enhanced:

*   **Granular Error States:**
    *   Instead of a single `error` state, `gameMachine` could have more specific error states: `error.networkDisconnect`, `error.invalidActionSequence`, `error.gameStateCorruption`.
    *   This allows for different recovery strategies or UI messages.
    *   `deckMachine` already has a slightly more granular `errorLoading` and general `error`.
*   **Recovery Mechanisms:**
    *   For certain errors (e.g., temporary network issues), states could implement automatic retry logic using delayed transitions.
    *   For more severe but potentially recoverable errors, define explicit recovery paths or events (e.g., `ATTEMPT_RECONNECT`, `RESYNC_GAME_STATE`).
    *   If game state corruption is detected, transition to a safe state like `gameEnded` or a specific `needsIntervention` state.
*   **Error Reporting:**
    *   Actions within error states could be responsible for packaging context/state information to send to an external error tracking service.

### 5. UI State Management (Secondary to Game Logic)

While the primary focus is game logic, XState can manage complex UI interactions triggered by game events:

*   **Spawned UI Machines:**
    *   If a card effect requires a complex modal (e.g., a multi-step card selection and confirmation process), the `gameMachine` (or an actor it spawns) could spawn a temporary UI machine to manage that modal's lifecycle.
    *   This keeps the `gameMachine` focused on game rules and the UI machine focused on presentation logic.
    *   The UI machine would send an event back to its parent (e.g., `CHOICE_CONFIRMED { ... }` or `MODAL_CANCELLED`).
*   **Examples:** Confirmation dialogs ("End turn?"), detailed card inspection pop-ups, multi-step forms for game setup options.

### 6. Tutorials and Onboarding

XState is excellent for managing sequential, interactive processes:

*   **Interactive Tutorial Machine:**
    *   A dedicated `tutorialMachine` could guide a new player.
    *   **States:** `welcome`, `explainMana`, `promptPlayCreature`, `explainAttack`, `waitForPlayerAction_PlayCreature`, `feedbackSuccessPlayCreature`, etc.
    *   **Context:** `tutorialMachine.context.currentStep`, `highlightedUiElements`.
    *   The tutorial machine would interact with the `gameMachine` (perhaps a specially configured instance for the tutorial) and the UI.
    *   It could restrict available actions in the `gameMachine` based on the current tutorial step.
*   **Onboarding Flows:** For introducing new features or game modes, smaller state machines can guide users through the steps.

### Conclusion

Further leveraging XState as suggested can lead to:
*   **Increased Clarity:** Explicitly defined states and transitions make complex game flows easier to understand and visualize.
*   **Improved Maintainability:** Encapsulating logic within machines and actors makes changes more localized and less prone to unintended side effects.
*   **Enhanced Robustness:** Well-defined error states and recovery paths can make the game more resilient.
*   **Better Testability:** Individual machines and actors can be tested in isolation.

By thoughtfully applying these patterns, XState can become an even more powerful tool in managing the complexity of the game.
