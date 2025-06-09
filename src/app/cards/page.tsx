
'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter }
from 'next/navigation';
import type { AlteredCard, Deck } from '@/types';
import { allCards, cardTypesLookup, factionsLookup, raritiesLookup } from '@/data/cards';
import CardDisplay from '@/components/cards/CardDisplay';
import DeckForm, { type DeckFormValues } from '@/components/decks/DeckForm';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Search, FilterX, PanelLeftOpen, PanelRightOpen, CheckCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useLocalStorage from '@/hooks/useLocalStorage';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const DECK_STORAGE_KEY = 'alterdeck-decks';
const CARDS_PER_LOAD = 20;
const MIN_DECK_CARDS_NON_HERO = 39;
const MAX_DECK_CARDS_NON_HERO = 60; // Adjusted for consistency
const EXACT_HERO_COUNT = 1;
const MAX_DUPLICATES_NON_HERO_BY_NAME = 3; // Max 3 copies of the same non-hero card by name
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


  // Effect to handle query parameters for opening the deck panel
  useEffect(() => {
    const action = searchParams.get('action');
    const deckIdToEdit = searchParams.get('deckId');

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
        setShowDeckPanel(true);
      } else {
        toast({ title: "Error", description: "Deck not found for editing.", variant: "destructive" });
      }
    } else if (action === 'create') {
      setDeckFormInitialData({ name: '', description: '', format: 'Standard', cardIds: [] });
      setIsEditingDeck(false);
      setEditingDeckId(null);
      setShowDeckPanel(true);
    }
  }, [searchParams, decks, toast]);


  const handleFilterChange = (filterName: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
    setLoadedCardsCount(CARDS_PER_LOAD); // Reset count on filter change
  };

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
    if (card.type !== cardTypesLookup.HERO.name) {
      toast({ title: "Deck Creation Error", description: "A new deck must start with a Hero card.", variant: "destructive" });
      return;
    }
    setDeckFormInitialData({
      name: `${card.name}'s Deck`,
      description: `A deck featuring ${card.name}.`,
      format: 'Standard',
      cardIds: [card.id]
    });
    setIsEditingDeck(false);
    setEditingDeckId(null);
    setShowDeckPanel(true);
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
    router.replace('/cards', undefined); // Clear query params
  };

  const handleDeckFormCancel = () => {
    setShowDeckPanel(false);
    setDeckFormInitialData(null);
    router.replace('/cards', undefined); // Clear query params
  };

  const handleLeftClickCardOnGrid = (card: AlteredCard) => {
    if (!deckFormInitialData) return;

    const currentCardIds = deckFormInitialData.cardIds || [];
    const currentFullCards = currentCardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean) as AlteredCard[];

    const isHero = card.type === cardTypesLookup.HERO.name;
    const heroesInDeck = currentFullCards.filter(c => c.type === cardTypesLookup.HERO.name);
    const heroCardInDeck = heroesInDeck[0];

    // Validation: Hero rules
    if (isHero) {
      if (heroesInDeck.length >= EXACT_HERO_COUNT && !currentCardIds.includes(card.id)) {
        toast({ title: "Deck Rule", description: `A deck can only have ${EXACT_HERO_COUNT} Hero.`, variant: "destructive" });
        return;
      }
    } else { // Non-Hero card
      if (!heroCardInDeck && currentFullCards.length > 0) {
         toast({ title: "Deck Rule", description: "You must select a Hero before adding other cards.", variant: "destructive" });
         return;
      }
      // Validation: Faction consistency
      if (heroCardInDeck && card.faction !== heroCardInDeck.faction && card.faction !== NEUTRAL_FACTION_NAME) {
        toast({ title: "Deck Rule", description: `Card faction (${card.faction}) must match Hero faction (${heroCardInDeck.faction}) or be Neutral.`, variant: "destructive" });
        return;
      }
      // Validation: Max non-Hero cards
      const nonHeroCardsInDeck = currentFullCards.filter(c => c.type !== cardTypesLookup.HERO.name);
      if (nonHeroCardsInDeck.length >= MAX_DECK_CARDS_NON_HERO && !currentCardIds.includes(card.id)) {
        toast({ title: "Deck Rule", description: `Deck cannot exceed ${MAX_DECK_CARDS_NON_HERO} non-Hero cards.`, variant: "destructive" });
        return;
      }
      // Validation: Max duplicates by name for non-Hero cards
      const countSameName = currentFullCards.filter(c => c.name === card.name && c.type !== cardTypesLookup.HERO.name).length;
      if (countSameName >= MAX_DUPLICATES_NON_HERO_BY_NAME) {
        toast({ title: "Deck Rule", description: `Maximum ${MAX_DUPLICATES_NON_HERO_BY_NAME} copies of "${card.name}" allowed.`, variant: "destructive" });
        return;
      }
       // Validation: Max Rare non-Hero cards
      if (card.rarity === raritiesLookup.RARE.name) {
        const rareNonHeroCardsInDeck = nonHeroCardsInDeck.filter(c => c.rarity === raritiesLookup.RARE.name);
        if (rareNonHeroCardsInDeck.length >= MAX_RARE_CARDS_NON_HERO && !currentCardIds.includes(card.id)) {
           toast({ title: "Deck Rule", description: `Deck cannot exceed ${MAX_RARE_CARDS_NON_HERO} Rare non-Hero cards.`, variant: "destructive" });
           return;
        }
      }
    }
    setDeckFormInitialData(prev => ({ ...prev!, cardIds: [...prev!.cardIds, card.id] }));
  };

  const handleRightClickCardOnGrid = (event: React.MouseEvent<HTMLDivElement>, cardToRemove: AlteredCard) => {
    event.preventDefault();
    if (!deckFormInitialData) return;

    const currentCardIds = [...(deckFormInitialData.cardIds || [])];
    const lastIndexOfCard = currentCardIds.lastIndexOf(cardToRemove.id);

    if (lastIndexOfCard > -1) {
      currentCardIds.splice(lastIndexOfCard, 1);
      setDeckFormInitialData(prev => ({ ...prev!, cardIds: currentCardIds }));

      // If the removed card was a Hero, and it was the last one, reset faction consistency
      if (cardToRemove.type === cardTypesLookup.HERO.name) {
          const remainingHeroes = currentCardIds.map(id => allCards.find(c=>c.id === id)).filter(c=> c && c.type === cardTypesLookup.HERO.name);
          if (remainingHeroes.length === 0) {
              // Potentially remove non-neutral cards if desired, or just let validation handle it on next add.
              // For now, simply allows next add to set new hero faction.
          }
      }
    }
  };


  if (!isMounted) {
    return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }


  return (
    <div className="flex flex-col md:flex-row gap-6">
      {showDeckPanel && deckFormInitialData && (
        <div className="w-full md:w-1/3 lg:w-1/4 xl:w-1/5 bg-card p-4 rounded-lg shadow-xl sticky top-20 h-[calc(100vh-10rem)] overflow-y-auto">
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
              <Button variant="ghost" size="icon" onClick={() => setShowDeckPanel(!showDeckPanel)} className="ml-2">
                {showDeckPanel ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                <span className="sr-only">{showDeckPanel ? "Close Deck Panel" : "Open Deck Panel"}</span>
              </Button>
            </h1>
            <p className="text-sm text-muted-foreground">
                {showDeckPanel ? "Panel Open: Left-click card to add, Right-click to remove." : "Browse Altered TCG cards."}
            </p>
          </div>
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
                  {Object.entries(cardTypesLookup).map(([key, type]) => (
                    <SelectItem key={key} value={type.name}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Cost Range Slider could be added here if desired */}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-12">
            {cardsToDisplay.map(card => {
                const countInDeck = deckFormInitialData?.cardIds.filter(id => id === card.id).length || 0;
                const isHeroCard = card.type === cardTypesLookup.HERO.name;
                let isMaxCopiesReached = false;
                if (isHeroCard) {
                    isMaxCopiesReached = countInDeck >= EXACT_HERO_COUNT;
                } else {
                    isMaxCopiesReached = countInDeck >= MAX_DUPLICATES_NON_HERO_BY_NAME;
                }
                const isSelectedInPanelCurrently = showDeckPanel && (deckFormInitialData?.cardIds.includes(card.id) ?? false);

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
                    // Allow context menu if panel is closed or not applicable
                  }}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`Select card ${card.name}`}
                >
                  <CardDisplay
                    card={card}
                    onStartNewDeck={!showDeckPanel ? handleStartNewDeckWithCard : undefined}
                    isSelectedInPanel={isSelectedInPanelCurrently}
                    isDeckPanelOpen={showDeckPanel}
                    isMaxCopiesReachedInPanel={showDeckPanel && isSelectedInPanelCurrently && isMaxCopiesReached}
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
              {/* Passing false for deck panel related props as this is a modal view */}
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


// Loader component for Suspense
const Loader = () => (
  <div className="flex justify-center items-center min-h-screen">
    <svg className="animate-spin h-10 w-10 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  </div>
);

// Main component wrapped in Suspense
export default function CardViewerPage() {
  return (
    <Suspense fallback={<Loader />}>
      <CardViewerPageContent />
    </Suspense>
  );
}

// Minimal loader for when hook is not ready
const Loader2 = ({ className }: { className?: string }) => (
  <svg className={cn("animate-spin", className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Lucide icons for panel toggle
import { ChevronLeft, ChevronRight } from 'lucide-react';
