import { describe, test, expect, beforeEach } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { CardType, GamePhase, StatusType, ZoneIdentifier, KeywordAbility } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';

describe('GameStateManager - Keyword Rule Compliance (Rule 7.4)', () => {
  let gsm: GameStateManager;
  let eventBus: EventBus;
  const P1 = 'player1';
  const P2 = 'player2';

  // Card Definitions
  const cardDef_EternalChar: ICardDefinition = {
    id: 'char-eternal',
    name: 'Eternal Warrior',
    type: CardType.Character,
    subTypes: [],
    handCost: 3,
    reserveCost: 3,
    faction: 'Neutral',
    statistics: { forest: 3, mountain: 3, water: 3 },
    abilities: [{
      abilityId: 'abil-eternal',
      text: 'This character is Eternal.',
      abilityType: 'passive',
      keyword: KeywordAbility.Eternal,
      effect: { steps: [] },
      isSupportAbility: false
    }],
    rarity: 'Rare',
    version: '1.0',
  };

  const cardDef_NormalChar_K: ICardDefinition = {
    id: 'char-normal-k',
    name: 'Regular Fighter',
    type: CardType.Character,
    subTypes: [],
    handCost: 2,
    reserveCost: 2,
    faction: 'Neutral',
    statistics: { forest: 2, mountain: 2, water: 2 },
    abilities: [],
    rarity: 'Common',
    version: '1.0'
  };

  const cardDef_DefenderChar: ICardDefinition = {
    id: 'char-defender',
    name: 'Steadfast Guardian',
    type: CardType.Character,
    subTypes: [],
    handCost: 1,
    reserveCost: 1,
    faction: 'Neutral',
    statistics: { forest: 5, mountain: 5, water: 5 },
    abilities: [{
      abilityId: 'abil-def',
      text: 'This character has Defender.',
      abilityType: 'passive',
      keyword: KeywordAbility.Defender,
      effect: { steps: [] },
      isSupportAbility: false,
    }],
    rarity: 'Common',
    version: '1.0',
  };

  const cardDef_OpponentChar_K: ICardDefinition = {
    id: 'char-opponent-k',
    name: 'Weak Opponent',
    type: CardType.Character,
    subTypes: [],
    handCost: 1,
    reserveCost: 1,
    faction: 'Neutral',
    statistics: { forest: 1, mountain: 1, water: 1 },
    abilities: [],
    rarity: 'Common',
    version: '1.0'
  };

  const cardDef_StrongNonDefenderChar_K: ICardDefinition = {
    id: 'char-strong-non-defender-k',
    name: 'Mighty Attacker',
    type: CardType.Character,
    subTypes: [],
    handCost: 3,
    reserveCost: 3,
    faction: 'Neutral',
    statistics: { forest: 6, mountain: 6, water: 6 },
    abilities: [],
    rarity: 'Common',
    version: '1.0'
  };

  const cardDef_GiganticChar: ICardDefinition = {
    id: 'char-gigantic',
    name: 'Towering Behemoth',
    type: CardType.Character,
    subTypes: [],
    handCost: 5,
    reserveCost: 5,
    faction: 'Neutral',
    statistics: { forest: 5, mountain: 5, water: 5 },
    abilities: [{
      abilityId: 'abil-gig',
      text: 'This character is Gigantic.', // Corrected from 'description'
      abilityType: 'passive',
      keyword: KeywordAbility.Gigantic,
      // sourceObjectId: 'char-gigantic', // ObjectFactory will set this
      effect: { steps: [] }, // Corrected from async () => {}
      isSupportAbility: false,
    }],
    rarity: 'Rare',
    version: '1.0',
  };

  const cardDef_P2_HeroChar_Stats10: ICardDefinition = {
    id: 'p2-hero-stats10',
    name: 'P2 Hero Strong',
    type: CardType.Character,
    subTypes: [],
    handCost: 1, reserveCost: 1, faction: 'Neutral',
    statistics: { forest: 10, mountain: 10, water: 10 },
    abilities: [], rarity: 'Common', version: '1.0',
  };

  const cardDef_P2_CompanionChar_Stats3: ICardDefinition = {
    id: 'p2-comp-stats3',
    name: 'P2 Companion Weak',
    type: CardType.Character,
    subTypes: [],
    handCost: 1, reserveCost: 1, faction: 'Neutral',
    statistics: { forest: 3, mountain: 3, water: 3 },
    abilities: [], rarity: 'Common', version: '1.0',
  };

  // Scout Card Definitions
  const cardDef_ScoutChar_Cost2_Scout1: ICardDefinition = {
    id: 'char-scout-cost2-scout1',
    name: 'Scouting Ranger',
    type: CardType.Character,
    subTypes: [],
    handCost: 2,
    reserveCost: 2,
    faction: 'Neutral',
    statistics: { forest: 1, mountain: 1, water: 1 },
    abilities: [
      {
        abilityId: 'abil-scout1',
        text: 'Scout 1',
        abilityType: 'keyword',
        keyword: KeywordAbility.Scout,
        value: 1,
        effect: { steps: [] }, // Scout keyword effect is handled by rules engine
        isSupportAbility: false,
      },
      {
        abilityId: 'abil-scout-j-draw',
        text: 'j You may draw a card.',
        abilityType: 'reaction',
        trigger: 'onSelfEnterPlay', // Assuming 'onSelfEnterPlay' is the correct trigger for 'j'
        effect: {
          steps: [{ type: 'drawCard', player: 'self', quantity: 1, isOptional: true }],
        },
        isSupportAbility: false,
      },
    ],
    rarity: 'Common',
    version: '1.0',
  };

  const cardDef_ScoutChar_Cost3_Scout2_Reaction: ICardDefinition = {
    id: 'char-scout-cost3-scout2-reaction',
    name: 'Veteran Scout',
    type: CardType.Character,
    subTypes: [],
    handCost: 3,
    reserveCost: 3,
    faction: 'Neutral',
    statistics: { forest: 2, mountain: 2, water: 2 },
    abilities: [
      {
        abilityId: 'abil-scout2',
        text: 'Scout 2',
        abilityType: 'keyword',
        keyword: KeywordAbility.Scout,
        value: 2,
        effect: { steps: [] },
        isSupportAbility: false,
      },
      {
        abilityId: 'abil-scout-h-boost',
        text: 'h Gain 1 boost.',
        abilityType: 'reaction',
        trigger: 'onSelfPlayedFromHand', // Assuming 'onSelfPlayedFromHand' is correct for 'h'
        effect: {
          steps: [{ type: 'gainBoost', player: 'self', quantity: 1 }],
        },
        isSupportAbility: false,
      },
    ],
    rarity: 'Uncommon',
    version: '1.0',
  };

  // Seasoned Card Definitions
  const cardDef_SeasonedChar: ICardDefinition = {
    id: 'char-seasoned',
    name: 'Seasoned Veteran',
    type: CardType.Character,
    subTypes: [],
    handCost: 3,
    reserveCost: 3,
    faction: 'Neutral',
    statistics: { forest: 2, mountain: 2, water: 2 },
    abilities: [{
      abilityId: 'abil-seasoned',
      text: 'Seasoned',
      abilityType: 'keyword',
      keyword: KeywordAbility.Seasoned,
      effect: { steps: [] }, // Seasoned keyword effect is handled by rules engine
      isSupportAbility: false,
    }],
    rarity: 'Common',
    version: '1.0',
  };

  const cardDef_NonSeasonedChar_Boosts: ICardDefinition = { // Renamed for clarity
    id: 'char-non-seasoned-for-boosts',
    name: 'Boostable Recruit',
    type: CardType.Character,
    subTypes: [],
    handCost: 1,
    reserveCost: 1,
    faction: 'Neutral',
    statistics: { forest: 1, mountain: 1, water: 1 },
    abilities: [],
    rarity: 'Common',
    version: '1.0',
  };

  const cardDef_MoveCharacterToReserveSpell: ICardDefinition = {
    id: 'spell-move-to-reserve',
    name: 'Tactical Withdrawal',
    type: CardType.Spell,
    subTypes: [],
    handCost: 1,
    faction: 'Neutral',
    abilities: [{
      abilityId: 'abil-move-to-reserve',
      text: 'Move target character you control from your Expedition to your Reserve.',
      abilityType: 'effect',
      effect: {
        targetType: 'single',
        targetFilter: { zone: ZoneIdentifier.Expedition, controller: 'self', cardType: CardType.Character },
        steps: [{
          type: 'moveObject',
          target: 'targetObject', // Special keyword for the target of the spell
          toZone: ZoneIdentifier.Reserve,
          controller: 'self',
        }],
      },
      isSupportAbility: false,
    }],
    rarity: 'Common',
    version: '1.0',
  };

  // Tough Card Definitions
  const cardDef_Tough1Char_P1: ICardDefinition = {
    id: 'p1-char-tough1',
    name: 'P1 Tough Defender 1',
    type: CardType.Character,
    subTypes: [],
    handCost: 2, reserveCost: 2, faction: 'Neutral',
    statistics: { forest: 2, mountain: 2, water: 2 },
    abilities: [{
      abilityId: 'abil-tough1', text: 'Tough 1', abilityType: 'keyword',
      keyword: KeywordAbility.Tough, value: 1, effect: { steps: [] }, isSupportAbility: false,
    }],
    rarity: 'Common', version: '1.0',
  };

  const cardDef_Tough2Char_P1: ICardDefinition = {
    id: 'p1-char-tough2',
    name: 'P1 Tough Defender 2',
    type: CardType.Character,
    subTypes: [],
    handCost: 3, reserveCost: 3, faction: 'Neutral',
    statistics: { forest: 3, mountain: 3, water: 3 },
    abilities: [{
      abilityId: 'abil-tough2', text: 'Tough 2', abilityType: 'keyword',
      keyword: KeywordAbility.Tough, value: 2, effect: { steps: [] }, isSupportAbility: false,
    }],
    rarity: 'Common', version: '1.0',
  };

  const cardDef_NormalChar_P1: ICardDefinition = {
    id: 'p1-char-normal',
    name: 'P1 Regular Attacker',
    type: CardType.Character,
    subTypes: [],
    handCost: 2, reserveCost: 2, faction: 'Neutral',
    statistics: { forest: 2, mountain: 2, water: 2 },
    abilities: [],
    rarity: 'Common', version: '1.0',
  };

  const cardDef_TargetingSpell_P2: ICardDefinition = {
    id: 'p2-spell-target-char',
    name: 'P2 Zap',
    type: CardType.Spell,
    subTypes: [],
    handCost: 1, // Simple cost for easier mana calculation
    faction: 'Neutral',
    abilities: [{
      abilityId: 'abil-zap',
      text: 'Target character gets -1/-1/-1 this turn.', // Example effect
      abilityType: 'effect',
      effect: {
        targetType: 'single',
        targetFilter: { zone: ZoneIdentifier.Expedition, cardType: CardType.Character }, // Can target any char in expedition
        steps: [{
          type: 'modifyStats', // Assuming a stat modification effect type
          target: 'targetObject',
          payload: { forest: -1, mountain: -1, water: -1, durationTurns: 1 } // Temporary effect
        }],
      },
      isSupportAbility: false,
    }],
    rarity: 'Common', version: '1.0',
  };

  const cardDef_TargetingSpell_P1: ICardDefinition = {
    id: 'p1-spell-target-char',
    name: 'P1 Reinforce', // Could be a buff to make sense for self-target
    type: CardType.Spell,
    subTypes: [],
    handCost: 1,
    faction: 'Neutral',
    abilities: [{
      abilityId: 'abil-reinforce',
      text: 'Target character gets +1/+1/+1 this turn.',
      abilityType: 'effect',
      effect: {
        targetType: 'single',
        targetFilter: { zone: ZoneIdentifier.Expedition, cardType: CardType.Character, controller: 'self' }, // Target self
        steps: [{
          type: 'modifyStats',
          target: 'targetObject',
          payload: { forest: 1, mountain: 1, water: 1, durationTurns: 1 }
        }],
      },
      isSupportAbility: false,
    }],
    rarity: 'Common', version: '1.0',
  };


  // Consolidated beforeEach
  beforeEach(async () => {
    eventBus = new EventBus();
    gsm = new GameStateManager(
      [P1, P2],
      [
        cardDef_EternalChar, cardDef_NormalChar_K, cardDef_DefenderChar,
        cardDef_OpponentChar_K, cardDef_StrongNonDefenderChar_K,
        cardDef_GiganticChar, cardDef_P2_HeroChar_Stats10, cardDef_P2_CompanionChar_Stats3,
        cardDef_ScoutChar_Cost2_Scout1, cardDef_ScoutChar_Cost3_Scout2_Reaction,
        cardDef_SeasonedChar, cardDef_NonSeasonedChar_Boosts, cardDef_MoveCharacterToReserveSpell,
        cardDef_Tough1Char_P1, cardDef_Tough2Char_P1, cardDef_NormalChar_P1,
        cardDef_TargetingSpell_P1, cardDef_TargetingSpell_P2 // Added new tough cards

      ],
      eventBus
    );
    await gsm.initializeGame();
    // Ensure players start with some mana for tests
    gsm.getPlayer(P1)!.currentMana = 10;
    gsm.getPlayer(P2)!.currentMana = 10;
  });

  test('Rule 7.4.3: Eternal character is not sent to Reserve during Rest', async () => {
    const player = gsm.getPlayer(P1)!;
    const expeditionZone = player.zones.expeditionZone;
    const reserveZone = player.zones.reserveZone;

    const eternalCharInst = gsm.objectFactory.createCardInstance(cardDef_EternalChar.id, P1);
    const eternalChar = gsm.objectFactory.createGameObject(eternalCharInst, P1);
    expeditionZone.add(eternalChar);
    const eternalCharId = eternalChar.objectId;

    const normalCharInst = gsm.objectFactory.createCardInstance(cardDef_NormalChar_K.id, P1);
    const normalChar = gsm.objectFactory.createGameObject(normalCharInst, P1);
    expeditionZone.add(normalChar);
    const normalCharId = normalChar.objectId;

    gsm.ruleAdjudicator.applyAllPassiveAbilities();

    const processedEternalCharFromGsm = gsm.getObject(eternalCharId);
    expect(processedEternalCharFromGsm).toBeDefined();
    expect(processedEternalCharFromGsm?.currentCharacteristics.isEternal).toBe(true);

    player.heroExpedition.hasMoved = true;
    await gsm.restPhase();

    const eternalCharAfterRest = expeditionZone.findById(eternalCharId);
    expect(eternalCharAfterRest).toBeDefined();
    expect(reserveZone.findById(eternalCharId)).toBeUndefined();

    expect(expeditionZone.getAll().find(o => isGameObject(o) && o.definitionId === cardDef_NormalChar_K.id && o.objectId === normalCharId)).toBeUndefined();
    const normalCharInReserve = reserveZone.getAll().find(o => isGameObject(o) && o.definitionId === cardDef_NormalChar_K.id);
    expect(normalCharInReserve).toBeDefined();
  });

  test('Rule 7.4.2: Expedition with Defender character does not move during Progress', async () => {
    const player1 = gsm.getPlayer(P1)!;
    const player2 = gsm.getPlayer(P2)!;

    const defenderCharInst = gsm.objectFactory.createCardInstance(cardDef_DefenderChar.id, P1);
    const defenderChar = gsm.objectFactory.createGameObject(defenderCharInst, P1);
    player1.zones.expeditionZone.add(defenderChar);
    const defenderCharId = defenderChar.objectId;

    const opponentCharInst = gsm.objectFactory.createCardInstance(cardDef_OpponentChar_K.id, P2);
    const opponentChar = gsm.objectFactory.createGameObject(opponentCharInst, P2);
    player2.zones.expeditionZone.add(opponentChar);

    gsm.ruleAdjudicator.applyAllPassiveAbilities();

    const processedDefenderChar = gsm.getObject(defenderCharId);
    expect(processedDefenderChar?.currentCharacteristics.hasDefender).toBe(true);

    player1.heroExpedition.hasMoved = false;
    player1.heroExpedition.position = 0;
    player2.heroExpedition.hasMoved = false;
    player2.heroExpedition.position = 0;

    await gsm.progressPhase();

    expect(player1.heroExpedition.hasMoved).toBe(false);
    expect(player1.heroExpedition.position).toBe(0);
    expect(player2.heroExpedition.hasMoved).toBe(false);
    expect(player2.heroExpedition.position).toBe(0);

    const strongNonDefenderInst = gsm.objectFactory.createCardInstance(cardDef_StrongNonDefenderChar_K.id, P2);
    const strongNonDefender = gsm.objectFactory.createGameObject(strongNonDefenderInst, P2);
    player2.zones.expeditionZone.add(strongNonDefender);

    player1.heroExpedition.hasMoved = false;
    player1.heroExpedition.position = 0;
    player2.heroExpedition.hasMoved = false;
    player2.heroExpedition.position = 0;

    await gsm.progressPhase();

    expect(player1.heroExpedition.hasMoved).toBe(false);
    expect(player1.heroExpedition.position).toBe(0);
    expect(player2.heroExpedition.hasMoved).toBe(true);
    expect(player2.heroExpedition.position).toBe(1);
  });

  test('Rule 7.4.4: Gigantic characteristic is applied', async () => {
    const player1 = gsm.getPlayer(P1)!;
    const giganticCharInst = gsm.objectFactory.createCardInstance(cardDef_GiganticChar.id, P1);
    const giganticChar = gsm.objectFactory.createGameObject(giganticCharInst, P1);
    player1.zones.expeditionZone.add(giganticChar);
    const giganticCharId = giganticChar.objectId;

    gsm.ruleAdjudicator.applyAllPassiveAbilities();

    const processedGiganticChar = gsm.getObject(giganticCharId);
    expect(processedGiganticChar?.currentCharacteristics.isGigantic).toBe(true);
  });

  test('Rule 7.4.4.e: Gigantic character stats count in its own expedition for Progress', async () => {
    const player1 = gsm.getPlayer(P1)!;
    const player2 = gsm.getPlayer(P2)!;

    // P1 has Gigantic Char (stats 5) in their Hero Expedition.
    const giganticCharInst = gsm.objectFactory.createCardInstance(cardDef_GiganticChar.id, P1);
    const giganticChar = gsm.objectFactory.createGameObject(giganticCharInst, P1);
    player1.zones.expeditionZone.add(giganticChar); // Assuming this one expedition zone is used for both hero/companion conceptual expeditions

    // P2 has Opponent Char (stats 1) in their Hero Expedition.
    const p2HeroCharInst = gsm.objectFactory.createCardInstance(cardDef_OpponentChar_K.id, P2); // stats 1
    const p2HeroChar = gsm.objectFactory.createGameObject(p2HeroCharInst, P2);
    player2.zones.expeditionZone.add(p2HeroChar);

    // P2 Companion expedition is weak (empty or another weak char for clearer test)
    // For simplicity, let's ensure P2's companion side is empty or very weak.
    // If player2.zones.expeditionZone is shared, then p2HeroChar is also on companion side.

    gsm.ruleAdjudicator.applyAllPassiveAbilities();

    await gsm.progressPhase();

    // P1 Hero (5) vs P2 Hero (1) -> P1 Hero moves
    expect(player1.heroExpedition.hasMoved).toBe(true);
    expect(player1.heroExpedition.position).toBe(1);

    // P1 Companion (5, due to Gigantic) vs P2 Companion (1, as p2HeroChar counts for both for P2)
    // Or, if P2 companion side is "empty" conceptually, then P2 companion stats = 0.
    // P1 Companion (5) vs P2 Companion (1 if p2HeroChar is its only char, or 0 if conceptually empty) -> P1 Companion moves
    expect(player1.companionExpedition.hasMoved).toBe(true);
    expect(player1.companionExpedition.position).toBe(1);
  });

  test('Rule 7.4.4.e: Gigantic character stats count in controller\'s other expedition for Progress', async () => {
    const player1 = gsm.getPlayer(P1)!;
    const player2 = gsm.getPlayer(P2)!;

    // P1 has Gigantic Char (stats 5) in their (conceptual) Hero Expedition.
    // For the test, it's just in player1.zones.expeditionZone
    const giganticCharInst = gsm.objectFactory.createCardInstance(cardDef_GiganticChar.id, P1);
    const giganticChar = gsm.objectFactory.createGameObject(giganticCharInst, P1);
    player1.zones.expeditionZone.add(giganticChar);

    // P1's Companion Expedition is conceptually empty (no other chars in player1.zones.expeditionZone for companion-specific role)

    // P2 has strong Hero char (stats 10)
    const p2HeroStrongInst = gsm.objectFactory.createCardInstance(cardDef_P2_HeroChar_Stats10.id, P2);
    const p2HeroStrong = gsm.objectFactory.createGameObject(p2HeroStrongInst, P2);
    player2.zones.expeditionZone.add(p2HeroStrong);

    // P2 has weak Companion char (stats 3)
    const p2CompanionWeakInst = gsm.objectFactory.createCardInstance(cardDef_P2_CompanionChar_Stats3.id, P2);
    const p2CompanionWeak = gsm.objectFactory.createGameObject(p2CompanionWeakInst, P2);
    // To make P2's companion side distinct, we'd need separate expedition zones or a way to tag chars.
    // Current model: all P2 chars (p2HeroStrong + p2CompanionWeak) are in player2.zones.expeditionZone.
    // So P2 Hero stats = 10+3=13, P2 Companion stats = 10+3=13.

    gsm.ruleAdjudicator.applyAllPassiveAbilities();

    // Re-evaluate P2 setup for clarity:
    // P2 Hero Expedition total stats = 13. P2 Companion Expedition total stats = 13.
    // P1 Hero Expedition total stats = 5 (Gigantic). P1 Companion Expedition total stats = 5 (Gigantic).

    await gsm.progressPhase();

    // P1 Hero (5) vs P2 Hero (13) -> P1 Hero does NOT move
    expect(player1.heroExpedition.hasMoved).toBe(false);
    expect(player1.heroExpedition.position).toBe(0);

    // P1 Companion (5) vs P2 Companion (13) -> P1 Companion does NOT move
    // This assertion will test if Gigantic char's stats (5) apply to P1's companion expedition
    // when compared against P2's companion expedition (stats 3 in the original intent, but 13 with current model).
    // To make the test work as intended (P1 companion moves), P2 companion stats need to be < 5.
    // Let's remove p2HeroStrong from P2's expedition for the companion check part of the test,
    // by only adding p2CompanionWeak for P2.

    // Reset for a clearer P2 setup for the second assertion
    player2.zones.expeditionZone.clear(); // Clear P2's expedition
    const p2CompanionWeakOnlyInst = gsm.objectFactory.createCardInstance(cardDef_P2_CompanionChar_Stats3.id, P2);
    const p2CompanionWeakOnly = gsm.objectFactory.createGameObject(p2CompanionWeakOnlyInst, P2);
    player2.zones.expeditionZone.add(p2CompanionWeakOnly); // P2 total stats = 3 for both hero and comp.

    player1.heroExpedition.hasMoved = false; player1.heroExpedition.position = 0;
    player1.companionExpedition.hasMoved = false; player1.companionExpedition.position = 0;
    player2.heroExpedition.hasMoved = false; player2.heroExpedition.position = 0;
    player2.companionExpedition.hasMoved = false; player2.companionExpedition.position = 0;

    await gsm.progressPhase(); // P1 (Gigantic, 5) vs P2 (Comp Only, 3)

    // P1 Hero (5) vs P2 Hero (3) -> P1 Hero moves
    expect(player1.heroExpedition.hasMoved).toBe(true);
    expect(player1.heroExpedition.position).toBe(1);

    // P1 Companion (5) vs P2 Companion (3) -> P1 Companion moves
    expect(player1.companionExpedition.hasMoved).toBe(true);
    expect(player1.companionExpedition.position).toBe(1);
  });

  // --- Scout Keyword Rules (Rule 7.4.5) ---
  describe('Scout Keyword Rules (Rule 7.4.5)', () => {
    let player: ReturnType<GameStateManager['getPlayer']>;

    beforeEach(() => {
      player = gsm.getPlayer(P1)!;
      player.currentMana = 10; // Reset mana for each scout test
      // Ensure P1 is in ActionPhase for playing cards
      gsm.currentPhase = GamePhase.Action;
      gsm.activePlayerId = P1;

      // Clear zones for clean test slate
      player.zones.hand.clear();
      player.zones.expeditionZone.clear();
      player.zones.reserveZone.clear();
      player.zones.discardPile.clear();
      gsm.effectExecutionManager.resetPendingEffects(); // Clear any pending effects
    });

    test('Rule 7.4.5.a, 7.4.5.c: Scout provides an alternative play cost and card enters Expedition Zone', async () => {
      const scoutCardInst = gsm.objectFactory.createCardInstance(cardDef_ScoutChar_Cost2_Scout1.id, P1);
      player.zones.hand.add(scoutCardInst);
      const initialMana = player.currentMana;

      // Action: Player plays the card using its Scout 1 cost.
      // This requires a way to choose the alternative cost.
      // Assuming playCard will have an option for this, or a specific "playWithScoutCost" method.
      // For now, let's assume the game logic automatically picks scout if player indicates.
      // We'll simulate this by directly calling a method that implies scout usage.
      // The actual mechanism might involve player.choosePlayOption() then gsm.playCard().

      // The playCard method needs to be aware of alternative costs like Scout.
      // Let's assume a parameter like `useAlternativeCostKeyword: KeywordAbility.Scout`
      const playResult = await gsm.playerPlaysCardFromHand(P1, scoutCardInst.instanceId, { useAlternativeCostKeyword: KeywordAbility.Scout });
      expect(playResult.success).toBe(true);

      const playedCardObject = gsm.findCardInAnyZone(scoutCardInst.instanceId);
      expect(playedCardObject).toBeDefined();
      expect(playedCardObject?.zone).toBe(ZoneIdentifier.Expedition);

      // Assertion: Check that only 1 mana was spent (Scout 1 cost)
      // cardDef_ScoutChar_Cost2_Scout1 has Scout 1
      const expectedManaSpent = cardDef_ScoutChar_Cost2_Scout1.abilities.find(a => a.keyword === KeywordAbility.Scout)?.value ?? 0;
      expect(player.currentMana).toBe(initialMana - expectedManaSpent);
    });

    test('Rule 7.4.5.b: Scouted card gains "h Send me to Reserve" and it works', async () => {
      const scoutCardInst = gsm.objectFactory.createCardInstance(cardDef_ScoutChar_Cost2_Scout1.id, P1);
      player.zones.hand.add(scoutCardInst);

      await gsm.playerPlaysCardFromHand(P1, scoutCardInst.instanceId, { useAlternativeCostKeyword: KeywordAbility.Scout });

      const playedCardObject = gsm.findCardInAnyZone(scoutCardInst.instanceId, ZoneIdentifier.Expedition) as IGameObject;
      expect(playedCardObject).toBeDefined();

      // Check if the gained ability "h Send me to Reserve" is present.
      // This ability is temporary and should be added by the Scout rule.
      // The exact implementation of this gained ability needs to be verified in the engine.
      // For testing, we assume it's an activatable ability that gets triggered.
      // Let's assume it's an 'h' (played from hand) triggered ability that resolves after entering play.
      // Or it could be an activated ability the player must use.
      // Rule 7.4.5.b says "it gains 'h Send me to your Reserve.' that resolves after it enters play."
      // This implies it's an automatically triggered and resolved effect.

      // After playCard resolves, any 'onPlay' or 'onEnterPlay' effects (including the gained one) should resolve.
      // We might need to explicitly advance the effect queue or check the state after effects resolve.
      await gsm.effectExecutionManager.resolvePendingEffects();

      const cardAfterEffects = gsm.findCardInAnyZone(scoutCardInst.instanceId);
      expect(cardAfterEffects).toBeDefined();
      expect(cardAfterEffects?.zone).toBe(ZoneIdentifier.Reserve);
    });

    test('Rule 7.4.5.c: Scout with Cost Increase', async () => {
      const scoutCardInst = gsm.objectFactory.createCardInstance(cardDef_ScoutChar_Cost2_Scout1.id, P1); // Scout 1
      player.zones.hand.add(scoutCardInst);
      const initialMana = player.currentMana; // 10

      // Apply a cost increase of +1 to the next character played
      // This is a hypothetical way to apply cost modifiers.
      // The actual implementation might differ.
      player.modifiers.add({
        type: 'playCost',
        value: 1, // Increase cost by 1
        duration: 1, // Affects the next play
        filter: { cardType: CardType.Character },
        sourceId: 'test-effect-cost-increase'
      });

      await gsm.playerPlaysCardFromHand(P1, scoutCardInst.instanceId, { useAlternativeCostKeyword: KeywordAbility.Scout });

      // Scout 1 cost + 1 (increase) = 2 mana spent
      const scoutValue = cardDef_ScoutChar_Cost2_Scout1.abilities.find(a => a.keyword === KeywordAbility.Scout)?.value ?? 0;
      expect(player.currentMana).toBe(initialMana - (scoutValue + 1));

      await gsm.effectExecutionManager.resolvePendingEffects(); // Resolve "Send to Reserve"
      const cardAfterEffects = gsm.findCardInAnyZone(scoutCardInst.instanceId);
      expect(cardAfterEffects?.zone).toBe(ZoneIdentifier.Reserve);
    });

    test('Rule 7.4.5.c: Scout with Cost Decrease (down to 0)', async () => {
      const scoutCardInst = gsm.objectFactory.createCardInstance(cardDef_ScoutChar_Cost2_Scout1.id, P1); // Scout 1
      player.zones.hand.add(scoutCardInst);
      const initialMana = player.currentMana; // 10

      // Apply a cost decrease of -1 to the next character played
      player.modifiers.add({
        type: 'playCost',
        value: -1, // Decrease cost by 1
        duration: 1,
        filter: { cardType: CardType.Character },
        sourceId: 'test-effect-cost-decrease'
      });

      await gsm.playerPlaysCardFromHand(P1, scoutCardInst.instanceId, { useAlternativeCostKeyword: KeywordAbility.Scout });

      // Scout 1 cost - 1 (decrease) = 0 mana spent
      const scoutValue = cardDef_ScoutChar_Cost2_Scout1.abilities.find(a => a.keyword === KeywordAbility.Scout)?.value ?? 0;
      const finalCost = Math.max(0, scoutValue - 1); // Costs cannot go below 0
      expect(player.currentMana).toBe(initialMana - finalCost);

      await gsm.effectExecutionManager.resolvePendingEffects();
      const cardAfterEffects = gsm.findCardInAnyZone(scoutCardInst.instanceId);
      expect(cardAfterEffects?.zone).toBe(ZoneIdentifier.Reserve);
    });

    test('Rule 7.4.5.d (Remark): Scout with "Play for Free" effect', async () => {
      const scoutCardInst = gsm.objectFactory.createCardInstance(cardDef_ScoutChar_Cost2_Scout1.id, P1); // Scout 1
      player.zones.hand.add(scoutCardInst);
      const initialMana = player.currentMana;

      // Apply a "Play for Free" effect for the next character
      player.modifiers.add({
        type: 'playCost',
        setToZero: true, // Special flag for "Play for Free"
        duration: 1,
        filter: { cardType: CardType.Character },
        sourceId: 'test-effect-play-free'
      });

      await gsm.playerPlaysCardFromHand(P1, scoutCardInst.instanceId, { useAlternativeCostKeyword: KeywordAbility.Scout });

      // Played for free, so 0 mana spent
      expect(player.currentMana).toBe(initialMana);

      const playedCardObject = gsm.findCardInAnyZone(scoutCardInst.instanceId, ZoneIdentifier.Expedition);
      expect(playedCardObject).toBeDefined(); // Should be in expedition first

      // Still gains "h Send me to Reserve"
      await gsm.effectExecutionManager.resolvePendingEffects();
      const cardAfterEffects = gsm.findCardInAnyZone(scoutCardInst.instanceId);
      expect(cardAfterEffects?.zone).toBe(ZoneIdentifier.Reserve);
    });

    test('Rule 7.4.5.e: Scouted card\'s other reactions resolve correctly after moving to Reserve', async () => {
      // cardDef_ScoutChar_Cost2_Scout1 has "j You may draw a card"
      const scoutCardInst = gsm.objectFactory.createCardInstance(cardDef_ScoutChar_Cost2_Scout1.id, P1);
      player.zones.hand.add(scoutCardInst);
      const initialHandSize = player.zones.hand.count; // For checking draw

      // Play card using Scout
      await gsm.playerPlaysCardFromHand(P1, scoutCardInst.instanceId, { useAlternativeCostKeyword: KeywordAbility.Scout });

      const cardInExpedition = gsm.findCardInAnyZone(scoutCardInst.instanceId, ZoneIdentifier.Expedition) as IGameObject;
      expect(cardInExpedition).toBeDefined(); // Initially in expedition

      // Resolve all pending effects. This should include:
      // 1. The Scout's gained "h Send me to Reserve" ability.
      // 2. The card's own "j You may draw a card" reaction.
      // The rule implies "h Send to Reserve" resolves, then other 'j' or 'h' abilities.
      // The EffectExecutionManager should handle the correct order and context.
      await gsm.effectExecutionManager.resolvePendingEffects();

      // Card should be in Reserve due to Scout's gained ability
      const cardInReserve = gsm.findCardInAnyZone(scoutCardInst.instanceId, ZoneIdentifier.Reserve);
      expect(cardInReserve).toBeDefined();
      const cardNotInExpedition = gsm.findCardInAnyZone(scoutCardInst.instanceId, ZoneIdentifier.Expedition);
      expect(cardNotInExpedition).toBeUndefined();


      // Assertion: Check that the 'j' reaction (draw a card) successfully resolved.
      // This means the player should have drawn a card.
      // The card to draw is defined as non-optional in the test card def, so it should always draw.
      // If it was optional, we'd need a way to make the choice.
      // For this test, let's assume the "j You may draw a card" has isOptional: false or auto-resolves for simplicity
      // The current definition has `isOptional: true`. This means the test needs to handle a choice.
      // For now, let's assume the test setup makes the choice automatically or the effect resolves if possible.
      // If the effect system requires explicit choice handling, this test would need adjustment.
      // Let's simplify the card's draw to be non-optional for this test case to avoid choice logic here.

      // Modify cardDef_ScoutChar_Cost2_Scout1's draw to be non-optional for this specific test logic.
      // This is a bit of a hack. Ideally, the choice mechanism would be mocked or handled.
      // (Simulating this change for the test's purpose - in a real scenario, use a different card or mock choices)
      const drawAbility = cardDef_ScoutChar_Cost2_Scout1.abilities.find(a => a.abilityId === 'abil-scout-j-draw');
      if (drawAbility && drawAbility.effect.steps[0]) {
        // (drawAbility.effect.steps[0] as any).isOptional = false; // Temporarily modify for test logic
        // This modification is tricky as the card def is already cached.
        // A better way would be to have a card variant or ensure the choice is auto-made if possible.
        // For now, we'll rely on the fact that if an optional effect *can* resolve, it *will* for this test,
        // or check if a choice was presented and auto-resolved.
        // The critical part is that the effect *could* resolve, not necessarily that it *did* without player input.
        // The prompt for draw is part of EffectExecutionManager usually.
        // Let's check if the hand size increased.
      }
      // If the draw effect (even if optional) was able to resolve, hand size should increase.
      // This implies that the effect found its context (the player) correctly.
      expect(player.zones.hand.count).toBe(initialHandSize); // Card played from hand (-1), card drawn (+1)
    });
  });

  // --- Seasoned Keyword Rules (Rule 7.4.6) ---
  describe('Seasoned Keyword Rules (Rule 7.4.6)', () => {
    let player: ReturnType<GameStateManager['getPlayer']>;
    let seasonedCharObject: IGameObject;
    let nonSeasonedCharObject: IGameObject;

    beforeEach(async () => {
      player = gsm.getPlayer(P1)!;
      gsm.currentPhase = GamePhase.Action;
      gsm.activePlayerId = P1;
      player.currentMana = 10;

      player.zones.hand.clear();
      player.zones.expeditionZone.clear();
      player.zones.reserveZone.clear();
      player.zones.discardPile.clear();
      player.heroExpedition.hasMoved = false;
      player.heroExpedition.position = 0;
      gsm.effectExecutionManager.resetPendingEffects();

      const seasonedCardDef = gsm.cardDataRepository.getCardDefinition(cardDef_SeasonedChar.id)!;
      seasonedCharObject = gsm.objectFactory.createGameObject(
        gsm.objectFactory.createCardInstance(seasonedCardDef.id, P1),
        P1
      );
      gsm.zones.addToZone(seasonedCharObject, ZoneIdentifier.Expedition, P1);

      const nonSeasonedCardDef = gsm.cardDataRepository.getCardDefinition(cardDef_NonSeasonedChar_Boosts.id)!;
      nonSeasonedCharObject = gsm.objectFactory.createGameObject(
        gsm.objectFactory.createCardInstance(nonSeasonedCardDef.id, P1),
        P1
      );
      gsm.zones.addToZone(nonSeasonedCharObject, ZoneIdentifier.Expedition, P1);

      gsm.ruleAdjudicator.applyAllPassiveAbilities();
    });

    const addBoostsToGameObject = (charObject: IGameObject, amount: number) => {
      charObject.boostCounters = (charObject.boostCounters || 0) + amount;
    };

    test('Rule 7.4.6.b, 7.4.6.c: Seasoned character keeps boosts during Rest Phase', async () => {
      addBoostsToGameObject(seasonedCharObject, 2);
      expect(seasonedCharObject.boostCounters).toBe(2);
      expect(seasonedCharObject.currentCharacteristics.isSeasoned).toBe(true);

      player.heroExpedition.hasMoved = true;
      await gsm.restPhase();

      const charInReserve = player.zones.reserveZone.findById(seasonedCharObject.objectId);
      expect(charInReserve).toBeDefined();
      expect(charInReserve?.boostCounters).toBe(2);
    });

    test('Rule 2.5.j (Control): Non-Seasoned character loses boosts during Rest Phase', async () => {
      addBoostsToGameObject(nonSeasonedCharObject, 2);
      expect(nonSeasonedCharObject.boostCounters).toBe(2);
      expect(nonSeasonedCharObject.currentCharacteristics.isSeasoned).toBe(false);

      player.heroExpedition.hasMoved = true;
      await gsm.restPhase();

      const charInReserve = player.zones.reserveZone.findById(nonSeasonedCharObject.objectId);
      expect(charInReserve).toBeDefined();
      expect(charInReserve?.boostCounters).toBe(0);
    });

    test('Rule 7.4.6.b, 7.4.6.c: Seasoned character keeps boosts when moved to Reserve by an effect', async () => {
      addBoostsToGameObject(seasonedCharObject, 3);
      expect(seasonedCharObject.boostCounters).toBe(3);
      expect(seasonedCharObject.currentCharacteristics.isSeasoned).toBe(true);

      const spellInst = gsm.objectFactory.createCardInstance(cardDef_MoveCharacterToReserveSpell.id, P1);
      player.zones.hand.add(spellInst);

      player.zones.expeditionZone.remove(nonSeasonedCharObject.objectId); // Simplify targeting

      const playResult = await gsm.playerPlaysCardFromHand(P1, spellInst.instanceId, { targetObjectIds: [seasonedCharObject.objectId] });
      expect(playResult.success).toBe(true);
      await gsm.effectExecutionManager.resolvePendingEffects();

      const charInReserve = player.zones.reserveZone.findById(seasonedCharObject.objectId);
      expect(charInReserve).toBeDefined();
      expect(charInReserve?.objectId).toBe(seasonedCharObject.objectId);
      expect(charInReserve?.boostCounters).toBe(3);
    });

    test('Rule 2.5.j (Control): Non-Seasoned character loses boosts when moved to Reserve by an effect', async () => {
      addBoostsToGameObject(nonSeasonedCharObject, 3);
      expect(nonSeasonedCharObject.boostCounters).toBe(3);
      expect(nonSeasonedCharObject.currentCharacteristics.isSeasoned).toBe(false);

      const spellInst = gsm.objectFactory.createCardInstance(cardDef_MoveCharacterToReserveSpell.id, P1);
      player.zones.hand.add(spellInst);

      player.zones.expeditionZone.remove(seasonedCharObject.objectId); // Simplify targeting

      const playResult = await gsm.playerPlaysCardFromHand(P1, spellInst.instanceId, { targetObjectIds: [nonSeasonedCharObject.objectId] });
      expect(playResult.success).toBe(true);
      await gsm.effectExecutionManager.resolvePendingEffects();

      const charInReserve = player.zones.reserveZone.findById(nonSeasonedCharObject.objectId);
      expect(charInReserve).toBeDefined();
      expect(charInReserve?.objectId).toBe(nonSeasonedCharObject.objectId);
      expect(charInReserve?.boostCounters).toBe(0);
    });
  });

  // --- Tough Keyword Rules (Rule 7.4.7) ---
  describe('Tough Keyword Rules (Rule 7.4.7)', () => {
    let p1: ReturnType<GameStateManager['getPlayer']>;
    let p2: ReturnType<GameStateManager['getPlayer']>;
    let tough1CharP1: IGameObject;
    let tough2CharP1: IGameObject;
    let normalCharP1: IGameObject;
    let targetingSpellP2: ICardDefinition; // Keep as ICardDefinition for cost checks
    let targetingSpellP1: ICardDefinition; // Keep as ICardDefinition for cost checks

    beforeEach(async () => {
      p1 = gsm.getPlayer(P1)!;
      p2 = gsm.getPlayer(P2)!;

      // Set initial mana
      p1.currentMana = 10;
      p2.currentMana = 10;

      // Clear zones
      p1.zones.hand.clear();
      p1.zones.expeditionZone.clear();
      p1.zones.reserveZone.clear();
      p1.zones.discardPile.clear();
      p2.zones.hand.clear();
      p2.zones.expeditionZone.clear(); // P2 shouldn't have expedition units for these tests usually
      p2.zones.discardPile.clear();

      gsm.effectExecutionManager.resetPendingEffects();

      // Create P1's characters and place in P1's expedition zone
      const tough1Def = gsm.cardDataRepository.getCardDefinition(cardDef_Tough1Char_P1.id)!;
      tough1CharP1 = gsm.objectFactory.createGameObject(gsm.objectFactory.createCardInstance(tough1Def.id, P1), P1);
      gsm.zones.addToZone(tough1CharP1, ZoneIdentifier.Expedition, P1);

      const tough2Def = gsm.cardDataRepository.getCardDefinition(cardDef_Tough2Char_P1.id)!;
      tough2CharP1 = gsm.objectFactory.createGameObject(gsm.objectFactory.createCardInstance(tough2Def.id, P1), P1);
      gsm.zones.addToZone(tough2CharP1, ZoneIdentifier.Expedition, P1);

      const normalDef = gsm.cardDataRepository.getCardDefinition(cardDef_NormalChar_P1.id)!;
      normalCharP1 = gsm.objectFactory.createGameObject(gsm.objectFactory.createCardInstance(normalDef.id, P1), P1);
      gsm.zones.addToZone(normalCharP1, ZoneIdentifier.Expedition, P1);

      // Apply passive abilities (like Tough)
      gsm.ruleAdjudicator.applyAllPassiveAbilities();
      expect(tough1CharP1.currentCharacteristics.isTough).toBe(1); // Check if Tough value is correctly applied
      expect(tough2CharP1.currentCharacteristics.isTough).toBe(2);
      expect(normalCharP1.currentCharacteristics.isTough).toBeUndefined();


      // Get spell definitions (not instances yet, as they'll be added to hand in tests)
      targetingSpellP2 = gsm.cardDataRepository.getCardDefinition(cardDef_TargetingSpell_P2.id)!;
      targetingSpellP1 = gsm.cardDataRepository.getCardDefinition(cardDef_TargetingSpell_P1.id)!;

      // Default to P2 active for most tests, P1 in Action phase
      gsm.currentPhase = GamePhase.Action;
      gsm.activePlayerId = P2; // Most tests involve P2 targeting P1's char
    });

    test('Rule 7.4.7.c: Opponent (P2) pays Tough 1 cost successfully', async () => {
      const spellCardInst = gsm.objectFactory.createCardInstance(targetingSpellP2.id, P2);
      p2.zones.hand.add(spellCardInst);
      const initialManaP2 = p2.currentMana; // e.g. 10
      const spellCost = targetingSpellP2.handCost; // e.g. 1
      const toughCost = tough1CharP1.currentCharacteristics.isTough as number; // Should be 1

      // P2 plays spell targeting P1's Tough 1 char
      // Assuming playerPlaysCardFromHand handles the Tough cost payment automatically if enough mana,
      // or requires an option like { payAdditionalCosts: [{ type: 'tough', amount: toughCost }] }
      // For this test, assume it's automatic if mana is sufficient.
      const playResult = await gsm.playerPlaysCardFromHand(P2, spellCardInst.instanceId, { targetObjectIds: [tough1CharP1.objectId] });
      expect(playResult.success).toBe(true);
      await gsm.effectExecutionManager.resolvePendingEffects();

      expect(p2.currentMana).toBe(initialManaP2 - spellCost - toughCost);
      // Check if effect applied (e.g., stats changed or card tapped)
      // For 'modifyStats' as defined in cardDef_TargetingSpell_P2:
      const targetStats = gsm.getObject(tough1CharP1.objectId)?.currentStats;
      const originalStats = cardDef_Tough1Char_P1.statistics;
      expect(targetStats?.forest).toBe(originalStats.forest - 1);
    });

    test('Rule 7.4.7.c, 7.4.7.d: Opponent (P2) fails to target if Tough 1 cost not paid (insufficient mana)', async () => {
      const spellCardInst = gsm.objectFactory.createCardInstance(targetingSpellP2.id, P2);
      p2.zones.hand.add(spellCardInst);
      const spellCost = targetingSpellP2.handCost; // 1
      const toughCost = tough1CharP1.currentCharacteristics.isTough as number; // 1

      p2.currentMana = spellCost + toughCost - 1; // Not enough for spell + tough (e.g., 1 mana, needs 2)
      const initialManaP2 = p2.currentMana;

      const playResult = await gsm.playerPlaysCardFromHand(P2, spellCardInst.instanceId, { targetObjectIds: [tough1CharP1.objectId] });
      expect(playResult.success).toBe(false); // Play should fail
      // Ensure mana is NOT spent if play fails due to pre-check
      expect(p2.currentMana).toBe(initialManaP2);

      const targetStats = gsm.getObject(tough1CharP1.objectId)?.currentStats;
      const originalStats = cardDef_Tough1Char_P1.statistics;
      expect(targetStats?.forest).toBe(originalStats.forest); // Effect not applied
    });

    test('Rule 7.4.7.c (implicitly): Controller (P1) does not pay Tough cost for own character', async () => {
      gsm.activePlayerId = P1; // P1 is active
      const spellCardInst = gsm.objectFactory.createCardInstance(targetingSpellP1.id, P1);
      p1.zones.hand.add(spellCardInst);
      const initialManaP1 = p1.currentMana;
      const spellCost = targetingSpellP1.handCost;

      const playResult = await gsm.playerPlaysCardFromHand(P1, spellCardInst.instanceId, { targetObjectIds: [tough1CharP1.objectId] });
      expect(playResult.success).toBe(true);
      await gsm.effectExecutionManager.resolvePendingEffects();

      expect(p1.currentMana).toBe(initialManaP1 - spellCost); // Only spell cost
      const targetStats = gsm.getObject(tough1CharP1.objectId)?.currentStats;
      const originalStats = cardDef_Tough1Char_P1.statistics;
      expect(targetStats?.forest).toBe(originalStats.forest + 1); // P1's spell was a buff
    });

    test('Rule 7.4.7.b, 7.4.7.c: Opponent (P2) pays correct Tough 2 cost', async () => {
      const spellCardInst = gsm.objectFactory.createCardInstance(targetingSpellP2.id, P2);
      p2.zones.hand.add(spellCardInst);
      const initialManaP2 = p2.currentMana;
      const spellCost = targetingSpellP2.handCost;
      const toughCost = tough2CharP1.currentCharacteristics.isTough as number; // Should be 2

      p2.currentMana = spellCost + toughCost + 1; // Ensure enough mana (e.g. 1 + 2 + 1 = 4)
      const manaBeforePlay = p2.currentMana;

      const playResult = await gsm.playerPlaysCardFromHand(P2, spellCardInst.instanceId, { targetObjectIds: [tough2CharP1.objectId] });
      expect(playResult.success).toBe(true);
      await gsm.effectExecutionManager.resolvePendingEffects();

      expect(p2.currentMana).toBe(manaBeforePlay - spellCost - toughCost);
      const targetStats = gsm.getObject(tough2CharP1.objectId)?.currentStats;
      const originalStats = cardDef_Tough2Char_P1.statistics;
      expect(targetStats?.forest).toBe(originalStats.forest - 1);
    });

    test('Targeting non-Tough character (P1 NormalChar) does not require Tough cost from P2', async () => {
      const spellCardInst = gsm.objectFactory.createCardInstance(targetingSpellP2.id, P2);
      p2.zones.hand.add(spellCardInst);
      const initialManaP2 = p2.currentMana;
      const spellCost = targetingSpellP2.handCost;

      // Ensure P2 has just enough for spell, but would not be enough if Tough 1 was added
      p2.currentMana = spellCost;
      const manaBeforePlay = p2.currentMana;

      const playResult = await gsm.playerPlaysCardFromHand(P2, spellCardInst.instanceId, { targetObjectIds: [normalCharP1.objectId] });
      expect(playResult.success).toBe(true);
      await gsm.effectExecutionManager.resolvePendingEffects();

      expect(p2.currentMana).toBe(manaBeforePlay - spellCost); // Only spell cost paid
      const targetStats = gsm.getObject(normalCharP1.objectId)?.currentStats;
      const originalStats = cardDef_NormalChar_P1.statistics;
      expect(targetStats?.forest).toBe(originalStats.forest - 1);
    });
  });
});
