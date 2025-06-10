'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Deck, AlteredCard } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Zap, BookOpen, Box } from 'lucide-react';
import Link from 'next/link';

import { GameStateManager } from '@/engine/GameStateManager';
import { EventBus } from '@/engine/EventBus';
import { TurnManager } from '@/engine/TurnManager';
import { PhaseManager } from '@/engine/PhaseManager';
import { ActionHandler } from '@/engine/ActionHandler';
import { IGameObject, isGameObject } from '@/engine/types/objects';
import type { ZoneEntity } from '@/engine/types/zones';
import type { ICardDefinition } from '@/engine/types/cards';
import { Faction as EngineFaction, CardType as EngineCardType, Rarity as EngineRarity, PermanentZoneType as EnginePermanentZoneType, GamePhase, CounterType, StatusType } from '@/engine/types/enums';
import { factionsLookup, raritiesLookup, cardTypesLookup, allCards as allAlteredCards } from '@/data/cards';

import PlayerHandClient from '@/components/game-ui/PlayerHandClient';
import HeroSpotClient from '@/components/game-ui/HeroSpotClient';
import BoardZoneClient from '@/components/game-ui/BoardZoneClient';
import { cn } from '@/lib/utils';

// --- CONSTANTS & CONFIG ---
const DECK_STORAGE_KEY = 'alterdeck-decks';
const STARTING_HAND_SIZE = 5;
const INITIAL_MANA_ORBS = 3;
const PLAYER_ID_SELF = 'player1';
const PLAYER_ID_OPPONENT = 'player2';

// --- TYPE DEFINITIONS ---
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

// --- HELPER FUNCTIONS ---
function findEnumKeyByValue<T extends object>(enumObj: T, value: string): keyof T | undefined {
  for (const key in enumObj) {
    if (Object.prototype.hasOwnProperty.call(enumObj, key)) {
      const enumEntry = enumObj[key as keyof T] as any;
      if (enumEntry?.name === value || enumEntry === value) {
        return key as keyof T;
      }
    }
  }
  return undefined;
}

function mapAlteredCardToEngineDefinition(card: AlteredCard): ICardDefinition | null {
  const cardTypeKey = findEnumKeyByValue(cardTypesLookup, card.type);
  let engineType: EngineCardType;

  switch (cardTypeKey) {
    case 'CHARACTER': engineType = EngineCardType.Character; break;
    case 'HERO': engineType = EngineCardType.Hero; break;
    case 'SPELL': engineType = EngineCardType.Spell; break;
    case 'LANDMARK_PERMANENT':
      engineType = EngineCardType.LandmarkPermanent;
      break;
    case 'EXPEDITION_PERMANENT':
      engineType = EngineCardType.ExpeditionPermanent;
      break;
    case 'PERMANENT':
      engineType = card.abilities_text?.toLowerCase().includes('landmark')
        ? EngineCardType.LandmarkPermanent
        : EngineCardType.ExpeditionPermanent;
      break;
    case 'TOKEN':
    case 'TOKEN_MANA':
    case 'FOILER':
      return null;
    default:
      console.warn(`Unknown card type_ref for mapping: ${card.type} for card ${card.name}`);
      return null;
  }

  const factionKey = card.faction ? findEnumKeyByValue(factionsLookup, card.faction) : undefined;
  const engineFaction = factionKey ? EngineFaction[factionKey as keyof typeof EngineFaction] : undefined;

  const rarityKey = findEnumKeyByValue(raritiesLookup, card.rarity);
  const engineRarity = rarityKey ? EngineRarity[rarityKey as keyof typeof EngineRarity] : undefined;

  return {
    id: card.id,
    name: card.name,
    type: engineType,
    handCost: card.cost ?? 0,
    reserveCost: card.recallCost ?? 0,
    faction: engineFaction,
    rarity: engineRarity,
    abilities: [],
    abilitiesText: card.abilities_text,
    statistics: {
      forest: card.attack ?? 0,
      mountain: card.powerM ?? 0,
      water: card.health ?? 0,
    },
    reserveLimit: engineType === EngineCardType.Hero ? 3 : undefined,
    landmarkLimit: engineType === EngineCardType.Hero ? 3 : undefined,
  };
}


