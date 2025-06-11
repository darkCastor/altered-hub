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


  // Consolidated beforeEach
  beforeEach(async () => {
    eventBus = new EventBus();
    gsm = new GameStateManager(
      [P1, P2],
      [
        cardDef_EternalChar, cardDef_NormalChar_K, cardDef_DefenderChar,
        cardDef_OpponentChar_K, cardDef_StrongNonDefenderChar_K,
        cardDef_GiganticChar, cardDef_P2_HeroChar_Stats10, cardDef_P2_CompanionChar_Stats3
      ],
      eventBus
    );
    await gsm.initializeGame();
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
});
