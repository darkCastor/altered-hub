'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Deck, AlteredCard } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Card as UiCard } from '@/components/ui/card';
import { Loader2, ArrowLeft, Zap, BookOpen, Box } from 'lucide-react';
import Link from 'next/link';

import { GameStateManager } from '@/engine/GameStateManager';
import { EventBus } from '@/engine/EventBus';
import { TurnManager } from '@/engine/TurnManager';
import { PhaseManager } from '@/engine/PhaseManager';
import { ActionHandler } from '@/engine/ActionHandler';
import { ReactionManager } from '@/engine/ReactionManager';
import { EffectResolver } from '@/engine/EffectResolver';
import { ObjectFactory } from '@/engine/ObjectFactory';
import { IGameObject, isGameObject } from '@/engine/types/objects';
import type { ZoneEntity } from '@/engine/types/zones';
import type { ICardDefinition } from '@/engine/types/cards';
import { Faction as EngineFaction, CardType as EngineCardType, Rarity as EngineRarity, PermanentZoneType as EnginePermanentZoneType, GamePhase, StatusType } from '@/engine/types/enums';
import { factionsLookup, raritiesLookup, cardTypesLookup, allCards as allAlteredCards } from '@/data/cards';

import PlayerHandClient from '@/components/game-ui/PlayerHandClient';
import HeroSpotClient from '@/components/game-ui/HeroSpotClient';
import BoardZoneClient from '@/components/game-ui/BoardZoneClient';
import { cn } from '@/lib/utils';


const DECK_STORAGE_KEY = 'alterdeck-decks';
const STARTING_HAND_SIZE = 6;
const INITIAL_MANA_ORBS = 3;
const PLAYER_ID_SELF = 'player1';
const PLAYER_ID_OPPONENT = 'player2';

function findEnumKeyByValue<T extends object>(enumObj: T, value: string): keyof T | undefined {
  for (const key in enumObj) {
    if (Object.prototype.hasOwnProperty.call(enumObj, key)) {
      const enumEntry = enumObj[key as keyof T] as any;
      if ((typeof enumEntry === 'object' && enumEntry !== null && enumEntry.name === value) ||
        (typeof enumEntry === 'string' && enumEntry === value)) {
        return key as keyof T;
      }
    }
  }
  return undefined;
}

function mapAlteredCardToEngineDefinition(card: AlteredCard): ICardDefinition | null {
  const cardTypeKey = findEnumKeyByValue(cardTypesLookup, card.type);
  let engineType: EngineCardType;
  let enginePermanentZoneType: EnginePermanentZoneType | undefined = undefined;

  switch (cardTypeKey) {
    case 'CHARACTER': engineType = EngineCardType.Character; break;
    case 'HERO': engineType = EngineCardType.Hero; break;
    case 'SPELL': engineType = EngineCardType.Spell; break;
    case 'PERMANENT':
      engineType = EngineCardType.Permanent;
      if (card.abilities_text?.toLowerCase().includes("repère")) {
        enginePermanentZoneType = EnginePermanentZoneType.Landmark;
      } else {
        enginePermanentZoneType = EnginePermanentZoneType.Expedition;
      }
      break;
    case 'LANDMARK_PERMANENT':
      engineType = EngineCardType.Permanent;
      enginePermanentZoneType = EnginePermanentZoneType.Landmark;
      break;
    case 'EXPEDITION_PERMANENT':
      engineType = EngineCardType.Permanent;
      enginePermanentZoneType = EnginePermanentZoneType.Expedition;
      break;
    case 'TOKEN':
    case 'TOKEN_MANA':
    case 'FOILER':
      return null;
    default:
      console.warn(`Unknown card type_ref for mapping: ${card.type} (key: ${cardTypeKey}) for card ${card.name}`);
      return null;
  }

  const factionKey = card.faction ? findEnumKeyByValue(factionsLookup, card.faction) : undefined;
  const engineFaction = factionKey ? EngineFaction[factionKey as keyof typeof EngineFaction] : undefined;

  const rarityKey = findEnumKeyByValue(raritiesLookup, card.rarity);
  const engineRarity = rarityKey ? EngineRarity[rarityKey as keyof typeof EngineRarity] : EngineRarity.Common;

  return {
    id: card.id,
    name: card.name,
    type: engineType,
    handCost: card.cost ?? 0,
    reserveCost: card.recallCost ?? 0,
    faction: engineFaction,
    rarity: engineRarity,
    abilities: [],
    statistics: {
      mountain: card.powerM ?? 0,
      forest: card.attack ?? 0,
      water: card.health ?? 0,
    },
    permanentZoneType: enginePermanentZoneType,
  };
}