// --- LAYOUT COMPONENT (Moved outside for performance) ---
const PlayerAreaLayout = ({ playerState, isOpponent, onCardClick, onZoneClick, selectedCardId }: {
  playerState: PlayerState,
  isOpponent: boolean,
  onCardClick: (card: DisplayableCardData) => void,
  onZoneClick: (zoneType: 'expedition' | 'landmark' | 'reserve', ownerId: string) => void,
  selectedCardId?: string | null
}) => {
  const isSelf = !isOpponent;
  const selectedCard = isSelf ? playerState.hand.find(c => c.instanceId === selectedCardId) : undefined;
  const expeditionIsTargetable = selectedCard?.type === EngineCardType.Character || selectedCard?.type === EngineCardType.ExpeditionPermanent;

  return (
    <div className={`flex-1 flex flex-col ${isOpponent ? '' : 'flex-col-reverse'} space-y-1 bg-zinc-900/50 p-1 rounded border border-zinc-700`}>
      {/* Hand */}
      <div className={`h-28 flex items-center justify-center ${isOpponent ? 'order-1' : 'order-3'} my-1`}>
        <PlayerHandClient cards={playerState.hand} owner={isOpponent ? "opponent" : "self"} onCardClick={onCardClick} selectedCardId={selectedCardId} />
      </div>

      {/* Expedition Zone */}
      <div className={`${isOpponent ? 'order-2' : 'order-2'} h-24`}>
        <BoardZoneClient
          cards={playerState.expedition}
          zoneType="Expedition"
          owner={isOpponent ? "opponent" : "self"}
          onClick={() => onZoneClick('expedition', isOpponent ? PLAYER_ID_OPPONENT : PLAYER_ID_SELF)}
          isTargetable={isSelf && expeditionIsTargetable}
        />
      </div>

      {/* Reserve - Hero - Landmarks Row */}
      <div className={`flex justify-around items-center h-32 ${isOpponent ? 'order-3' : 'order-1'} space-x-1`}>
        <BoardZoneClient cards={playerState.reserve} zoneType="Reserve" owner={isOpponent ? "opponent" : "self"} className="flex-[1_1_30%]" />
        <HeroSpotClient hero={playerState.hero} isOpponent={isOpponent} />
        <BoardZoneClient cards={playerState.landmarks} zoneType="Landmarks" owner={isOpponent ? "opponent" : "self"} className="flex-[1_1_30%]" />
      </div>

      {/* Mana - Deck/Discard Row */}
      <div className={`flex justify-between items-center h-20 ${isOpponent ? 'order-4' : 'order-0'} p-1`}>
        <div className="flex-1 p-1 bg-black/20 rounded h-full flex flex-col items-center justify-center text-center">
          <Zap className="h-5 w-5 text-yellow-400 mb-1" />
          <p className="text-xs text-muted-foreground">Mana</p>
          <div className="text-sm font-semibold">{playerState.mana.current}/{playerState.mana.max}</div>
        </div>
        <div className="flex-1 p-1 text-xs text-center h-full flex flex-col items-center justify-center">
          <BookOpen className="h-5 w-5 text-blue-400 mb-1" />
          <div className="text-muted-foreground">Deck: {playerState.deckCount}</div>
          <Box className="h-5 w-5 text-gray-500 mt-1 mb-0.5" />
          <div className="text-muted-foreground">Discard: {playerState.discardCount}</div>
        </div>
      </div>
    </div>
  );
};


