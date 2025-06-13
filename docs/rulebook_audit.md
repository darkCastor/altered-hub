# Rulebook Audit

This document audits the game engine implementation against the Altered Complete Rules Version 3.0.

## Table of Contents

- [Section 1: Overview](#section-1-overview)
- [Section 2: Objects](#section-2-objects)
- [Section 3: Zones](#section-3-zones)
- [Section 4: Game Progression](#section-4-game-progression)
- [Section 5: Playing cards and objects](#section-5-playing-cards-and-objects)
- [Section 6: From Costs and Effects to Events](#section-6-from-costs-and-effects-to-events)
- [Section 7: Vocabulary](#section-7-vocabulary)
- [Section 8: Changes From the Previous Version](#section-8-changes-from-the-previous-version)

## Audit Findings

### Section 1: Overview

#### 1.1 General

##### 1.1.1 This Document

- **Status:** Informational
- **Code References:** N/A
- **Details/Discrepancies:** Rules 1.1.1.a-e describe the purpose and structure of the rulebook itself. This is not relevant to the game engine implementation.

##### 1.1.2 Scope

- **Status:** Informational
- **Code References:** N/A
- **Details/Discrepancies:** Rules 1.1.2.a-b define the scope of the rules (two-player game, document precedence). This is a meta-rule for human interpretation, not engine logic.

##### 1.1.3 Collectible Card Game

- **Status:** Informational
- **Code References:** N/A
- **Details/Discrepancies:** Rules 1.1.3.a-d define Altered as a CCG, deck requirements, and card ownership concepts. Deck construction is a prerequisite to the game the engine runs. Card ownership is a foundational concept, implicitly handled by player-specific zones and card instances. The engine assumes valid decks are provided.

##### 1.1.4 Constructed Play

- **Status:** Informational
- **Code References:** N/A
- **Details/Discrepancies:** Rules 1.1.4.a-g define deck-building rules for Constructed play (Hero count, card count, faction alignment, max copies, rarity limits). These are pre-game rules enforced during deck construction, not by the core game engine during a match. The engine assumes a valid deck.

##### 1.1.5 Limited Play

- **Status:** Informational
- **Code References:** N/A
- **Details/Discrepancies:** Rules 1.1.5.a-d define deck-building rules for Limited play. Similar to Constructed Play, these are pre-game rules. The engine assumes a valid deck.

##### 1.1.6 Numbers and Symbols

- **Status:** Fully Implemented (Informational for most)
- **Code References:**
  - `src/engine/types/enums.ts` (for symbols that map to enums like `TerrainType`, `Faction`)
- **Details/Discrepancies:**
  - 1.1.6.a (Numbers are integers): Standard programming practice; floating point numbers are not typically used for game counters, stats, etc.
  - 1.1.6.b (Division rounding): If division occurs in an effect, the effect definition in `src/engine/EffectProcessor.ts` or card-specific logic would need to specify rounding. This is specific to certain card effects, not a general engine feature.
  - 1.1.6.c (Division by zero): Standard error or undefined behavior if not handled by specific effect logic.
  - 1.1.6.d (Missing number is zero): Handled by game logic, e.g., `GameStateManager.calculateExpeditionStats` would treat missing stats as zero.
  - 1.1.6.e-k (Symbols j, h, r, T, D, I, mana cost): These symbols are primarily for card text representation.
    - j, h, r: Parsed into `IAbilityTrigger` conditions/event types (e.g., 'enterPlay', 'playFromHand', 'playFromReserve') handled by `src/engine/AdvancedTriggerHandler.ts`.
    - T (Exhaust me): Implemented as `ICost.exhaustSelf` in `src/engine/types/abilities.ts` and processed by `src/engine/CostProcessor.ts`.
    - D (Discard me from Reserve): Potentially part of a cost, would be specified in an ability's cost structure and handled by `src/engine/CostProcessor.ts` (needs specific cost component).
    - I (Support ability clarification): Represented by `IAbility.isSupportAbility` boolean flag in `src/engine/types/abilities.ts`.
    - Mana cost circles: Represented by `ICost.mana` in `src/engine/types/abilities.ts`.

##### 1.1.7 Material

- **Status:** Informational
- **Code References:** N/A
- **Details/Discrepancies:** Rules 1.1.7.a-f describe physical game components (cards, tokens, counters, dice, status representations, Adventure board).
  - Card text source (1.1.7.a): The engine uses JSON card definitions which are assumed to be authoritative.
  - Tokens (1.1.7.b): Created by `src/engine/ObjectFactory.ts` based on effect definitions. Representation is via `IGameObject`.
  - Counters (1.1.7.c): `IGameObject.counters` map.
  - Dice (1.1.7.d): Would require a random number generator if dice roll effects are implemented (e.g., in `src/engine/EffectProcessor.ts`).
  - Status representation (1.1.7.e): `IGameObject.statuses` set.
  - Adventure board (1.1.7.f): Implemented virtually in `src/engine/GameStateManager.ts` (`state.sharedZones.adventure`).

#### 1.2 Game Concepts

##### 1.2.1 Players

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/GameStateManager.ts`: Manages `this.state.players`.
  - `src/engine/types/game.ts`: Defines `IPlayer`.
- **Details/Discrepancies:**
  - 1.2.1.a (Participant): `IPlayer` instances.
  - 1.2.1.b (Opponent): Implicit in a two-player game via `this.state.players.find(p => p.id !== currentPlayerId)`.
  - 1.2.1.c (Own deck): Assumed at game start.
  - 1.2.1.d (Personal zones): `IPlayer.zones` in `src/engine/types/game.ts`, initialized in `src/engine/GameStateManager.ts`.

##### 1.2.2 Objects

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ObjectFactory.ts`: Creates `IGameObject` instances.
  - `src/engine/types/objects.ts`: Defines `IGameObject`, `ICardInstance`.
  - `src/engine/types/cards.ts`: Defines `ICardDefinition` (base characteristics).
- **Details/Discrepancies:**
  - 1.2.2.a (Game pieces): `IGameObject`.
  - 1.2.2.b (Most things are objects): Yes, or properties of objects.
  - 1.2.2.c (Characteristics): Defined in `ICardDefinition` and instantiated in `IGameObject.baseCharacteristics` and `IGameObject.currentCharacteristics`. See Section 2.2 audit for detailed characteristic mapping.
  - 1.2.2.d (Lacking characteristics): Handled by TypeScript optional properties or default values (e.g., stats are 0 if not applicable).

##### 1.2.3 Zones

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/Zone.ts`: Defines zone classes like `GenericZone`, `DeckZone`, `HandZone`.
  - `src/engine/GameStateManager.ts`: Initializes and manages zones (`state.sharedZones.expedition`).
  - `src/engine/types/zones.ts`: Defines `IZone`, `ZoneIdentifier`.
  - `src/engine/types/enums.ts`: `ZoneIdentifier` enum.
- **Details/Discrepancies:**
  - 1.2.3.a (Sets of cards/objects): `IZone.entities`.
  - 1.2.3.b (Ten zone types): `ZoneIdentifier` enum lists them.
  - 1.2.3.c (Expedition sub-zones): These are conceptual (Hero/Companion for each player) rather than distinct `IZone` instances. Logic like `IPlayer.expeditionState` or `IGameObject.expeditionAssignment` differentiates them within the shared expedition zone.
  - 1.2.3.d (Shared zones: Adventure, Expedition zone, Limbo):
    - Adventure, Limbo: Correctly implemented as shared in `GameStateManager.state.sharedZones`.
    - Expedition zone: Now correctly implemented as a single shared zone (`GameStateManager.state.sharedZones.expedition`). Player-specific views are achieved by filtering its contents by `controllerId`.
  - 1.2.3.e (Personal zones): `Deck, DiscardPile, Hand, HeroZone, LandmarkZone, ManaZone, Reserve` are correctly per-player.
  - 1.2.3.f (Visible zones): Adventure, DiscardPile, ExpeditionZone, HeroZone, LandmarkZone, Limbo, ManaZone, Reserve have `visibility: 'visible'`.
  - 1.2.3.g (Hidden zones): Deck, Hand have `visibility: 'hidden'`.

##### 1.2.4 Abilities

- **Status:** Partially Implemented
- **Code References:**
  - `src/engine/types/abilities.ts`: Defines `IAbility`, `AbilityType`.
  - `src/engine/PlayerActionHandler.ts`: For Quick Actions.
  - `src/engine/AdvancedTriggerHandler.ts` & `src/engine/ReactionManager.ts`: For Reactions.
  - `src/engine/RuleAdjudicator.ts`: For Passive abilities.
  - `src/engine/EffectProcessor.ts`: For Effects.
  - `src/engine/SupportAbilityHandler.ts`: For support abilities.
- **Details/Discrepancies:**
  - 1.2.4.a (Paragraph is an ability): Parsing card text into `IAbility[]` is a pre-engine step.
  - 1.2.4.b (Keywords as abilities): `IAbility.keyword` can store this.
  - 1.2.4.c (Four types of abilities): `AbilityType` enum (`QuickAction`, `Reaction`, `Passive`, `Effect`).
    - Quick actions: `PlayerActionHandler.ts`.
    - Reactions: `AdvancedTriggerHandler.ts` identifies triggers, `ReactionManager.ts` (if used as per previous audit, or general reaction loop) would manage resolution.
    - Passive abilities: `RuleAdjudicator.ts` applies these.
    - Effects: `EffectProcessor.ts` resolves these (often as part of other ability types).
  - 1.2.4.d (Ability scope - where they work): This is critical and complex.
    - Non-Hero objects in play: `RuleAdjudicator.getAllPlayObjects()` filters for this for passives. Other handlers need similar checks.
    - Heroes in Hero zone: Logic in ability handlers needs to verify Hero's location.
    - Support abilities in Reserve (ready): `SupportAbilityHandler.ts` and `StatusEffectHandler.hasSupportAbilities()` (checks for not exhausted).
    - Emblems in Limbo: Emblem abilities are resolved by `EffectProcessor.ts` when the emblem is processed.
    - Playable from specific zone: `CardPlaySystem.ts` checks source zone.
    - Cost modification abilities: `CardPlaySystem.calculateModifiedCost()` needs to be ableto find and apply these from any zone the card can be played from.
- **Discrepancies/Bugs:** Full and consistent enforcement of ability scope (1.2.4.d) across all ability types and handlers is a complex ongoing task. For example, ensuring a passive ability on a card in hand doesn't apply unless it's a known "works from hand" ability (like Scout).

##### 1.2.5 Costs

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ManaSystem.ts`: Mana payment.
  - `src/engine/CostProcessor.ts`: General cost payment.
  - `src/engine/CardPlaySystem.ts`: Orchestrates cost payment for playing cards.
  - `src/engine/types/costs.ts` / `src/engine/types/abilities.ts` (for `ICost` structure).
- **Details/Discrepancies:**
  - 1.2.5.a (Change to game state): `CostProcessor.pay()` enacts changes (mana, exhaust, counters).
  - 1.2.5.b (Not forced to pay): Player choice is part of game flow before calling payment functions.
  - 1.2.5.c (Pay in full): `CostProcessor.canPay()` checks this.
  - 1.2.5.d (Simultaneous payment): `CostProcessor.pay()` handles all components of a defined `ICost` atomically.
  - 1.2.5.e (Mana cost by exhausting orbs): `ManaSystem.spendMana()` (called by `CostProcessor.pay()`) handles this.

##### 1.2.6 Effects

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/EffectProcessor.ts`: Core for resolving effects.
  - `src/engine/types/abilities.ts`: `IEffect`, `IEffectStep`.
- **Details/Discrepancies:**
  - 1.2.6.a (Change to game state): Purpose of `EffectProcessor.ts`.
  - 1.2.6.b (Multiple steps): `IEffect.steps` array, processed sequentially by `EffectProcessor.resolveEffect`.
  - 1.2.6.c (Targeting): `IEffectStep.target` and `EffectProcessor.resolveTargets`.
  - 1.2.6.d (Optional "may"): `IEffectStep.isOptional` and `EffectProcessor.shouldExecuteOptionalEffect` (player choice mechanism needed).
  - 1.2.6.e (Conditional "If"): `IEffectStep.condition` (needs implementation for evaluation).
  - 1.2.6.f (Partial failure ignored): `EffectProcessor.resolveEffectStep` has error handling to continue with other steps/effects.

##### 1.2.7 Events

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/EventBus.ts`: Manages event publishing and subscription.
  - Various systems publish events (e.g., `GameStateManager.moveEntity`, `PhaseManager`).
- **Details/Discrepancies:**
  - 1.2.7.a (Change from one game state to next): `EventBus` notifications represent these.
  - 1.2.7.b (Paying cost is single event): `CostProcessor.pay()` could publish a single "costPaid" event.
  - 1.2.7.c (Different event for each step in effect): `EffectProcessor.resolveEffectStep` could publish an event after each step resolution.
  - 1.2.7.d (Events with no change): Possible if an effect resolves with no net change, an event could still be published.

#### 1.3 Game Progress

##### 1.3.1 Starting the Game

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/GameStateManager.ts`: `initializeGame()`, `initializeAdventureZones()`, `initializePlayerState()`, `placeHeroInZone()`, `initializePlayerDeck()`, `initializeManaOrbs()`.
  - `src/engine/PhaseManager.ts`: `handleFirstMorning()`.
- **Details/Discrepancies:**
  - 1.3.1.a (Adventure setup): `initializeAdventureZones()` in `GameStateManager.ts`.
  - 1.3.1.b (Expedition counters): `IPlayer.expeditionState` initialized in `initializePlayerState()`.
  - 1.3.1.c (Hero placement, deck shuffle): `placeHeroInZone()` and `initializePlayerDeck()` in `GameStateManager.ts`.
  - 1.3.1.d (First player random): `initializeGame()` in `GameStateManager.ts` sets a first player (currently defaults to player 1, true randomness could be added).
  - 1.3.1.e (Initial draw and mana): `drawCards()` and `initializeManaOrbs()` in `initializePlayerState()`. This happens during setup, and then `PhaseManager.handleFirstMorning` skips normal morning effects, aligning with the rule.

##### 1.3.2 Day Progress

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/PhaseManager.ts`: Manages phase transitions and daily effects.
  - `src/engine/TurnManager.ts`: Manages turns within Afternoon.
  - `src/engine/GameStateManager.ts`: Logic for specific daily effects.
- **Details/Discrepancies:**
  - 1.3.2.a (Day divided into five phases): `GamePhase` enum and `PhaseManager.advancePhase()`.
  - 1.3.2.b (Morning): `PhaseManager.handleSubsequentMorning()` orchestrates Succeed (`TurnManager.succeedPhase`), Prepare (`GameStateManager.preparePhase`), Draw (`GameStateManager.drawCards`), Expand (`PhaseManager.handleExpandPhase`).
  - 1.3.2.c (Noon): `PhaseManager.executeNoonPhase()` advances phase; "At Noon" reactions handled by `AdvancedTriggerHandler.processPhaseTriggersForPhase()`.
  - 1.3.2.d (Afternoon): `TurnManager.ts` and `PhaseManager.executeAfternoonPhase()` handle turns, quick actions, playing cards/passing.
  - 1.3.2.e (Dusk): `PhaseManager.handleDusk()` calls `GameStateManager.progressPhase()`. `expeditionShouldMove()` checks conditions (terrain, greater than opponent, greater than zero).
  - 1.3.2.f (Night): `PhaseManager.handleNight()` orchestrates Rest (`GameStateManager.restPhase`), Clean-up (`GameStateManager.cleanupPhase`), Check Victory (`GameStateManager.checkVictoryConditions`).

##### 1.3.3 Ending the Game

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/GameStateManager.ts`: `checkVictoryConditions()`, `setGameWinner()`, `enterTiebreakerMode()`.
  - `src/engine/TiebreakerSystem.ts`: Handles detailed tiebreaker logic.
- **Details/Discrepancies:**
  - 1.3.3.a (Check Victory condition): `checkVictoryConditions()` in `GameStateManager.ts` and `TiebreakerSystem.ts` (`checkForTiebreaker`).
  - 1.3.3.b (Win condition - total distance): Implemented.
  - 1.3.3.c-f (Tiebreakers): `TiebreakerSystem.ts` handles Arena setup, modified Dusk, and win conditions.

#### 1.4 Golden Rules

##### 1.4.1 Can’t Beats Can

- **Status:** Fully Implemented
- **Code References:** `src/engine/RuleAdjudicator.ts`, `src/engine/EffectProcessor.ts`, `src/engine/types/abilities.ts` (for `IEffectStep.canBeModified`). Various validation checks.
- **Details/Discrepancies:** This is a core principle.
  - 1.4.1.a (Impossible thing cannot be done): Enforced by validation logic before actions (e.g., `CostProcessor.canPay`).
  - 1.4.1.b (Impossible cost): `CostProcessor.canPay()` prevents payment.
  - 1.4.1.c (Impossible effect part ignored): `EffectProcessor.ts` generally attempts to resolve what it can.
  - 1.4.1.d (Cannot modify impossible event): Implemented via the Modifier System (see Section 6.2). Effect steps can be marked with a 'canBeModified: false' flag, which prevents the EffectProcessor from applying any further modifiers (replacing or additive) to them. This ensures that rules stating an event cannot be modified are respected.

##### 1.4.2 Specific Beats General

- **Status:** Partially Implemented (Design Principle)
- **Code References:** `src/engine/RuleAdjudicator.ts` (passive ability ordering). Effect definitions.
- **Details/Discrepancies:** Card-specific abilities should override general rules. This is handled by the specificity of effect definitions and the passive ability application order (Rule 2.3.3, partially implemented in `RuleAdjudicator.ts`).

##### 1.4.3 My Cards, My Zones

- **Status:** Fully Implemented
- **Code References:** `src/engine/GameStateManager.ts` (`moveEntity` method).
- **Details/Discrepancies:** `moveEntity` redirects to owner's corresponding zone if a card would go to another player's personal zone.

##### 1.4.4 New Zone, New Object

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ObjectFactory.ts`: Creates new object instances.
  - `src/engine/GameStateManager.ts` (`moveEntity` method).
- **Details/Discrepancies:** `moveEntity` creates new `IGameObject` instances with new IDs and timestamps when cards move to visible zones, aligning with Rule 2.1.d. Token destruction (Rule 2.1.e) is also handled.

##### 1.4.5 Initiative Order

- **Status:** Partially Implemented
- **Code References:**
  - `src/engine/TurnManager.ts`: Sets `firstPlayerId` and `currentPlayerId`.
  - Applicable in areas like `GameStateManager.cleanupPhase` (TODO for choices) and multi-target effects.
- **Details/Discrepancies:** Initiative is tracked. Rule 6.1.h (simultaneous decisions made in initiative order) needs consistent application across all relevant game steps (e.g., "Each player..." effects, Clean-up choices). `PhaseManager.handleExpandPhase` currently iterates players but may need explicit initiative order if choice becomes more complex.

##### 1.4.6 Nothing Is Forever

- **Status:** Not Implemented
- **Code References:** N/A
- **Details/Discrepancies:**
  - 1.4.6.b (Quick action limit 100/day): No tracking implemented.
  - 1.4.6.c (Reaction limit 100/day): No tracking implemented.

##### 1.4.7 Who Did That?

- **Status:** Fully Implemented (Implicitly by design)
- **Code References:** Effect definitions, `EffectProcessor.ts`.
- **Details/Discrepancies:** The rules for determining action controller (Rules 7.5.5.b-e) are generally handled by:
  - 1.4.7.b (Effect specifies player): Effect definition targets a specific player.
  - 1.4.7.c (Controller of effect): `EffectProcessor.ts` uses the `controllerId` of the ability/spell.
  - 1.4.7.d (Controller of affected object): For abilities inherent to an object, its controller is the default.
  - 1.4.7.e (Neither player): Game rule actions (like phase changes).
    This is consistently applied by how effects are structured and processed.

### Section 2: Objects

#### 2.1 General

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ObjectFactory.ts`
  - `src/engine/GameStateManager.ts` (`moveEntity`, `eventBus`)
  - `src/engine/types/objects.ts` (`IGameObject`, `ICardInstance`, `ZoneEntity`)
  - `src/engine/types/enums.ts` (`CardType`, `ZoneIdentifier`)
- **Details/Discrepancies:**
  - **2.1.a (Objects in visible zones):** `IGameObject` instances are used for entities in visible zones. `ZoneEntity` can be `IGameObject` or `ICardInstance`.
  - **2.1.b (Object representation):** `ICardDefinition` for cards, token definitions for tokens, `IEmblemObject` for emblems. Adventure cards are conceptual entities in `adventureZone`.
  - **2.1.c (Objects don't change zones - Golden Rule 1.4.4):** `moveEntity` in `GameStateManager.ts` creates new `IGameObject` instances via `ObjectFactory.createGameObject()` when representations move to visible zones.
  - **2.1.d (Moving an object - new object, new timestamp, old object gone):** `GameStateManager.moveEntity` + `ObjectFactory.createGameObject()` (assigns new `objectId`, `timestamp`). The old object is removed from the source zone. LKI for reactions is a conceptual requirement for `AdvancedTriggerHandler.ts`.
  - **2.1.e (Token leaving Expedition zone ceases to exist):** `GameStateManager.moveEntity` has specific logic:
    ```typescript
    if (definition.type === CardType.Token && fromZone.zoneType === ZoneIdentifier.Expedition) {
    	this.eventBus.publish('entityCeasedToExist', { entity: sourceEntity, from: fromZone });
    	// ... remove from sourceZone ...
    	return null; // Token ceases to exist instead of moving
    }
    ```
    This correctly implements the rule.
  - **2.1.f (Ability refers to object moving to visible zone - can find new object):** Partially Implemented. This relies on how `AdvancedTriggerHandler.ts` and `EffectProcessor.ts` handle effects for objects that have just moved. If an effect from the "old" object needs to affect the "new" object, it typically would need to re-target based on `definitionId` or be part of the same chain of events where the new object's ID is passed along. Rule 6.3.j is key here.
  - **2.1.g (Rule 2.1.f through multiple zone changes by same ability):** Partially Implemented. Similar to 2.1.f, depends on robust effect chaining and object identity tracking through transitions.
  - **2.1.h (Effect asking for info about non-existent object - use LKI):** Partially Implemented. If an `IGameObject` is removed, its data is gone. LKI would need to be explicitly captured by the system triggering the effect (e.g., `AdvancedTriggerHandler` might pass LKI of the triggering object if it's about to be removed/changed).
  - **2.1.i (Non-existent object cannot move):** Fully Implemented. `moveEntity` requires a valid `sourceEntity` found in the `fromZone`.
  - **2.1.j (Cards in hidden zones are not objects):** Fully Implemented. `ICardInstance` for hidden zones, `IGameObject` for visible. `ObjectFactory.createGameObject` converts.
  - **2.1.k (Zones are not objects):** Fully Implemented. `IZone` is distinct from `IGameObject`.
  - **2.1.l (Counters are not objects):** Fully Implemented. `IGameObject.counters` is a property.

#### 2.2 Characteristics

- **Status:** Fully Implemented (data representation), Partially Implemented (dynamic application of some characteristic-related rules like ability scopes).
- **Code References:**

  - `src/engine/types/cards.ts` (`ICardDefinition`, `ITerrainStats`, `IAbility`)
  - `src/engine/types/objects.ts` (`IGameObject`, `IEmblemObject`, `IHeroObject`)
  - `src/engine/types/enums.ts` (`CardType`, `SubType`, `Rarity`, `Faction`, `PermanentZoneType`, `EmblemSubType`)
  - `src/engine/ObjectFactory.ts`
  - `src/engine/RuleAdjudicator.ts` (for applying passives that modify characteristics)
  - `src/engine/SupportAbilityHandler.ts`
  - `src/engine/StatusEffectHandler.ts` (for exhausted state affecting support abilities)

- **Details/Discrepancies:**

  - **2.2.1 Type:** Fully Implemented.
    - `CardType` enum. `IGameObject.type`. Token type is Character. Region type for adventure cards. Mana Orb type set. Emblem type. Rules 2.2.1.h/i (distinction between "a [type]" in play vs. checking card's type) handled by contextual game logic.
  - **2.2.2 Sub-types:** Fully Implemented.
    - `IGameObject.subTypes` (array of `SubType` or strings). Token sub-types from definition. Region sub-types (terrains). Emblem sub-types (`EmblemSubType`). Rules 2.2.2.n/o (in play vs. card check) contextual. Rule 2.2.2.p (gain/lose types means sub-types) - `RuleAdjudicator.ts` would modify `currentCharacteristics.subTypes`.
  - **2.2.3 Zone Type (Permanents):** Fully Implemented.
    - `PermanentZoneType` enum. `IPermanentObject.permanentZoneType` (from `ICardDefinition`). `CardPlaySystem.ts` routes to correct zone.
  - **2.2.4 Name:** Fully Implemented.
    - `IGameObject.name` (from `ICardDefinition.name`). Token names from definition. Emblems have descriptive names, not card names.
  - **2.2.5 Rarity:** Fully Implemented (as data).
    - `Rarity` enum, `ICardDefinition.rarity`. Not typically a runtime factor unless specific effects check it. Heroes, regions, tokens, emblems effectively have no rarity or a default that isn't used by rules.
  - **2.2.6 Version (Collector Number):** Fully Implemented (as data).
    - `ICardDefinition.id` (often includes set/number) and `ICardDefinition.version` or `collectorNumber`. Not typically runtime logic.
  - **2.2.7 Hand Cost:** Fully Implemented.
    - `ICardDefinition.handCost`. Token hand cost 0 (by definition). Emblems no hand cost.
  - **2.2.8 Reserve Cost:** Fully Implemented.
    - `ICardDefinition.reserveCost`. Token reserve cost 0 (by definition). Emblems no reserve cost.
  - **2.2.9 Faction:** Fully Implemented.
    - `Faction` enum, `ICardDefinition.faction`. Tokens/Emblems no faction (by definition/creation logic).
  - **2.2.10 Statistics:** Fully Implemented.
    - `ITerrainStats` (`V`, `M`, `O`) in `ICardDefinition.statistics`, copied to `IGameObject.baseCharacteristics.statistics` and `currentCharacteristics.statistics`. Only Characters have stats (enforced by card definitions). Token stats from definition.
  - **2.2.11 Abilities:** Partially Implemented (Scope enforcement is key).
    - `IGameObject.abilities` (array of `IAbility`). Flavor text ignored.
    - Support abilities: `IAbility.isSupportAbility` flag. "I" symbol is parser concern.
    - Token abilities from definition.
    - **Ability Scope (2.2.11.g-j):**
      - (g) In play (Expedition/Landmark): `RuleAdjudicator.getAllPlayObjects()`. Other handlers need similar zone checks.
      - (h) Heroes in Hero Zone: Hero ability usage must verify Hero is in `player.zones.heroZone`.
      - (i) Support abilities in Reserve: `SupportAbilityHandler.ts`.
      - (j) Exhausted objects in Reserve have no support abilities: `StatusEffectHandler.hasSupportAbilities()` checks this.
    - Types (Quick, Reaction, Passive, Effect): `AbilityType` enum.
  - **2.2.12 Reserve Limit (Heroes):** Fully Implemented.
    - `ICardDefinition.reserveLimit` for Heroes, copied to `IHeroObject` then `IGameObject.currentCharacteristics.reserveLimit`. Default (2 if no Hero) in `GameStateManager.cleanupPhase`.
  - **2.2.13 Landmark Limit (Heroes):** Fully Implemented.
    - `ICardDefinition.landmarkLimit` for Heroes, copied as above. Default (2 if no Hero) in `GameStateManager.cleanupPhase`.
  - **2.2.14 Duration (Ongoing Emblems):** Fully Implemented.
    - `IEmblemObject.duration` (`'this turn'`, `'this Afternoon'`, `'this Day'`). Emblem expiry handled by `PhaseManager.ts` checking and removing emblems.
  - **2.2.15 Timestamp:** Fully Implemented.
    - `IGameObject.timestamp` from `ObjectFactory.getNewTimestamp()`.
    - Simultaneous entry ordering (2.2.15.d): Currently, `ObjectFactory.getNewTimestamp()` assigns unique incrementing timestamps as objects are created sequentially by an effect. True player choice for relative order of simultaneous timestamp assignment is not implemented.

#### 2.3 Applying Passive Abilities

- **Status:** Partially Implemented.
- **Code References:**
  - `src/engine/RuleAdjudicator.ts`
  - `src/engine/PassiveAbilityManager.ts` (Note: `RuleAdjudicator.ts` seems to be the primary system for Rule 2.3)
- **Details/Discrepancies:**
  - **2.3.1 Base Characteristics:**
    - (a,b) `IGameObject.baseCharacteristics` vs. `currentCharacteristics`.
    - (c-f) Missing characteristics handled by TypeScript optionals/defaults.
    - (g-j) `RuleAdjudicator.applyAbility` modifies `currentCharacteristics`. Filters for "in play". Continuous application via re-applying all passives (`applyAllPassiveAbilities`) after events.
    - (k,l,m) Re-evaluation process: `RuleAdjudicator.applyAllPassiveAbilities` resets to base, gathers, sorts, and applies. Order by timestamp and dependency (dependency is simplified).
  - **2.3.2 Dependency:** Partially Implemented.
    - `RuleAdjudicator.doesADependOnB` is a placeholder. Full dependency checking logic (2.3.2.c-g) is complex and not implemented. This is a significant gap for correct application order.
  - **2.3.3 Order of Application:** Partially Implemented.
    - `RuleAdjudicator.sortAbilitiesByDependency` currently sorts by timestamp due to lack of full dependency logic. "Free from dependency" (2.3.3.a) concept is not fully realized.
- **Discrepancies/Bugs:**
  - Full dependency checking (2.3.2) for passive ability application order is missing. Current timestamp-first sorting is a simplification.
  - Clarification of roles between `PassiveAbilityManager.ts` and `RuleAdjudicator.ts` might be needed if both are active.

#### 2.4 Statuses

- **Status:** Fully Implemented.
- **Code References:**
  - `src/engine/StatusEffectHandler.ts`
  - `src/engine/types/objects.ts`: `IGameObject.statuses` (Set).
  - `src/engine/types/enums.ts`: `StatusType` enum.
  - `src/engine/GameStateManager.ts` (for calling status interactions during phases).
- **Details/Discrepancies:**
  - **2.4.1 General:**
    - (a) Status list: `StatusType` enum.
    - (b) Objects can have statuses: `IGameObject.statuses`.
    - (c) No status in Discard/Deck/Hand: When entities move to these zones, they become `ICardInstance` or lose statuses.
    - (d) New object no status: `ObjectFactory.createGameObject` initializes `statuses: new Set()`.
    - (e) Statuses change by effect: `StatusEffectHandler.ts` methods.
    - (f) Cannot gain existing status: `Set.add` handles this.
    - (g) Re-gaining status can trigger reactions: The attempt to grant (even if already present) should still fire events that reactions can pick up. `StatusEffectHandler.applyStatusEffect` adds, event bus fires.
    - (h) Cannot lose non-existing status: `Set.delete` handles this; `StatusEffectHandler.removeStatusEffect` checks first.
  - **2.4.2 Anchored:** Fully Implemented.
    - `StatusEffectHandler.processAnchoredDuringRest` (called from `GameStateManager.restPhase` via `checkStatusInteraction`) implements not sending to Reserve and losing Anchored.
  - **2.4.3 Asleep:** Fully Implemented.
    - Stats not counted: `GameStateManager.calculateExpeditionStats` checks `object.statuses.has(StatusType.Asleep)`.
    - Not sent to Reserve, loses Asleep: `StatusEffectHandler.processAsleepDuringRest` (called from `GameStateManager.restPhase`).
  - **2.4.4 Boosted:** Fully Implemented.
    - (a) Has boost counter: `StatusEffectHandler.isBoosted()`.
    - (b) Status changes automatically: `StatusEffectHandler.updateBoostedStatus` adds/removes `StatusType.Boosted` based on `CounterType.Boost` presence. Called via `updateAutomaticStatuses`.
  - **2.4.5 Exhausted:** Fully Implemented.
    - (a) Gained by costs/effects.
    - (b) Ready = not exhausted: Implicit.
    - (c) Exhausted in Reserve cannot be played: `CardPlaySystem.canPlayCard()` checks `StatusEffectHandler.canPlayFromReserve()`.
    - (d) Passive to play exhausted from Reserve: `CardPlaySystem.canPlayCard()` would need to check for such passives.
    - (e) Exhausted in Reserve no support abilities: `StatusEffectHandler.hasSupportAbilities()`.
  - **2.4.6 Fleeting:** Fully Implemented.
    - (a) Gained when played from Reserve (in Limbo): `CardPlaySystem.playCard` calls `StatusEffectHandler.applyFleetingOnPlayFromReserve`. Timing (in Limbo vs. on entry to final zone) needs care (see 5.2.1.b).
    - (b) Spells with Fleeting passive: `CardPlaySystem.playCard` should check `cardDefinition.abilities` for passive Fleeting and apply status.
    - (Remark: Landmark Permanents cannot gain Fleeting): `StatusEffectHandler.applyStatusEffect` should prevent Fleeting application to Landmark types.
    - (c) Fleeting char/expedition perm enters from Limbo, gains Fleeting: Handled by play logic.
    - (d) Fleeting char/expedition perm goes to discard from expedition (instead of Reserve): `StatusEffectHandler.processFleetingDuringRest` (called from `GameStateManager.restPhase`).
    - (e) Fleeting spell discarded after resolution: `CardPlaySystem.playSpell` handles this.

#### 2.5 Counters

- **Status:** Fully Implemented.
- **Code References:**
  - `src/engine/types/objects.ts`: `IGameObject.counters` (`Map<CounterType, number>`).
  - `src/engine/types/enums.ts`: `CounterType` enum.
  - `src/engine/GameStateManager.ts` (`moveEntity` for counter retention/loss).
  - `src/engine/ObjectFactory.ts` (for starting counters).
- **Details/Discrepancies:**
  - **2.5.a (Counters on objects):** `IGameObject.counters`.
  - **2.5.b (No counters in Discard/Deck/Hand):** `GameStateManager.moveEntity` ensures new instances in hidden zones don't get counters from the old object, and counters are cleared if moving to Discard.
  - **2.5.c (Names):** `CounterType` enum.
  - **2.5.d (Indistinguishable):** `Map` with count per `CounterType`.
  - **2.5.e (Starting counters on Heroes):** `ICardDefinition.startingCounters`, applied by `ObjectFactory.createGameObject`.
  - **2.5.f (Gain counters):** Effects modify `IGameObject.counters`.
  - **2.5.g (Remove counters):** Effects modify `IGameObject.counters`, cannot go below zero.
  - **2.5.h (Spend counters):** Cost payment logic (`CostProcessor.ts`) modifies `IGameObject.counters`.
  - **2.5.i (Most counters no intrinsic impact):** True.
  - **2.5.j (Lose all counters when moving from Exp/Landmark to another zone):**
    - `GameStateManager.moveEntity` logic for `countersToKeep`:
      ```typescript
      if (sourceGameObject && !isMovingToLosingZone) {
      	if (fromZoneIsReserveOrLimbo) {
      		countersToKeep = sourceGameObject.counters;
      	} else if (fromZoneIsExpeditionOrLandmark && toZone.zoneType === ZoneIdentifier.Reserve) {
      		if (sourceGameObject.abilities.some((a) => a.keyword === 'Seasoned')) {
      			// Seasoned check
      			if (sourceGameObject.counters.has(CounterType.Boost)) {
      				countersToKeep.set(
      					CounterType.Boost,
      					sourceGameObject.counters.get(CounterType.Boost)!
      				);
      			}
      		}
      	}
      }
      // newObject.counters = countersToKeep;
      ```
    - **Verification:** Rule 2.5.j (lose all counters when moving from Exp/Landmark unless specified) confirmed. The `moveEntity` logic in `GameStateManager.ts` correctly initializes `countersToKeep` as empty, ensuring counters are lost by default. Exceptions, like 'Seasoned' allowing Boost counters to be kept when moving to Reserve, are handled. Added specific unit tests to `GameStateManager.test.ts` covering moves from Expedition/Landmark to Reserve (with/without Seasoned), Hand, Limbo, and Discard, all of which passed and confirm the correct behavior.
  - **2.5.k (Keep counters from Reserve/Limbo to another visible zone, unless to Discard):** Fully Implemented. `GameStateManager.moveEntity` logic: `if (fromZoneIsReserveOrLimbo)` then `countersToKeep = sourceGameObject.counters` (if not moving to a losing zone like Discard).
  - **2.5.1 Boost Counters:** Fully Implemented.
    - (a) `CounterType.Boost`.
    - (b) Adds +1/+1/+1 to stats: `GameStateManager.calculateExpeditionStats` adds `boostCount` from `object.counters.get(CounterType.Boost)`.

### Section 3: Zones

#### 3.1 Zone Properties

- **Status:** Fully Implemented (with noted discrepancy for Expedition Zone shared status).
- **Code References:**

  - `src/engine/Zone.ts` (`BaseZone`, `GenericZone`, `DeckZone`, `HandZone`, `DiscardPileZone`, `LimboZone`)
  - `src/engine/GameStateManager.ts` (`initializeGameState`, `moveEntity`)
  - `src/engine/types/zones.ts` (`IZone`, `ZoneEntity`)
  - `src/engine/types/enums.ts` (`ZoneIdentifier`, `Visibility`)
  - `src/engine/types/objects.ts` (`IGameObject`, `ICardInstance`)

- **Details/Discrepancies:**
  - **3.1.1 General:**
    - **3.1.1.a (Zone is a set of objects or cards):** Fully Implemented. `IZone.entities` (Map of `ZoneEntity`, which is `IGameObject` or `ICardInstance`).
    - **3.1.1.b (Zones always exist, even if empty):** Fully Implemented. Zones are properties of `IPlayer` or `IGameState.sharedZones`, initialized and persistent.
    - **3.1.1.c (Ten kinds of zones):** Fully Implemented. `ZoneIdentifier` enum matches the list.
  - **3.1.2 Shared or Personal:**
    - **3.1.2.a (Shared zones: Adventure, Expedition zone, Limbo):** Fully Implemented.
      - Adventure, Limbo: Correctly in `GameStateManager.state.sharedZones`.
      - Expedition Zone: Now correctly implemented as a single shared zone (`GameStateManager.state.sharedZones.expedition`).
    - **3.1.2.b (Personal zones):** Fully Implemented. `Deck, Hand, HeroZone, LandmarkZone, ManaZone, Reserve, DiscardPile` are properties of `IPlayer.zones`.
    - **3.1.2.c (Card to owner's zone if sent to other's personal zone):** Fully Implemented. `GameStateManager.moveEntity` handles redirection to the owner's correct personal zone.
  - **3.1.3 Visible or Hidden:**
    - **3.1.3.a (Visible zones contain objects):** Fully Implemented. `IZone.visibility` is `Visibility.Visible`. Entities are `IGameObject`.
    - **3.1.3.b (All players know number/characteristics in visible zones):** Fully Implemented (Engine Access). Engine has full access. UI would filter for player view.
    - **3.1.3.c (Face-down cards in visible zones):** Fully Implemented. `IGameObject.faceDown` property. Mana Orbs are face-down `IGameObject`s of type `CardType.ManaOrb`. Tumult cards in Adventure are also initially face-down.
    - **3.1.3.d (Hidden zones contain cards):** Fully Implemented. `DeckZone` and `HandZone` have `visibility: Visibility.Hidden`. Entities are `ICardInstance`.
    - **3.1.3.e (All players know number of cards in hidden zones):** Fully Implemented. `IZone.getCount()`.
    - **3.1.3.f (Players cannot look at cards in hidden zones unless allowed):** Fully Implemented (Engine Control). Engine controls data access. Effect logic (e.g., reveal hand) would temporarily grant access.
  - **3.1.4 In Play:**
    - **3.1.4.a (Object "in play" if in Expedition or Landmark zone):** Fully Implemented (Conceptual). This definition is used by other systems like `RuleAdjudicator.getAllPlayObjects()` to filter objects for passive ability application and by ability handlers to check scope.

#### 3.2 Zone-specific Rules

- **3.2.1 Adventure Zone:** Fully Implemented.

  - **Code References:** `GameStateManager.initializeAdventureZones()`, `GameStateManager.enterTiebreakerMode()`, `state.sharedZones.adventure`.
  - (a) Shared, visible: Yes. Remark on face-down Tumults: Handled.
  - (b) Regular play layout: Hero region, 6 Tumult regions, Companion region. Handled.
  - (c) Tiebreakers (Arena): `enterTiebreakerMode` replaces regions with Arena. Handled.

- **3.2.2 Deck Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`DeckZone`), `player.zones.deckZone`.
  - (a) Personal, hidden: Yes.
  - (b) Ordered pile (top, bottom): `DeckZone` methods (`removeTop`, `addBottom`, `shuffle`) provide this abstraction.
  - (c) Affecting specific positions: `removeTop`, `addBottom` exist. Other positions would need new methods.
  - (d) Deck empty, shuffle discard: `GameStateManager.drawCards()` implements this.
  - (e) Still no card after reshuffle: `drawCards()` handles this (draw stops).
  - (f) Moving to specific position, not enough cards (top/bottom): `addTop`/`addBottom` handle this. "X cards from top/bottom" for other operations not generally implemented.

- **3.2.3 Discard Pile Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`DiscardPileZone`), `player.zones.discardPileZone`.
  - (a) Personal, visible: Yes.

- **3.2.4 Expedition Zone:** Fully Implemented.

  - **Code References:** `GameStateManager.state.sharedZones.expedition` (`GenericZone`).
  - (a) Shared, visible: Fully Implemented. The Expedition Zone is a single shared, visible zone.
  - (b) Sub-zones (Hero/Companion Expeditions): These are conceptual divisions within the shared Expedition Zone. Objects are associated with a player's Hero or Companion expedition via their `controllerId` and an `expeditionAssignment` property (e.g., `{ type: 'Hero' | 'Companion' }`). `IPlayer.expeditionState` tracks positions for Hero and Companion expeditions.
  - (c) Expeditions always exist: The shared zone is initialized. Conceptual player expeditions exist as long as the player exists.
  - (d) Object moving from one Expedition to another does not change zones: Fully Implemented. If an object switches its conceptual expedition (e.g., from Player A's Hero expedition to Player A's Companion expedition via an effect like "Switch Expeditions"), it remains within the single `sharedZones.expeditionZone`. Only its `expeditionAssignment` property changes. This does not trigger "leaves zone" or "enters zone" events for the Expedition Zone itself.
  - (e) Player knows in which Expedition: Game state tracks object locations and their `expeditionAssignment`.

- **3.2.5 Hand Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`HandZone`), `player.zones.handZone`.
  - (a) Personal, hidden: Yes.
  - (b) Owner can look/reorder: Engine access. UI handles view/reorder. `HandZone` (Map) order is by insertion.
  - (c) Acting on card in hand (random/reveal): Effect-specific logic in `EffectProcessor.ts`.

- **3.2.6 Hero Zone:** Fully Implemented.

  - **Code References:** `player.zones.heroZone` (`GenericZone`).
  - (a) Personal, visible: Yes.
  - (b) Up to one Hero: Enforced by setup logic in `GameStateManager.placeHeroInZone()`.

- **3.2.7 Landmark Zone:** Fully Implemented.

  - **Code References:** `player.zones.landmarkZone` (`GenericZone`).
  - (a) Personal, visible: Yes.
  - (b) Landmark limit: `GameStateManager.cleanupPhase` uses `hero.baseCharacteristics.landmarkLimit ?? 2`.

- **3.2.8 Limbo Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`LimboZone`), `state.sharedZones.limbo`.
  - (a) Shared, visible: Yes.

- **3.2.9 Mana Zone:** Fully Implemented.
  - **Code References:** `player.zones.manaZone` (`GenericZone`), `src/engine/ManaSystem.ts`.
  - (a) Personal, visible, contains face-down: Yes.
  - (b) Card enters face-down, exhausted unless specified: Fully Implemented.
    - `GameStateManager.initializeManaOrbsFromHand` (Rule 4.1.k) and `GameStateManager.initializeBoard` correctly set initial mana orbs as face-down, `CardType.ManaOrb`, and **Ready**.
    - `ManaSystem.addCardToMana` (used by "Expand Mana" action - Rule 4.2.1.e) correctly ensures the card becomes a face-down `IGameObject` of `type: CardType.ManaOrb` and is **Exhausted** (Rule 3.2.9.b).
  - (c) Objects are Mana Orbs: Fully Implemented. Handled by the methods mentioned in 3.2.9.b.
  - (d) Player can look at own mana: Engine access. UI rule.
  - (e) Exhaust one Mana Orb to ready another: Fully Implemented. `ManaSystem.convertMana(playerId, orbToExhaustId, orbToReadyId)` handles this, including validation and event publishing.
  - (f) Pay X mana by exhausting X orbs: `ManaSystem.payMana` handles this.
- **Details/Discrepancies:** All previously noted discrepancies for Mana Zone rules are now resolved.

- **3.2.10 Reserve Zone:** Fully Implemented.
  - **Code References:** `player.zones.reserveZone` (`GenericZone`).
  - (a) Personal, visible: Yes.
  - (b) Reserve limit: `GameStateManager.cleanupPhase` uses `hero.baseCharacteristics.reserveLimit ?? 2`.

### Section 4: Game Progression

- **Status:** Partially Implemented. Key areas like reaction checking loop and precise "At [Phase]" trigger timing need more robust implementation.
- **Code References:**

  - `src/engine/GameStateManager.ts` (`initializeGame`, `placeHeroInZone`, `initializePlayerDeck`, `initializeManaOrbs`, `preparePhase`, `progressPhase`, `restPhase`, `cleanupPhase`, `checkVictoryConditions`, `drawCards`, `setCurrentPhase`)
  - `src/engine/PhaseManager.ts` (`advancePhase`, `handleFirstMorning`, `handleSubsequentMorning`, `executeNoonPhase`, `executeAfternoonPhase`, `handleDusk`, `handleNight`, `playerExpand`)
  - `src/engine/TurnManager.ts` (`succeedPhase`, `startAfternoon`, `advanceTurn`, `playerPasses`, `checkPhaseEnd`)
  - `src/engine/TiebreakerSystem.ts` (`checkForTiebreaker`, `initiateTiebreaker`, `processTiebreakerProgress`)
  - `src/engine/AdvancedTriggerHandler.ts` (`processPhaseTriggersForPhase`, `processEventTriggers`)
  - `src/engine/ReactionManager.ts` (or equivalent logic for reaction resolution loop)
  - `src/engine/ObjectFactory.ts` (`createReactionEmblem`)

- **Details/Discrepancies:**

  - **4.1 Beginning of the Game:** Fully Implemented.

    - (a) Zones empty: `initializeGameState` creates new empty zones.
    - (b,c) Adventure setup: `initializeAdventureZones` correctly places Hero/Companion regions and 3 face-down Tumults.
    - (d) Expedition counters: `IPlayer.expeditionState` (positions) initialized.
    - (e-h) Hero presentation/reveal: `placeHeroInZone` adds Hero to Hero Zone.
    - (i) Deck shuffle: `initializePlayerDeck` calls `DeckZone.shuffle()`.
    - (j) Draw 6 cards: `initializePlayerState` calls `drawCards(playerId, 6)`.
    - (k) 3 Mana Orbs ready: `initializeManaOrbs` sets them as `CardType.ManaOrb` and not exhausted.
    - (l) Start first day, skip Morning: `GameStateManager.initializeGame` sets phase to Noon and `firstMorningSkipped = true`. `PhaseManager.handleFirstMorning` correctly skips to Noon logic.

  - **4.2 Day Structure:** Partially Implemented.

    - (a) Five phases: `GamePhase` enum and `PhaseManager.advancePhase()` are correct.
    - (b) "At [Phase]" reactions & check: `GameStateManager.setCurrentPhase` calls `AdvancedTriggerHandler.processPhaseTriggersForPhase()`. These triggers should create Emblem-Reactions in Limbo. The subsequent playing of these emblems (Rule 4.4) is the part that needs a robust loop. The remark about new reactions (e.g., from Dredger Drone) not triggering off the same "At [Phase]" event if they appear _during_ the resolution of an initial "At [Phase]" reaction requires careful sequencing in the reaction handling loop.
    - (c) Daily effects in Morning, Dusk, Night: `PhaseManager` orchestrates these by calling methods in `GameStateManager`.
    - (d,e) Check reactions after _each_ daily effect / next daily effect or phase: This precise looping and checking is not explicitly clear in `PhaseManager`. It currently processes a block of daily effects for a phase (e.g., all of Morning's effects) and then reaction processing would occur. A more granular check-resolve-check loop after _each_ effect (Succeed, then reactions, then Prepare, then reactions, etc.) is implied by the rulebook but likely not implemented this granularly.
    - (f,g) Afternoon turns & reactions: `TurnManager` handles turns. Reaction checking after each turn effect needs to be integrated with the main reaction resolution loop.

  - **4.2.1 Morning:** Fully Implemented (for effects), Partially Implemented (for reaction timing).

    - (a-e) Succeed, Prepare, Draw, Expand are all called by `PhaseManager.handleSubsequentMorning` (or `handleFirstMorning` for initial Expand).
    - `PhaseManager.playerExpand` needs to correctly implement player choice in initiative order if it's not just an automatic "may put one" without collision. Currently, it seems to iterate players.

  - **4.2.2 Noon:** Fully Implemented (for effects), Partially Implemented (for reaction timing).

    - (a) No daily effects. "At Noon" reactions are triggered by `AdvancedTriggerHandler.processPhaseTriggersForPhase(GamePhase.Noon)`. Resolution via reaction loop (Rule 4.4).

  - **4.2.3 Afternoon:** Fully Implemented (for turn structure), Partially Implemented (for reaction timing).

    - (a-e) `TurnManager.ts` handles turn alternation, first player, playing actions/cards, passing, and ending Afternoon. Reaction checking after each action is reliant on the main reaction loop.

  - **4.2.4 Dusk:** Fully Implemented (for effects), Partially Implemented (for reaction timing).

    - (a) One daily effect: Progress.
    - (b) Progress logic: `GameStateManager.progressPhase` with `calculateExpeditionStats` and `expeditionShouldMove`. Conditions (on terrain, > opponent, > 0) are generally handled. Terrain matching for an expedition being _in_ its region's terrain is implicit.
    - (c,d) "Cannot move due to [terrain]" / "Can only move due to [terrain]": These are specific effect types that would modify `IExpeditionState.canMove` or influence stat calculation; not general `progressPhase` logic but supported via effect system.
    - (e,f,g,h) Tie not sufficient, 0 not sufficient, move once, simultaneous move: All correctly handled in `GameStateManager.progressPhase`.
    - (i,j) "Fails to move forward", "Moves forward due to [terrain]": These are definitions. Data is available.

  - **4.2.5 Night:** Fully Implemented (for effects), Partially Implemented (for reaction timing).

    - (a-d) Rest, Clean-up, Check Victory are called by `PhaseManager.handleNight`.
    - Rest: `GameStateManager.restPhase` handles status interactions (Asleep, Anchored, Fleeting via `StatusEffectHandler`) and Eternal (`KeywordAbilityHandler`).
    - Clean-up: `GameStateManager.cleanupPhase` handles limits. Player choice for selection and initiative order for that choice (Rule 6.1.h) is currently a TODO (uses `pop`).
    - Check Victory: `GameStateManager.checkVictoryConditions` calls `TiebreakerSystem.checkForTiebreaker`.

  - **4.3 Tiebreakers:** Fully Implemented.

    - (a-f) `TiebreakerSystem.ts` and relevant calls from `GameStateManager.ts` handle Arena setup, modified Progress (stat summation), and win conditions during tiebreakers. "Check Victory" daily effect has no impact here.

  - **4.4 Checking Reactions:** Partially Implemented.
    - **Code References:** `AdvancedTriggerHandler.ts`, `ReactionManager.ts` (or equivalent game loop logic), `ObjectFactory.createReactionEmblem`.
    - (a) When to check:
      1. Beginning of phase: `AdvancedTriggerHandler.processPhaseTriggersForPhase` identifies "At [Phase]" triggers. These should create Emblem-Reactions.
      2. After daily effect: Needs explicit call to reaction resolution.
      3. After turn effect: Needs explicit call to reaction resolution.
      4. After a player plays a Reaction: The loop itself should re-check.
    - (b) Playing an Emblem-Reaction from Limbo by initiative player: `ObjectFactory.createReactionEmblem` creates emblems. A system (likely in `ReactionManager.ts` or main game loop) needs to:
      - Identify all Emblem-Reactions in Limbo.
      - Allow current initiative player to choose one they control.
      - Resolve its `boundEffect` via `EffectProcessor.ts`.
      - Remove the emblem from Limbo.
    - (c) Check again after Reaction: The loop must continue.
    - (d) Game progresses once Limbo empty: Loop terminates.

- **Discrepancies/Bugs for Section 4:**
  - The main area needing full implementation is the robust **Reaction Checking Loop (4.4)**. While triggers are identified (`AdvancedTriggerHandler`) and emblems can be created (`ObjectFactory`), the process of iterating these emblems in Limbo, respecting initiative, playing them, and re-looping is not clearly defined or fully implemented in the provided file structure (likely intended for `ReactionManager.ts` or a central game loop).
  - The precise timing of reaction checks "after each daily effect" (4.2.d,e) vs. after a block of phase effects needs clarification and implementation.
  - Player choice and initiative order for Clean-up (4.2.5.c) and potentially Expand (4.2.1.e) if choices become contested.
  - The remark for 4.2.b (Dredger Drone example) regarding new "At [Phase]" reactions not re-triggering from the same initial phase event needs to be handled by the reaction sequencing logic.

### Section 5: Playing cards and objects

- **Status:** Partially Implemented. Core structure in `CardPlaySystem.ts` exists, but several key steps and specific card type handling details need full implementation or refinement.
- **Code References:**

  - `src/engine/CardPlaySystem.ts` (main)
  - `src/engine/PlayerActionHandler.ts` (for Quick Actions)
  - `src/engine/ReactionManager.ts` (or game loop for Reactions)
  - `src/engine/GameStateManager.ts` (`moveEntity`)
  - `src/engine/CostProcessor.ts`
  - `src/engine/EffectProcessor.ts`
  - `src/engine/ObjectFactory.ts` (`createGameObject`, `createReactionEmblem`)
  - `src/engine/StatusEffectHandler.ts`
  - `src/engine/types/cards.ts` (`ICardDefinition`, `CardType`)
  - `src/engine/types/objects.ts` (`IGameObject`)
  - `src/engine/types/zones.ts` (`ZoneIdentifier`)
  - `src/engine/types/abilities.ts` (`IAbility`, `ICost`)

- **Details/Discrepancies:**

  - **5.1.1 Timing:**

    - (a) Possibility to play: Fully Implemented (Conceptual through game structure).
    - (b) During turn (card or quick action): Fully Implemented. `PlayerActionHandler.getAvailableActions` and `executeAction` (which calls `CardPlaySystem.playCard` or `executeQuickAction`).
    - (c) Checking reactions (initiative player plays): Partially Implemented. Relies on Rule 4.4's reaction loop which is not fully implemented.
    - (d) Effects instruct to play a card: Partially Implemented. `EffectProcessor.ts` would need to be able to call `CardPlaySystem.playCard`.

  - **5.1.2 Playing process:** Partially Implemented.

    - (a) Card (declare, Limbo, cost, resolve): `CardPlaySystem.playCard` outlines this.
      - `declarePlayIntent` (test stub) - needs full implementation for target/mode choices.
      - `moveToLimbo` (test stub) - needs to use `GameStateManager.moveEntity` to `sharedZones.limbo`.
      - `payCosts` (test stub) - needs to use `CostProcessor.pay`.
      - `resolveCard` (test stub) - needs to move to final zone and trigger effects.
    - (b) Quick action/Reaction (declare, cost, resolve):
      - Quick Action: `PlayerActionHandler.executeQuickAction` should follow this.
      - Reaction: Reaction loop (4.4) should follow this (no cost for reactions).
    - (c) Declaration of intent details: Partially Implemented.
      - Reveal from hidden: Implicit when playing from hand.
      - Modes/alternative costs: `CardPlaySystem.calculateCost` considers `useScoutCost`. General mode selection not implemented.
      - Declare how costs paid: `CostProcessor.canPay` checks, `pay` executes.
    - (d) Mana cost (Hand/Reserve): Fully Implemented. `CardPlaySystem.getPlayingCost`.
    - (e) Cost alterations order (increases, decreases, restrictions): Fully Implemented. `CardPlaySystem.calculateModifiedCost`. Timestamp ordering for multiple same-type restrictions is not explicitly handled.
    - (f) Legality check before state change: Partially Implemented. `CardPlaySystem.validateCanPlay` exists. Needs to be more comprehensive and strictly before any state change.
    - (g) Move card to Limbo: Partially Implemented. `CardPlaySystem.playCard` needs to explicitly call `GameStateManager.moveEntity` to Limbo at the right step.
    - (h) Pay costs simultaneously: Fully Implemented (Conceptual via `CostProcessor.pay`).
    - (i) Resolution steps (destination zones, effects): Partially Implemented.
      - `CardPlaySystem.playCharacter`, `playPermanent`, `playSpell` handle moving to final zones and basic effect processing.
      - Reaction emblems from Limbo are handled by the reaction loop (4.4).
    - (j) "When card is played" trigger timing (leaves Limbo to final zone): Partially Implemented. `AdvancedTriggerHandler` needs to be invoked at this specific point.

  - **5.2 Playing a Card:** Partially Implemented.

    - (a) From Hand/Reserve: Fully Implemented by `CardPlaySystem.playCard` taking `fromZone`.
    - (b) Passive ability granting counter/status on play creates Emblem-Reaction: **Not Implemented.** `CardPlaySystem` doesn't currently check for external passives that modify the card being played by creating an Emblem-Reaction for it to gain/lose counters/statuses upon resolution. This is a complex interaction.
    - **5.2.1 Playing a Character:** Partially Implemented. (`CardPlaySystem.playCharacter`)
      - (a) Choose Expedition: `CardPlayOptions.expeditionChoice` exists, needs full integration.
      - (b) Gains Fleeting if from Reserve (in Limbo): **Discrepancy/Timing.** `StatusEffectHandler.applyFleetingOnPlayFromReserve` is currently called _after_ moving to the final zone. Rule 5.2.1.b states it gains Fleeting _as it enters Limbo_. This timing difference could matter for effects checking status in Limbo.
      - (c) Enters Expedition, gains Fleeting (if had in Limbo): Covered if Fleeting applied correctly in Limbo.
    - **5.2.2 Playing an Expedition Permanent:** Partially Implemented. (`CardPlaySystem.playPermanent`)
      - (a) Choose Expedition: Needs integration similar to Characters.
      - (b) Gains Fleeting if from Reserve (in Limbo): Same timing issue as 5.2.1.b.
      - (c) Enters Expedition, gains Fleeting (if had in Limbo): Covered if Fleeting applied correctly in Limbo.
    - **5.2.3 Playing a Landmark Permanent:** Partially Implemented. (`CardPlaySystem.playPermanent`)
      - (a) Enters Landmark zone: Correctly handled.
      - (Remark: Landmark Permanents cannot have Fleeting): **Discrepancy.** `CardPlaySystem.playPermanent` calls `StatusEffectHandler.applyFleetingOnPlayFromReserve`. This should be prevented for `PermanentZoneType.Landmark`.
    - **5.2.4 Playing a Spell Card:** Partially Implemented. (`CardPlaySystem.playSpell`)
      - (a) Fleeting application order in Limbo: This sequence (from Reserve, then passive Fleeting on card, then external passives) needs to be explicitly implemented when the spell is conceptually in Limbo. `CardPlaySystem.playSpell` currently resolves effects then determines destination/status.
      - (b) Spell resolution & destination (Reserve/Discard, Cooldown): `CardPlaySystem.playSpell` correctly handles moving to Reserve (and exhausting if Cooldown via `StatusEffectHandler.applyStatusEffect`) or Discard (if Fleeting).

  - **5.3 Playing a Quick Action:** Partially Implemented.

    - **Code References:** `src/engine/PlayerActionHandler.ts`
    - (a) Process: `PlayerActionHandler.executeAction` (for 'quickAction') needs to ensure declare intent (implicit), pay costs (`CostProcessor`), and resolve effects (`EffectProcessor`).
    - (b) Control/zone requirements: `PlayerActionHandler.getAvailableQuickActions` needs to check object control and correct zone (in play, or Reserve for support).
    - (c) Not objects, don't change zones: Correct.
    - (d) Symbol T cost (Exhaust me): `ICost.exhaustSelf` handled by `CostProcessor.pay`.
    - (e) Limit 100/day (Rule 1.4.6.b): Not Implemented.

  - **5.4 Playing Reactions:** Partially Implemented.
    - **Code References:** Relies on Reaction Loop (Rule 4.4), `ObjectFactory.createReactionEmblem`, `EffectProcessor.ts`.
    - (a) Process: Reaction loop should handle this.
    - (b) Played from Limbo, don't change zones: Emblem-Reactions are created and exist in Limbo.
    - (c) No costs: Correct.
    - (d) Ceases to exist after resolution: Emblem-Reaction should be removed from Limbo.

- **Discrepancies/Bugs for Section 5:**
  - The precise multi-step playing process (declare, Limbo, cost, resolve) in `CardPlaySystem.playCard` needs to be fully implemented beyond the current stub/test methods.
  - Rule 5.2.b (external passives creating emblems for cards being played) is Not Implemented.
  - Timing of Fleeting application for cards played from Reserve (should be upon entering Limbo, not final zone).
  - Landmark Permanents incorrectly gain Fleeting if played from Reserve.
  - Fleeting application for Spells (Rule 5.2.4.a) needs to correctly model the sequence in Limbo.
  - Quick Action limit (5.3.e) is Not Implemented.
  - The full reaction playing loop (5.4, dependent on 4.4) is not complete.

### Section 6: From Costs and Effects to Events

- **Status:** Partially Implemented. Core concepts of effects and costs are present, but advanced features like the Modifier System and detailed reaction triggering nuances require significant development.
- **Code References:**

  - `src/engine/EffectProcessor.ts`
  - `src/engine/CostProcessor.ts`
  - `src/engine/EventBus.ts`
  - `src/engine/AdvancedTriggerHandler.ts`
  - `src/engine/ObjectFactory.ts` (`createReactionEmblem`)
  - `src/engine/RuleAdjudicator.ts` (potentially for Modifiers if they are passive abilities)
  - `src/engine/types/abilities.ts` (`IEffect`, `IEffectStep`, `ICost`, `IAbilityTrigger`)
  - `src/engine/types/objects.ts` (`IEmblemObject`)

- **Details/Discrepancies:**

  - **6.1 General (Costs & Effects Structure):**

    - (a) Costs/effects are sequences of instructions: Fully Implemented. `IEffect` has `IEffectStep[]`. `ICost` has components.
    - (b) Effect may involve multiple steps: Fully Implemented. `EffectProcessor.resolveEffect` iterates `effect.steps`.
    - (c) Separate step per verb, unless "simultaneously": Fully Implemented. `EffectProcessor.resolveEffectStep` handles one main action. True simultaneity of different verbs is not generally supported beyond atomic actions within one step.
    - (d) Costs always single step: Fully Implemented. `CostProcessor.pay` handles all components of an `ICost` as one atomic operation.
    - (e) Single step, multiple objects -> separate atomic actions: Fully Implemented. `EffectProcessor` methods often iterate targets, applying the action to each.
    - (f) Atomic actions in single step simultaneous: Fully Implemented (Conceptual). Processed sequentially but game state considered changed "at once" for that step.
    - (g) Decisions by controller, before step, impossible options: Partially Implemented. `EffectProcessor.resolveTargets` is basic. A full targeting system would need more robust controller choice, timing, and validation against impossible options (e.g., targeting immune). `PlayerActionHandler.promptForOptionalStepChoice` and other prompt methods handle player choices.
    - (h) Multi-player decisions in initiative order: Partially Implemented. `GameStateManager.state.firstPlayerId` and `currentPlayerId` exist. However, consistent application for "Each player..." effects or choices like in Clean-up (4.2.5.c) is needed in `EffectProcessor` or specific game phase logic.

  - **6.2 Modifiers:**

    - **Status:** Fully Implemented.
    - **Code References:**
      - `src/engine/types/abilities.ts` (for `IModifier` interface, `IEffectStep.canBeModified`)
      - `src/engine/types/enums.ts` (for `ModifierType` enum)
      - `src/engine/RuleAdjudicator.ts` (`getActiveModifiers` method)
      - `src/engine/EffectProcessor.ts` (`resolveSingleStep` method, modifier application logic)
    - **Details/Discrepancies:**
      - The Modifier System allows dynamic alteration of effect step resolution.
      - **Source of Modifiers (6.2.d):** Modifiers are primarily defined by passive abilities on game objects. These abilities use specific effect step verbs: `DEFINE_REPLACEMENT_MODIFIER`, `DEFINE_ADD_STEP_BEFORE_MODIFIER`, or `DEFINE_ADD_STEP_AFTER_MODIFIER`.
      - **Sourcing Modifiers:** The `RuleAdjudicator.getActiveModifiers` method identifies these defining steps in active passive abilities, evaluates their `applicationCriteria` against the current context (e.g., the effect step being processed), and constructs `IModifier` objects.
      - **Modifier Types & Parameters:**
        - `IModifier` objects store their `modifierType` (`ReplaceStep`, `AddStepBefore`, `AddStepAfter`), `priority` (timestamp-based or explicit), `applicationCriteria`, the `replacementEffectStep` or `additionalEffectStep` to be applied, and a `canBeModified` flag for the modifier rule itself (defaulting to true, meta-modification not currently a primary feature).
        - The effect steps introduced by modifiers also respect their own `IEffectStep.canBeModified` flag.
      - **Application (6.2.a, 6.2.b, 6.2.e, 6.2.g, 6.2.h, 6.2.i):**
        - `EffectProcessor.resolveSingleStep` retrieves active modifiers for the current step.
        - Replacing modifiers are applied first (highest priority wins if multiple). If a step is replaced, additive modifiers targeting the original step are ignored (6.2.i).
        - Additive modifiers (`AddStepBefore`, `AddStepAfter`) are applied in order of priority, before or after the main (potentially replaced) step. Their effects are resolved recursively by calling `EffectProcessor.resolveSingleStep`.
      - **Non-Modifiable Steps (6.2.l, 1.4.1.d):** If an `IEffectStep` (whether original or introduced by a modifier) has its `canBeModified` property set to `false`, the `EffectProcessor` will not apply any further modifiers to that specific step. This upholds the "Cannot modify impossible event" principle.
      - **No Self-Modification (6.2.j):** The system inherently prevents direct self-modification as modifiers are fetched and applied to distinct steps. A step introduced by a modifier is treated as a new step subject to its own `canBeModified` flag during its own resolution.
      - **Persistence (6.2.k):** Modifiers are transiently generated by `RuleAdjudicator.getActiveModifiers` based on the current game state (active passive abilities). They cease to "exist" if their source passive ability is no longer active or its conditions no longer met on the next query.
      - **Optional Modifiers with Alternatives (6.2.c):** Rule 6.2.c ("If you don't X, then Y happens") is typically handled by the `IEffectStep` structure itself (e.g., using `isOptional` and conditional follow-up steps or the `CHOOSE_MODE` verb), rather than as a distinct modifier type within this system.

  - **6.3 Reactions:** Partially Implemented.

    - (a) "Trigger -> Effect": Fully Implemented. `IAbility` with `AbilityType.Reaction` and `IAbilityTrigger`.
    - (b) Trigger specifies event and condition: Fully Implemented. `IAbilityTrigger.eventType` and `condition` function.
    - (c) Self-move Reactions (j,h,r): Fully Implemented. Handled as specific `eventType`s (e.g., `ZoneChange_EnterPlay`, `CardPlayed_FromHand`, `CardPlayed_FromReserve`) by `AdvancedTriggerHandler`.
    - (d) Self-move Reaction activation (exists after event, trigger matches): Fully Implemented. `AdvancedTriggerHandler.processMovementAndPlayTriggers` is typically called after the move/play, so the object is in its new state/zone.
    - (e) Other Reaction activation (exists and works before event, trigger matches): Partially Implemented. `AdvancedTriggerHandler` needs to consistently ensure it captures the state of the object _before_ the event for these non-self-move triggers, including checking if the ability was active in its source zone.
    - (f) Multiple activations from single event (distinct atomic actions): Partially Implemented. The event processing loop that calls `AdvancedTriggerHandler` would need to break down multi-target events into individual atomic actions and check triggers for each.
    - (g) Reaction-activating step creates Emblem-Reactions in Limbo: Fully Implemented. `AdvancedTriggerHandler` calls `ObjectFactory.createReactionEmblem` which creates an `IEmblemObject` intended for Limbo.
    - (h) Emblem-Reaction effect bound to trigger objects: Fully Implemented. `createReactionEmblem` stores `sourceObject` and `triggerPayload` in the emblem for its `boundEffect`.
    - (i) Pronoun "I" in Reaction effect: Fully Implemented. Refers to `boundEffect.sourceObjectId` on the emblem.
    - (j) Effect bound to non-existent object uses LKI: Partially Implemented. `EffectProcessor` resolving an emblem's effect would need access to LKI if the `sourceObjectId` no longer exists as a valid `IGameObject`. This LKI capture and provision is not explicitly systemic. (Related to 2.1.h).
    - (k) Trigger condition tense (past/present): Partially Implemented. The `condition` function in `IAbilityTrigger` receives current `GameStateManager`. Accessing past state (LKI of specific objects involved in the trigger) would need to be explicitly passed into the condition or the condition designed to only use the `triggerPayload` which might contain some LKI.
    - (l) Reaction limit 100/day (Rule 1.4.6.c): Not Implemented.

  - **6.4 Costs:** Fully Implemented.

    - (a) Single step: `CostProcessor.pay` is atomic.
    - (b) Player may decline: Handled by game flow before calling `pay`.
    - (c) Pay in full: `CostProcessor.canPay` checks this.
    - (d,e) Decline cost -> go back: UI/game loop responsibility.

  - **6.5 Effects:** Partially Implemented.
    - (a) Usually mandatory: `EffectProcessor.resolveEffectStep` executes steps unless marked optional and player declines (player choice for optional is placeholder).
    - (b) Targets: `EffectProcessor.resolveTargets` is basic. Full system needs: choice from suitable targets, distinct targets per step, no action if no suitable targets.
    - (c) Optional steps ("You may"): `IEffectStep.isOptional` exists. `EffectProcessor.shouldExecuteOptionalEffect` is placeholder for player choice.
    - (d) Conditional steps ("If [condition]"): `IEffectStep.condition` needed for evaluation by `EffectProcessor`.
    - (e) Conditional "If... Otherwise...": Needs specific structure or two conditional steps.
    - (f) Conditional "if you did": Requires tracking success/attempt of first part of a step. Not explicitly supported.
    - (g) Modal effects ("Choose X"): Not supported by `IEffectStep` structure.
    - (h) Partial failure ignored: `EffectProcessor.resolveEffectStep` has try-catch, continues with other steps.
    - (i) Multiple times / For each: `EffectProcessor` methods can iterate targets or use a count.

- **Discrepancies/Bugs for Section 6:**
  - **Modifier System (6.2) is entirely Not Implemented.** This is a major feature for dynamic effect alteration.
  - Reaction Triggering (6.3): Nuances around LKI (6.3.j), checking ability status _before_ event for non-self-move (6.3.e), and conditions based on past state (6.3.k) need robust implementation in `AdvancedTriggerHandler` and `EffectProcessor`. Multiple activations from single multi-target event (6.3.f) also needs care.
  - Effect Resolution (6.5): Advanced targeting, player choice for optional steps, conditional step evaluation, and modal effects are mostly placeholders or not fully implemented in `IEffectStep` and `EffectProcessor`.
  - Initiative Order for multi-player decisions (6.1.h) needs consistent implementation in `EffectProcessor` for relevant effects.

### Section 7: Vocabulary

- **Status:** Partially Implemented. Many terms are defined by their implementation within specific systems, but some keyword actions or complex abilities are still placeholders or need full integration.
- **Code References:**

  - `src/engine/types/enums.ts` (for `TerrainType`, `Faction`, `CostSymbol` (conceptual), `KeywordAbility`, `EffectType` which maps to many keyword actions)
  - `src/engine/types/abilities.ts` (`IAbilityTrigger`, `ICost`)
  - `src/engine/EffectProcessor.ts` (implements many keyword actions as `EffectType` cases)
  - `src/engine/CostProcessor.ts` (for cost symbols)
  - `src/engine/AdvancedTriggerHandler.ts` (for j,h,r trigger symbols/event types)
  - `src/engine/KeywordAbilityHandler.ts`
  - `src/engine/GameStateManager.ts` (for state checks like "Ahead/Behind/Tied", "Controls")
  - `src/engine/CardPlaySystem.ts` (for "Play", "Scout X")

- **Details/Discrepancies:**

  - **7.1 Symbols:**

    - **7.1.1 Trigger Symbols (j, h, r):** Fully Implemented.
      - Handled by `IAbilityTrigger.eventType` in `AdvancedTriggerHandler.ts` (e.g., `ZoneChange_EnterPlay`, `CardPlayed_FromHand`, `CardPlayed_FromReserve`).
    - **7.1.2 Terrains and Statistics (V, M, O):** Fully Implemented.
      - `TerrainType` enum. `ITerrainStats` interface. Used in `ICardDefinition.statistics` and `IGameObject.currentCharacteristics.statistics`.
    - **7.1.3 Faction Symbol:** Fully Implemented.
      - `Faction` enum. `ICardDefinition.faction`.
    - **7.1.4 Cost Symbols:**
      - (T) "Exhaust me": Fully Implemented. `ICost.exhaustSelf`. Handled by `CostProcessor.pay()`.
      - (D) "Discard me from the Reserve": Partially Implemented. Not an explicit `ICost` component. Would be an `IEffectStep` if part of an ability's effect, or needs a new `ICost` component if a payment option.
      - (Mana 1, 2, ..., X): Fully Implemented. `ICost.mana`. Handled by `CostProcessor.pay()`.
    - **7.1.5 Clarification Symbols (I - Support Ability):** Fully Implemented.
      - `IAbility.isSupportAbility` boolean flag.

  - **7.2 Pronouns:** Fully Implemented (Conceptual by system design).

    - (I - self): `effectContext.sourceId` in `EffectProcessor.ts`.
    - (You - controller): `effectContext.controllerId` or `object.controllerId`.
    - (They - players): General iteration.
    - (It - objects/cards): Generic object references.

  - **7.3 Keywords Actions:** Partially Implemented. Many are `EffectType` enums processed by `EffectProcessor.ts`.

    - **7.3.1 Activates (a reaction):** Partially Implemented. `AdvancedTriggerHandler.ts` and reaction loop (4.4). Direct activation by effect is not general.
    - **7.3.2 After You:** Not Implemented. Would be a specific quick action effect.
    - **7.3.3 Augment:** Partially Implemented. `EffectType.Augment` exists, `EffectProcessor.effectAugment` is a placeholder. (V3.0 Keyword)
    - **7.3.4 Create (token):** Partially Implemented. `EffectType.CreateToken` exists, `EffectProcessor.effectCreate` is a placeholder. Needs `ObjectFactory.createGameObject` with a token definition.
    - **7.3.5 Discard:** Fully Implemented. `EffectType.DiscardCard` exists, `EffectProcessor.effectDiscard` handles moving cards from hand to discard.
    - **7.3.6 Double (counters):** Not Implemented. (V3.0 Keyword Action)
    - **7.3.7 Draw:** Fully Implemented. `EffectType.DrawCard` exists, `EffectProcessor.effectDraw` calls `GameStateManager.drawCards`.
    - **7.3.8 Exchange (boosts):** Not Implemented. (V3.0 Keyword Action)
    - **7.3.9 Exchange (objects or cards):** Partially Implemented. `EffectType.Exchange` exists, `EffectProcessor.effectExchange` is a placeholder.
    - **7.3.10 Exhaust:** Fully Implemented. `EffectType.Exhaust` exists, `EffectProcessor.effectExhaust` applies `StatusType.Exhausted`.
    - **7.3.11 Exhausted Resupply:** Partially Implemented. Combination of Resupply then Exhaust. Needs Resupply to be correct first.
    - **7.3.12 Gain (counters):** Fully Implemented. `EffectType.GainCounter` exists, `EffectProcessor.effectGainCounter`.
    - **7.3.13 Gain (status):** Fully Implemented. `EffectType.GainStatus` exists, `EffectProcessor.effectGainStatus` calls `StatusEffectHandler.applyStatusEffect`.
    - **7.3.14 Ignore (abilities):** Not Implemented. Complex interaction with `RuleAdjudicator.ts`.
    - **7.3.15 Lose (status):** Fully Implemented. `EffectType.LoseStatus` exists, `EffectProcessor.effectLoseStatus` calls `StatusEffectHandler.removeStatusEffect`.
    - **7.3.16 Move Backward:** Fully Implemented. `EffectType.MoveBackward` exists, `EffectProcessor.effectMoveBackward` updates expedition positions.
    - **7.3.17 Move Forward:** Fully Implemented. `EffectType.MoveForward` exists, `EffectProcessor.effectMoveForward` updates expedition positions.
    - **7.3.18 Ready:** Fully Implemented. `EffectType.Ready` exists, `EffectProcessor.effectReady` removes `StatusType.Exhausted`.
    - **7.3.19 Roll a Die:** Not Implemented. Would require RNG and effect integration.
    - **7.3.20 Play For Free:** Partially Implemented. `CardPlaySystem.playCard` needs an option to bypass cost payment. Cost calculation might set cost to 0.
    - **7.3.21 Put (to zone):** Fully Implemented. `EffectType.MoveCard` exists, `EffectProcessor.effectMoveTo` uses `GameStateManager.moveEntity`.
    - **7.3.22 Resupply:** Discrepancy. `EffectType.Resupply` exists. Rulebook: "top card of one’s Deck into one’s Reserve". `EffectProcessor.effectResupply` current implementation: "moves the top card of a player's discard pile to their reserve."
    - **7.3.23 Return (to zone):** Fully Implemented (Synonym of Put). `EffectType.MoveCard` / `effectMoveTo`.
    - **7.3.24 Sabotage:** Partially Implemented. `EffectType.Sabotage` exists. "Discard up to one target card in a Reserve". `EffectProcessor.effectSabotage` is placeholder. Needs targeting and then `GameStateManager.moveEntity` to discard.
    - **7.3.25 Sacrifice:** Partially Implemented. `EffectType.Sacrifice` exists. Requires player to choose an object they control in play and discard it. `EffectProcessor.effectSacrifice` is placeholder. Needs targeting and `GameStateManager.moveEntity` to discard. Rule 7.3.25.b (still sacrifice if modified) is an interpretation point for triggers.
    - **7.3.26 Send (to zone):** Fully Implemented (Synonym of Put). `EffectType.MoveCard` / `effectMoveTo`.
    - **7.3.27 Spend (counters):** Fully Implemented. `ICost.spendCounters` and `CostProcessor.pay()`. Also as an effect via `EffectType.SpendCounter` / `EffectProcessor.effectSpendCounter`.
    - **7.3.28 Switch Expeditions:** Partially Implemented. No specific `EffectType`. Would be `EffectType.MoveCard` with specific targeting to move a character within a player's own expedition zones (conceptual areas).

  - **7.4 Keyword Abilities:** Partially Implemented. Managed by `KeywordAbilityHandler.ts` and specific game phase logic.

    - **7.4.1 Cooldown:** Fully Implemented. `KeywordAbility.Cooldown`. `CardPlaySystem.playSpell` checks to exhaust.
    - **7.4.2 Defender:** Fully Implemented. `KeywordAbility.Defender`. `KeywordAbilityHandler.checkDefenderRestrictions` called by `GameStateManager.progressPhase`.
    - **7.4.3 Eternal:** Fully Implemented. `KeywordAbility.Eternal`. `KeywordAbilityHandler.isEternal` called by `GameStateManager.restPhase`.
    - **7.4.4 Gigantic:** Partially Implemented. `KeywordAbility.Gigantic`. `KeywordAbilityHandler.handleGiganticEnterPlay/LeavePlay` are placeholders. Complex interactions (stats in both expeditions, targeting, etc.) need full implementation in `GameStateManager.calculateExpeditionStats`, targeting systems, `RuleAdjudicator`.
    - **7.4.5 Scout X:** Partially Implemented. `KeywordAbility.Scout`. `CardPlaySystem.calculateCost` uses `options.useScoutCost`. `KeywordAbilityHandler.processScoutPlay` for dynamically adding "h Send me to Reserve" ability is complex and not fully done.
    - **7.4.6 Seasoned:** Fully Implemented. `KeywordAbility.Seasoned`. `GameStateManager.moveEntity` checks and keeps boosts.
    - **7.4.7 Tough:** Partially Implemented. `KeywordAbility.Tough`. `KeywordAbilityHandler.canTargetWithTough` is placeholder. Cost payment by opponent needs integration into targeting/effect resolution.

  - **7.5 Keyword Descriptors:** Mostly Informational or definitions used by other systems.
    - **7.5.1 j, h, r Abilities:** Fully Implemented. Defined by `IAbilityTrigger.eventType`.
    - **7.5.2 Ahead, Behind, Tied:** Fully Implemented. Determined by `IPlayer.expeditionState.heroPosition` / `companionPosition` relative to opponent's.
    - **7.5.3 Becomes (status):** Fully Implemented. `StatusEffectHandler.applyStatusEffect` and `EventBus` event `statusGained`.
    - **7.5.4 Controls:** Fully Implemented. `IGameObject.controllerId`.
    - **7.5.5 Do (who did that action?):** Fully Implemented (Conceptual, as per 1.4.7 / effect context).
    - **7.5.6 Fails to Move Forward:** Fully Implemented. Determined in `GameStateManager.progressPhase`.
    - **7.5.7 In (terrain):** Partially Implemented. Requires checking current region of expedition (`IPlayer.expeditionState.heroRegionIndex`/`companionRegionIndex`) and that region's `terrainType` (from `AdventureZone` objects).
    - **7.5.8 Join (zone/expedition):** Fully Implemented. `GameStateManager.moveEntity` results in joining. `AdvancedTriggerHandler` processes relevant triggers.
    - **7.5.9 Leave (zone/expedition):** Fully Implemented. `GameStateManager.moveEntity` results in leaving. `AdvancedTriggerHandler` processes relevant triggers.
    - **7.5.10 Play (card is played):** Fully Implemented (Conceptual). Defined as when a card leaves Limbo after resolution (Rule 5.1.2.j). This is a specific timing for triggers.

- **Discrepancies/Bugs for Section 7:**
  - **Cost Symbol 'D' (7.1.4.b):** Not an explicit cost component in `ICost`.
  - **Resupply (7.3.22.a):** Rulebook: Deck to Reserve. Engine: Discard to Reserve. This is a significant functional difference.
  - Many Keyword Actions (Augment, Create, Double, Exchange, Ignore, Roll a Die, Sabotage, Sacrifice, Switch Expeditions) are placeholders in `EffectProcessor.ts` or not implemented.
  - Complex Keyword Abilities (Gigantic, Scout X dynamic ability, Tough X cost) require significant implementation.

### Section 8: Changes From the Previous Version

... (Content from previous audit state, to be audited in a future step) ...
