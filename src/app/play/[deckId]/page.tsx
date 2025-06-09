
'use client';

import { useEffect, useState, useCallback } from 'react';
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
import type { ICardDefinition, ICardInstance, IGameObject } from '@/engine/types/zones';
import { Faction as EngineFaction, CardType as EngineCardType, Rarity as EngineRarity, PermanentZoneType as EnginePermanentZoneType, GamePhase } from '@/engine/types/enums';
import { factionsLookup, raritiesLookup, cardTypesLookup, allCards as allAlteredCards } from '@/data/cards';

import PlayerHandClient from '@/components/game-ui/PlayerHandClient';
import HeroSpotClient from '@/components/game-ui/HeroSpotClient';
import BoardZoneClient from '@/components/game-ui/BoardZoneClient';
import { cn } from '@/lib/utils';


const DECK_STORAGE_KEY = 'alterdeck-decks';
const STARTING_HAND_SIZE = 5;
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
    case 'PERMANENT': engineType = EngineCardType.Permanent; break;
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
  if (card.faction && !engineFaction && card.faction !== factionsLookup.NE?.name) {
    console.warn(`Unknown faction for mapping: ${card.faction} for card ${card.name}`);
  }

  const rarityKey = findEnumKeyByValue(raritiesLookup, card.rarity);
  const engineRarity = rarityKey ? EngineRarity[rarityKey as keyof typeof EngineRarity] : EngineRarity.Common;
   if (!rarityKey && card.rarity !== raritiesLookup.COMMON?.name) { 
     console.warn(`Unknown rarity for mapping: ${card.rarity} for card ${card.name}. Defaulting to Common.`);
   }

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
    reserveLimit: engineType === EngineCardType.Hero ? 3 : undefined, 
    landmarkLimit: engineType === EngineCardType.Hero ? 3 : undefined, 
  };
}