// --- MAIN PAGE COMPONENT ---
export default function PlayGamePage() {
  const params = useParams();
  const deckId = params.deckId as string;
  const router = useRouter();

  const [decks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameStateManager, setGameStateManager] = useState<GameStateManager | null>(null);
  const [actionHandler, setActionHandler] = useState<ActionHandler | null>(null);
  const [phaseManager, setPhaseManager] = useState<PhaseManager | null>(null);

  const [currentPhase, setCurrentPhase] = useState<GamePhase | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [selectedCardForPlay, setSelectedCardForPlay] = useState<DisplayableCardData | null>(null);

  // FIX: Explicitly define all properties in the initial state to match the type.
  const initialPlayerState: PlayerState = {
    hero: undefined,
    hand: [],
    mana: { current: 0, max: 0 },
    deckCount: 0,
    discardCount: 0,
    expedition: [],
    landmarks: [],
    reserve: []
  };
  const [player1State, setPlayer1State] = useState<PlayerState>(initialPlayerState);
  const [player2State, setPlayer2State] = useState<PlayerState>(initialPlayerState);

  const eventBus = useState(() => new EventBus())[0];

  const mapToDisplayableCard = useCallback((cardInstance: ZoneEntity): DisplayableCardData => {
    const originalCardDef = allAlteredCards.find(ac => ac.id === cardInstance.definitionId);
    let name = originalCardDef?.name || 'Unknown';
    let type = EngineCardType.Token;
    let statuses: string[] = [];
    let counters: { type: string, amount: number }[] = [];

    if (isGameObject(cardInstance)) {
      const engineDef = gameStateManager?.getCardDefinition(cardInstance.definitionId);
      name = engineDef?.name || name;
      type = engineDef?.type || type;
      statuses = Array.from(cardInstance.statuses.values());
      counters = Array.from(cardInstance.counters.entries()).map(([type, amount]) => ({ type: type as string, amount }));
    } else {
      const engineDef = gameStateManager?.getCardDefinition(cardInstance.definitionId);
      if (engineDef) {
        type = engineDef.type;
      }
    }

    return {
      instanceId: 'objectId' in cardInstance ? cardInstance.objectId : cardInstance.instanceId,
      originalCardId: cardInstance.definitionId,
      name,
      imageUrl: originalCardDef?.imageUrl,
      cost: originalCardDef?.cost,
      attack: originalCardDef?.attack,
      health: originalCardDef?.health,
      powerM: originalCardDef?.powerM,
      type,
      statuses,
      counters,
    };
  }, [gameStateManager]);

  const updateFullPlayerState = useCallback((playerId: string, gsm: GameStateManager) => {
    const player = gsm.getPlayer(playerId);
    if (!player) return;

    const handCards = player.zones.hand.getAll().map(mapToDisplayableCard);
    const heroCardRaw = player.zones.heroZone.getAll()[0];
    const heroCard = heroCardRaw ? mapToDisplayableCard(heroCardRaw) : undefined;
    const manaObjects = player.zones.manaZone.getAll() as IGameObject[];
    const currentMana = manaObjects.filter(orb => !orb.statuses.has(StatusType.Exhausted)).length;

    const newState: PlayerState = {
      hand: handCards,
      hero: heroCard,
      mana: { current: currentMana, max: manaObjects.length },
      deckCount: player.zones.deck.getCount(),
      discardCount: player.zones.discardPile.getCount(),
      expedition: player.zones.expedition.getAll().map(mapToDisplayableCard),
      landmarks: player.zones.landmarkZone.getAll().map(mapToDisplayableCard),
      reserve: player.zones.reserve.getAll().map(mapToDisplayableCard),
    };

    if (playerId === PLAYER_ID_SELF) setPlayer1State(newState);
    else setPlayer2State(newState);
  }, [mapToDisplayableCard]);


  useEffect(() => {
    if (deckId && decks.length > 0 && !gameStateManager) {
      const foundDeck = decks.find(d => d.id === deckId);
      if (foundDeck) {
        const playerIds = [PLAYER_ID_SELF, PLAYER_ID_OPPONENT];
        const deckDefinitions: ICardDefinition[] = foundDeck.cards.map(mapAlteredCardToEngineDefinition).filter((def): def is ICardDefinition => def !== null);

        if (deckDefinitions.length === 0 && foundDeck.cards.length > 0) {
          setError("No valid cards for the game engine could be mapped from this deck.");
          setIsLoading(false);
          return;
        }

        try {
          const gsm = new GameStateManager(playerIds, deckDefinitions, eventBus);
          const turnManager = new TurnManager(gsm);
          const phm = new PhaseManager(gsm, turnManager);
          const ah = new ActionHandler(gsm, turnManager, {} as any);

          setGameStateManager(gsm);
          setActionHandler(ah);
          setPhaseManager(phm);

          const playerDeckMap = new Map<string, ICardDefinition[]>();
          playerDeckMap.set(PLAYER_ID_SELF, deckDefinitions);
          playerDeckMap.set(PLAYER_ID_OPPONENT, deckDefinitions);
          gsm.initializeBoard(playerDeckMap, STARTING_HAND_SIZE, INITIAL_MANA_ORBS);

          const updateAllStates = () => {
            if (!gsm) return;
            updateFullPlayerState(PLAYER_ID_SELF, gsm);
            updateFullPlayerState(PLAYER_ID_OPPONENT, gsm);
            setCurrentPhase(gsm.state.currentPhase);
            setCurrentPlayerId(gsm.state.currentPlayerId);
            setDayNumber(gsm.state.dayNumber);
          };

          eventBus.subscribe('phaseChanged', updateAllStates);
          eventBus.subscribe('turnAdvanced', updateAllStates);
          eventBus.subscribe('dayAdvanced', updateAllStates);
          eventBus.subscribe('entityMoved', updateAllStates);
          eventBus.subscribe('entityCeasedToExist', updateAllStates);
          eventBus.subscribe('manaSpent', updateAllStates);
          eventBus.subscribe('statusGained', updateAllStates);
          eventBus.subscribe('counterGained', updateAllStates);
          eventBus.subscribe('countersSpent', updateAllStates);


          if (gsm.state.currentPhase === GamePhase.Setup) {
            phm.advancePhase();
          } else {
            updateAllStates();
          }
        } catch (e: any) {
          setError(`Error initializing game engine: ${e.message}`);
          console.error(e);
        }
      } else {
        setError(`Deck with ID "${deckId}" not found.`);
      }
      setIsLoading(false);
    }
  }, [deckId, decks, eventBus, gameStateManager, updateFullPlayerState]);

  const handleAction = useCallback(async (action: () => Promise<void>) => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    setError(null);
    try {
      await action();
    } catch (e: any) {
      console.error("Error during action:", e);
      setError(`Action failed: ${e.message}`);
    } finally {
      setIsProcessingAction(false);
      setSelectedCardForPlay(null);
    }
  }, [isProcessingAction]);

  const handlePassTurn = useCallback(async () => {
    if (actionHandler && currentPlayerId === PLAYER_ID_SELF) {
      handleAction(() => actionHandler.tryPass(PLAYER_ID_SELF));
    }
  }, [actionHandler, currentPlayerId, handleAction]);

  const handleCardClickInHand = (card: DisplayableCardData) => {
    if (currentPlayerId !== PLAYER_ID_SELF || isProcessingAction) return;

    if (selectedCardForPlay?.instanceId === card.instanceId) {
      setSelectedCardForPlay(null);
      return;
    }

    if (card.type === EngineCardType.Character || card.type === EngineCardType.ExpeditionPermanent) {
      setSelectedCardForPlay(card);
    } else if (card.type === EngineCardType.Spell || card.type === EngineCardType.LandmarkPermanent) {
      handleAction(() => actionHandler!.tryPlayCardFromHand(PLAYER_ID_SELF, card.instanceId!));
    } else {
      setError(`Playing a ${card.type} is not yet supported.`);
    }
  };

  const handleZoneClick = (zoneType: 'expedition' | 'landmark' | 'reserve', ownerId: string) => {
    if (ownerId !== PLAYER_ID_SELF || !selectedCardForPlay || !actionHandler) return;

    const cardToPlay = selectedCardForPlay;
    if ((cardToPlay.type === EngineCardType.Character || cardToPlay.type === EngineCardType.ExpeditionPermanent) && zoneType === 'expedition') {
      const expeditionId = `${ownerId}-expedition`;
      handleAction(() => actionHandler.tryPlayCardFromHand(PLAYER_ID_SELF, cardToPlay.instanceId, expeditionId));
    }
  };

  const handleAdvancePhase = useCallback(async () => {
    if (phaseManager) {
      handleAction(() => phaseManager.advancePhase());
    }
  }, [phaseManager, handleAction]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl">Loading Game Engine...</p>
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

  if (!selectedDeck || !gameStateManager) {
    return <div className="text-center p-10 text-destructive">Deck not found or Engine failed to initialize.</div>;
  }

  const canSelfPass = currentPhase === GamePhase.Afternoon && gameStateManager?.getPlayer(PLAYER_ID_SELF)?.hasPassedTurn === false && currentPlayerId === PLAYER_ID_SELF;
  const isMyTurn = currentPlayerId === PLAYER_ID_SELF;

  return (
    <div className="flex flex-col h-screen bg-zinc-800 text-foreground overflow-hidden">
      {/* Top Bar */}
      <div className="h-10 bg-zinc-900 text-xs flex items-center justify-between px-4 border-b border-zinc-700 shrink-0">
        <div>Day: {dayNumber} | Phase: {currentPhase}</div>
        <div className={cn("font-bold", isMyTurn ? "text-green-400" : "text-red-400")}>
          {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
        </div>
        <div className="text-right">{error && <span className="text-destructive text-xs">{error}</span>}</div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col p-1 space-y-1">
          <PlayerAreaLayout playerState={player2State} isOpponent={true} onCardClick={() => { }} onZoneClick={() => { }} selectedCardId={null} />

          {/* Shared Adventure Zone */}
          <div className="h-36 bg-zinc-700/30 rounded border border-zinc-600 p-1 flex items-center justify-center shrink-0">
            Adventure Zone (coming soon)
          </div>

          <PlayerAreaLayout
            playerState={player1State}
            isOpponent={false}
            onCardClick={handleCardClickInHand}
            onZoneClick={handleZoneClick}
            selectedCardId={selectedCardForPlay?.instanceId}
          />

          {/* Action Bar */}
          <div className="h-12 flex items-center justify-center space-x-4 p-1 bg-zinc-900 border-t border-zinc-700 shrink-0">
            <Button onClick={handlePassTurn} disabled={!canSelfPass || isProcessingAction} variant="destructive" size="sm">
              {isProcessingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pass Turn
            </Button>
            <Button onClick={handleAdvancePhase} disabled={isProcessingAction} variant="secondary" size="sm">
              {isProcessingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Advance Phase
            </Button>
            <Link href="/decks"><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Surrender</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}