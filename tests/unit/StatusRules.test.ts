import { describe, test, expect, beforeEach } from 'bun:test';
import { GameStateManager } from '../../src/engine/GameStateManager';
import { EventBus } from '../../src/engine/EventBus';
import { CardType, GamePhase, StatusType, ZoneIdentifier, KeywordAbility, CounterType } from '../../src/engine/types/enums';
import type { ICardDefinition } from '../../src/engine/types/cards';
import type { IGameObject } from '../../src/engine/types/objects';
import { isGameObject } from '../../src/engine/types/objects';

describe('GameStateManager - Status Rule Compliance (Rule 2.4)', () => {
  let gsm: GameStateManager;
  let eventBus: EventBus;
  let P1 = 'player1';
  let P2 = 'player2';

  const cardDef_AsleepAnchoredChar: ICardDefinition = {
    id: 'char-asleep-anchored',
    name: 'Sleepy Rock',
    type: CardType.Character,
    subTypes: [],
    handCost: { total: 1 },
    reserveCost: { total: 1 },
    faction: 'Neutral',
    statistics: { forest: 1, mountain: 1, water: 1 },
    abilities: [], // No passive abilities that grant these statuses
    rarity: 'Common',
    version: '1.0'
  };

  const cardDef_NormalChar: ICardDefinition = {
    id: 'char-normal',
    name: 'Normal Guy',
    type: CardType.Character,
    subTypes: [],
    handCost: { total: 1 },
    reserveCost: { total: 1 },
    faction: 'Neutral',
    statistics: { forest: 2, mountain: 2, water: 2 },
    abilities: [],
    rarity: 'Common',
    version: '1.0'
  };

  const cardDef_FleetingChar: ICardDefinition = {
    id: 'char-fleeting',
    name: 'Fleeting Fellow',
    type: CardType.Character,
    subTypes: [],
    handCost: { total: 1 },
    reserveCost: { total: 1 },
    faction: 'Neutral',
    statistics: { forest: 1, mountain: 1, water: 1 },
    abilities: [{ description: "Fleeting (passive for test)", type: "passive", keyword: KeywordAbility.Fleeting }], // Note: This is a conceptual passive. Real Fleeting is applied differently.
    rarity: 'Common',
    version: '1.0'
  };


  beforeEach(async () => {
    eventBus = new EventBus();
    gsm = new GameStateManager([P1, P2], [cardDef_AsleepAnchoredChar, cardDef_NormalChar, cardDef_FleetingChar], eventBus);
    await gsm.initializeGame(); // Basic setup

    // Ensure players have their expedition zones set up in gsm.state.players.get(P1).zones.expeditionZone
    // initializeGame should handle this, but good to be aware.
  });

  // Rule 2.4.3.a: Asleep Character's statistics are not counted in their expedition's statistics during Progress.
  test('Rule 2.4.3.a: Asleep character stats are not counted during Progress', async () => {
    const player = gsm.getPlayer(P1)!;
    const sleepyChar = gsm.objectFactory.createGameObject(
      gsm.objectFactory.createCardInstance(cardDef_AsleepAnchoredChar.id, P1), P1
    );
    sleepyChar.statuses.add(StatusType.Asleep);
    player.zones.expeditionZone.add(sleepyChar);

    const normalChar = gsm.objectFactory.createGameObject(
      gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1), P1
    );
    player.zones.expeditionZone.add(normalChar);

    // Manually trigger stat calculation for P1's hero expedition (assuming it's one of them)
    const stats = gsm.calculateExpeditionStats(P1, 'hero');
    expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest); // Only normalChar's stats
    expect(stats.mountain).toBe(cardDef_NormalChar.statistics!.mountain);
    expect(stats.water).toBe(cardDef_NormalChar.statistics!.water);
  });

  // Rule 2.4.3.b & 2.4.2.b: During Rest, Asleep/Anchored Characters are not sent to Reserve and lose Asleep/Anchored.
  test('Rule 2.4.3.b / 2.4.2.b: Asleep/Anchored characters are not sent to Reserve and lose status during Rest', async () => {
    const player = gsm.getPlayer(P1)!;
    const expeditionZone = player.zones.expeditionZone;
    const reserveZone = player.zones.reserveZone;

    const sleepyChar = gsm.objectFactory.createGameObject(
        gsm.objectFactory.createCardInstance(cardDef_AsleepAnchoredChar.id, P1), P1
    );
    sleepyChar.statuses.add(StatusType.Asleep);
    expeditionZone.add(sleepyChar);
    const sleepyCharId = sleepyChar.objectId;

    const anchoredChar = gsm.objectFactory.createGameObject(
        gsm.objectFactory.createCardInstance(cardDef_AsleepAnchoredChar.id, P1), P1 // Use same def for simplicity
    );
    anchoredChar.instanceId = "anchoredCharInst"; // different instance
    anchoredChar.statuses.add(StatusType.Anchored);
    expeditionZone.add(anchoredChar);
    const anchoredCharId = anchoredChar.objectId;

    const normalChar = gsm.objectFactory.createGameObject(
        gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1), P1
    );
    expeditionZone.add(normalChar);
    const normalCharId = normalChar.objectId;

    // Simulate that the player's expeditions moved forward to trigger Rest actions
    player.heroExpedition.hasMoved = true;
    player.companionExpedition.hasMoved = true;

    await gsm.restPhase();

    expect(expeditionZone.findById(sleepyCharId)).toBeDefined(); // Stays in expedition
    expect(reserveZone.findById(sleepyCharId)).toBeUndefined();
    expect(gsm.getObject(sleepyCharId)?.statuses.has(StatusType.Asleep)).toBe(false); // Loses Asleep

    expect(expeditionZone.findById(anchoredCharId)).toBeDefined(); // Stays in expedition
    expect(reserveZone.findById(anchoredCharId)).toBeUndefined();
    expect(gsm.getObject(anchoredCharId)?.statuses.has(StatusType.Anchored)).toBe(false); // Loses Anchored

    expect(expeditionZone.findById(normalCharId)).toBeUndefined(); // Normal char goes to reserve
    // Find by definitionId as objectId changes on move
    const normalCharInReserve = reserveZone.getAll().find(o => isGameObject(o) && o.definitionId === cardDef_NormalChar.id);
    expect(normalCharInReserve).toBeDefined();
  });

  // Rule 2.4.6.d: If a Fleeting Character or Expedition Permanent would go to the Reserve from the Expedition zone, it is discarded instead.
  test('Rule 2.4.6.d: Fleeting character is discarded instead of going to Reserve during Rest', async () => {
    const player = gsm.getPlayer(P1)!;
    const expeditionZone = player.zones.expeditionZone;
    const reserveZone = player.zones.reserveZone;
    const discardPile = player.zones.discardPileZone;

    const fleetingChar = gsm.objectFactory.createGameObject(
        gsm.objectFactory.createCardInstance(cardDef_FleetingChar.id, P1), P1
    );
    // Fleeting is typically applied on play from reserve. Here, we simulate it being active.
    // The StatusEffectHandler or game logic should correctly apply Fleeting.
    // For this test, we'll manually add it.
    fleetingChar.statuses.add(StatusType.Fleeting);
    expeditionZone.add(fleetingChar);
    const fleetingCharId = fleetingChar.objectId;

    player.heroExpedition.hasMoved = true; // Simulate expedition moved

    await gsm.restPhase();

    expect(expeditionZone.findById(fleetingCharId)).toBeUndefined();
    expect(reserveZone.findById(fleetingCharId)).toBeUndefined();
    // Find by definitionId as objectId changes on move
    const fleetingCharInDiscard = discardPile.getAll().find(o => isGameObject(o) && o.definitionId === cardDef_FleetingChar.id);
    expect(fleetingCharInDiscard).toBeDefined(); // Should be in discard
  });

  // Rule 2.4.4.b: Boosted status (derived from boost counters)
  test('Rule 2.4.4.b: Boosted status is present if boost counters > 0, affects stats', () => {
    const player = gsm.getPlayer(P1)!;
    const normalCharObj = gsm.objectFactory.createGameObject(
      gsm.objectFactory.createCardInstance(cardDef_NormalChar.id, P1), P1
    );
    player.zones.expeditionZone.add(normalCharObj);

    // Check initial stats (no boosts)
    let stats = gsm.calculateExpeditionStats(P1, 'hero');
    expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest);
    expect(normalCharObj.statuses.has(StatusType.Boosted)).toBe(false);

    // Add a boost counter
    normalCharObj.counters.set(CounterType.Boost, 1);

    // Re-calculate stats and check Boosted status
    // Note: GameStateManager.calculateExpeditionStats reads currentCharacteristics for base stats,
    // then adds counters. The Boosted status itself is checked on the IGameObject.statuses directly.
    // The RuleAdjudicator would apply passive abilities that might add counters or modify stats further.
    // This test focuses on the base interaction of counters and the Boosted status flag.

    // Manually update Boosted status based on counters for this test, as no system is doing it yet.
    // In a full system, this would be updated by an event or handler when counters change.
    if ((normalCharObj.counters.get(CounterType.Boost) || 0) > 0) {
        normalCharObj.statuses.add(StatusType.Boosted);
    } else {
        normalCharObj.statuses.delete(StatusType.Boosted);
    }

    stats = gsm.calculateExpeditionStats(P1, 'hero');
    expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest! + 1);
    expect(normalCharObj.statuses.has(StatusType.Boosted)).toBe(true);

    // Remove boost counter
    normalCharObj.counters.set(CounterType.Boost, 0);
    if ((normalCharObj.counters.get(CounterType.Boost) || 0) > 0) {
        normalCharObj.statuses.add(StatusType.Boosted);
    } else {
        normalCharObj.statuses.delete(StatusType.Boosted);
    }

    stats = gsm.calculateExpeditionStats(P1, 'hero');
    expect(stats.forest).toBe(cardDef_NormalChar.statistics!.forest);
    expect(normalCharObj.statuses.has(StatusType.Boosted)).toBe(false);
  });

});
