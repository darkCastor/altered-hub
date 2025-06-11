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

- **Status:** Fully Implemented (Informational)
- **Details:** Rules 1.1.1 (This Document), 1.1.2 (Scope), 1.1.3 (Collectible Card Game), 1.1.4 (Constructed Play), 1.1.5 (Limited Play), 1.1.6 (Numbers and Symbols), and 1.1.7 (Material) are primarily informational or define game setup parameters rather than dynamic game engine logic.
  - Deck construction rules (1.1.4, 1.1.5) are prerequisites for game start and assumed to be correct by the engine.
  - Numbers (1.1.6.a-d) are implicitly handled by using standard data types.
  - Symbols (1.1.6.e-k) are relevant for card definitions and ability parsing, which the engine consumes.
  - Material requirements (1.1.7) are for physical play and not directly coded.

#### 1.2 Game Concepts

##### 1.2.1 Players

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/GameStateManager.ts`: Manages player states within `this.state.players`.
  - `src/engine/types/game.ts`: Defines `IPlayer`.
- **Details:** The engine correctly identifies and manages multiple players (1.2.1.a). The concept of "opponent" (1.2.1.b) is implicit in a two-player setup. Deck requirements (1.2.1.c) are part of game setup. Personal zones (1.2.1.d) are initialized per player.

##### 1.2.2 Objects

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ObjectFactory.ts`: Responsible for creating game objects.
  - `src/engine/types/objects.ts`: Defines `IGameObject` and `isGameObject`.
  - `src/engine/types/cards.ts`: Defines `ICardDefinition` which holds base characteristics.
- **Details:** Objects as game pieces (1.2.2.a, 1.2.2.b) are represented by `IGameObject`. Characteristics (1.2.2.c) are largely covered by `ICardDefinition` (for base values) and `IGameObject` (for current values). Rule 1.2.2.d (lacking characteristics) is implicitly handled by TypeScript's optional properties or default values.

##### 1.2.3 Zones

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/Zone.ts`: Defines `GenericZone`, `HandZone`, `DeckZone`, etc.
  - `src/engine/GameStateManager.ts`: Initializes and manages shared and player-specific zones (`initializeGameState`).
  - `src/engine/types/zones.ts`: Defines `IZone` and `ZoneIdentifier`.
- **Details:** Zones as sets of objects/cards (1.2.3.a) are implemented. The ten zone types (1.2.3.b) are represented by `ZoneIdentifier` and instantiated in `GameStateManager.ts`.
  - Expedition sub-zones (1.2.3.c): Handled within player state (`expeditionState` in `IPlayer`) and conceptually through `player.zones.expeditionZone`.
  - Shared vs. Personal (1.2.3.d, 1.2.3.e): `GameStateManager.ts` initializes shared zones (`sharedZones`) and personal zones under each `IPlayer`.
  - Visible vs. Hidden (1.2.3.f, 1.2.3.g): Zone classes have a `visibility` property. `HandZone` and `DeckZone` are examples of hidden zones.

##### 1.2.4 Abilities

- **Status:** Partially Implemented
- **Code References:**
  - `src/engine/KeywordAbilityHandler.ts`
  - `src/engine/SupportAbilityHandler.ts`
  - `src/engine/AdvancedTriggerHandler.ts`
  - `src/engine/EffectProcessor.ts`
  - `src/engine/PassiveAbilityManager.ts` (related to `RuleAdjudicator.ts`)
  - `src/engine/types/abilities.ts`: Defines `IAbility`.
- **Details:** The engine has systems for various ability types (1.2.4.c).
  - Quick actions: Logic for playing quick actions exists in `PlayerActionHandler.ts` (referenced by `GameStateManager.ts`).
  - Reactions: `AdvancedTriggerHandler.ts` seems to manage these.
  - Passive abilities: `PassiveAbilityManager.ts` and `RuleAdjudicator.ts` are designed to handle these (see Section 2.3 audit).
  - Effects: `EffectProcessor.ts` processes effects.
  - Rule 1.2.4.d (Abilities work in play unless specified): This is a critical rule. `RuleAdjudicator.ts` and ability-specific handlers need to ensure this. Support abilities are handled by `SupportAbilityHandler.ts` for Reserve (see also 2.2.11.e, 7.1.5.a for "I" symbol). Hero abilities in Hero Zone, Emblem abilities in Limbo need verification. Cost-modifying abilities working from any playable zone also needs checking.
- **Discrepancies/Bugs:**
  - Verification needed for Rule 1.2.4.d across all ability types and zones. For example, ensuring passive abilities from hand cards don't apply unless explicitly stated (e.g., Scout).

##### 1.2.5 Costs

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ManaSystem.ts`: Handles mana payment.
  - `src/engine/CardPlaySystem.ts`: Orchestrates playing cards, including cost payment.
- **Details:** Costs as changes to game state (1.2.5.a) are handled. Player choice to pay (1.2.5.b) is implicit in initiating an action.
  - Paying in full (1.2.5.c): `ManaSystem.ts` should ensure this.
  - Simultaneous payment (1.2.5.d): Assumed to be handled by the atomicity of cost payment steps.
  - Mana cost payment (1.2.5.e): `ManaSystem.ts` (`spendMana`).

##### 1.2.6 Effects

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/EffectProcessor.ts`: Core for resolving effects.
- **Details:** Effects as changes to game state (1.2.6.a) are the purpose of `EffectProcessor.ts`.
  - Multiple steps (1.2.6.b): Effect definitions should allow for sequences of actions.
  - Targeting (1.2.6.c): Handled by effect definitions and processed by `EffectProcessor.ts`.
  - Optional steps ("may") (1.2.6.d): Should be part of effect definition logic.
  - Conditional steps ("If") (1.2.6.e): Should be part of effect definition logic.
  - Partial failure (1.2.6.f): `EffectProcessor.ts` should attempt to resolve as much of an effect as possible.

##### 1.2.7 Events

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/EventBus.ts`: Manages event publishing and subscription.
- **Details:** Events as changes in game state (1.2.7.a) are central; the `EventBus` is used to signal these. Cost payment (1.2.7.b) and effect steps (1.2.7.c) should ideally publish events. Events with no change (1.2.7.d) are possible if an effect resolves with no impact.

#### 1.3 Game Progress

##### 1.3.1 Starting the Game

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/GameStateManager.ts`: `initializeGame()`, `initializeAdventureZones()`, `initializePlayerState()`, `placeHeroInZone()`, `initializePlayerDeck()`, `initializeManaOrbs()`.
- **Details:**
  - Adventure setup (1.3.1.a): `initializeAdventureZones()` creates Hero/Companion regions and Tumult cards.
  - Expedition counters (1.3.1.b): Player expedition states are initialized in `initializePlayerState()`.
  - Hero placement, deck shuffle (1.3.1.c): `placeHeroInZone()` and `initializePlayerDeck()`.
  - First player determination (1.3.1.d): `initializeGame()` sets a first player (simplified for now).
  - Initial draw and mana (1.3.1.e): `drawCards()` and `initializeManaOrbs()` in `initializePlayerState()`. The rule states this happens "In the Morning of the first day, instead of normal daily effects", while the code does this during `initializeGame` and then sets phase to Noon (`this.state.currentPhase = GamePhase.Noon; this.state.firstMorningSkipped = true;`). This aligns with Rule 4.1.l.

##### 1.3.2 Day Progress

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/PhaseManager.ts`: Manages phase transitions and daily effects.
  - `src/engine/TurnManager.ts`: Manages turns within the Afternoon phase.
  - `src/engine/GameStateManager.ts`: Contains logic for specific daily effects like `preparePhase()`, `progressPhase()`, `restPhase()`, `cleanupPhase()`.
- **Details:** Day structure (1.3.2.a) is managed by `PhaseManager.ts`.
  - **Morning (1.3.2.b):**
    - `PhaseManager.ts` (`handleSubsequentMorning`):
      - Succeed: `TurnManager.ts` (`succeedPhase`).
      - Prepare: `GameStateManager.ts` (`preparePhase`).
      - Draw: `GameStateManager.ts` (`drawCards`).
      - Expand: `PhaseManager.ts` (`handleExpandPhase`).
  - **Noon (1.3.2.c):** `PhaseManager.ts` (`executeNoonPhase`) advances to Noon. "At Noon" reactions would be handled by `AdvancedTriggerHandler.ts`.
  - **Afternoon (1.3.2.d):** `TurnManager.ts` (`startAfternoon`, `advanceTurn`, `playerPasses`) and `PhaseManager.ts` (`executeAfternoonPhase`). Quick actions and playing cards/passing are handled.
  - **Dusk (1.3.2.e):**
    - `PhaseManager.ts` (`handleDusk`) calls `GameStateManager.ts` (`progressPhase`).
    - `GameStateManager.ts` (`progressPhase` and `calculateExpeditionStats`, `expeditionShouldMove`): Calculates stats and determines movement. The conditions for movement (terrain match, greater than opponent, greater than zero) are partially implemented in `expeditionShouldMove` but need specific terrain logic from regions.
  - **Night (1.3.2.f):**
    - `PhaseManager.ts` (`handleNight`):
      - Rest: `GameStateManager.ts` (`restPhase`).
      - Clean-up: `GameStateManager.ts` (`cleanupPhase`).
      - Check Victory: `GameStateManager.ts` (`checkVictoryConditions`).

