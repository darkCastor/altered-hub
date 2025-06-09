
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Deck, AlteredCard } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Play } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image'; // Added for card images

import { GameStateManager } from '@/engine/GameStateManager';
import { EventBus } from '@/engine/EventBus';
import { TurnManager } from '@/engine/TurnManager';
import { PhaseManager } from '@/engine/PhaseManager';
import { ActionHandler } from '@/engine/ActionHandler';
import type { ICardDefinition, ICardInstance } from '@/engine/types/cards';
import { Faction as EngineFaction, CardType as EngineCardType, Rarity as EngineRarity, PermanentZoneType as EnginePermanentZoneType, GamePhase } from '@/engine/types/enums';
import { factionsLookup, raritiesLookup, cardTypesLookup, allCards as allAlteredCards } from '@/data/cards';

const DECK_STORAGE_KEY = 'alterdeck-decks';
const STARTING_HAND_SIZE = 5;
const INITIAL_MANA_ORBS = 3;

// Helper to find enum key by its string value (name)
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

interface DisplayableHandCard {
  instanceId: string;
  originalCardId: string;
  name: string;
  imageUrl?: string;
}

export default function PlayGamePage() {
  const params = useParams();
  const deckId = params.deckId as string;

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

  const [player1HandCount, setPlayer1HandCount] = useState(0);
  const [player2HandCount, setPlayer2HandCount] = useState(0);
  const [player1HandCards, setPlayer1HandCards] = useState<DisplayableHandCard[]>([]);
  const [player2HandCards, setPlayer2HandCards] = useState<DisplayableHandCard[]>([]);


  const eventBus = useState(() => new EventBus())[0]; 

  const updateHandDisplays = useCallback((gsmInstance: GameStateManager) => {
    if (!gsmInstance) return;
    const p1 = gsmInstance.getPlayer('player1');
    const p2 = gsmInstance.getPlayer('player2');

    if (p1) {
      const p1HandEntities = p1.zones.hand.getAll() as ICardInstance[];
      const p1DisplayCards = p1HandEntities.map(entity => {
        const originalCard = allAlteredCards.find(ac => ac.id === entity.definitionId);
        return {
          instanceId: entity.instanceId,
          originalCardId: entity.definitionId,
          name: originalCard?.name || 'Unknown',
          imageUrl: originalCard?.imageUrl,
        };
      });
      setPlayer1HandCards(p1DisplayCards);
      setPlayer1HandCount(p1DisplayCards.length);
    }

    if (p2) {
      const p2HandEntities = p2.zones.hand.getAll() as ICardInstance[];
      const p2DisplayCards = p2HandEntities.map(entity => {
        const originalCard = allAlteredCards.find(ac => ac.id === entity.definitionId);
        return {
          instanceId: entity.instanceId,
          originalCardId: entity.definitionId,
          name: originalCard?.name || 'Unknown',
          imageUrl: originalCard?.imageUrl,
        };
      });
      setPlayer2HandCards(p2DisplayCards);
      setPlayer2HandCount(p2DisplayCards.length);
    }
  }, []);


  useEffect(() => {
    if (deckId && decks.length > 0) {
      const foundDeck = decks.find(d => d.id === deckId);
      if (foundDeck) {
        setSelectedDeck(foundDeck);
        
        const playerIds = ['player1', 'player2'];
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
          playerIds.forEach(pid => {
              playerDeckMap.set(pid, [...deckDefinitions]); 
          });
          gsm.initializeBoard(playerDeckMap, STARTING_HAND_SIZE, INITIAL_MANA_ORBS);
          
          setCurrentPhase(gsm.state.currentPhase);
          setCurrentPlayerId(gsm.state.currentPlayerId);
          setDayNumber(gsm.state.dayNumber);
          updateHandDisplays(gsm);


          eventBus.subscribe('phaseChanged', (payload: { phase: GamePhase }) => setCurrentPhase(payload.phase));
          eventBus.subscribe('turnAdvanced', (payload: { currentPlayerId: string }) => setCurrentPlayerId(payload.currentPlayerId));
          eventBus.subscribe('dayAdvanced', (payload: { dayNumber: number }) => setDayNumber(payload.dayNumber));
          eventBus.subscribe('entityMoved', () => { 
            updateHandDisplays(gsm);
          });
          
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
  }, [deckId, decks, eventBus, updateHandDisplays]);


  const handlePassTurn = useCallback(async () => {
    if (actionHandler && currentPlayerId && !isProcessingAction) {
      setIsProcessingAction(true);
      try {
        await actionHandler.tryPass(currentPlayerId); 
      } catch(e) {
        console.error("Error during pass turn:", e);
        setError("An error occurred while passing the turn.");
      } finally {
        setIsProcessingAction(false);
      }
    }
  }, [actionHandler, currentPlayerId, isProcessingAction]);

  const handleAdvancePhase = useCallback(async () => {
    if (phaseManager && !isProcessingAction && gameStateManager) { // Added gameStateManager check
      setIsProcessingAction(true);
      try {
        // Ensure the current player can advance (e.g., if it's Afternoon phase, they must have passed)
        const player = gameStateManager.getPlayer(gameStateManager.state.currentPlayerId);
        if (gameStateManager.state.currentPhase === GamePhase.Afternoon && player && !player.hasPassedTurn) {
          console.warn("[PlayGamePage] Cannot advance phase manually during Afternoon if current player hasn't passed.");
          setIsProcessingAction(false);
          return;
        }
        await phaseManager.advancePhase();
      } catch(e) {
        console.error("Error during advance phase:", e);
        setError("An error occurred while advancing the phase.");
      } finally {
        setIsProcessingAction(false);
      }
    }
  }, [phaseManager, isProcessingAction, gameStateManager]);


  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading game...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Game</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Link href="/decks">
              <Button variant="outline">Back to Decks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedDeck || !gameStateManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
         <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle>Deck Not Found or Engine Not Ready</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">The specified deck could not be loaded or the game engine failed to initialize.</p>
            <Link href="/decks">
              <Button variant="outline">Back to Decks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canPass = currentPhase === GamePhase.Afternoon && gameStateManager?.getPlayer(currentPlayerId!)?.hasPassedTurn === false;
  const canAdvancePhaseManually = !(currentPhase === GamePhase.Afternoon && gameStateManager?.getPlayer(currentPlayerId!)?.hasPassedTurn === false);


  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">
          Playing: {selectedDeck.name}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Basic engine test. Play against yourself.
        </p>
      </section>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Game State</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p><span className="font-semibold">Day:</span> {dayNumber}</p>
          <p><span className="font-semibold">Current Phase:</span> {currentPhase || 'Initializing...'}</p>
          <p><span className="font-semibold">Current Player:</span> {currentPlayerId || 'N/A'}</p>
          <p><span className="font-semibold">Player 1 Hand Count:</span> {player1HandCount} cards</p>
          <p><span className="font-semibold">Player 2 Hand Count:</span> {player2HandCount} cards</p>
          
          <div className="flex gap-4 mt-6">
            <Button onClick={handlePassTurn} disabled={!canPass || isProcessingAction}>
              {isProcessingAction && canPass ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
               Pass Turn
            </Button>
            <Button onClick={handleAdvancePhase} disabled={!canAdvancePhaseManually || isProcessingAction}>
              {isProcessingAction && canAdvancePhaseManually ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
               Advance Phase (Manual)
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            This is a very basic interface for testing the engine logic. Full UI to come.
          </p>
           <div className="mt-6">
             <Link href="/decks">
              <Button variant="outline">Back to Decks</Button>
            </Link>
           </div>
        </CardContent>
      </Card>

       <Card className="shadow-xl mt-8">
        <CardHeader><CardTitle>Player 1 Hand ({player1HandCount})</CardTitle></CardHeader>
        <CardContent>
            {player1HandCards.length === 0 ? (
              <p className="text-muted-foreground">Hand is empty.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {player1HandCards.map(card => (
                  <div key={card.instanceId} className="w-20 h-28 relative" title={card.name}>
                    {card.imageUrl ? (
                       <Image src={card.imageUrl} alt={card.name} layout="fill" objectFit="contain" className="rounded-sm shadow-md" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />
                    ) : (
                      <div className="w-full h-full bg-muted rounded-sm flex items-center justify-center text-xs text-muted-foreground p-1">{card.name}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
       <Card className="shadow-xl mt-8">
        <CardHeader><CardTitle>Player 2 Hand ({player2HandCount})</CardTitle></CardHeader>
        <CardContent>
             {player2HandCards.length === 0 ? (
              <p className="text-muted-foreground">Hand is empty.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {player2HandCards.map(card => (
                  <div key={card.instanceId} className="w-20 h-28 relative" title={card.name}>
                    {card.imageUrl ? (
                      <Image src={card.imageUrl} alt={card.name} layout="fill" objectFit="contain" className="rounded-sm shadow-md" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />
                    ) : (
                      <div className="w-full h-full bg-muted rounded-sm flex items-center justify-center text-xs text-muted-foreground p-1">{card.name}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

    

