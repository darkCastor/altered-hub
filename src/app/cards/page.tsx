
'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { AlteredCard } from '@/types';
import { allCards } from '@/data/cards';
import CardDisplay from '@/components/cards/CardDisplay';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { XCircle, Search, Loader2 } from 'lucide-react';

const ALL_OPTION = "all";
const CARDS_PER_LOAD = 20; // Number of cards to load at a time

export default function CardViewerPage() {
  const [cards, setCards] = useState<AlteredCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFaction, setSelectedFaction] = useState<string>(ALL_OPTION);
  const [selectedType, setSelectedType] = useState<string>(ALL_OPTION);
  const [selectedRarity, setSelectedRarity] = useState<string>(ALL_OPTION);
  const [selectedCard, setSelectedCard] = useState<AlteredCard | null>(null);
  const [displayCount, setDisplayCount] = useState<number>(CARDS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCards(allCards);
  }, []);

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
      const matchesFaction = selectedFaction === ALL_OPTION || card.faction === selectedFaction;
      const matchesType = selectedType === ALL_OPTION || card.type === selectedType;
      const matchesRarity = selectedRarity === ALL_OPTION || card.rarity === selectedRarity;
      return matchesSearchTerm && matchesFaction && matchesType && matchesRarity;
    });
  }, [cards, searchTerm, selectedFaction, selectedType, selectedRarity]);

  useEffect(() => {
    setDisplayCount(CARDS_PER_LOAD);
  }, [searchTerm, selectedFaction, selectedType, selectedRarity]);

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
      { 
        threshold: 1.0,
        rootMargin: "0px 0px 300px 0px" 
      } 
    );

    const currentObserverRef = observerRef.current;
    if (currentObserverRef) {
      observer.observe(currentObserverRef);
    }

    return () => {
      if (currentObserverRef) {
        observer.unobserve(currentObserverRef);
      }
    };
  }, [isLoadingMore, displayCount, filteredCards.length, handleLoadMore]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedFaction(ALL_OPTION);
    setSelectedType(ALL_OPTION);
    setSelectedRarity(ALL_OPTION);
  };

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">Card Viewer</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Explore the diverse and powerful cards of Altered TCG.
        </p>
      </section>

      <Card className="p-6 shadow-lg">
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, text, keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            </div>
            <Select value={selectedFaction} onValueChange={setSelectedFaction}>
              <SelectTrigger><SelectValue placeholder="Filter by Faction" /></SelectTrigger>
              <SelectContent>
                {factions.map(faction => (
                  <SelectItem key={faction} value={faction}>{faction === ALL_OPTION ? 'All Factions' : faction}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger><SelectValue placeholder="Filter by Type" /></SelectTrigger>
              <SelectContent>
                {types.map(type => (
                  <SelectItem key={type} value={type}>{type === ALL_OPTION ? 'All Types' : type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRarity} onValueChange={setSelectedRarity}>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {cardsToShow.map(card => (
            <div key={card.id} onClick={() => setSelectedCard(card)}>
              <CardDisplay card={card} />
            </div>
          ))}
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

      {selectedCard && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-details-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full bg-card rounded-lg shadow-2xl overflow-hidden"
          >
             <CardDisplay card={selectedCard} />
             <h2 id="card-details-title" className="sr-only">{selectedCard.name} Details</h2>
          </div>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white hover:text-primary" onClick={() => setSelectedCard(null)} aria-label="Close card details">
            <XCircle className="h-8 w-8" />
          </Button>
        </div>
      )}
    </div>
  );
}
