
'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { AlteredCard, Deck } from '@/types';
import { allCards, cardTypesLookup, factionsLookup, raritiesLookup } from '@/data/cards';
import CardDisplay from '@/components/cards/CardDisplay';
import DeckForm, { type DeckFormValues } from '@/components/decks/DeckForm';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { XCircle, Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useLocalStorage from '@/hooks/useLocalStorage';

const ALL_OPTION = "all";
const CARDS_PER_LOAD = 20;
const DECK_STORAGE_KEY = 'alterdeck-decks';

const MIN_DECK_CARDS_NON_HERO = 39;
const MAX_DECK_CARDS_NON_HERO = 60;
const EXACT_HERO_COUNT = 1;
const MAX_DUPLICATES_NON_HERO_BY_NAME = 3;
const MAX_RARE_CARDS_NON_HERO = 15;
const NEUTRAL_FACTION_NAME = factionsLookup.NE?.name || "Neutre";

export default function CardViewerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [cards, setCards] = useState<AlteredCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFactionFilter, setSelectedFactionFilter] = useState<string>(ALL_OPTION);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>(ALL_OPTION);
  const [selectedRarityFilter, setSelectedRarityFilter] = useState<string>(ALL_OPTION);
  const [selectedCardModal, setSelectedCardModal] = useState<AlteredCard | null>(null);
  const [displayCount, setDisplayCount] = useState<number>(CARDS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  const [decks, setDecks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);

  const [showDeckPanel, setShowDeckPanel] = useState(false);
  const [deckFormInitialData, setDeckFormInitialData] = useState<DeckFormValues | undefined>(undefined);
  const [isEditingDeck, setIsEditingDeck] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);

  useEffect(() => {
    setCards(allCards);
  }, []);

  useEffect(() => {
    const action = searchParams.get('action');
    const deckIdToEdit = searchParams.get('deckId');

    if (deckIdToEdit) {
      const deck = decks.find(d => d.id === deckIdToEdit);
      if (deck) {
        setDeckFormInitialData({
          name: deck.name,
          description: deck.description || '',
          format: (deck.format as DeckFormValues['format']) || "Standard",
          cardIds: deck.cards.map(c => c.id),
        });
        setIsEditingDeck(true);
        setEditingDeckId(deck.id);
        setShowDeckPanel(true);
      } else {
        toast({ title: "Error", description: `Deck with ID ${deckIdToEdit} not found.`, variant: "destructive" });
        router.replace('/cards');
      }
    } else if (action === 'create') {
      setDeckFormInitialData({ name: 'New Deck', cardIds: [], description: '', format: 'Standard' });
      setIsEditingDeck(false);
      setEditingDeckId(null);
      setShowDeckPanel(true);
    }

    if (action || deckIdToEdit) {
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        current.delete('action');
        current.delete('deckId');
        const search = current.toString();
        const query = search ? `?${search}` : "";
        router.replace(`/cards${query}`);
    }
  }, [searchParams, decks, router, toast]);


  const factions = useMemo(() => {
    const uniqueFactions = [...new Set(cards.map(card => card.faction).filter(Boolean) as string[])];
    return [ALL_OPTION, ...uniqueFactions.sort()];
  }, [cards]);

  const types = useMemo(() => {
    const uniqueTypes = [...new Set(cards.map(card => card.type).filter(Boolean) as string[])];
    return [ALL_OPTION, ...uniqueTypes.sort()];
  }, [cards]);

  const rarities = useMemo(() => {
    const uniqueRarities = [...new Set(cards.map(card => card.rarity).filter(Boolean) as string[])];
    return [ALL_OPTION, ...uniqueRarities.sort()];
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const searchTermLower = searchTerm.toLowerCase();
      const matchesSearchTerm = card.name.toLowerCase().includes(searchTermLower) ||
                                (card.description && card.description.toLowerCase().includes(searchTermLower)) ||
                                (card.keywords && card.keywords.join(' ').toLowerCase().includes(searchTermLower));
      const matchesFaction = selectedFactionFilter === ALL_OPTION || card.faction === selectedFactionFilter;
      const matchesType = selectedTypeFilter === ALL_OPTION || card.type === selectedTypeFilter;
      const matchesRarity = selectedRarityFilter === ALL_OPTION || card.rarity === selectedRarityFilter;
      return matchesSearchTerm && matchesFaction && matchesType && matchesRarity;
    });
  }, [cards, searchTerm, selectedFactionFilter, selectedTypeFilter, selectedRarityFilter]);

  useEffect(() => {
    setDisplayCount(CARDS_PER_LOAD);
  }, [searchTerm, selectedFactionFilter, selectedTypeFilter, selectedRarityFilter]);

  const cardsToShow = useMemo(() => {
    return filteredCards.slice(0, displayCount);
  }, [filteredCards, displayCount]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || displayCount >= filteredCards.length) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount(prevCount => Math.min(prevCount + CARDS_PER_LOAD, filteredCards.length));
      setIsLoadingMore(false);
    }, 500);
  }, [isLoadingMore, displayCount, filteredCards.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && displayCount < filteredCards.length) {
          handleLoadMore();
        }
      },
      { threshold: 1.0, rootMargin: "0px 0px 300px 0px" }
    );
    const currentObserverRef = observerRef.current;
    if (currentObserverRef) observer.observe(currentObserverRef);
    return () => { if (currentObserverRef) observer.unobserve(currentObserverRef); };
  }, [isLoadingMore, displayCount, filteredCards.length, handleLoadMore]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedFactionFilter(ALL_OPTION);
    setSelectedTypeFilter(ALL_OPTION);
    setSelectedRarityFilter(ALL_OPTION);
  };

  const handleStartNewDeckWithCard = (card: AlteredCard) => {
    const initialHero = card.type === cardTypesLookup.HERO.name ? card : undefined;
    const initialCardIds = initialHero ? [initialHero.id] : [card.id];

    const newDeckData: DeckFormValues = {
      name: `Deck with ${card.name}`,
      description: `A new deck started with ${card.name}.`,
      cardIds: initialCardIds,
      format: "Standard",
    };
    setDeckFormInitialData(newDeckData);
    setIsEditingDeck(false);
    setEditingDeckId(null);
    setShowDeckPanel(true);
    toast({ title: "Deck Started", description: `"${card.name}" added to a new deck. Continue building in the panel.` });
  };

  const handleCloseDeckPanel = () => {
    setShowDeckPanel(false);
    setDeckFormInitialData(undefined);
    setEditingDeckId(null);
    setIsEditingDeck(false);
    router.replace('/cards');
  };

  const handleSaveDeck = (data: DeckFormValues) => {
    const now = new Date().toISOString();
    const selectedFullCards: AlteredCard[] = data.cardIds
      .map(id => allCards.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];

    const heroCard = selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);
    const deckFaction = heroCard?.faction;

    if (isEditingDeck && editingDeckId) {
      const updatedDecks = decks.map(d =>
        d.id === editingDeckId
          ? {
              ...d,
              name: data.name,
              description: data.description,
              format: data.format,
              cards: selectedFullCards,
              updatedAt: now,
              hero: heroCard,
              faction: deckFaction,
            }
          : d
      );
      setDecks(updatedDecks);
      toast({ title: "Deck Updated", description: `"${data.name}" has been successfully updated.` });
    } else {
      const newDeck: Deck = {
        id: `deck-${Date.now()}`,
        name: data.name,
        description: data.description,
        format: data.format || "Standard",
        cards: selectedFullCards,
        createdAt: now,
        updatedAt: now,
        hero: heroCard,
        faction: deckFaction,
      };
      setDecks(prevDecks => [...prevDecks, newDeck]);
      toast({ title: "Deck Created", description: `"${newDeck.name}" has been successfully created.` });
    }
    handleCloseDeckPanel();
  };

  const handleLeftClickCardOnGrid = (card: AlteredCard) => {
    if (!deckFormInitialData) return;

    const currentCardIds = deckFormInitialData.cardIds || [];
    const currentSelectedFullCards = currentCardIds
        .map(id => allCards.find(c => c.id === id))
        .filter(Boolean) as AlteredCard[];

    const potentialSelectedCardsAfterAdd = [...currentSelectedFullCards, card];
    const heroInCurrentDeck = currentSelectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);
    
    if (card.type === cardTypesLookup.HERO.name) {
      if (heroInCurrentDeck && heroInCurrentDeck.id !== card.id) {
        toast({ title: "Deck Rule Violation", description: `Cannot add another Hero. Remove "${heroInCurrentDeck.name}" first.`, variant: "destructive" });
        return;
      }
      if (heroInCurrentDeck && heroInCurrentDeck.id === card.id) {
         toast({ title: "Deck Rule Violation", description: `Hero "${card.name}" is already in the deck. Only one Hero allowed.`, variant: "destructive" });
        return;
      }
       const existingHeroesCount = currentSelectedFullCards.filter(c => c.type === cardTypesLookup.HERO.name).length;
        if (existingHeroesCount >= EXACT_HERO_COUNT) {
             toast({ title: "Deck Rule Violation", description: `Cannot add more than ${EXACT_HERO_COUNT} Hero. Remove current Hero first.`, variant: "destructive" });
            return;
        }
    }

    const deckHeroForFactionCheck = card.type === cardTypesLookup.HERO.name ? card : heroInCurrentDeck;
    if (deckHeroForFactionCheck && card.type !== cardTypesLookup.HERO.name) {
      if (card.faction !== deckHeroForFactionCheck.faction && card.faction !== NEUTRAL_FACTION_NAME) {
        toast({ title: "Deck Rule Violation", description: `Card "${card.name}" faction (${card.faction}) does not match Hero's faction (${deckHeroForFactionCheck.faction}) and is not Neutral.`, variant: "destructive" });
        return;
      }
    }

    if (card.type !== cardTypesLookup.HERO.name) {
      const countOfSameName = potentialSelectedCardsAfterAdd.filter(c => c.name === card.name && c.type !== cardTypesLookup.HERO.name).length;
      if (countOfSameName > MAX_DUPLICATES_NON_HERO_BY_NAME) {
        toast({ title: "Deck Rule Violation", description: `Cannot add more than ${MAX_DUPLICATES_NON_HERO_BY_NAME} copies of non-Hero card "${card.name}".`, variant: "destructive" });
        return;
      }
    }

    if (card.type !== cardTypesLookup.HERO.name && card.rarity === raritiesLookup.RARE.name) {
      const currentRareNonHeroCountInDeck = potentialSelectedCardsAfterAdd.filter(c => c.type !== cardTypesLookup.HERO.name && c.rarity === raritiesLookup.RARE.name).length;
      if (currentRareNonHeroCountInDeck > MAX_RARE_CARDS_NON_HERO) {
         toast({ title: "Deck Rule Violation", description: `Cannot add more than ${MAX_RARE_CARDS_NON_HERO} Rare non-Hero cards.`, variant: "destructive" });
         return;
      }
    }

    const nonHeroCardsInPotentialDeck = potentialSelectedCardsAfterAdd.filter(c => c.type !== cardTypesLookup.HERO.name);
    if (nonHeroCardsInPotentialDeck.length > MAX_DECK_CARDS_NON_HERO) {
       toast({ title: "Deck Rule Violation", description: `Deck cannot exceed ${MAX_DECK_CARDS_NON_HERO} non-Hero cards.`, variant: "destructive" });
       return;
    }

    const updatedCardIds = [...currentCardIds, card.id];
    setDeckFormInitialData(prev => prev ? { ...prev, cardIds: updatedCardIds } : undefined);
  };

  const handleRightClickCardOnGrid = (e: React.MouseEvent, card: AlteredCard) => {
    e.preventDefault();
    if (!deckFormInitialData) return;

    const currentCardIds = [...(deckFormInitialData.cardIds || [])];
    const lastIndexOfCard = currentCardIds.lastIndexOf(card.id);

    if (lastIndexOfCard > -1) {
      currentCardIds.splice(lastIndexOfCard, 1);
      setDeckFormInitialData(prev => prev ? { ...prev, cardIds: currentCardIds } : undefined);
    }
  };


  return (
    <div className="flex flex-col md:flex-row h-full space-x-0 md:space-x-4">
      {showDeckPanel && deckFormInitialData && (
        <div className="w-full md:w-1/3 lg:w-2/5 xl:w-1/3 p-4 border-r border-border bg-card overflow-y-auto mb-4 md:mb-0 h-screen md:sticky md:top-0">
          <DeckForm
            key={editingDeckId || 'new-deck'}
            onSubmit={handleSaveDeck}
            initialData={deckFormInitialData}
            isEditing={isEditingDeck}
            onCancel={handleCloseDeckPanel}
            allCardsData={allCards}
          />
        </div>
      )}

      <div className={`flex-1 space-y-8 ${showDeckPanel ? 'w-full md:w-2/3 lg:w-3/5 xl:w-2/3' : 'w-full'}`}>
        <section className="text-center">
          <div className="flex justify-between items-center mb-4">
            <h1 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-primary">Card Explorer</h1>
            <Button variant="ghost" size="icon" onClick={() => setShowDeckPanel(!showDeckPanel)} title={showDeckPanel ? "Close Panel" : "Open Panel"}>
              {showDeckPanel ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </Button>
          </div>
          <p className="mt-2 text-lg text-muted-foreground">
            Explore Altered TCG cards. {showDeckPanel ? "Left-click card to add, Right-click to remove." : "Click the '+' on a card to start a new deck."}
          </p>
        </section>

        <Card className="p-6 shadow-lg">
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search cards..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              </div>
              <Select value={selectedFactionFilter} onValueChange={setSelectedFactionFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by Faction" /></SelectTrigger>
                <SelectContent>
                  {factions.map(faction => (
                    <SelectItem key={faction} value={faction}>{faction === ALL_OPTION ? 'All Factions' : faction}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by Type" /></SelectTrigger>
                <SelectContent>
                  {types.map(type => (
                    <SelectItem key={type} value={type}>{type === ALL_OPTION ? 'All Types' : type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedRarityFilter} onValueChange={setSelectedRarityFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by Rarity" /></SelectTrigger>
                <SelectContent>
                  {rarities.map(rarity => (
                    <SelectItem key={rarity} value={rarity}>{rarity === ALL_OPTION ? 'All Rarities' : rarity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-start items-center">
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-primary">
                <XCircle className="mr-2 h-4 w-4" /> Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {cardsToShow.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {cardsToShow.map(card => {
              const isSelectedInPanelCurrent = showDeckPanel && !!deckFormInitialData?.cardIds.includes(card.id);
              const countInDeck = deckFormInitialData?.cardIds.filter(id => id === card.id).length || 0;
              const isHero = card.type === cardTypesLookup.HERO.name;
              const maxCopiesForCard = isHero ? EXACT_HERO_COUNT : MAX_DUPLICATES_NON_HERO_BY_NAME;
              const isMaxCopiesReached = countInDeck >= maxCopiesForCard;

              return (
                <div
                  key={card.id}
                  onClick={() => {
                    if (showDeckPanel) {
                      handleLeftClickCardOnGrid(card);
                    } else {
                      setSelectedCardModal(card);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (showDeckPanel) {
                      handleRightClickCardOnGrid(e, card);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <CardDisplay
                    card={card}
                    onStartNewDeck={!showDeckPanel ? handleStartNewDeckWithCard : undefined}
                    isSelectedInPanel={isSelectedInPanelCurrent}
                    isDeckPanelOpen={showDeckPanel}
                    isMaxCopiesReachedInPanel={showDeckPanel && isSelectedInPanelCurrent && isMaxCopiesReached}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground">No cards match your criteria.</p>
          </div>
        )}

        {filteredCards.length > displayCount && !isLoadingMore && (
          <div ref={observerRef} style={{ height: '50px', marginTop: '20px' }} aria-hidden="true" />
        )}

        {isLoadingMore && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
        )}

        {selectedCardModal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedCardModal(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-details-title"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-card rounded-lg shadow-2xl overflow-hidden"
            >
              <CardDisplay
                card={selectedCardModal}
                onStartNewDeck={handleStartNewDeckWithCard}
                isSelectedInPanel={false}
                isDeckPanelOpen={false}
                isMaxCopiesReachedInPanel={false}
              />
              <h2 id="card-details-title" className="sr-only">{selectedCardModal.name} Details</h2>
            </div>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white hover:text-primary" onClick={() => setSelectedCardModal(null)} aria-label="Close card details">
              <XCircle className="h-8 w-8" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