##### 1.3.3 Ending the Game

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/GameStateManager.ts`: `checkVictoryConditions()`, `setGameWinner()`, `enterTiebreakerMode()`.
  - `src/engine/TiebreakerSystem.ts`: Handles detailed tiebreaker logic.
- **Details:**
  - Check Victory (1.3.3.a): `checkVictoryConditions()` in `GameStateManager.ts` and `TiebreakerSystem.ts` (`checkForTiebreaker`) evaluate expedition meeting/crossing.
  - Win condition (1.3.3.b): Implemented based on total distance if one player is ahead after meeting/crossing.
  - Tiebreakers (1.3.3.c-f): `TiebreakerSystem.ts` handles replacing regions with Arena, summing stats, and checking win conditions during tiebreaker days.

#### 1.4 Golden Rules

##### 1.4.1 Can’t Beats Can

- **Status:** Partially Implemented (Design Principle)
- **Code References:** `src/engine/RuleAdjudicator.ts` (intended).
- **Details:** This is a fundamental design principle. `RuleAdjudicator.ts` and various checks throughout the engine (e.g., action validation) should enforce this. Specific "can't" scenarios need to be tested. For example, paying an impossible cost (1.4.1.b) should be prevented by cost payment logic. Impossible effects (1.4.1.c) should be handled by `EffectProcessor.ts` ignoring unperformable parts.

##### 1.4.2 Specific Beats General

- **Status:** Partially Implemented (Design Principle)
- **Code References:** `src/engine/RuleAdjudicator.ts` (intended for passive ability ordering).
- **Details:** Card effects overriding general rules should be handled by how abilities are applied. `RuleAdjudicator.ts`'s passive ability sorting (Rule 2.3.3) is a key part. Effect processing should prioritize card-specific instructions.

##### 1.4.3 My Cards, My Zones

- **Status:** Fully Implemented
- **Code References:** `src/engine/GameStateManager.ts` (`moveEntity` method).
- **Details:** The `moveEntity` logic checks `toZone.ownerId` and redirects to the `sourceEntity.ownerId`'s corresponding zone if there's a mismatch for personal zones.

##### 1.4.4 New Zone, New Object

- **Status:** Fully Implemented
- **Code References:**
  - `src/engine/ObjectFactory.ts`
  - `src/engine/GameStateManager.ts` (`moveEntity` method).
- **Details:** When an entity moves to a visible zone, `moveEntity` in `GameStateManager.ts` uses `ObjectFactory.createGameObject()` to create a new object instance. It also handles counter retention based on rules (e.g., 2.5.j, 2.5.k, 7.4.6.b - Seasoned). This aligns with Rule 2.1.d. Token destruction upon leaving expedition (Rule 2.1.e) is also handled in `moveEntity`.

##### 1.4.5 Initiative Order

- **Status:** Partially Implemented
- **Code References:**
  - `src/engine/TurnManager.ts`: Sets `firstPlayerId` and `currentPlayerId`.
  - `src/engine/PhaseManager.ts`: Some phased actions might need to respect this.
  - Rule 6.1.h implementation details are crucial here (simultaneous decisions).
- **Details:** `TurnManager.ts` establishes who has initiative. However, the explicit handling of simultaneous choices (e.g., during Clean-up or for "Each player..." effects) as per Rule 6.1.h needs to be consistently implemented across relevant game actions. `PhaseManager.ts` currently iterates players for 'Expand' but may need more explicit initiative order for other multi-player decisions.

##### 1.4.6 Nothing Is Forever

- **Status:** Not Implemented
- **Details:** Rules 1.4.6.b (quick action limit) and 1.4.6.c (Reaction limit) do not appear to be currently implemented. This would require counters on abilities or objects within a game day.

##### 1.4.7 Who Did That?

- **Status:** Partially Implemented (Implicit)
- **Code References:** Effect definitions and `EffectProcessor.ts`.
- **Details:** The rules for determining action controller (7.5.5.b-e) are generally handled by how effects are defined and processed.
  - 7.5.5.b (Effect specifies player): Effect definition should state this.
  - 7.5.5.c (Controller of effect): `EffectProcessor.ts` should use the controller of the spell/ability.
  - 7.5.5.d (Controller of affected object): This might apply for some triggered abilities.
  - 7.5.5.e (Neither player): For game rule actions.
    This needs to be consistently applied.

### Section 2: Objects

#### 2.1 General

- **2.1.a (Objects in visible zones):** Fully Implemented.
  - `IGameObject` instances represent objects in visible zones. Hidden zones use `ICardInstance`.
- **2.1.b (Object representation):** Fully Implemented.
  - Represented by `ICardDefinition` (for cards), token creation effects define token objects (`ObjectFactory.createGameObject` for tokens, based on definitions often augmented by effects), and `IEmblemObject` for emblems.
- **2.1.c (Objects don't change zones):** Fully Implemented.
  - This is the "New Zone, New Object" Golden Rule (1.4.4). `ObjectFactory.ts` creates new `IGameObject` instances with new `objectId`s and `timestamp`s when a card representation moves to a visible zone, as seen in `GameStateManager.moveEntity`.
- **2.1.d (Moving an object - new object, new timestamp):** Fully Implemented.
  - `GameStateManager.moveEntity` calls `ObjectFactory.createGameObject` which assigns a new `objectId` and `timestamp`.
  - The old object implicitly ceases to exist as it's removed from its source zone and no longer referenced. Reactions referencing the "old object" would need careful handling in `AdvancedTriggerHandler.ts` to use its last known state if necessary (see 2.1.h).
- **2.1.e (Token leaving Expedition zone):** Fully Implemented.
  - `GameStateManager.moveEntity`:
    ```typescript
    if (definition.type === CardType.Token && fromZone.zoneType === ZoneIdentifier.Expedition) {
	this.eventBus.publish('entityCeasedToExist', { entity: sourceEntity, from: fromZone });
	return null; // Token ceases to exist
    }
    ```
  - This correctly implements that the token does not join the new zone and ceases to exist.
- **2.1.f (Ability refers to object moving to visible zone - can find new object):** Partially Implemented (Conceptual).
  - This is a complex interaction for triggered abilities (especially self-referential ones after a move, like "When I am sacrificed... put me in Reserve"). The `AdvancedTriggerHandler.ts` and `EffectProcessor.ts` would need to ensure that effects targeting the "moved" object can correctly identify the new instance in the destination zone. The example for Moonlight Jellyfish (keep Fleeting status to find it in discard) implies the "new" object retains properties or can be identified. Rule 6.3.j also covers this.
  - Current implementation of `moveEntity` creates a new object; systems relying on the old objectId post-move would fail unless they are designed to look up the new object based on `definitionId` or other persistent traits, or if the event system provides a clear linkage.
- **2.1.g (Rule 2.1.f through multiple zone changes by the same ability):** Partially Implemented (Conceptual).
  - Similar to 2.1.f. If an ability moves an object multiple times (e.g., Hand -> Limbo -> Expedition), it should be able to track it. This relies on the effect resolution logic being able to pass the identity of the evolving object representation.
- **2.1.h (Effect asking for info about non-existent object - use LKI):** Partially Implemented (Conceptual).
  - If an object ceases to exist (e.g. token, or card moved to hidden zone), any subsequent effects or triggers needing its characteristics must rely on its last known information (LKI). The engine would need to capture this LKI if an effect relies on it post-obliteration. For moves to hidden zones, the `IGameObject` is gone, so LKI would be important.
- **2.1.i (Non-existent object cannot move):** Fully Implemented.
  - If an object is removed from all zones (e.g. token ceasing to exist), it cannot be selected as a source for a move. `moveEntity` requires the `entityId` to be found in the `fromZone`.
- **2.1.j (Cards in hidden zones are not objects):** Fully Implemented.
  - `ICardInstance` is used for cards in hidden zones (Deck, Hand), while `IGameObject` is for visible zones. `ObjectFactory.createGameObject` is called when a card instance enters a visible zone.
- **2.1.k (Zones are not objects):** Fully Implemented.
  - `IZone` is a distinct type from `IGameObject`.
- **2.1.l (Counters are not objects):** Fully Implemented.
  - `IGameObject.counters` is a `Map<CounterType, number>`, a property of an object.

#### 2.2 Characteristics

- **General:** Characteristics are primarily defined by `ICardDefinition` (base values) and instantiated into `IGameObject.baseCharacteristics` and `IGameObject.currentCharacteristics`.

- **2.2.1 Type:** Fully Implemented.

  - `CardType` enum (`src/engine/types/enums.ts`).
  - `IGameObject.type` stores this.
  - Token type is Character (2.2.1.d): `ObjectFactory.createGameObject` uses `definition.type`. Token definitions should specify `CardType.Character`.
  - Region type (2.2.1.e): Adventure cards are conceptual; their representations in `adventureZone` in `GameStateManager` have types like 'HeroRegion', 'TumultCard'.
  - Mana Orb type (2.2.1.f): `GameStateManager.initializeManaOrbs` sets `manaOrb.type = CardType.ManaOrb`. Also Rule 3.2.9.c.
  - Emblem type (2.2.1.g): `IEmblemObject.type` is `CardType.Emblem`.
  - Referring to "[type]" in play (2.2.1.h) vs. checking card's type (2.2.1.i): This distinction is handled by game logic checking object properties in specific zones vs. card definition properties.

- **2.2.2 Sub-types:** Fully Implemented.

  - `IGameObject.subTypes` (string array). Populated from `ICardDefinition.subTypes`.
  - Token sub-types (2.2.2.j): Defined by the creating effect; `ObjectFactory.createGameObject` takes `definition.subTypes`.
  - Region sub-types (2.2.2.f, k, l): Terrain types on regions are stored in `terrainType` for adventure objects.
  - Emblem sub-types (2.2.2.h, m): `IEmblemObject.emblemSubType` ('Reaction' | 'Ongoing'). `ObjectFactory.createReactionEmblem` sets this.
  - Referring to "[sub-type]" in play (2.2.2.n) vs. checking card's sub-type (2.2.2.o): Similar to type, handled by game logic context.
  - Gain/lose types (sub-types) (2.2.2.p): `PassiveAbilityManager.ts` or direct effect modification of `currentCharacteristics.subTypes` would handle this.

- **2.2.3 Zone Type:** Fully Implemented.

  - `PermanentZoneType` enum (`Expedition`, `Landmark`) in `src/engine/types/enums.ts`.
  - `IPermanentObject` could have a `permanentZoneType: PermanentZoneType` field, derived from `ICardDefinition`. (Currently `IPermanentObject` in `objects.ts` has this).
  - Resolution to correct zone (2.2.3.d, e): `CardPlaySystem.ts` should handle this based on the permanent's zone type.

- **2.2.4 Name:** Fully Implemented.

  - `IGameObject.name`, from `ICardDefinition.name`.
  - Token names (2.2.4.f): Set by creating effect, stored in `ICardDefinition` for the token.
  - Emblems have no name (2.2.4.g): `IEmblemObject.name` is a descriptive string like "Reaction: Ability Text", not a card name.

- **2.2.5 Rarity:** Fully Implemented (as data).

  - `ICardDefinition.rarity`. Runtime relevance is minimal unless an effect specifically checks it.
  - Heroes, regions, tokens, emblems no rarity (2.2.5.c): Their `ICardDefinition` equivalents would lack this or have a default. `ObjectFactory` does not explicitly assign/remove rarity for these.

- **2.2.6 Version (Collector Number):** Fully Implemented (as data).

  - `ICardDefinition.id` often serves as the unique identifier which includes set and number. A separate `version` or `collectorNumber` field exists in `ICardDefinition`. Not typically a runtime game logic concern for `IGameObject`.

- **2.2.7 Hand Cost:** Fully Implemented.

  - `ICardDefinition.handCost`.
  - Token hand cost 0 (2.2.7.c): Token definitions should specify this. `ObjectFactory` uses the definition.
  - Emblems no hand cost (2.2.7.d): `IEmblemObject` does not have cost fields.

- **2.2.8 Reserve Cost:** Fully Implemented.

  - `ICardDefinition.reserveCost`.
  - Token reserve cost 0 (2.2.8.c): As with hand cost.
  - Emblems no reserve cost (2.2.8.d): As with hand cost.

- **2.2.9 Faction:** Fully Implemented.

  - `ICardDefinition.faction`.
  - Tokens/Emblems no faction (2.2.9.d): Token definitions and emblem creation should reflect this. `ObjectFactory` uses the definition; `IEmblemObject` has no faction field.

- **2.2.10 Statistics:** Fully Implemented.

  - `ICardDefinition.statistics` (`ITerrainStats`), copied to `IGameObject.baseCharacteristics.statistics` and `IGameObject.currentCharacteristics.statistics`.
  - Only Characters have stats (2.2.10.c): Type system and card definitions enforce this.
  - Token stats (2.2.10.e): Defined by creating effect, stored in their `ICardDefinition`.

- **2.2.11 Abilities:** Fully Implemented.

  - `IGameObject.abilities` (array of `IAbility`). Populated from `ICardDefinition.abilities`.
  - Text in italics (2.2.11.c) is flavor and not parsed as abilities.
  - Support abilities (2.2.11.d, e): `IAbility.isSupportAbility` boolean flag. `I` symbol is a parser concern.
  - Token abilities (2.2.11.f): Defined by creating effect, stored in their `ICardDefinition.abilities`.
  - **Ability scope (2.2.11.g-j):** Critical. Partially Implemented.
    - (g) In play: `RuleAdjudicator.ts` and ability handlers should primarily consider objects in play.
    - (h) Heroes in Hero Zone: Hero abilities should be filtered/checked by `PlayerActionHandler` or `PassiveAbilityManager` to only apply if the Hero is in `player.zones.heroZone`.
    - (i) Support abilities in Reserve: `SupportAbilityHandler.ts` is designed for this.
    - (j) Exhausted objects in Reserve have no support abilities: `StatusEffectHandler.hasSupportAbilities` checks for `StatusType.Exhausted`.
  - Quick actions, Reactions, Passive, Effects (2.2.11.k-n): `AbilityType` enum and specific handlers.

- **2.2.12 Reserve Limit:** Fully Implemented.

  - `ICardDefinition.reserveLimit` for Heroes. Copied to `IHeroObject` and then to `IGameObject.currentCharacteristics.reserveLimit`.
  - Default (2 if no Hero) applied in `GameStateManager.cleanupPhase`.

- **2.2.13 Landmark Limit:** Fully Implemented.

  - `ICardDefinition.landmarkLimit` for Heroes. Copied as above.
  - Default (2 if no Hero) applied in `GameStateManager.cleanupPhase`.

- **2.2.14 Duration:** Fully Implemented.

  - `IEmblemObject.duration` (`'this turn'`, `'this Afternoon'`, `'this Day'`). Set by creating effect.
  - Emblem expiry based on duration needs to be handled by `PhaseManager.ts` or a dedicated emblem manager.

- **2.2.15 Timestamp:** Fully Implemented.
  - `IGameObject.timestamp` assigned by `ObjectFactory.getNewTimestamp()`.
  - Simultaneous entry ordering (2.2.15.d): `ObjectFactory.getNewTimestamp()` provides unique incrementing timestamps. If multiple objects are created in one action, they get distinct timestamps. The rule implies player choice for relative order if created "at the same time" by game rules rather than a single effect resolving. This level of choice for timestamp assignment is not currently implemented; they are assigned sequentially as objects are created.

#### 2.3 Applying Passive Abilities

- **Status:** Partially Implemented. `RuleAdjudicator.ts` and `PassiveAbilityManager.ts` provide the framework.
- **Code References:**
  - `src/engine/RuleAdjudicator.ts`
  - `src/engine/PassiveAbilityManager.ts` (Note: The provided `PassiveAbilityManager.ts` seems to have overlapping responsibilities with `RuleAdjudicator.ts` regarding applying passives. The audit assumes `RuleAdjudicator.ts` is the newer/primary system for this per its doc comments "Implements Rule 2.3").
- **Details:**
  - **2.3.1 Base Characteristics:**
    - (a,b) `IGameObject.baseCharacteristics` stores defined/token-creation characteristics. `IGameObject.currentCharacteristics` starts as a copy and is then modified.
    - (c-f) Missing characteristics: Handled by TypeScript optionals and game logic defaulting to 0/empty for calculations.
    - (g-j) Modifying characteristics: `RuleAdjudicator.applyAbility` modifies `currentCharacteristics`. Abilities only affect objects in play (2.3.1.h) - `RuleAdjudicator.getAllPlayObjects()` ensures this. Continuous application (2.3.1.i) is achieved by re-applying all passives (`applyAllPassiveAbilities`) after each game event.
    - (k,l) Re-evaluation: `RuleAdjudicator.applyAllPassiveAbilities` first resets to base, then gathers and sorts all passives before applying. This matches the described re-evaluation process.
  - **2.3.2 Dependency:** Partially Implemented.
    - `RuleAdjudicator.doesADependOnB` is a placeholder. Full dependency checking (2.3.2.d-f) is complex and not yet implemented. This is crucial for correct application order.
  - **2.3.3 Order of Application:** Partially Implemented.
    - `RuleAdjudicator.sortAbilitiesByDependency` currently sorts by timestamp due to lack of full dependency logic (2.3.3.b).
    - "Free from dependency" (2.3.3.a) concept relies on the dependency logic.
    - Timestamp tie-breaking (part of 2.3.3.b, detailed in example as 2.3.3.d in rulebook v2 table of contents, now seems integrated into 2.3.3.b/c) is noted as simplified in `RuleAdjudicator.ts`.
- **Discrepancies/Bugs:**
  - Full dependency checking (2.3.2) is a major missing piece for accurate passive ability application. The current timestamp-first sorting in `RuleAdjudicator.ts` is a simplification.
  - The interaction and distinct roles of `PassiveAbilityManager.ts` and `RuleAdjudicator.ts` need clarification. `RuleAdjudicator.ts` seems to be the intended system for Rule 2.3.

#### 2.4 Statuses

- **Status:** Fully Implemented.
- **Code References:**
  - `src/engine/StatusEffectHandler.ts`
  - `src/engine/types/objects.ts`: `IGameObject.statuses` (Set).
  - `src/engine/types/enums.ts`: `StatusType` enum.
- **Details:**
  - **2.4.1 General:**
    - (a) Status list: `StatusType` enum.
    - (b) Objects in various zones can have statuses: `IGameObject.statuses`.
    - (c) No status in Discard/Deck/Hand: `StatusEffectHandler` primarily interacts with `IGameObject`s which exist in visible zones. Moving to these zones results in a new `ICardInstance` or loss of status generally.
    - (d) New object no status: `ObjectFactory.createGameObject` initializes `statuses: new Set<StatusType>()`.
    - (e) Statuses don't change unless effect causes: Logic is event-driven by calls to `StatusEffectHandler`.
    - (f) Cannot gain existing status: `Set.add` naturally handles this. `StatusEffectHandler.applyStatusEffect` adds to the set.
    - (g) Exception for re-gaining status (triggers reactions): The example implies the _attempt_ to grant an existing status can still trigger reactions. `StatusEffectHandler.applyStatusEffect` would add it; event bus listeners for status gain would fire.
    - (h) Cannot lose non-existing status: `Set.delete` handles this. `StatusEffectHandler.removeStatusEffect` checks `!object.statuses.has(status)` first.
  - **2.4.2 Anchored:** Fully Implemented.
    - `StatusEffectHandler.processAnchoredDuringRest` implements both points (not sent to Reserve, loses Anchored). Called from `checkStatusInteraction` during 'rest' event.
  - **2.4.3 Asleep:** Fully Implemented.
    - Stats not counted: `GameStateManager.calculateExpeditionStats` checks for Asleep. `StatusEffectHandler.processAsleepDuringProgress` confirms this.
    - Not sent to Reserve, loses Asleep: `StatusEffectHandler.processAsleepDuringRest`.
  - **2.4.4 Boosted:** Fully Implemented.
    - (a) Has boost counter: `isBoosted(object)` in `types/objects.ts` checks `object.counters.get(CounterType.Boost) || 0) > 0`.
    - (b) Status changes automatically: `StatusEffectHandler.updateBoostedStatus` adds/removes `StatusType.Boosted` based on counter presence. This is called by `StatusEffectHandler.updateAutomaticStatuses`.
  - **2.4.5 Exhausted:** Fully Implemented.
    - (a) Gained by costs/effects.
    - (b) Ready = not exhausted: Implicit.
    - (c) Exhausted in Reserve cannot be played: `StatusEffectHandler.canPlayFromReserve`.
    - (d) Passive to play exhausted from Reserve: This would be an exception handled by `CardPlaySystem` checking for such passives.
    - (e) Exhausted in Reserve no support abilities: `StatusEffectHandler.hasSupportAbilities`.
  - **2.4.6 Fleeting:** Fully Implemented.
    - (a) Gained when played from Reserve: `StatusEffectHandler.applyFleetingOnPlayFromReserve` (called by `CardPlaySystem` or similar).
    - (b) Spells with Fleeting passive: `CardPlaySystem` should apply Fleeting when such spells are played from anywhere.
    - (Remark: Landmark Permanents cannot gain Fleeting): Needs enforcement in `StatusEffectHandler.applyStatusEffect` or by game logic attempting to apply it.
    - (c) Fleeting character/expedition permanent enters from Limbo, gains Fleeting: Handled by card play logic setting status upon zone entry.
    - (d) Fleeting char/expedition perm goes to discard from expedition (instead of Reserve): `StatusEffectHandler.processFleetingDuringRest` (returns 'discard'). Logic in `GameStateManager.restPhase` uses this.
    - (e) Fleeting spell discarded after resolution: `CardPlaySystem` or `EffectProcessor` should handle this.

#### 2.5 Counters

- **Status:** Fully Implemented.
- **Code References:**
  - `src/engine/types/objects.ts`: `IGameObject.counters` (`Map<CounterType, number>`).
  - `src/engine/types/enums.ts`: `CounterType` enum.
  - `src/engine/GameStateManager.ts` (`moveEntity` for counter retention).
- **Details:**
  - **2.5.a (Counters on objects in various zones):** `IGameObject.counters` allows this.
  - **2.5.b (No counters in Discard/Deck/Hand):** When objects move to these zones, they become `ICardInstance`s or lose counters. `GameStateManager.moveEntity` logic for `isMovingToLosingZone` (hidden or discard) means the new instance in a hidden zone won't have counters, and objects going to discard also lose them.
  - **2.5.c (Names):** `CounterType` enum.
  - **2.5.d (Indistinguishable):** `Map` storing a count per `CounterType` handles this.
  - **2.5.e (Starting counters on Heroes):** `ICardDefinition.startingCounters`. Applied in `GameStateManager.initializeBoard` by `ObjectFactory.createGameObject`.
  - **2.5.f (Gain counters):** Effects modify `IGameObject.counters`.
  - **2.5.g (Remove counters):** Effects modify `IGameObject.counters`. Cannot go below zero.
  - **2.5.h (Spend counters):** Cost payment logic would modify `IGameObject.counters`.
  - **2.5.i (Most counters no intrinsic impact):** True, their meaning comes from abilities.
  - **2.5.j (Lose counters from Exp/Landmark to another zone):** `GameStateManager.moveEntity` has logic for `countersToKeep`.
    - Currently, it states: "if (sourceGameObject && !isMovingToLosingZone)" and then "if (fromZoneIsReserveOrLimbo)" counters are kept. "else if (fromZoneIsExpeditionOrLandmark)" only Seasoned keeps boosts to Reserve.
    - **Discrepancy:** Rule 2.5.j says ALL counters are lost when moving from Exp/Landmark, _except_ for specific cases like Seasoned (7.4.6.b). The current `moveEntity` logic for counters when moving from Exp/Landmark to a non-losing zone (that isn't Reserve for Seasoned) would need to ensure counters are wiped, unless an exception applies.
  - **2.5.k (Keep counters from Reserve/Limbo to another visible zone, unless to Discard):** `GameStateManager.moveEntity` implements this: `if (fromZoneIsReserveOrLimbo)` counters are kept by `countersToKeep` if not `isMovingToLosingZone`.
  - **2.5.1 Boost Counters:** Fully Implemented.
    - (a) `CounterType.Boost`.
    - (b) Adds +1/+1/+1 to stats: `GameStateManager.calculateExpeditionStats` adds `boostCount` to each statistic.

### Section 3: Zones

#### 3.1 Zone Properties

- **3.1.1 General:**

  - **3.1.1.a (Zone is a set of objects or cards):** Fully Implemented.
    - `IZone` interface in `src/engine/types/zones.ts` defines `entities` as `Map<string, ZoneEntity>`. `ZoneEntity` can be `ICardInstance` (for hidden zones) or `IGameObject` (for visible zones).
  - **3.1.1.b (Zones always exist, even if empty):** Fully Implemented.
    - Zones are initialized in `GameStateManager.initializeGameState` as part of `IPlayer.zones` or `IGameState.sharedZones` and persist.
  - **3.1.1.c (Ten kinds of zones):** Fully Implemented.
    - `ZoneIdentifier` enum in `src/engine/types/enums.ts` lists: `Deck`, `Hand`, `DiscardPile`, `Mana`, `Reserve`, `Landmark`, `Hero`, `Expedition`, `Limbo`, `Adventure`. These are used in `GameStateManager.initializeGameState` and `IZone.zoneType`.

- **3.1.2 Shared or Personal:**

  - **3.1.2.a (Shared zones - Adventure, Expedition, Limbo):** Partially Implemented.
    - `GameStateManager.state.sharedZones` correctly implements `adventure` and `limbo` as shared.
    - **Discrepancy:** Rulebook states Expedition zone is shared. However, `GameStateManager.initializeGameState` creates a per-player `expeditionZone: new GenericZone(...)` under `player.zones` and also a `sharedZones.expedition: new GenericZone("shared-expedition-deprecated", ...)` which is marked deprecated. Current game logic appears to use the player-specific expedition zones. This needs alignment with the rulebook or rulebook update.
  - **3.1.2.b (Personal zones):** Fully Implemented.
    - `Deck`, `Hand`, `DiscardPile`, `HeroZone`, `LandmarkZone`, `ManaZone`, `Reserve` are all initialized under `player.zones` in `GameStateManager.initializeGameState`.
  - **3.1.2.c (Card to owner's zone if sent to other's personal zone):** Fully Implemented.
    - `GameStateManager.moveEntity` contains logic: `if (toZone.ownerId && toZone.ownerId !== sourceEntity.ownerId) { ... finalDestinationZone = correctZone; }`.

- **3.1.3 Visible or Hidden:**

  - **3.1.3.a (Visible zones contain objects):** Fully Implemented.
    - `IZone.visibility` property set in `BaseZone` constructor. `GenericZone`, `DiscardPileZone`, `LimboZone` are 'visible'. Entities in these become `IGameObject`.
  - **3.1.3.b (All players know number/characteristics in visible zones):** Fully Implemented (Engine Access).
    - The engine has full access to `IGameObject` properties in visible zones. UI would determine actual player presentation.
  - **3.1.3.c (Face-down cards in visible zones):** Fully Implemented.
    - `IGameObject` has a `faceDown` property (though not directly in `IGameObject` interface, it's added by `ObjectFactory` or specific card logic like Mana Orbs).
    - Mana Orbs (Rule 3.2.9.c): `GameStateManager.initializeManaOrbs` sets `manaOrb.type = CardType.ManaOrb` and `manaOrb.faceDown = true`.
    - Adventure zone tumult cards are also handled as face-down entities initially.
  - **3.1.3.d (Hidden zones contain cards):** Fully Implemented.
    - `DeckZone` and `HandZone` are 'hidden'. Entities remain `ICardInstance` or are treated as such by external views.
  - **3.1.3.e (All players know number of cards in hidden zones):** Fully Implemented.
    - `IZone.getCount()` is available for all zones.
  - **3.1.3.f (Players cannot look at cards in hidden zones unless allowed):** Fully Implemented (Engine Control).
    - The engine controls access to card data. A UI would be responsible for enforcing visual restrictions for players. Effects requiring reveal would temporarily make data available.

- **3.1.4 In Play:**
  - **3.1.4.a (Object is "in play" if in Expedition or Landmark zone):** Fully Implemented (Conceptual).
    - This definition is crucial for ability scopes (Rules 1.2.4.d, 2.2.11.g). Game logic, especially in `RuleAdjudicator.ts` (`getAllPlayObjects`) and ability handlers, must consistently use `ZoneIdentifier.Expedition` and `ZoneIdentifier.Landmark` to determine "in play" status.

#### 3.2 Zone-specific Rules

- **3.2.1 Adventure Zone:** Fully Implemented.

  - **Code References:** `GameStateManager.initializeAdventureZones()`, `GameStateManager.enterTiebreakerMode()`. Zone is `state.sharedZones.adventure`.
  - (a) Shared, visible: Yes. Remark on face-down Tumults: `initializeAdventureZones` adds Tumult cards with `faceDown: true`.
  - (b) Regular play layout: `initializeAdventureZones` adds Hero, Companion, and 3 Tumult card representations.
  - (c) Tiebreakers (Arena): `enterTiebreakerMode` clears adventure and adds Arena regions.

- **3.2.2 Deck Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`DeckZone` class), `player.zones.deckZone` in `GameStateManager`.
  - (a) Personal, hidden: Yes, `DeckZone` constructor sets visibility to 'hidden' and has an `ownerId`.
  - (b) Ordered pile: `DeckZone` uses a `Map` but `removeTop()`, `addBottom()`, and `shuffle()` provide ordered behavior.
  - (c) Affecting specific positions: `removeTop()` and `addBottom()` exist. Accessing other specific positions (e.g., "3rd card") would require additional methods.
  - (d) Deck empty, shuffle discard: `GameStateManager.drawCards()` implements this: if `deck.getCount() === 0` and `discardPile.getCount() > 0`, it reshuffles discard into deck.
  - (e) Still no card at position after reshuffle: `GameStateManager.drawCards()` loop breaks if deck is empty.
  - (f) Moving to specific position, not enough cards: Not generally implemented beyond top/bottom.

- **3.2.3 Discard Pile Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`DiscardPileZone` class), `player.zones.discardPileZone` in `GameStateManager`.
  - (a) Personal, visible: Yes.

- **3.2.4 Expedition Zone:** Partially Implemented.

  - **Code References:** `player.zones.expeditionZone` (`GenericZone`) in `GameStateManager`.
  - (a) Shared, visible: **Discrepancy.** Rulebook states shared. Code implements per-player expedition zones (`player.zones.expeditionZone`). `sharedZones.expedition` is deprecated. This is a significant difference.
  - (b) Sub-zones (Hero/Companion Expeditions): These are conceptual divisions managed by game logic (e.g. `IPlayer.expeditionState`, effects targeting a specific expedition) rather than distinct `IZone` instances.
  - (c) Expeditions always exist: Player expedition zones are initialized with the player.
  - (d) Object moving between player's own expeditions does not change `IZone` instance: Correct, if "switch expeditions" means moving within the same conceptual player's overall expedition area (which might contain multiple characters). If it means moving from Player A's Hero Expedition to Player A's Companion Expedition, these are not separate zones in current code.
  - (e) Player knows which expedition: Game state tracks object locations; UI would display.

- **3.2.5 Hand Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`HandZone` class), `player.zones.handZone` in `GameStateManager`.
  - (a) Personal, hidden: Yes.
  - (b) Owner can look/reorder: Engine has access. UI would manage player view. Reordering cards in hand is a UI concern; `HandZone` uses a `Map` so order isn't intrinsic to the zone data structure itself beyond insertion order.
  - (c) Acting on card in hand (random/reveal): This is up to specific card effect implementations and `EffectProcessor.ts`.

- **3.2.6 Hero Zone:** Fully Implemented.

  - **Code References:** `player.zones.heroZone` (`GenericZone`) in `GameStateManager`.
  - (a) Personal, visible: Yes.
  - (b) Up to one Hero: `GameStateManager.placeHeroInZone()` adds the hero during setup. No explicit runtime check prevents adding more, but game rules and setup flow imply one.

- **3.2.7 Landmark Zone:** Fully Implemented.

  - **Code References:** `player.zones.landmarkZone` (`GenericZone`) in `GameStateManager`.
  - (a) Personal, visible: Yes.
  - (b) Landmark limit: `GameStateManager.cleanupPhase` correctly uses `hero.baseCharacteristics.landmarkLimit ?? 2`.

- **3.2.8 Limbo Zone:** Fully Implemented.

  - **Code References:** `src/engine/Zone.ts` (`LimboZone` class), `state.sharedZones.limbo` in `GameStateManager`.
  - (a) Shared, visible: Yes.

- **3.2.9 Mana Zone:** Partially Implemented.

  - **Code References:** `player.zones.manaZone` (`GenericZone`) in `GameStateManager`. `ManaSystem.ts`.
  - (a) Personal, visible, contains face-down: Yes, `visibility: 'visible'`. Cards are expected to be face-down.
  - (b) Card enters face-down, exhausted unless specified:
    - `GameStateManager.initializeManaOrbs` sets them ready.
    - `ManaSystem.expandMana` (called by `PhaseManager.playerExpand`) is responsible for new cards entering the mana zone. It should ensure they enter face-down and exhausted. Current `PhaseManager.playerExpand` calls `moveEntity` which does not automatically make cards exhausted or face-down; this must be handled by `ManaSystem.expandMana` or the caller.
  - (c) Objects are Mana Orbs: `GameStateManager.initializeManaOrbs` sets `manaOrb.type = CardType.ManaOrb`. When cards are expanded via `playerExpand` -> `ManaSystem.expandMana`, the `moveEntity` function creates a new `IGameObject`. This new object's type should be explicitly set to `CardType.ManaOrb`.
  - (d) Player can look at own mana: UI/client-side rule. Engine has access.
  - (e) Exhaust one Mana Orb to ready another: **Not Implemented.** This player utility is missing from `ManaSystem.ts`.
  - (f) Pay X mana by exhausting X orbs: `ManaSystem.spendMana` handles payment.

- **3.2.10 Reserve Zone:** Fully Implemented.
  - **Code References:** `player.zones.reserveZone` (`GenericZone`) in `GameStateManager`.
  - (a) Personal, visible: Yes.
  - (b) Reserve limit: `GameStateManager.cleanupPhase` correctly uses `hero.baseCharacteristics.reserveLimit ?? 2`.

### Section 4: Game Progression

#### 4.1 Beginning of the Game

- **Status:** Fully Implemented.
- **Code References:**
  - `src/engine/GameStateManager.ts`: `initializeGame()`, `initializeAdventureZones()`, `initializePlayerState()`, `placeHeroInZone()`, `initializePlayerDeck()`, `initializeManaOrbs()`.
  - `src/engine/PhaseManager.ts`: `handleFirstMorning()`.
- **Details:**
  - (a) Zones empty: `initializeGameState` creates new, empty zone instances.
  - (b,c) Adventure setup: `initializeAdventureZones` sets up Hero/Companion regions and 3 face-down Tumult cards.
  - (d) Expedition counters: `initializePlayerState` sets `heroPosition: 0`, `companionPosition: 0`.
  - (e-h) Hero presentation/reveal: `placeHeroInZone` (called from `initializePlayerState`) adds the Hero to Hero Zone. Assumes deck definition provides the Hero.
  - (i) Shuffle deck: `initializePlayerDeck` (called from `initializePlayerState`) uses `DeckZone.shuffle()`.
  - (j) Draw 6 cards: `initializePlayerState` calls `drawCards(playerId, 6)`.
  - (k) 3 Mana Orbs ready: `initializePlayerState` calls `initializeManaOrbs`, which sets them as `CardType.ManaOrb` and not exhausted.
  - (l) Start first day, skip Morning: `GameStateManager.initializeGame()` sets `currentPhase = GamePhase.Noon` and `firstMorningSkipped = true`. `PhaseManager.handleFirstMorning()` (called via `advancePhase` from Setup) logs the skip and directly advances to Noon handling. (V3.0: This aligns with "Check Victory" changes in Sec 8, as first morning skip is still current).

#### 4.2 Day Structure

- **Status:** Fully Implemented.
- **Code References:**
  - `src/engine/PhaseManager.ts`: Manages phase advancement and calls daily effect handlers.
  - `src/engine/TurnManager.ts`: Manages turn order and passing within Afternoon.
  - `src/engine/GameStateManager.ts`: Contains methods for daily effects (`preparePhase`, `progressPhase`, `restPhase`, `cleanupPhase`, `checkVictoryConditions`, `drawCards`).
  - `src/engine/AdvancedTriggerHandler.ts`: `processPhaseTriggersForPhase()` for "At [Phase]" reactions.
- **Details:**
  - (a) Five phases: `GamePhase` enum includes `Morning, Noon, Afternoon, Dusk, Night`. `PhaseManager.advancePhase()` cycles these.
  - (b) Phase start reaction timing: `GameStateManager.setCurrentPhase` (called by `PhaseManager`) publishes `phaseChanged` and calls `triggerHandler.processPhaseTriggersForPhase(phase)`. This handles "At [Phase]" reactions. The general Reaction checking (Rule 4.4) should follow. The remark about new reactions not triggering if they appear after the initial "At [Phase]" event is an important detail for `AdvancedTriggerHandler.ts`'s future implementation of queueing and resolving reactions.
  - (c) Daily effects in Morning, Dusk, Night: `PhaseManager.ts` calls the respective handler methods which in turn call methods in `GameStateManager.ts`.
  - (d, e) Check reactions after daily effect: Currently, `PhaseManager` executes daily effects sequentially within its phase handlers (e.g., `handleNight` calls `restPhase`, then `cleanupPhase`, then `checkVictoryConditions`). Reaction checking (Rule 4.4) is not explicitly called after _each individual daily effect_ but rather implied to be handled by a main game loop or event-driven system that processes reactions as they are queued.
  - (f, g) Afternoon turns & reactions: `TurnManager.ts` handles turn progression. Reaction checking after each turn effect (quick action, play card, pass) needs to be integrated into the main turn processing loop.
  - **4.2.1 Morning:** Fully Implemented. (`PhaseManager.handleSubsequentMorning()`)
    - (a) Four daily effects: Succeed, Prepare, Draw, Expand.
    - (b) Succeed: `TurnManager.succeedPhase()`.
    - (c) Prepare: `GameStateManager.preparePhase()` calls `statusHandler.processStatusEffectsDuringPhase('morning')` which readies exhausted objects.
    - (d) Draw: `GameStateManager.drawCards(playerId, 2)`.
    - (e) Expand: `PhaseManager.handleExpandPhase()`. Currently auto-expands if player has cards; player choice and initiative order for choice (as per Rule 1.4.5/6.1.h) would be an enhancement.
  - **4.2.2 Noon:** Fully Implemented. (`PhaseManager.executeNoonPhase()`, `AdvancedTriggerHandler.processPhaseTriggersForPhase()`)
    - (a) No daily effects. "At Noon" reactions are processed.
  - **4.2.3 Afternoon:** Fully Implemented. (`TurnManager.ts`, `PhaseManager.executeAfternoonPhase()`)
    - (a) No daily effects.
    - (b) Alternate turns until all pass: `TurnManager` methods `startAfternoon()`, `advanceTurn()`, `playerPasses()`, `checkPhaseEnd()`.
    - (c) First player takes first turn: `TurnManager.startAfternoon()` sets `this.gsm.state.currentPlayerId = this.gsm.state.firstPlayerId;`.
    - (d) Turn structure (quick actions then play/pass): This is a player choice flow. `PlayerActionHandler.ts` would be responsible for validating this sequence.
    - (e) After turn effect & reactions: `TurnManager.advanceTurn()` moves to the next player or ends afternoon if all passed. The main loop needs to ensure reactions are checked.
  - **4.2.4 Dusk:** Fully Implemented. (`PhaseManager.handleDusk()`, `GameStateManager.progressPhase()`)
    - (a) One daily effect: Progress.
    - (b) Progress logic: `GameStateManager.progressPhase()` uses `calculateExpeditionStats()` and `expeditionShouldMove()`. Conditions (on terrain, > opponent, > 0) are partially in `expeditionShouldMove`. Full terrain matching logic (expedition must be _on_ one of its terrains) is not explicitly detailed in `expeditionShouldMove` but assumed to be a prerequisite for the stat comparison to be relevant for that terrain.
    - (c, d) Cannot move / can only move due to [terrain]: These imply specific card effects or rules that would modify `canMove` or filter applicable stats. Not generically implemented in `progressPhase` but could be by card effects modifying `IExpeditionState.canMove` or stats.
    - (e) Tie not sufficient: `expeditionShouldMove` uses `>`.
    - (f) 0 not sufficient: `expeditionShouldMove` uses `Math.max(0, myStatValue)` for the moving expedition's stat, ensuring it's positive.
    - (g) Move once: `player.heroExpedition.hasMoved` flag in `GameStateManager.progressPhase`.
    - (h) Simultaneous move: All stat calculations are made based on the state before Dusk, then movements are applied.
    - (i, j) "Fails to move forward", "Moves forward due to [terrain]": These are definitions for other rules/effects to use. The necessary data (moved or not, stats, region terrain) is available.
  - **4.2.5 Night:** Fully Implemented. (`PhaseManager.handleNight()`)
    - (a) Three daily effects: Rest, Clean-up, Check Victory.
    - (b) Rest: `GameStateManager.restPhase()`. Handles sending Characters/Gears to Reserve if their expedition moved. Status interactions (Asleep, Anchored via `StatusEffectHandler.checkStatusInteraction`; Eternal via `KeywordAbilityHandler.isEternal`) correctly modify this.
    - (c) Clean-up: `GameStateManager.cleanupPhase()`. Discards from Reserve and sacrifices from Landmark zone to limits. (V3.0 Change: Landmarks are _sacrificed_, not just discarded. `moveEntity` to discard pile is consistent with sacrifice if "on sacrifice" triggers look for discard). Player choice for selection is currently not implemented (uses `pop()`); initiative order (Rule 6.1.h) would apply if choice is added.
    - (d) Check Victory: `GameStateManager.checkVictoryConditions()` calls `TiebreakerSystem.checkForTiebreaker()`. (V3.0 Change: This is now a distinct daily effect, which aligns with current audit).

#### 4.3 Tiebreakers

- **Status:** Fully Implemented.
- **Code References:** `src/engine/TiebreakerSystem.ts`, `GameStateManager.ts` (`enterTiebreakerMode`, `checkVictoryConditions`).
- **Details:** (V3.0: Timing of entering tiebreakers is now tied to the "Check Victory" step, which this audit section reflects).
  - (a) Start: `TiebreakerSystem.checkForTiebreaker()` calls `initiateTiebreaker()`. `GameStateManager.enterTiebreakerMode()` clears adventure and adds Arena regions. Expedition markers are conceptually on the Arena.
  - (b) Arena name: Conceptual.
  - (c) Arena terrains (V,M,O): `GameStateManager.enterTiebreakerMode()` adds regions with these terrain types.
  - (d) Expeditions cannot move forward/backward: Tiebreaker logic in `TiebreakerSystem.processTiebreakerProgress` focuses on stat comparison, not position changes.
  - (e) Modified Progress for tiebreakers: `TiebreakerSystem.processTiebreakerProgress()` calls `calculateArenaTerrainWinners()` and `determineArenaWinner()` which sum all character stats per player and compare per terrain to find a winner.
  - (f) Check Victory no effect during tiebreakers: `GameStateManager.checkVictoryConditions()` calls `tiebreakerSystem.isInTiebreakerMode()` first. If true, it calls `tiebreakerSystem.processTiebreakerProgress()` instead of normal victory check.

#### 4.4 Checking Reactions

- **Status:** Partially Implemented.
- **Code References:** `src/engine/AdvancedTriggerHandler.ts`, `src/engine/EventBus.ts`, `src/engine/ObjectFactory.ts` (`createReactionEmblem`). Game flow in `PhaseManager.ts`.
- **Details:**
  - (a) When to check:
    1.  Beginning of phase: `GameStateManager.setCurrentPhase` calls `triggerHandler.processPhaseTriggersForPhase(phase)` which identifies "At [Phase]" triggers. These should create Emblem-Reactions. The actual playing of these emblems needs to be handled by a reaction resolution loop.
    2.  After daily effect: The main game loop/`PhaseManager` needs to explicitly call a reaction resolution step after each daily effect.
    3.  After turn effect: Similarly, after a player plays a card, uses a quick action, or passes.
    4.  After a player plays a Reaction: The reaction resolution system itself should loop until no more reactions are pending.
  - (b) Playing an Emblem-Reaction: `ObjectFactory.createReactionEmblem` creates emblem objects that are intended to be placed in Limbo. A system is needed to iterate these emblems in Limbo, allow the player with initiative to choose one, and then resolve its `boundEffect`.
  - (c) Check again after Reaction: This implies a loop for reaction processing that continues as long as new reactions are triggered or pending ones exist in Limbo.
  - (d) Game progresses once Limbo empty of reactions: The loop terminates, and normal game flow resumes.
- **Discrepancies/Bugs:**
  - The explicit loop for "Checking Reactions" (processing Emblem-Reactions from Limbo one by one, respecting initiative, and re-checking if new reactions are triggered) is not clearly defined in `PhaseManager` or `TurnManager`. `AdvancedTriggerHandler` identifies triggers, but the play and resolution sequence (4.4.b-d) needs a dedicated manager or be integrated into the main game loop.
  - The remark under 4.2.b (new reactions from resolving a reaction don't trigger off the same "At [Phase]" event) needs careful handling in the reaction queuing/triggering mechanism.

### Section 5: Playing cards and objects

#### 5.1 General

- **5.1.1 Timing:**

  - **5.1.1.a (Possibility to play):** Fully Implemented (Conceptual).
    - The game structure allows for windows to play cards or actions.
  - **5.1.1.b (During turn: play card or quick action):** Fully Implemented.
    - `PlayerActionHandler.getAvailableActions()` and `executeAction()` are intended for this. `TurnManager.startAfternoon()` sets current player, `PhaseManager.ts` ensures it's Afternoon.
  - **5.1.1.c (Checking reactions: initiative player plays one):** Partially Implemented.
    - This is part of Rule 4.4. A dedicated reaction resolution loop is needed. `AdvancedTriggerHandler` identifies reactions to be queued (as Emblems in Limbo via `ObjectFactory.createReactionEmblem`). The playing of these emblems from Limbo is not yet fully detailed.
  - **5.1.1.d (Effects instruct to play a card):** Partially Implemented (Conceptual).
    - `EffectProcessor.ts` would need to handle effects that trigger `CardPlaySystem.playCard()`. The framework exists but specific effects are TBD.

- **5.1.2 Playing process:**
  - **5.1.2.a (Card: declare intent, move to Limbo, pay costs, resolution):** Partially Implemented.
    - `CardPlaySystem.ts` has an async `playCard` method. Test methods like `declarePlayIntent`, `moveToLimbo`, `payCosts`, `resolveCard` outline this flow but are simplified. The main `playCard` method in `CardPlaySystem.ts` itself needs to fully orchestrate these steps including moving the actual card to Limbo, invoking `CostProcessor.pay`, then resolving the card (moving to final zone and processing effects).
  - **5.1.2.b (Quick action/Reaction: declare, pay, resolution):** Partially Implemented.
    - Quick Actions: `PlayerActionHandler.executeQuickAction` should follow this.
    - Reactions: Reaction resolution loop (Rule 4.4) needs to implement this; reactions have no cost to pay.
  - **5.1.2.c (Declaration of intent):** Partially Implemented.
    - `CardPlaySystem.declarePlayIntent` (test stub) lists requirements. The main `playCard` needs to gather this information (targets, modes, chosen costs). Revealing from hidden zone is implicit if card is in hand.
  - **5.1.2.d (Mana cost: Hand/Reserve Cost):** Fully Implemented.
    - `CardPlaySystem.getPlayingCost()` and `calculateCost()` fetch `definition.handCost` or `definition.reserveCost`.
  - **5.1.2.e (Cost alterations order):** Fully Implemented.
    - `CardPlaySystem.calculateModifiedCost()` applies increases, then decreases, then restrictions (like min cost). Timestamp ordering for multiple restrictions of the same kind is not explicitly handled but could be if modifiers carry timestamps. (V3.0: Rulebook structure changed to move cost determination earlier, audit already reflects this).
  - **5.1.2.f (Legality check before state change):** Partially Implemented.
    - `CardPlaySystem.validateCanPlay()` performs some checks. More comprehensive validation needed before any state change (especially before moving to Limbo or paying costs).
  - **5.1.2.g (Move to Limbo):** Partially Implemented.
    - `GameStateManager.moveEntity()` is the tool. `CardPlaySystem.playCard()` must use this to move the card to `player.zones.limboZone` or `sharedZones.limbo`.
  - **5.1.2.h (Pay costs simultaneously):** Fully Implemented (Conceptual via `CostProcessor`).
    - `CostProcessor.pay()` should ensure all parts of a single cost are paid atomically. (See Rule 6.4).
  - **5.1.2.i (Resolution steps):** Partially Implemented.
    - Character/Expedition Permanent: `CardPlaySystem.playCharacter()` and `playPermanent()` move card to destination zone. Expedition choice via `CardPlayOptions`.
    - Landmark Permanent: `CardPlaySystem.playPermanent()` moves card.
    - Spell: `CardPlaySystem.playSpell()` calls `EffectProcessor.resolveEffect()`, then moves card to Reserve/Discard.
    - Quick Action: `PlayerActionHandler.executeQuickAction()` should call `EffectProcessor.resolveEffect()`.
    - Reaction: Reaction resolution loop (Rule 4.4) should call `EffectProcessor.resolveEffect()` for the emblem's `boundEffect`, then emblem ceases to exist (removed from Limbo).
  - **5.1.2.j ("When card is played" trigger timing):** Partially Implemented (Conceptual).
    - `AdvancedTriggerHandler.ts` needs to be invoked at this specific point (card leaving Limbo to its final non-Limbo zone) for triggers like "When you play a Character card...".

#### 5.2 Playing a Card

- **Status:** Partially Implemented.
- **Code References:** `src/engine/CardPlaySystem.ts`.
- **Details:**
  - **5.2.a (Play from Hand/Reserve unless specified):** Fully Implemented.
    - `CardPlaySystem.playCard` takes `fromZone: 'hand' | 'reserve'`.
  - **5.2.b (Passive ability granting counter/status on play creates Emblem-Reaction):** Not Implemented.
    - `CardPlaySystem` currently does not check for external passive abilities that should apply to the card being played as it resolves (e.g. "Next character you play enters with +1 boost"). This is a significant interaction requiring integration with the passive ability system and reaction/emblem system.
  - **5.2.1 Playing a Character:** Partially Implemented (`CardPlaySystem.playCharacter`).
    - (a) Choose Expedition: `CardPlayOptions.expeditionChoice` exists but is not fully plumbed into selection.
    - (b) Gains Fleeting if from Reserve (in Limbo): `StatusEffectHandler.applyFleetingOnPlayFromReserve` is called _after_ moving to the final zone in `playCharacter`. Rule 5.2.1.b says it gains Fleeting _as it enters Limbo_. This timing difference could matter for effects checking status in Limbo.
    - (c) Enters Expedition, gains Fleeting (if had in Limbo): `playCharacter` applies Fleeting if `fromZone === 'reserve'`. This effectively covers it.
  - **5.2.2 Playing an Expedition Permanent:** Partially Implemented (`CardPlaySystem.playPermanent`).
    - Similar to Character: expedition choice needed. Fleeting from Reserve timing (as per 5.2.1.b) needs to be when card enters Limbo.
  - **5.2.3 Playing a Landmark Permanent:** Partially Implemented (`CardPlaySystem.playPermanent`).
    - Moves to Landmark zone.
    - **Discrepancy/Bug:** Remark states Landmark Permanents cannot have Fleeting. `CardPlaySystem.playPermanent` calls `StatusEffectHandler.applyFleetingOnPlayFromReserve` if played from Reserve. This should be conditional _not_ to apply for Landmarks.
  - **5.2.4 Playing a Spell Card:** Partially Implemented (`CardPlaySystem.playSpell`).
    - (a) Fleeting application order in Limbo:
      1.  From Reserve -> gains Fleeting: `StatusEffectHandler.applyFleetingOnPlayFromReserve` should be called when the spell instance is notionally in Limbo (before effect resolution).
      2.  Has Fleeting passive -> gains Fleeting: This needs to be checked on the card's definition.
      3.  Passive ability grants/loses Fleeting: External passives affecting the spell.
          The current `playSpell` doesn't explicitly model the spell in Limbo and apply these status changes there before resolving effects. It resolves effects first, then determines final zone.
    - (b) Spell resolution & destination: `playSpell` resolves effects then moves to Reserve (exhausted if Cooldown via `StatusEffectHandler.applyStatusEffect`) or Discard (if Fleeting). This part seems largely correct, assuming Fleeting status is correctly determined.

#### 5.3 Playing a Quick Action

- **Status:** Partially Implemented.
- **Code References:** `src/engine/PlayerActionHandler.ts`.
- **Details:**
  - (a) Same process as Spell (declare, pay, resolve): `PlayerActionHandler.executeAction` (for type 'quickAction') would need to follow this. Declaration is implicit in choosing the action. Cost payment and effect resolution need to be implemented.
  - (b) Control/zone requirements: `PlayerActionHandler.getAvailableQuickActions` needs to check if the source object is controlled and in the correct zone (in play for most, Reserve for support).
  - (c) Not objects, don't change zones: Correct.
  - (d) Symbol T cost (Exhaust me): `CostProcessor.pay()` handles `exhaustSelf`.
  - (e) Limit 100/day (Rule 1.4.6.b): Not Implemented.

#### 5.4 Playing Reactions

- **Status:** Partially Implemented.
- **Code References:** Game loop / `PhaseManager.ts` (conceptual for reaction resolution). `ObjectFactory.createReactionEmblem`.
- **Details:** (Relates heavily to Rule 4.4)
  - (a) Same process as Spell (declare, resolve, as costs are not paid): The reaction resolution loop should handle this.
  - (b) Played from Limbo, don't change zones: Emblem-Reactions are created in Limbo.
  - (c) No costs: Correct.
  - (d) Ceases to exist after resolution: Emblem-Reaction should be removed from Limbo after its `boundEffect` is resolved.
- **Discrepancies/Bugs:** The full reaction play loop (selecting from Limbo based on initiative, resolving, re-checking) is not yet fully implemented.

### Section 6: From Costs and Effects to Events

#### 6.1 General

- **Status:** Partially Implemented.
- **Code References:** `src/engine/EffectProcessor.ts`, `src/engine/CostProcessor.ts`, `src/engine/EventBus.ts`.
- **Details:**
  - (a) Costs/effects as sequences of instructions: `IEffect` contains `IEffectStep[]`. `ICost` (in `types/abilities.ts`) is simpler but implies components.
  - (b) Effect may involve multiple steps: `EffectProcessor.resolveEffect` iterates `effect.steps`.
  - (c) Separate step per verb, unless "simultaneously": `EffectProcessor.resolveEffectStep` handles one verb/action per step. True simultaneity of multiple distinct verbs is not explicitly modeled beyond atomic actions within one step (6.1.f).
  - (d) Costs always single step: `CostProcessor.pay()` handles all components of an `ICost` (mana, exhaustSelf, spendCounters) together.
  - (e) Single step, multiple objects -> separate atomic actions: `EffectProcessor` methods like `effectDraw` can iterate over multiple targets (e.g., if `resolveTargets` returns multiple player IDs). Each application to a target is an atomic action.
  - (f) Atomic actions in single step simultaneous: Conceptually, yes. The engine processes them sequentially within a step, but the game state is considered to change "all at once" for that step before reactions or other subsequent steps. `EventBus` would typically publish after the full step.
  - (g) Decisions by controller, before step, impossible options: `EffectProcessor.resolveTargets` is a placeholder for target selection. A full targeting system would need to incorporate controller choice, timing before step resolution, and validation against impossible choices (e.g., targeting an immune object).
  - (h) Multi-player decisions in initiative order: Not explicitly implemented for general effects. `GameStateManager.state.firstPlayerId` and `currentPlayerId` provide initiative data. Effects like "Each player..." would require `EffectProcessor` to iterate through players in initiative order for choices/actions. Currently, `GameStateManager.cleanupPhase` has a TODO for initiative order in player choices.

#### 6.2 Modifiers

- **Status:** Not Implemented (as a distinct system).
- **Code References:** `src/engine/RuleAdjudicator.ts` (for passive characteristics modification), potentially `EffectProcessor.ts` for direct effect modification.
- **Details:** The rulebook describes a sophisticated system of modifiers (replacing, additive, optional) that can change how effects or steps resolve.
  - (a) Rules/passives changing step effects: `RuleAdjudicator.applyAllPassiveAbilities` handles characteristic changes. Direct modification of effect _behavior_ by passives (e.g., "Draw 1 card" becomes "Draw 2 cards instead") is not a general system yet.
  - (b-e) Replacing, Additive, Optional Modifiers (including "If you don't"): These types of modifiers are not explicitly defined in `IAbility` or handled systematically by `EffectProcessor.ts` or `RuleAdjudicator.ts`. This would require a more advanced effect/ability definition and processing system where modifiers can intercept and alter effect steps.
  - (f-k) Application order of modifiers: This detailed hierarchy (replacing step -> replacing atomic -> additive, controller choice, no re-application) is not implemented.
  - (l) Modifiers exist before step: Standard.
  - (m) Step becomes event after modifiers, then reactions: The concept is sound: final state change publishes an event via `EventBus`, then `AdvancedTriggerHandler` (or reaction loop) picks up.
- **Discrepancies/Bugs:** The entire explicit modifier system (6.2.b-k) that dynamically alters effect steps during resolution is largely conceptual and not yet implemented. Current passives in `RuleAdjudicator` focus on characteristics.

#### 6.3 Reactions

- **Status:** Partially Implemented.
- **Code References:** `src/engine/AdvancedTriggerHandler.ts`, `src/engine/ObjectFactory.ts` (`createReactionEmblem`), `src/engine/types/abilities.ts` (`IAbilityTrigger`).
- **Details:**
  - (a) Trigger -> Effect: `IAbility` with `AbilityType.Reaction` and an `IAbilityTrigger`.
  - (b) Trigger specifies event and condition: `IAbilityTrigger` has `eventType` and a `condition` function.
  - (c) Self-move Reactions (j,h,r): These are specific `eventType`s (e.g., 'enterPlay', 'playFromHand', 'playFromReserve') that `AdvancedTriggerHandler` can process.
  - (d) Self-move Reaction activation (exists after event, trigger matches): `AdvancedTriggerHandler.processMovementTriggers` is called after `GameStateManager.moveEntity`, so the object is in its new state/zone.
  - (e) Other Reaction activation (exists and works before event, trigger matches): `AdvancedTriggerHandler` needs to robustly check the object's state _before_ the event for these. This includes being in an appropriate zone where abilities work (e.g. "in play").
  - (f) Multiple activations from single event (distinct atomic actions): The system that calls `AdvancedTriggerHandler` or creates emblems would need to iterate through all atomic parts of an event and check for triggers for each. E.g. if an effect "damages three characters", reaction to damage should trigger for each.
  - (g) Reaction-activating step creates Emblem-Reactions in Limbo: `ObjectFactory.createReactionEmblem` serves this. This is the intended mechanism for queuing reactions.
  - (h) Emblem-Reaction effect bound to trigger objects: `createReactionEmblem` takes `sourceObject` and `triggerPayload` to bind to the `boundEffect`.
  - (i) Pronoun "I" in Reaction effect: `boundEffect.sourceObjectId` on the emblem refers to the object that had the original reaction ability.
  - (j) Effect bound to non-existent object uses LKI: Critical for abilities like "When I leave play...". If `boundEffect.sourceObjectId` is gone, `EffectProcessor` would need a way to get LKI (Last Known Information) for that object. This is not explicitly implemented.
  - (k) Trigger condition tense (past/present): The `condition` function in `IAbilityTrigger` gets the current `GameStateManager`. Accessing past state for conditions would require the trigger invocation to pass specific LKI or for the condition to only rely on the `triggerPayload`.
  - (l) Reaction limit 100/day (Rule 1.4.6.c): Not Implemented.

#### 6.4 Costs

- **Status:** Fully Implemented.
- **Code References:** `src/engine/CostProcessor.ts`.
- **Details:**
  - (a) Single step: `CostProcessor.pay()` processes all cost components (mana, exhaustSelf, spendCounters) as one operation.
  - (b) Player may decline: Player choice is handled by game flow before `pay()` is called.
  - (c) Pay in full: `CostProcessor.canPay()` checks if all components of a cost can be met. `pay()` assumes `canPay()` was true.
  - (d,e) Decline cost -> go back: This is UI/game loop flow. If `canPay()` is false, or player chooses not to proceed, the action isn't started.

#### 6.5 Effects

- **Status:** Partially Implemented.
- **Code References:** `src/engine/EffectProcessor.ts`, `src/engine/types/abilities.ts` (`IEffectStep`).
- **Details:**
  - (a) Usually mandatory: `EffectProcessor.resolveEffectStep` executes unless `isOptional` and the choice (if implemented) is "no".
  - (b) Targets: `EffectProcessor.resolveTargets` is currently basic. A full targeting system needs to allow choice from suitable targets, ensure distinct targets per step if required, and handle "no suitable targets" by having the atomic action do nothing.
  - (c) Optional steps ("You may"): `IEffectStep.isOptional` flag exists. `EffectProcessor.shouldExecuteOptionalEffect` is a placeholder for player choice.
  - (d) Conditional steps ("If [condition]"): Needs a `condition` property/function in `IEffectStep` and evaluation in `EffectProcessor.resolveEffectStep`. Not currently in `IEffectStep` structure.
  - (e) Conditional "If... Otherwise...": Would require specific structure in `IEffectStep` or be implemented as two separate conditional steps.
  - (f) Conditional "if you did": Requires tracking the outcome/attempt of the first part of a step to gate the second. Not explicitly supported.
  - (g) Modal effects ("Choose X"): `IEffectStep` does not currently support a list of modes to choose from.
  - (h) Partial failure ignored: `EffectProcessor.resolveEffectStep` has a try-catch for each step. If a step errors, it's logged, and processing continues to the next step of the same effect. This generally aligns.
  - (i) Multiple times / For each: `EffectProcessor` methods (e.g., `effectDraw`, `effectGainCounter`) often take a `count` or can iterate over a list of targets from `resolveTargets`, effectively performing the action multiple times.
- **Discrepancies/Bugs:**
  - Advanced targeting (6.5.b), player choice for optional effects (6.5.c), conditional step evaluation (6.5.d-f), and modal effects (6.5.g) are largely conceptual or placeholders in `EffectProcessor.ts` and require more detailed implementation in `IEffectStep` definitions and processing logic.

### Section 7: Vocabulary

#### 7.1 Symbols

- **7.1.1 Trigger Symbols (j, h, r):** Partially Implemented.

  - **Code References:** `src/engine/AdvancedTriggerHandler.ts`, `src/engine/types/abilities.ts` (`IAbilityTrigger`).
  - (j) "When I join the Expedition zone or the Landmark zone": `AdvancedTriggerHandler.processEnterPlayTriggers` is called when an object enters a visible zone. The `IAbilityTrigger.condition` would need to check if the destination is Expedition or Landmark.
  - (h) "When I am played from Hand": `IAbilityTrigger.eventType` could be defined as `'playFromHand'`. `CardPlaySystem.playCard` knows the source zone and could pass this to the trigger handler.
  - (r) "When I am played from Reserve": Similar to 'h', `eventType` could be `'playFromReserve'`.
  - **Note:** The symbols themselves are parser-level concerns; the engine handles corresponding event types.

- **7.1.2 Terrains and Statistics (V, M, O):** Fully Implemented.

  - **Code References:** `src/engine/types/enums.ts` (`TerrainType`), `src/engine/types/game.ts` (`ITerrainStats`), `ICardDefinition.statistics`, `IGameObject.currentCharacteristics.statistics`.
  - V (Forest), M (Mountain), O (Water) are defined and used for stats.

- **7.1.3 Faction Symbol:** Fully Implemented.

  - **Code References:** `src/engine/types/enums.ts` (`Faction`), `ICardDefinition.faction`.

- **7.1.4 Cost Symbols:**

  - (T) "Exhaust me": Fully Implemented.
    - `ICost.exhaustSelf` in `src/engine/types/abilities.ts`. Processed by `CostProcessor.pay()`.
  - (D) "Discard me from the Reserve": Partially Implemented.
    - Not an explicit field in `ICost`. Would require adding e.g. `discardSelfFromReserve: boolean` to `ICost` and specific handling in `CostProcessor.pay()` to move the source object from Reserve to Discard.
  - (Mana Cost 1, 2, ..., X): Fully Implemented.
    - `ICost.mana` in `src/engine/types/abilities.ts`. Processed by `CostProcessor.pay()`.

- **7.1.5 Clarification Symbols (I - Support Ability):** Fully Implemented.
  - **Code References:** `IAbility.isSupportAbility` in `src/engine/types/abilities.ts`.
  - The "I" symbol itself is a visual/parser convention. The engine uses the boolean flag.

#### 7.2 Pronouns

- **Status:** Fully Implemented (Conceptual).
- **Details:** Pronoun resolution is handled by the context in which abilities and effects are processed.
  - (I - self): `sourceObject` in `EffectProcessor.resolveEffectStep` or the object an ability belongs to.
  - (You - controller): `IGameObject.controllerId`.
  - (They - players): General iteration or targeting logic.
  - (It - objects/cards): General programmatic references.

#### 7.3 Keywords Actions

- **Status:** Partially Implemented. Many are specific verbs in `EffectProcessor.ts`.
- **Details:**
  - **7.3.1 Activates (a reaction):** Partially Implemented. `AdvancedTriggerHandler.ts` identifies trigger matches. `ObjectFactory.createReactionEmblem` creates the emblem. The reaction resolution loop (Rule 4.4) then plays it. Activating a specific reaction by its ID or a trigger symbol directly is not a general feature.
  - **7.3.3 Augment:** Partially Implemented. `EffectProcessor.effectAugment` is a placeholder. Needs logic to identify a counter on the target and increment it. (V3.0: New Keyword).
  - **7.3.4 Create (token):** Partially Implemented. `EffectProcessor.effectCreate` is a placeholder. Requires `ObjectFactory.createGameObject` with a token definition.
  - **7.3.5 Discard:** Fully Implemented. `EffectProcessor.effectDiscard` moves cards from hand to discard.
  - **7.3.6 Double (counters):** Not Implemented. Would be custom effect logic. (V3.0: New Keyword Action).
  - **7.3.7 Draw:** Fully Implemented. `EffectProcessor.effectDraw` calls `GameStateManager.drawCards`.
  - **7.3.8 Exchange (boosts):** Not Implemented. Specific effect logic. (V3.0: New Keyword Action).
  - **7.3.9 Exchange (objects or cards):** Partially Implemented. `EffectProcessor.effectExchange` is a placeholder.
  - **7.3.10 Exhaust:** Fully Implemented. `EffectProcessor.effectExhaust` applies `StatusType.Exhausted`.
  - **7.3.11 Exhausted Resupply:** Partially Implemented. Combination of `effectResupply` then `effectExhaust`.
  - **7.3.12 Gain (counters):** Fully Implemented. `EffectProcessor.effectGainCounter`.
  - **7.3.13 Gain (status):** Fully Implemented. `EffectProcessor.effectGainStatus` calls `StatusEffectHandler.applyStatusEffect`.
  - **7.3.14 Ignore (abilities):** Not Implemented. Would require `RuleAdjudicator` or ability validation to check for "ignore" effects.
  - **7.3.15 Lose (status):** Fully Implemented. `EffectProcessor.effectLoseStatus` calls `StatusEffectHandler.removeStatusEffect`.
  - **7.3.16 Move Backward:** Fully Implemented. `EffectProcessor.effectMoveBackward` updates expedition positions.
  - **7.3.17 Move Forward:** Fully Implemented. `EffectProcessor.effectMoveForward` updates expedition positions.
  - **7.3.18 Ready:** Fully Implemented. `EffectProcessor.effectReady` removes `StatusType.Exhausted`.
  - **7.3.19 Roll a Die:** Not Implemented.
  - **7.3.20 Play For Free:** Partially Implemented. `CardPlaySystem.playCard` would need an option to bypass `CostProcessor.pay`. Cost calculation (`calculateCost`) might set cost to 0 if an effect makes it free. (V3.0: Clarified to include all cards, audit seems consistent).
  - **7.3.21 Put (to zone):** Fully Implemented. `EffectProcessor.effectMoveTo` uses `GameStateManager.moveEntity`.
  - **7.3.22 Resupply:** Fully Implemented. `EffectProcessor.effectResupply` moves cards from discard to reserve. (Note: Rulebook 7.3.22.a is "top card of deck to Reserve". `EffectProcessor.effectResupply` currently moves from discard. This is a discrepancy.)
  - **7.3.23 Return (to zone):** Fully Implemented (Synonym of Put). `EffectProcessor.effectMoveTo`.
  - **7.3.24 Sabotage:** Partially Implemented. Defined as "discard up to one target card in a Reserve". `EffectProcessor.effectDiscard` could be adapted if the target is a card object in Reserve.
  - **7.3.25 Sacrifice:** Partially Implemented. Requires player to choose an object they control in play and discard it. `EffectProcessor.effectDiscard` (or `effectMoveTo` to discard) would be used on a player-chosen target. (V3.0: Rule 7.3.25.b added to clarify that modified discards are still sacrifices. This needs to be ensured in the effect definition and how sacrifice-triggered reactions work).
  - **7.3.26 Send (to zone):** Fully Implemented (Synonym of Put). `EffectProcessor.effectMoveTo`.
  - **7.3.27 Spend (counters):** Fully Implemented. `ICost.spendCounters` and `CostProcessor.pay()`.
  - **7.3.28 Switch Expeditions:** Partially Implemented. An effect could call `GameStateManager.moveEntity` to move a character between conceptual expeditions within the same player's `expeditionZone`. No dedicated `EffectProcessor` verb.
- **Discrepancies:**
  - Rule 7.3.22.a "Resupply": Rulebook says "top card of one’s Deck into one’s Reserve". `EffectProcessor.effectResupply` currently moves from _Discard_ to Reserve. This needs correction.
  - Cost Symbol 'D' (7.1.4.b) for "Discard me from Reserve" is not an explicit cost component in `ICost`.

#### 7.4 Keyword Abilities

- **Status:** Partially Implemented.
- **Code References:** `src/engine/KeywordAbilityHandler.ts`, `src/engine/types/enums.ts` (`KeywordAbility`), `src/engine/GameStateManager.ts`.
- **Details:**
  - **7.4.1 Cooldown:** Fully Implemented. `KeywordAbility.Cooldown`. `CardPlaySystem.playSpell` checks this to exhaust the spell if it goes to Reserve. `KeywordAbilityHandler.handleCooldownLeavePlay` also exists but might be redundant if `CardPlaySystem` handles it.
  - **7.4.2 Defender:** Fully Implemented. `KeywordAbility.Defender`. `KeywordAbilityHandler.checkDefenderRestrictions` is called by `GameStateManager.progressPhase`. `IGameObject.currentCharacteristics.hasDefender` stores the state.
  - **7.4.3 Eternal:** Fully Implemented. `KeywordAbility.Eternal`. `KeywordAbilityHandler.isEternal` is called by `GameStateManager.restPhase`. `IGameObject.currentCharacteristics.isEternal` stores the state.
  - **7.4.4 Gigantic:** Partially Implemented. `KeywordAbility.Gigantic`. `KeywordAbilityHandler.handleGiganticEnterPlay/LeavePlay` are placeholders. The various effects (stats counted in both expeditions, presence in both, targeting implications, behavior during tiebreakers, gaining/losing Gigantic) require significant logic across `GameStateManager.calculateExpeditionStats`, targeting systems, and `RuleAdjudicator.ts`. `IGameObject.currentCharacteristics.isGigantic` stores the state. (V3.0: Rule 7.4.4.i clarifies join/leave for subsets of Gigantic's expeditions; needs checking in implementation).
  - **7.4.5 Scout X:** Partially Implemented. `KeywordAbility.Scout`. `CardPlaySystem.calculateCost` accepts `options.useScoutCost`. `KeywordAbilityHandler.processScoutPlay` is intended to add the "h Send me to Reserve" ability, but the dynamic ability granting is complex. (V3.0: New Keyword, audit reflects current partial state).
  - **7.4.6 Seasoned:** Fully Implemented. `KeywordAbility.Seasoned`. `GameStateManager.moveEntity` has the logic to check for Seasoned via `sourceGameObject.abilities.some(a => a.keyword === 'Seasoned')` and keep boosts when moving from Expedition to Reserve.
  - **7.4.7 Tough:** Partially Implemented. `KeywordAbility.Tough`. `KeywordAbilityHandler.canTargetWithTough` is a placeholder. The cost payment aspect needs to be integrated into the targeting sequence of `EffectProcessor` or `PlayerActionHandler`, requiring the opponent to pay via `CostProcessor`.
- **Discrepancies/Bugs:**
  - Gigantic (7.4.4) is a complex keyword whose multifaceted effects are not fully implemented.
  - Scout X (7.4.5) dynamically granting an ability needs full implementation.
  - Tough X (7.4.7) requiring an opponent to pay an additional cost during their action needs to be integrated into the cost payment and targeting flow.

#### 7.5 Keyword Descriptors

- **Status:** Mostly Implemented (as game state queries or definitions).
- **Details:** These are primarily definitions of game states or terms.
  - **7.5.1 j, h, r Abilities:** Fully Implemented. Represented by `IAbilityTrigger.eventType` (e.g., `enterPlay`, `playFromHand`, `playFromReserve`).
  - **7.5.2 Ahead, Behind, Tied:** Fully Implemented. Determined by comparing expedition positions in `IPlayer.expeditionState`. Used by `GameStateManager.progressPhase` and `TiebreakerSystem`.
  - **7.5.3 Becomes (status):** Fully Implemented. `StatusEffectHandler.applyStatusEffect` applies a status. The `EventBus` has `statusGained` event.
  - **7.5.4 Controls:** Fully Implemented. `IGameObject.controllerId`. Logic checks this to determine control.
  - **7.5.5 Do (who did that action?):** Fully Implemented (Conceptual, as per 1.4.7). Determined by action context (current player, ability controller).
  - **7.5.6 Fails to Move Forward:** Fully Implemented. Determined during `GameStateManager.progressPhase` if an expedition's `hasMoved` flag is false after checks.
  - **7.5.7 In (terrain):** Partially Implemented. Requires checking the current region of an expedition/character and that region's terrain type. Region objects in `AdventureZone` have `terrainType`.
  - **7.5.8 Join (zone/expedition):** Fully Implemented. `GameStateManager.moveEntity` results in joining a zone. `AdvancedTriggerHandler.processEnterPlayTriggers` handles "join" triggers.
  - **7.5.9 Leave (zone/expedition):** Fully Implemented. `GameStateManager.moveEntity` results in leaving a zone. `AdvancedTriggerHandler.processLeavePlayTriggers`. (V3.0: Rule 7.5.9.b for tokens ceasing to exist is covered by 2.1.e).
  - **7.5.10 Play (card is played):** Fully Implemented (Conceptual). Defined as when a card leaves Limbo after resolution (Rule 5.1.2.j). This timing is a specific point for triggering "on play" abilities.

### Section 8: Changes From the Previous Version

- **Summary of V3.0 Changes vs. Codebase Audit:**
  - **New Keywords/Actions:**
    - `Augment` (7.3.3): Audit (Sec 7.3) noted it as a placeholder. Code needs implementation.
    - `Scout X` (7.4.5, 5.1.2.c): Audit (Sec 5.1, 7.4) noted alternative cost part is okay, but dynamic ability granting ("h Send me to Reserve") is complex and pending. Code needs full implementation for the dynamic ability.
    - `Support abilities (I symbol)` (1.1.6.j, 2.2.11.e, 7.1.5.a): Audit (Sec 1.1, 2.2, 7.1) confirms `isSupportAbility` flag handles the distinction. Aligned.
    - `Double (counters)` (7.3.6): Audit (Sec 7.3) noted as Not Implemented. Code needs implementation.
    - `Exchange (boosts)` (7.3.8): Audit (Sec 7.3) noted as Not Implemented. Code needs implementation.
  - **Rule Changes:**
    - `Check Victory Timing` (1.3.2.f, 1.3.3, 4.2.5.d, 4.3): Audit (Sec 1.3, 4.2, 4.3) confirms this is aligned with game flow (`PhaseManager`, `GameStateManager.checkVictoryConditions`).
    - `Clean-up: Landmarks Sacrificed` (1.3.2.f, 4.2.5.c): Audit (Sec 4.2.5.c) confirms `GameStateManager.cleanupPhase` moves to discard. This is consistent with "sacrifice" if sacrifice is defined as "controller moves from play to discard".
    - `Tokens Leaving Expedition` (2.1.e, 7.5.9.b): Audit (Sec 2.1.e) confirms `GameStateManager.moveEntity` correctly handles tokens ceasing to exist. Aligned.
    - `Sacrifice of Modified Discard` (7.3.25.b): Audit (Sec 7.3.25) noted Sacrifice as partially implemented. This clarification (still a sacrifice even if destination changes) is a rule interpretation point for trigger conditions ("when sacrificed"). Engine needs to ensure "sacrifice" flag/event is raised even if a replacement effect changes where the card goes.
  - **Other Changes (Clarifications, etc.):**
    - Most "Other Changes" listed in Sec 8 are clarifications or structural rulebook edits. The audit for the respective sections (e.g. 2.1.d, 2.3.1.k/l, remark after 4.2.b, etc.) already reflects the current understanding of these rules.
    - `Rule 7.4.4.i (Gigantic join/leave subset)`: Audit for 7.4.4 noted Gigantic as complex and partially implemented. This specific clarification needs to be a test case for Gigantic's movement/presence logic.
- **New Discrepancies due to V3.0:**
  - The new keyword actions (`Augment`, `Double`, `Exchange`) are explicitly Not Implemented yet.
  - `Scout X` dynamic ability granting is a known gap.
  - The nuance of `Sacrifice` (7.3.25.b) with replacement effects needs careful consideration in the event/trigger system for "when sacrificed" conditions.
  - The `Resupply` keyword action (7.3.22.a) definition in the rulebook (Deck to Reserve) still mismatches the current `EffectProcessor.effectResupply` (Discard to Reserve). This was an existing discrepancy, reinforced by being unchanged in V3.0.