export interface DisplayableCardData {
  instanceId: string;
  originalCardId: string;
  name: string;
  imageUrl?: string;
  cost?: number;
  attack?: number;
  health?: number;
  powerM?: number;
  type: EngineCardType;
  statuses: string[];
  counters: { type: string; amount: number }[];
}

interface PlayerState {
  hand: DisplayableCardData[];
  hero?: DisplayableCardData;
  mana: { current: number; max: number };
  deckCount: number;
  discardCount: number;
  expedition: DisplayableCardData[];
  landmarks: DisplayableCardData[];
  reserve: DisplayableCardData[];
}


export default function PlayGamePage() {
  const params = useParams();
  const deckId = params.deckId as string;
  const router = useRouter();

  const [decks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use refs for engine instances to prevent stale closures and dependency cycles
  const gsmRef = useRef<GameStateManager | null>(null);
  const actionHandlerRef = useRef<ActionHandler | null>(null);
  const phaseManagerRef = useRef<PhaseManager | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);

  // UI state remains in React State
  const [currentPhase, setCurrentPhase] = useState<GamePhase | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [selectedCardForPlay, setSelectedCardForPlay] = useState<DisplayableCardData | null>(null);

  const initialPlayerState: PlayerState = {
    hand: [], mana: { current: 0, max: 0 }, deckCount: 0, discardCount: 0, expedition: [], landmarks: [], reserve: []
  };
  const [player1State, setPlayer1State] = useState<PlayerState>(initialPlayerState);
  const [player2State, setPlayer2State] = useState<PlayerState>(initialPlayerState);

  const eventBus = useState(() => new EventBus())[0];

  const mapToDisplayableCard = useCallback((entity: ZoneEntity): DisplayableCardData => {
    const uiData = allAlteredCards.find(ac => ac.id === entity.definitionId);
    const engineDef = gsmRef.current?.getCardDefinition(entity.definitionId);

    if (!engineDef) {
      console.error(`FATAL: No engine definition found for ID ${entity.definitionId}`);
      return {
        instanceId: 'objectId' in entity ? entity.objectId : entity.instanceId,
        originalCardId: entity.definitionId,
        name: 'ENGINE ERROR', type: EngineCardType.Token, statuses: [], counters: []
      };
    }

    let statuses: string[] = [];
    let counters: { type: string, amount: number }[] = [];

    if (isGameObject(entity)) {
      statuses = Array.from(entity.statuses.values());
      counters = Array.from(entity.counters.entries()).map(([type, amount]) => ({ type: type as string, amount }));
    }

    return {
      instanceId: 'objectId' in entity ? entity.objectId : entity.instanceId,
      originalCardId: entity.definitionId,
      name: engineDef.name,
      imageUrl: uiData?.imageUrl,
      cost: engineDef.handCost,
      attack: engineDef.statistics?.forest,
      health: engineDef.statistics?.water,
      powerM: engineDef.statistics?.mountain,
      type: engineDef.type,
      statuses,
      counters,
    };
  }, []);

  const updateAllGameStates = useCallback(() => {
    const gsm = gsmRef.current;
    if (!gsm) return;

    const player1 = gsm.getPlayer(PLAYER_ID_SELF);
    const player2 = gsm.getPlayer(PLAYER_ID_OPPONENT);

    if (player1) {
      const manaObjects = player1.zones.manaZone.getAll() as IGameObject[];
      setPlayer1State({
        hand: player1.zones.hand.getAll().map(mapToDisplayableCard),
        hero: player1.zones.heroZone.getAll()[0] ? mapToDisplayableCard(player1.zones.heroZone.getAll()[0]) : undefined,
        mana: { current: manaObjects.filter(orb => !orb.statuses.has(StatusType.Exhausted)).length, max: manaObjects.length },
        deckCount: player1.zones.deck.getCount(),
        discardCount: player1.zones.discardPile.getCount(),
        expedition: player1.zones.expedition.getAll().map(mapToDisplayableCard),
        landmarks: player1.zones.landmarkZone.getAll().map(mapToDisplayableCard),
        reserve: player1.zones.reserve.getAll().map(mapToDisplayableCard),
      });
    }
    if (player2) {
      const manaObjects = player2.zones.manaZone.getAll() as IGameObject[];
      setPlayer2State({
        hand: player2.zones.hand.getAll().map(mapToDisplayableCard),
        hero: player2.zones.heroZone.getAll()[0] ? mapToDisplayableCard(player2.zones.heroZone.getAll()[0]) : undefined,
        mana: { current: manaObjects.filter(orb => !orb.statuses.has(StatusType.Exhausted)).length, max: manaObjects.length },
        deckCount: player2.zones.deck.getCount(),
        discardCount: player2.zones.discardPile.getCount(),
        expedition: player2.zones.expedition.getAll().map(mapToDisplayableCard),
        landmarks: player2.zones.landmarkZone.getAll().map(mapToDisplayableCard),
        reserve: player2.zones.reserve.getAll().map(mapToDisplayableCard),
      });
    }

    setCurrentPhase(gsm.state.currentPhase);
    setCurrentPlayerId(gsm.state.currentPlayerId);
    setDayNumber(gsm.state.dayNumber);
  }, [mapToDisplayableCard]);

  useEffect(() => {
    if (isEngineReady || !deckId || decks.length === 0) {
      return; // Run only once
    }

    const foundDeck = decks.find(d => d.id === deckId);
    if (!foundDeck) {
      setError(`Deck with ID "${deckId}" not found.`);
      setIsLoading(false);
      return;
    }

    const allGameCardDefinitions = allAlteredCards
      .map(mapAlteredCardToEngineDefinition)
      .filter((def): def is ICardDefinition => def !== null);

    const playerDeckDefinitions = foundDeck.cards
      .map(c => allAlteredCards.find(card => card.id === c.id)!)
      .map(mapAlteredCardToEngineDefinition)
      .filter((def): def is ICardDefinition => def !== null);

    if (playerDeckDefinitions.length === 0 && foundDeck.cards.length > 0) {
      setError("No valid cards for the game engine could be mapped from this deck.");
      setIsLoading(false);
      return;
    }

    try {
      const playerIds = [PLAYER_ID_SELF, PLAYER_ID_OPPONENT];
      const gsm = new GameStateManager(playerIds, allGameCardDefinitions, eventBus);
      const objectFactory = gsm.objectFactory;
      const effectResolver = new EffectResolver(gsm);
      const reactionManager = new ReactionManager(gsm, objectFactory, effectResolver);
      const turnManager = new TurnManager(gsm);
      const phm = new PhaseManager(gsm, turnManager);
      const ah = new ActionHandler(gsm, turnManager, reactionManager);

      // Assign to refs. They can now be safely accessed from anywhere.
      gsmRef.current = gsm;
      actionHandlerRef.current = ah;
      phaseManagerRef.current = phm;

      eventBus.subscribe('phaseChanged', updateAllGameStates);
      eventBus.subscribe('turnAdvanced', updateAllGameStates);
      eventBus.subscribe('dayAdvanced', updateAllGameStates);
      eventBus.subscribe('entityMoved', updateAllGameStates);
      eventBus.subscribe('entityCeasedToExist', updateAllGameStates);
      eventBus.subscribe('manaSpent', updateAllGameStates);
      eventBus.subscribe('statusGained', updateAllGameStates);
      eventBus.subscribe('counterGained', updateAllGameStates);
      eventBus.subscribe('countersSpent', updateAllGameStates);

      const playerDeckMap = new Map<string, ICardDefinition[]>();
      playerDeckMap.set(PLAYER_ID_SELF, playerDeckDefinitions);
      playerDeckMap.set(PLAYER_ID_OPPONENT, playerDeckDefinitions);
      gsm.initializeBoard(playerDeckMap, STARTING_HAND_SIZE, INITIAL_MANA_ORBS);

      if (gsm.state.currentPhase === GamePhase.Setup) {
        phm.advancePhase();
      } else {
        updateAllGameStates(); // Initial state update
      }

      setIsEngineReady(true);

    } catch (e: any) {
      setError(`Error initializing game engine: ${e.message}`);
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [deckId, decks, eventBus, isEngineReady, updateAllGameStates]);

  const handleAction = useCallback(async (action: () => Promise<void>) => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    setError(null);
    try {
      await action();
    } catch (e: any) {
      console.error("Error during action:", e);
      setError(`Action failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsProcessingAction(false);
      setSelectedCardForPlay(null);
    }
  }, [isProcessingAction]);

  const handlePassTurn = useCallback(() => {
    if (actionHandlerRef.current && currentPlayerId === PLAYER_ID_SELF) {
      handleAction(() => actionHandlerRef.current!.tryPass(PLAYER_ID_SELF));
    }
  }, [currentPlayerId, handleAction]);

  const handleAdvancePhase = useCallback(() => {
    if (phaseManagerRef.current) {
      handleAction(() => phaseManagerRef.current!.advancePhase());
    }
  }, [handleAction]);

  const handleCardClickInHand = (card: DisplayableCardData) => {
    if (currentPlayerId !== PLAYER_ID_SELF || isProcessingAction) return;

    if (selectedCardForPlay?.instanceId === card.instanceId) {
      setSelectedCardForPlay(null);
      return;
    }

    const needsTargeting = [EngineCardType.Character, EngineCardType.Permanent].includes(card.type);

    if (needsTargeting) {
      setSelectedCardForPlay(card);
    } else if (card.type === EngineCardType.Spell) {
      handleAction(() => actionHandlerRef.current!.tryPlayCardFromHand(PLAYER_ID_SELF, card.instanceId));
    } else {
      setError(`Cannot play card of type ${card.type} directly.`);
    }
  };

  const handleZoneClick = (zoneType: 'expedition' | 'landmark', ownerId: string) => {
    const ah = actionHandlerRef.current;
    const gsm = gsmRef.current;
    if (ownerId !== PLAYER_ID_SELF || !selectedCardForPlay || !ah || !gsm) return;

    const cardToPlay = selectedCardForPlay;
    const cardDef = gsm.getCardDefinition(cardToPlay.originalCardId);
    if (!cardDef) return;

    const canPlayInExpedition = zoneType === 'expedition' && (
      cardDef.type === EngineCardType.Character ||
      (cardDef.type === EngineCardType.Permanent && cardDef.permanentZoneType === EnginePermanentZoneType.Expedition)
    );
    const canPlayInLandmark = zoneType === 'landmark' && (
      cardDef.type === EngineCardType.Permanent && cardDef.permanentZoneType === EnginePermanentZoneType.Landmark
    );

    if (canPlayInExpedition || canPlayInLandmark) {
      handleAction(() => ah.tryPlayCardFromHand(PLAYER_ID_SELF, cardToPlay.instanceId));
    } else {
      setError(`Cannot play ${cardToPlay.name} in the ${zoneType} zone.`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl">Loading Game...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
        <UiCard className="w-full max-w-md shadow-lg bg-card text-card-foreground p-6">
          <h2 className="text-destructive text-2xl font-bold mb-2">Game Error</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => router.push('/decks')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Decks
          </Button>
        </UiCard>
      </div>
    );
  }

  if (!isEngineReady) {
    return <div className="text-center p-10 text-destructive">Engine failed to initialize or is still loading.</div>;
  }

  const canSelfPass = isEngineReady && gsmRef.current && currentPhase === GamePhase.Afternoon &&
    gsmRef.current.getPlayer(PLAYER_ID_SELF)?.hasPassedTurn === false &&
    currentPlayerId === PLAYER_ID_SELF;

  const isMyTurn = currentPlayerId === PLAYER_ID_SELF;

  const PlayerAreaLayout = ({ playerState, isOpponent }: { playerState: PlayerState, isOpponent: boolean }) => {
    const isSelf = !isOpponent;
    const cardDef = selectedCardForPlay ? gsmRef.current?.getCardDefinition(selectedCardForPlay.originalCardId) : undefined;
    const expeditionIsTargetable = isSelf && isMyTurn && cardDef && (cardDef.type === EngineCardType.Character || (cardDef.type === EngineCardType.Permanent && cardDef.permanentZoneType === EnginePermanentZoneType.Expedition));
    const landmarkIsTargetable = isSelf && isMyTurn && cardDef && (cardDef.type === EngineCardType.Permanent && cardDef.permanentZoneType === EnginePermanentZoneType.Landmark);

    return (
      <div className={cn("flex-1 flex flex-col bg-zinc-900/50 p-1 rounded border border-zinc-700 space-y-1 min-h-0", isOpponent ? '' : 'flex-col-reverse')}>
        <div className={cn("flex items-center justify-center h-24 shrink-0", isOpponent ? 'order-3' : 'order-1')}>
          <HeroSpotClient hero={playerState.hero} isOpponent={isOpponent} />
        </div>
        <div className={cn("flex-1 flex items-stretch p-1 space-x-1", isOpponent ? 'order-2' : 'order-2')}>
          <BoardZoneClient cards={playerState.reserve} zoneType={`Reserve`} owner={isOpponent ? "opponent" : "self"} className="flex-1" />
          <BoardZoneClient cards={playerState.expedition} zoneType={`Expedition`} owner={isOpponent ? "opponent" : "self"} className="flex-1" isTargetable={expeditionIsTargetable} onClick={isSelf ? () => handleZoneClick('expedition', PLAYER_ID_SELF) : undefined} />
          <BoardZoneClient cards={playerState.landmarks} zoneType={`Landmarks`} owner={isOpponent ? "opponent" : "self"} className="flex-1" isTargetable={landmarkIsTargetable} onClick={isSelf ? () => handleZoneClick('landmark', PLAYER_ID_SELF) : undefined} />
        </div>
        <div className={cn("flex items-center justify-between p-1 space-x-2 h-28 shrink-0", isOpponent ? 'order-1' : 'order-3')}>
          <div className="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center">
            <Zap className="h-4 w-4 text-yellow-400" />
            <p className="text-sm font-semibold mt-1">{playerState.mana.current}/{playerState.mana.max}</p>
          </div>
          <div className={cn("flex-[2_2_0%] h-full flex items-center justify-center rounded overflow-hidden")}>
            <PlayerHandClient cards={playerState.hand} owner={isOpponent ? "opponent" : "self"} onCardClick={isSelf ? handleCardClickInHand : () => { }} selectedCardId={isSelf ? selectedCardForPlay?.instanceId : undefined} />
          </div>
          <div className="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center text-xs">
            <div className="flex items-center"><BookOpen className="h-4 w-4 text-blue-400 mr-1" />Deck: {playerState.deckCount}</div>
            <div className="flex items-center mt-1"><Box className="h-4 w-4 text-gray-500 mr-1" />Discard: {playerState.discardCount}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-800 text-foreground overflow-hidden">
      <div className="h-10 bg-zinc-900 text-xs flex items-center justify-between px-4 border-b border-zinc-700 shrink-0">
        <div>Day: {dayNumber} | Phase: {currentPhase}</div>
        <div className={cn("font-bold", isMyTurn ? "text-green-400 animate-pulse" : "text-red-400")}>{isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}</div>
        <div className="text-right w-1/3 truncate">{error && <span className="text-destructive text-xs">{error}</span>}</div>
      </div>

      <div className="flex-1 flex flex-col p-1 space-y-1 min-h-0">
        <PlayerAreaLayout playerState={player2State} isOpponent={true} />
        <div className="h-12 bg-zinc-700/30 rounded border border-zinc-600 p-1 flex items-center justify-center shrink-0">
          <p className="text-xs text-muted-foreground">Adventure Zone</p>
        </div>
        <PlayerAreaLayout playerState={player1State} isOpponent={false} />
      </div>

      <div className="h-12 flex items-center justify-center space-x-4 p-1 bg-zinc-900 border-t border-zinc-700 shrink-0">
        <Button onClick={handlePassTurn} disabled={!canSelfPass || isProcessingAction} variant="destructive" size="sm">
          {isProcessingAction && canSelfPass && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Pass Turn
        </Button>
        <Button onClick={handleAdvancePhase} disabled={isProcessingAction} variant="secondary" size="sm">
          {isProcessingAction && !canSelfPass && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Advance Phase
        </Button>
        <Link href="/decks">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Surrender
          </Button>
        </Link>
      </div>
    </div>
  );
}