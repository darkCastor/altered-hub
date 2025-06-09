
'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { AlteredCard, Deck } from '@/types';
import { allCards, cardTypesLookup, factionsLookup, raritiesLookup } from '@/data/cards';
import CardDisplay from '@/components/cards/CardDisplay';
import DeckForm, { type DeckFormValues } from '@/components/decks/DeckForm';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader as UiCardHeader, CardTitle as UiCardTitle } from '@/components/ui/card'; // Renamed CardHeader import
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Search, FilterX, Loader2 as LucideLoader } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useLocalStorage from '@/hooks/useLocalStorage';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const DECK_STORAGE_KEY = 'alterdeck-decks';
const CARDS_PER_LOAD = 20;
const MIN_DECK_CARDS_NON_HERO = 39;
const MAX_DECK_CARDS_NON_HERO = 60;
const EXACT_HERO_COUNT = 1;
const MAX_DUPLICATES_NON_HERO_BY_NAME = 3;
const MAX_RARE_CARDS_NON_HERO = 15;
const NEUTRAL_FACTION_NAME = factionsLookup.NE?.name || "Neutre";

interface Filters {
  searchTerm: string;
  selectedFaction: string;
  selectedRarity: string;
  selectedType: string;
  costRange: [number, number];
}

const initialFilters: Filters = {
  searchTerm: '',
  selectedFaction: 'all',
  selectedRarity: 'all',
  selectedType: 'all',
  costRange: [0, 10],
};

function CardViewerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [decks, setDecks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);
  const [loadedCardsCount, setLoadedCardsCount] = useState(CARDS_PER_LOAD);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedCardModal, setSelectedCardModal] = useState<AlteredCard | null>(null);

  const [showDeckPanel, setShowDeckPanel] = useState(false);
  const [deckFormInitialData, setDeckFormInitialData] = useState<DeckFormValues | null>(null);
  const [isEditingDeck, setIsEditingDeck] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);


  useEffect(() => {
    const action = searchParams.get('action');
    const deckIdToEdit = searchParams.get('deckId');
    const cameFromCardViewerPlusButton = action === 'create-with-card';
  
    if (deckIdToEdit) {
      const deckToEdit = decks.find(d => d.id === deckIdToEdit);
      if (deckToEdit) {
        setDeckFormInitialData({
          name: deckToEdit.name,
          description: deckToEdit.description || '',
          format: deckToEdit.format || 'Standard',
          cardIds: deckToEdit.cards.map(c => c.id),
        });
        setIsEditingDeck(true);
        setEditingDeckId(deckIdToEdit);
        if (!showDeckPanel) setShowDeckPanel(true);
      } else {
        toast({ title: "Error", description: "Deck not found for editing.", variant: "destructive" });
        router.replace('/cards', { scroll: false });
      }
    } else if (action === 'create' && !cameFromCardViewerPlusButton) {
      setFilters(initialFilters);
      setLoadedCardsCount(CARDS_PER_LOAD);
  
      setDeckFormInitialData({ name: '', description: '', format: 'Standard', cardIds: [] });
      setIsEditingDeck(false);
      setEditingDeckId(null);
      if (!showDeckPanel) setShowDeckPanel(true);
    } else if (cameFromCardViewerPlusButton) {
      if (!showDeckPanel) setShowDeckPanel(true); 
    } else {
      if (showDeckPanel) { 
          const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
          if (!currentParams.has('action') && !currentParams.has('deckId')) {
              setShowDeckPanel(false);
              setDeckFormInitialData(null);
              setIsEditingDeck(false);
              setEditingDeckId(null);
          }
      }
    }
  }, [searchParams, decks, toast, router, showDeckPanel]);


  const handleFilterChange = useCallback((filterName: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
    setLoadedCardsCount(CARDS_PER_LOAD);
  }, []);

  // Effect to sync Card Explorer faction filter with the hero in the deck panel
  useEffect(() => {
    if (!showDeckPanel || !deckFormInitialData?.cardIds) {
      return;
    }

    const currentDeckCards = (deckFormInitialData.cardIds || [])
      .map(id => allCards.find(c => c.id === id))
      .filter(Boolean) as AlteredCard[];
    
    const currentHeroInDeck = currentDeckCards.find(c => c.type === cardTypesLookup.HERO.name);
    const heroFactionName = currentHeroInDeck?.faction; // This is the faction NAME, e.g., "Axiom"

    if (heroFactionName) {
      if (filters.selectedFaction !== heroFactionName) {
        handleFilterChange('selectedFaction', heroFactionName);
      }
    } else { // No hero in deck
      if (filters.selectedFaction !== 'all') {
        handleFilterChange('selectedFaction', 'all');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFilterChange is memoized, allCards & cardTypesLookup are stable
  }, [deckFormInitialData?.cardIds, showDeckPanel, handleFilterChange, filters.selectedFaction]);


  const clearFilters = () => {
    setFilters(initialFilters);
    setLoadedCardsCount(CARDS_PER_LOAD);
  };

  const filteredCards = useMemo(() => {
    return allCards.filter(card => {
      const matchesSearchTerm = card.name.toLowerCase().includes(filters.searchTerm.toLowerCase());
      const matchesFaction = filters.selectedFaction === 'all' || card.faction === filters.selectedFaction;
      const matchesRarity = filters.selectedRarity === 'all' || card.rarity === filters.selectedRarity;
      const matchesType = filters.selectedType === 'all' || card.type === filters.selectedType;
      const matchesCost = (card.cost ?? 0) >= filters.costRange[0] && (card.cost ?? 0) <= filters.costRange[1];
      return matchesSearchTerm && matchesFaction && matchesRarity && matchesType && matchesCost;
    });
  }, [filters]);

  const cardsToDisplay = useMemo(() => {
    return filteredCards.slice(0, loadedCardsCount);
  }, [filteredCards, loadedCardsCount]);

  const loadMoreCards = useCallback(() => {
    setLoadedCardsCount(prevCount => Math.min(prevCount + CARDS_PER_LOAD, filteredCards.length));
  }, [filteredCards.length]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && loadedCardsCount < filteredCards.length) {
        loadMoreCards();
      }
    });
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loadMoreCards, loadedCardsCount, filteredCards.length]);


  const handleStartNewDeckWithCard = (card: AlteredCard) => {
    setDeckFormInitialData({
      name: `${card.name}'s Deck`,
      description: `A deck featuring ${card.name}.`,
      format: 'Standard',
      cardIds: [card.id]
    });
    setIsEditingDeck(false);
    setEditingDeckId(null);
    setShowDeckPanel(true);
    router.push('/cards?action=create-with-card', { scroll: false });
  };

  const handleDeckFormSubmit = (data: DeckFormValues) => {
    const fullCardsForDeck = data.cardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean) as AlteredCard[];
    const heroCard = fullCardsForDeck.find(c => c.type === cardTypesLookup.HERO.name);

    const newDeck: Deck = {
      id: isEditingDeck && editingDeckId ? editingDeckId : crypto.randomUUID(),
      name: data.name,
      description: data.description,
      format: data.format || 'Standard',
      cards: fullCardsForDeck,
      hero: heroCard,
      faction: heroCard?.faction,
      createdAt: isEditingDeck ? (decks.find(d=>d.id === editingDeckId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isEditingDeck) {
      setDecks(decks.map(deck => deck.id === editingDeckId ? newDeck : deck));
      toast({ title: "Deck Updated", description: `"${newDeck.name}" has been saved.` });
    } else {
      setDecks([...decks, newDeck]);
      toast({ title: "Deck Created", description: `"${newDeck.name}" has been saved.` });
    }
    setShowDeckPanel(false);
    setDeckFormInitialData(null);
    setIsEditingDeck(false);
    setEditingDeckId(null);
    router.replace('/cards', { scroll: false });
  };

  const handleDeckFormCancel = () => {
    setShowDeckPanel(false);
    setDeckFormInitialData(null);
    setIsEditingDeck(false);
    setEditingDeckId(null);
    router.replace('/cards', { scroll: false });
  };

  const handleLeftClickCardOnGrid = (card: AlteredCard) => {
    if (!deckFormInitialData) return;

    const currentCardIds = deckFormInitialData.cardIds || [];
    const currentFullCards = currentCardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean) as AlteredCard[];

    const isHero = card.type === cardTypesLookup.HERO.name;
    const heroesInDeck = currentFullCards.filter(c => c.type === cardTypesLookup.HERO.name);
    const heroCardInDeck = heroesInDeck[0];

    if (isHero) {
      if (heroesInDeck.length >= EXACT_HERO_COUNT && !currentCardIds.includes(card.id)) {
        toast({ title: "Deck Rule", description: `A deck can only have ${EXACT_HERO_COUNT} Hero.`, variant: "destructive" });
        return;
      }
    } else { 
      if (heroCardInDeck && heroCardInDeck.faction && card.faction !== heroCardInDeck.faction && card.faction !== NEUTRAL_FACTION_NAME) {
        toast({ title: "Deck Rule", description: `Card faction (${card.faction}) must match Hero faction (${heroCardInDeck.faction}) or be Neutral.`, variant: "destructive" });
        return;
      }

      const nonHeroCardsInDeck = currentFullCards.filter(c => c.type !== cardTypesLookup.HERO.name);
      if (nonHeroCardsInDeck.length >= MAX_DECK_CARDS_NON_HERO && !currentCardIds.includes(card.id)) {
        toast({ title: "Deck Rule", description: `Deck cannot exceed ${MAX_DECK_CARDS_NON_HERO} non-Hero cards.`, variant: "destructive" });
        return;
      }
      const countSameName = currentFullCards.filter(c => c.name === card.name && c.type !== cardTypesLookup.HERO.name).length;
      if (countSameName >= MAX_DUPLICATES_NON_HERO_BY_NAME) {
        toast({ title: "Deck Rule", description: `Maximum ${MAX_DUPLICATES_NON_HERO_BY_NAME} copies of "${card.name}" allowed.`, variant: "destructive" });
        return;
      }
      if (card.rarity === raritiesLookup.RARE.name) {
        const rareNonHeroCardsInDeck = nonHeroCardsInDeck.filter(c => c.rarity === raritiesLookup.RARE.name);
        if (rareNonHeroCardsInDeck.length >= MAX_RARE_CARDS_NON_HERO && !currentCardIds.includes(card.id)) {
           toast({ title: "Deck Rule", description: `Deck cannot exceed ${MAX_RARE_CARDS_NON_HERO} Rare non-Hero cards.`, variant: "destructive" });
           return;
        }
      }
    }
    setDeckFormInitialData(prev => ({ ...prev!, cardIds: [...(prev?.cardIds || []), card.id] }));
  };

  const handleRightClickCardOnGrid = (event: React.MouseEvent<HTMLDivElement>, cardToRemove: AlteredCard) => {
    event.preventDefault();
    if (!deckFormInitialData) return;

    const currentCardIds = [...(deckFormInitialData.cardIds || [])];
    const lastIndexOfCard = currentCardIds.lastIndexOf(cardToRemove.id);

    if (lastIndexOfCard > -1) {
      currentCardIds.splice(lastIndexOfCard, 1);
      setDeckFormInitialData(prev => ({ ...prev!, cardIds: currentCardIds }));
    }
  };

  if (!isMounted) {
    return <div className="flex justify-center items-center min-h-[60vh]"><LucideLoader className="h-16 w-16 animate-spin text-primary" /></div>;
  }

  let instructionText = "Browse Altered TCG cards. Click '+' on a card to start a new deck.";
  let panelTitle = "Create New Deck";

  if (showDeckPanel && deckFormInitialData) {
    if (isEditingDeck && editingDeckId) {
      panelTitle = `Editing: ${deckFormInitialData.name || 'Deck'}`;
      instructionText = `Deck panel open. Editing "${deckFormInitialData.name || 'Deck'}". Left-click cards to add, Right-click to remove.`;
    } else {
      panelTitle = "Create New Deck";
      instructionText = "Deck panel open. Building new deck. Left-click cards to add, Right-click to remove.";
    }
  }


  return (
    <div className="flex flex-col md:flex-row gap-6">
      {showDeckPanel && deckFormInitialData && (
        <div className="w-full md:w-1/3 lg:w-1/4 xl:w-1/5 bg-card p-4 rounded-lg shadow-xl sticky top-20 h-[calc(100vh-10rem)] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 text-primary">{panelTitle}</h2>
          <DeckForm
            onSubmit={handleDeckFormSubmit}
            initialData={deckFormInitialData}
            isEditing={isEditingDeck}
            onCancel={handleDeckFormCancel}
            allCardsData={allCards}
          />
        </div>
      )}

      <div className={`flex-1 ${showDeckPanel ? 'md:w-2/3 lg:w-3/4 xl:w-4/5' : 'w-full'}`}>
        <section className="mb-8 p-6 bg-card rounded-lg shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h1 className="font-headline text-3xl sm:text-4xl font-bold text-primary">
              Card Explorer
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6 -mt-4">
             {instructionText}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
              <label htmlFor="search" className="text-sm font-medium">Search Name</label>
              <Input
                id="search"
                type="text"
                placeholder="Card name..."
                value={filters.searchTerm}
                onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                className="w-full"
                aria-label="Search by card name"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="faction" className="text-sm font-medium">Faction</label>
              <Select value={filters.selectedFaction} onValueChange={(value) => handleFilterChange('selectedFaction', value)}>
                <SelectTrigger id="faction" aria-label="Filter by faction">
                  <SelectValue placeholder="Faction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Factions</SelectItem>
                  {Object.entries(factionsLookup).map(([key, faction]) => (
                    <SelectItem key={key} value={faction.name}>{faction.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="rarity" className="text-sm font-medium">Rarity</label>
              <Select value={filters.selectedRarity} onValueChange={(value) => handleFilterChange('selectedRarity', value)}>
                <SelectTrigger id="rarity" aria-label="Filter by rarity">
                  <SelectValue placeholder="Rarity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rarities</SelectItem>
                  {Object.entries(raritiesLookup).map(([key, rarity]) => (
                    <SelectItem key={key} value={rarity.name}>{rarity.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="type" className="text-sm font-medium">Type</label>
              <Select value={filters.selectedType} onValueChange={(value) => handleFilterChange('selectedType', value)}>
                <SelectTrigger id="type" aria-label="Filter by type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(cardTypesLookup).map(([key, typeInfo]) => (
                    <SelectItem key={key} value={typeInfo.name}>{typeInfo.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={clearFilters} variant="outline" className="self-end text-muted-foreground hover:text-primary">
              <FilterX className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
          </div>
        </section>

        {cardsToDisplay.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            <Search className="mx-auto h-12 w-12 mb-4 text-primary/50" />
            <p className="text-xl">No cards match your filters.</p>
            <p>Try adjusting your search or clearing filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {cardsToDisplay.map(card => {
                const isSelectedInPanel = showDeckPanel && (deckFormInitialData?.cardIds.includes(card.id) ?? false);
                const countInDeck = deckFormInitialData?.cardIds.filter(id => id === card.id).length || 0;
                const isHeroCard = card.type === cardTypesLookup.HERO.name;
                
                let isMaxCopiesReached = false;
                if (isHeroCard) {
                    isMaxCopiesReached = countInDeck >= EXACT_HERO_COUNT;
                } else {
                    isMaxCopiesReached = countInDeck >= MAX_DUPLICATES_NON_HERO_BY_NAME;
                }

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
                  role="button"
                  aria-label={`Select card ${card.name}`}
                >
                  <CardDisplay
                    card={card}
                    onStartNewDeck={!showDeckPanel ? handleStartNewDeckWithCard : undefined}
                    isSelectedInPanel={isSelectedInPanel}
                    isDeckPanelOpen={showDeckPanel}
                    isMaxCopiesReachedInPanel={showDeckPanel && isSelectedInPanel && isMaxCopiesReached}
                  />
                </div>
              );
            })}
          </div>
        )}

        {loadedCardsCount < filteredCards.length && (
          <div ref={loadMoreRef} className="flex justify-center py-10">
            <Button onClick={loadMoreCards} variant="outline">Load More</Button>
          </div>
        )}

        {selectedCardModal && (
          <Dialog open={!!selectedCardModal} onOpenChange={() => setSelectedCardModal(null)}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
              <DialogHeader className="p-0">
                <DialogTitle className="sr-only">{selectedCardModal.name}</DialogTitle>
                <DialogDescription className="sr-only">Card details for {selectedCardModal.name}</DialogDescription>
              </DialogHeader>
              <CardDisplay
                card={selectedCardModal}
                className="border-0 shadow-none"
                onStartNewDeck={handleStartNewDeckWithCard}
                isSelectedInPanel={false} 
                isDeckPanelOpen={false} 
                isMaxCopiesReachedInPanel={false}
              />
              <Button
                onClick={() => setSelectedCardModal(null)}
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 bg-background/50 hover:bg-background/80"
                aria-label="Close card details"
              >
                <X />
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

const Loader = () => (
  <div className="flex justify-center items-center min-h-screen">
    <LucideLoader className="h-10 w-10 animate-spin text-primary" />
  </div>
);


export default function CardViewerPage() {
  return (
    <Suspense fallback={<Loader />}>
      <CardViewerPageContent />
    </Suspense>
  );
}
    
