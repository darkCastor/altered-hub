
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Deck, AlteredCard } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { GameStateManager } from '@/engine/GameStateManager';
import { EventBus } from '@/engine/EventBus';
import { TurnManager } from '@/engine/TurnManager';
import { PhaseManager } from '@/engine/PhaseManager';
import { ActionHandler } from '@/engine/ActionHandler';
import type { ICardDefinition, ICardInstance } from '@/engine/types/cards';
import { Faction as EngineFaction, CardType as EngineCardType, Rarity as EngineRarity, PermanentZoneType as EnginePermanentZoneType, GamePhase } from '@/engine/types/enums';
import { factionsLookup, raritiesLookup, cardTypesLookup, allCards as allAlteredCards } from '@/data/cards';

// Import new Game UI components
import PlayerResourcesClient from '@/components/game-ui/PlayerResourcesClient';
import PlayerHandClient from '@/components/game-ui/PlayerHandClient';
import HeroSpotClient from '@/components/game-ui/HeroSpotClient';
import BoardZoneClient from '@/components/game-ui/BoardZoneClient';
import GameLogClient from '@/components/game-ui/GameLogClient';


const DECK_STORAGE_KEY = 'alterdeck-decks';
const STARTING_HAND_SIZE = 5;
const INITIAL_MANA_ORBS = 3;
const PLAYER_ID_SELF = 'player1'; // Current human player
const PLAYER_ID_OPPONENT = 'player2'; // Opponent

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
  instanceId?: string; // For cards that are instances/objects in play
  originalCardId: string; // Definition ID
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
  resources: { forest: number; mountain: number; water: number };
  deckCount: number;
  discardCount: number;
  // Add other zone arrays as needed (reserve, expedition, landmarks)
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

  const [logMessages, setLogMessages] = useState<string[]>([]);

  const [player1State, setPlayer1State] = useState<PlayerState>({
    hand: [], mana: {current: 0, max: 0}, resources: {forest: 0, mountain: 0, water: 0}, deckCount: 0, discardCount: 0, expedition: [], landmarks: [], reserve: []
  });
  const [player2State, setPlayer2State] = useState<PlayerState>({
    hand: [], mana: {current: 0, max: 0}, resources: {forest: 0, mountain: 0, water: 0}, deckCount: 0, discardCount: 0, expedition: [], landmarks: [], reserve: []
  });

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
    
    const manaObjects = player.zones.manaZone.getAll() as IGameObject[]; // Assuming mana orbs are game objects
    const currentMana = manaObjects.filter(orb => !orb.statuses.has('Exhausted' as any)).length; // Quick hack for status
    const maxMana = manaObjects.length;

    // Placeholder for resources, expedition, landmarks, reserve
    const resources = { forest: 0, mountain: 0, water: 0 }; // TODO: Implement resource tracking
    const expeditionCards = player.zones.expedition?.getAll().map(mapToDisplayableCard) || []; // Assuming expedition zone on player
    const landmarkCards = player.zones.landmarkZone.getAll().map(mapToDisplayableCard);
    const reserveCards = player.zones.reserve.getAll().map(mapToDisplayableCard);


    const newState: PlayerState = {
      hand: handCards,
      hero: heroCard,
      mana: { current: currentMana, max: maxMana },
      resources: resources, // Placeholder
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
    if (deckId && decks.length > 0) {
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
        
        const allGameCardDefinitions = [...deckDefinitions]; 

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
          setLogMessages(prev => [...prev, `Game started. Day ${gsm.state.dayNumber}, Phase: ${gsm.state.currentPhase}, Turn: ${gsm.state.currentPlayerId}`]);


          const onPhaseChanged = (payload: { phase: GamePhase }) => {
            setCurrentPhase(payload.phase);
            setLogMessages(prev => [...prev, `Phase changed to: ${payload.phase}`]);
          };
          const onTurnAdvanced = (payload: { currentPlayerId: string }) => {
            setCurrentPlayerId(payload.currentPlayerId);
            setLogMessages(prev => [...prev, `Turn for: ${payload.currentPlayerId}`]);
          };
          const onDayAdvanced = (payload: { dayNumber: number }) => {
            setDayNumber(payload.dayNumber);
            setLogMessages(prev => [...prev, `Day advanced to: ${payload.dayNumber}`]);
          };
          const onEntityMoved = () => {
            updateFullPlayerState(PLAYER_ID_SELF, gsm);
            updateFullPlayerState(PLAYER_ID_OPPONENT, gsm);
            // Add more specific log if needed
          };
          const onManaSpent = (payload: { playerId: string, amount: number }) => {
            setLogMessages(prev => [...prev, `Player ${payload.playerId} spent ${payload.amount} mana.`]);
            updateFullPlayerState(payload.playerId, gsm);
          };


          eventBus.subscribe('phaseChanged', onPhaseChanged);
          eventBus.subscribe('turnAdvanced', onTurnAdvanced);
          eventBus.subscribe('dayAdvanced', onDayAdvanced);
          eventBus.subscribe('entityMoved', onEntityMoved);
          eventBus.subscribe('manaSpent', onManaSpent);
          
          // Auto-advance setup phase
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

    // Cleanup listeners on component unmount
    return () => {
        // This is tricky with the current EventBus setup. A more robust bus might return unsubscribe functions.
        // For now, we assume the bus might be re-created or this page is unmounted cleanly.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, decks]); // Removed eventBus & updateFullPlayerState as they are stable


  const handlePassTurn = useCallback(async () => {
    if (actionHandler && currentPlayerId && !isProcessingAction && currentPlayerId === PLAYER_ID_SELF) { // Only allow self to pass
      setIsProcessingAction(true);
      setLogMessages(prev => [...prev, `${PLAYER_ID_SELF} attempts to pass turn.`]);
      try {
        await actionHandler.tryPass(PLAYER_ID_SELF);
      } catch(e) {
        console.error("Error during pass turn:", e);
        setError("An error occurred while passing the turn.");
        setLogMessages(prev => [...prev, `Error passing turn for ${PLAYER_ID_SELF}.`]);
      } finally {
        setIsProcessingAction(false);
      }
    }
  }, [actionHandler, currentPlayerId, isProcessingAction]);

  // Placeholder for other actions like playing a card
  const handlePlayCard = (card: DisplayableCardData) => {
    if (currentPlayerId === PLAYER_ID_SELF && !isProcessingAction) {
      setLogMessages(prev => [...prev, `${PLAYER_ID_SELF} tries to play ${card.name} (ID: ${card.originalCardId})`]);
      // TODO: Implement actionHandler.tryPlayCardFromHand(...) 
      // This will require selecting destination zone, paying costs, etc.
      alert(`Playing card ${card.name} is not yet implemented.`);
    }
  };


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
        <Card className="w-full max-w-md shadow-lg bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="text-destructive text-2xl">Game Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => router.push('/decks')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Decks
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedDeck || !gameStateManager) {
     return <div className="text-center p-10 text-destructive">Deck not found or Engine failed to initialize.</div>;
  }
  
  const canSelfPass = currentPhase === GamePhase.Afternoon && 
                      gameStateManager?.getPlayer(PLAYER_ID_SELF)?.hasPassedTurn === false &&
                      currentPlayerId === PLAYER_ID_SELF;

  return (
    <div className="flex flex-col h-screen bg-zinc-800 text-foreground overflow-hidden">
      {/* Top Bar Placeholder */}
      <div className="h-10 bg-zinc-900 text-xs flex items-center justify-between px-4 border-b border-zinc-700">
        <div>Opponent: {PLAYER_ID_OPPONENT} vs You: {PLAYER_ID_SELF}</div>
        <div>Day: {dayNumber} | Phase: {currentPhase} | Turn: {currentPlayerId === PLAYER_ID_SELF ? 'Your Turn' : "Opponent's Turn"}</div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main Game Area */}
        <div className="flex flex-col flex-1 p-2 space-y-2">
          {/* Opponent's Area (Top) */}
          <div className="flex-1 flex flex-col border border-zinc-700 rounded bg-zinc-900/50 p-2 space-y-1">
            <PlayerResourcesClient playerState={player2State} isOpponent={true} />
            <div className="flex-1 flex items-end justify-center"> {/* Expedition/Landmarks for Opponent */}
                 <BoardZoneClient cards={player2State.expedition} zoneType="Expedition" owner="opponent" />
                 <BoardZoneClient cards={player2State.landmarks} zoneType="Landmarks" owner="opponent" />
            </div>
             <HeroSpotClient hero={player2State.hero} isOpponent={true} />
            <PlayerHandClient cards={player2State.hand} owner="opponent" onCardClick={() => {}} />
          </div>

          {/* Central Shared Zones Placeholder */}
          <div className="h-24 md:h-32 flex items-center justify-around bg-zinc-700/30 rounded border border-zinc-600 p-2">
            <BoardZoneClient cards={[]} zoneType="Adventure Zone 1" owner="shared" />
            <BoardZoneClient cards={[]} zoneType="Adventure Zone 2" owner="shared" />
            <BoardZoneClient cards={[]} zoneType="Adventure Zone 3" owner="shared" />
          </div>

          {/* Current Player's Area (Bottom) */}
          <div className="flex-1 flex flex-col border border-zinc-700 rounded bg-zinc-900/50 p-2 space-y-1">
            <PlayerHandClient cards={player1State.hand} owner="self" onCardClick={handlePlayCard} />
            <HeroSpotClient hero={player1State.hero} isOpponent={false} />
            <div className="flex-1 flex items-start justify-center"> {/* Expedition/Landmarks for Self */}
                <BoardZoneClient cards={player1State.expedition} zoneType="Expedition" owner="self" />
                <BoardZoneClient cards={player1State.landmarks} zoneType="Landmarks" owner="self" />
            </div>
            <PlayerResourcesClient playerState={player1State} isOpponent={false} />
          </div>
          
          {/* Action Bar */}
           <div className="h-12 flex items-center justify-center space-x-4 p-1 bg-zinc-900 border-t border-zinc-700">
                <Button onClick={handlePassTurn} disabled={!canSelfPass || isProcessingAction} variant="destructive" size="sm">
                  {isProcessingAction && canSelfPass ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Pass Turn
                </Button>
                <Link href="/decks">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Surrender
                    </Button>
                </Link>
            </div>
        </div>

        {/* Game Log Sidebar */}
        <GameLogClient messages={logMessages} />
      </div>
    </div>
  );
}

