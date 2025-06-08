
'use client';

import { useState, useMemo, useEffect } from 'react';
import type { AlteredCard } from '@/types';
import { mockCards } from '@/data/mockCards';
import CardDisplay from '@/components/cards/CardDisplay';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card'; 
import Image from 'next/image'; 
import { XCircle, Search, LayoutGrid, List } from 'lucide-react';

const ALL_OPTION = "all";

export default function CardViewerPage() {
  const [cards, setCards] = useState<AlteredCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFaction, setSelectedFaction] = useState<string>(ALL_OPTION);
  const [selectedType, setSelectedType] = useState<string>(ALL_OPTION);
  const [selectedRarity, setSelectedRarity] = useState<string>(ALL_OPTION);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCard, setSelectedCard] = useState<AlteredCard | null>(null);

  useEffect(() => {
    setCards(mockCards);
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
          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-primary">
              <XCircle className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
            <div className="flex gap-2">
              <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')} aria-label="Grid view">
                <LayoutGrid className="h-5 w-5" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')} aria-label="List view">
                <List className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {filteredCards.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredCards.map(card => (
              <CardDisplay key={card.id} card={card} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCards.map(card => (
              <Card key={card.id} className="p-2 flex items-center justify-between gap-2 hover:shadow-md transition-shadow">
                <Image 
                  src={card.imageUrl || `https://placehold.co/100x140.png?text=${encodeURIComponent(card.name)}`} 
                  alt={card.name} 
                  width={75} 
                  height={105} 
                  className="rounded object-cover" 
                  data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} 
                />
                <Button variant="outline" size="sm" onClick={() => setSelectedCard(card)}>View</Button>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <p className="text-xl text-muted-foreground">No cards match your criteria.</p>
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