export interface DisplayableCardData {
  instanceId?: string; 
  originalCardId: string; 
  name: string;
  imageUrl?: string;
  cost?: number;
  attack?: number;
  health?: number;
  powerM?: number;
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
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameStateManager, setGameStateManager] = useState<GameStateManager | null>(null);
  const [actionHandler, setActionHandler] = useState<ActionHandler | null>(null);
  const [phaseManager, setPhaseManager] = useState<PhaseManager | null>(null);

  const [currentPhase, setCurrentPhase] = useState<GamePhase | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [isProcessingAction, setIsProcessingAction] = useState(false);


  const initialPlayerState: PlayerState = {
    hand: [], mana: {current: 0, max: 0}, deckCount: 0, discardCount: 0, expedition: [], landmarks: [], reserve: []
  };
  const [player1State, setPlayer1State] = useState<PlayerState>(initialPlayerState);
  const [player2State, setPlayer2State] = useState<PlayerState>(initialPlayerState); 

  const eventBus = useState(() => new EventBus())[0]; 

  const mapToDisplayableCard = (cardInstance: ICardInstance | IGameObject): DisplayableCardData => {
    const definition = allAlteredCards.find(ac => ac.id === cardInstance.definitionId);
    return {
      instanceId: 'objectId' in cardInstance ? cardInstance.objectId : cardInstance.instanceId,
      originalCardId: cardInstance.definitionId,
      name: definition?.name || 'Unknown Card',
      imageUrl: definition?.imageUrl,
      cost: definition?.cost,
      attack: definition?.attack,
      health: definition?.health,
      powerM: definition?.powerM,
    };
  };

  const updateFullPlayerState = useCallback((playerId: string, gsm: GameStateManager) => {
    const player = gsm.getPlayer(playerId);
    if (!player) return;

    const handCards = player.zones.hand.getAll().map(mapToDisplayableCard);
    const heroCardRaw = player.zones.heroZone.getAll()[0];
    const heroCard = heroCardRaw ? mapToDisplayableCard(heroCardRaw) : undefined;

    const manaObjects = player.zones.manaZone.getAll() as IGameObject[]; 
    const currentMana = manaObjects.filter(orb => !orb.statuses.has('Exhausted' as any)).length; 
    const maxMana = manaObjects.length;

    const expeditionCards = player.zones.expedition?.getAll().map(mapToDisplayableCard) || [];
    const landmarkCards = player.zones.landmarkZone.getAll().map(mapToDisplayableCard);
    const reserveCards = player.zones.reserve.getAll().map(mapToDisplayableCard);

    const newState: PlayerState = {
      hand: handCards,
      hero: heroCard,
      mana: { current: currentMana, max: maxMana },
      deckCount: player.zones.deck.getCount(),
      discardCount: player.zones.discardPile.getCount(),
      expedition: expeditionCards,
      landmarks: landmarkCards,
      reserve: reserveCards,
    };

    if (playerId === PLAYER_ID_SELF) {
      setPlayer1State(newState);
    } else {
      setPlayer2State(newState);
    }
  }, []);


  useEffect(() => {
    if (deckId && decks.length > 0 && !gameStateManager) { 
      const foundDeck = decks.find(d => d.id === deckId);
      if (foundDeck) {
        setSelectedDeck(foundDeck);

        const playerIds = [PLAYER_ID_SELF, PLAYER_ID_OPPONENT];
        const deckDefinitions: ICardDefinition[] = foundDeck.cards
          .map(mapAlteredCardToEngineDefinition)
          .filter((def): def is ICardDefinition => def !== null);

        if (deckDefinitions.length === 0 && foundDeck.cards.length > 0) {
            setError("No valid cards for the game engine could be mapped from this deck.");
            setIsLoading(false);
            return;
        }

        const allGameCardDefinitions = [...new Set(deckDefinitions.map(def => def.id))]
            .map(id => deckDefinitions.find(def => def.id === id)!);


        try {
          const gsm = new GameStateManager(playerIds, allGameCardDefinitions, eventBus);
          const turnManager = new TurnManager(gsm);
          const phm = new PhaseManager(gsm, turnManager);
          const ah = new ActionHandler(gsm, turnManager);

          setGameStateManager(gsm);
          setActionHandler(ah);
          setPhaseManager(phm);

          const playerDeckMap = new Map<string, ICardDefinition[]>();
          playerIds.forEach(pid => playerDeckMap.set(pid, [...deckDefinitions])); 
          gsm.initializeBoard(playerDeckMap, STARTING_HAND_SIZE, INITIAL_MANA_ORBS);

          setCurrentPhase(gsm.state.currentPhase);
          setCurrentPlayerId(gsm.state.currentPlayerId);
          setDayNumber(gsm.state.dayNumber);

          updateFullPlayerState(PLAYER_ID_SELF, gsm);
          updateFullPlayerState(PLAYER_ID_OPPONENT, gsm);
          console.log(`Game started. Day ${gsm.state.dayNumber}, Phase: ${gsm.state.currentPhase}, Turn: ${gsm.state.currentPlayerId}`);


          const onPhaseChanged = (payload: { phase: GamePhase }) => { setCurrentPhase(payload.phase); console.log(`Phase changed to: ${payload.phase}`); };
          const onTurnAdvanced = (payload: { currentPlayerId: string }) => { setCurrentPlayerId(payload.currentPlayerId); console.log(`Turn for: ${payload.currentPlayerId}`); };
          const onDayAdvanced = (payload: { dayNumber: number }) => { setDayNumber(payload.dayNumber); console.log(`Day advanced to: ${payload.dayNumber}`); };
          const onEntityMoved = () => { updateFullPlayerState(PLAYER_ID_SELF, gsm); updateFullPlayerState(PLAYER_ID_OPPONENT, gsm);};
          const onManaSpent = (payload: { playerId: string, amount: number }) => { console.log(`Player ${payload.playerId} spent ${payload.amount} mana.`); updateFullPlayerState(payload.playerId, gsm); };

          eventBus.subscribe('phaseChanged', onPhaseChanged);
          eventBus.subscribe('turnAdvanced', onTurnAdvanced);
          eventBus.subscribe('dayAdvanced', onDayAdvanced);
          eventBus.subscribe('entityMoved', onEntityMoved);
          eventBus.subscribe('manaSpent', onManaSpent);

          if (gsm.state.currentPhase === GamePhase.Setup) {
            phm.advancePhase();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, decks, eventBus, gameStateManager]); 


  const handlePassTurn = useCallback(async () => {
    if (actionHandler && currentPlayerId && !isProcessingAction && currentPlayerId === PLAYER_ID_SELF) {
      setIsProcessingAction(true);
      console.log(`${PLAYER_ID_SELF} attempts to pass turn.`);
      try {
        await actionHandler.tryPass(PLAYER_ID_SELF);
      } catch(e: any) {
        console.error("Error during pass turn:", e);
        setError(`An error occurred while passing the turn: ${e.message || 'Unknown error'}`);
      } finally {
        setIsProcessingAction(false);
      }
    }
  }, [actionHandler, currentPlayerId, isProcessingAction]);

  const handlePlayCard = (card: DisplayableCardData) => {
    if (currentPlayerId === PLAYER_ID_SELF && !isProcessingAction) {
      console.log(`${PLAYER_ID_SELF} tries to play ${card.name} (ID: ${card.originalCardId})`);
      alert(`Playing card ${card.name} is not yet implemented.`);
    }
  };

  const handleAdvancePhase = useCallback(async () => {
    if (phaseManager && !isProcessingAction) {
        setIsProcessingAction(true);
        console.log("Manually attempting to advance phase.");
        try {
            await phaseManager.advancePhase();
        } catch (e: any) {
            console.error("Error advancing phase manually:", e);
            setError(`An error occurred while advancing the phase: ${e.message}`);
        } finally {
            setIsProcessingAction(false);
        }
    }
  }, [phaseManager, isProcessingAction]);


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

  const canSelfPass = currentPhase === GamePhase.Afternoon &&
                      gameStateManager?.getPlayer(PLAYER_ID_SELF)?.hasPassedTurn === false &&
                      currentPlayerId === PLAYER_ID_SELF;

  const canManuallyAdvancePhase = currentPhase !== GamePhase.Afternoon || (currentPhase === GamePhase.Afternoon && gameStateManager?.getPlayer(PLAYER_ID_SELF)?.hasPassedTurn);

  const PlayerAreaLayout = ({ playerState, onCardClick, isOpponent }: { playerState: PlayerState, onCardClick: (card: DisplayableCardData) => void, isOpponent: boolean }) => (
    <div className={cn("flex-1 flex space-y-1 bg-zinc-900/50 p-1 rounded border border-zinc-700", isOpponent ? 'flex-col-reverse' : 'flex-col' )}>
      {/* Top Row (closest to Adventure Zone for Player, furthest for Opponent): Expedition Zone + Hero */}
      <div className="h-24 md:h-28 p-1 relative order-1">
        <BoardZoneClient cards={playerState.expedition} zoneType={`Expédition (${playerState.expedition.length})`} owner={isOpponent ? "opponent" : "self"} />
        {playerState.hero && (
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 -translate-x-1/2 z-10 w-20 h-28 md:w-24 md:h-32">
            <HeroSpotClient hero={playerState.hero} isOpponent={isOpponent} />
          </div>
        )}
      </div>
  
      {/* Middle Row: Reserve and Landmarks Zones */}
      <div className="flex justify-around items-stretch h-32 md:h-36 p-1 space-x-1 order-2">
        <BoardZoneClient cards={playerState.reserve} zoneType={`Réserve (${playerState.reserve.length})`} owner={isOpponent ? "opponent" : "self"} className="flex-1" />
        <BoardZoneClient cards={playerState.landmarks} zoneType={`Repères (${playerState.landmarks.length})`} owner={isOpponent ? "opponent" : "self"} className="flex-1" />
      </div>

      {/* Bottom Row (closest to screen edge for Player, top of screen for Opponent): Mana, Hand, Deck/Discard */}
      <div className="flex items-stretch h-28 md:h-32 p-1 space-x-1 order-3">
         {/* Mana Area */}
        <div className="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center space-y-1">
          <Zap className="h-5 w-5 text-yellow-400" />
          <p className="text-xs text-muted-foreground">Mana</p>
          <div className="text-sm font-semibold">{playerState.mana.current}/{playerState.mana.max}</div>
        </div>
        {/* Hand Area (Middle) */}
        <div className="flex-[3_3_0%] h-full flex items-center justify-center bg-black/10 rounded">
          <PlayerHandClient cards={playerState.hand} owner={isOpponent ? "opponent" : "self"} onCardClick={onCardClick} />
        </div>
        {/* Deck/Discard Area */}
        <div className="flex-1 p-1 bg-black/30 rounded h-full flex flex-col items-center justify-center text-center space-y-1">
          <BookOpen className="h-5 w-5 text-blue-400" />
          <p className="text-xs text-muted-foreground">Deck: {playerState.deckCount}</p>
          <Box className="h-5 w-5 text-gray-500" />
          <p className="text-xs text-muted-foreground">Discard: {playerState.discardCount}</p>
        </div>
      </div>
    </div>
  );


  return (
    <div className="flex flex-col h-screen bg-zinc-800 text-foreground overflow-hidden">
      <div className="h-10 bg-zinc-900 text-xs flex items-center justify-between px-4 border-b border-zinc-700 shrink-0">
        <div>Opponent: {PLAYER_ID_OPPONENT} ({player2State.hero?.name || 'No Hero'}) vs You: {PLAYER_ID_SELF} ({player1State.hero?.name || 'No Hero'})</div>
        <div>Day: {dayNumber} | Phase: {currentPhase} | Turn: {currentPlayerId === PLAYER_ID_SELF ? 'Your Turn' : "Opponent's Turn"}</div>
      </div>

      <div className="flex-1 flex flex-col p-1 space-y-1 min-h-0">
        {/* Opponent's Area - Placeholder */}
        <PlayerAreaLayout playerState={player2State} onCardClick={() => {}} isOpponent={true} />


        {/* Shared Adventure Zone - Thinner */}
        <div className="h-12 bg-zinc-700/30 rounded border border-zinc-600 p-1 flex items-center justify-center shrink-0">
          <p className="text-xs text-muted-foreground">Adventure Zone (Shared)</p>
        </div>

        {/* Current Player's Area (Bottom part) */}
        <PlayerAreaLayout playerState={player1State} onCardClick={handlePlayCard} isOpponent={false} />
      </div>
      
      <div className="h-12 flex items-center justify-center space-x-4 p-1 bg-zinc-900 border-t border-zinc-700 shrink-0">
          <Button onClick={handlePassTurn} disabled={!canSelfPass || isProcessingAction} variant="destructive" size="sm">
            {isProcessingAction && canSelfPass ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Pass Turn
          </Button>
          <Button onClick={handleAdvancePhase} disabled={isProcessingAction || !canManuallyAdvancePhase} variant="secondary" size="sm">
            {isProcessingAction && !canManuallyAdvancePhase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} 
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

