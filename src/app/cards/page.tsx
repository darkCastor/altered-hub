'use client';

import { useState, useMemo, useEffect } from 'react';
import type { AlteredCard } from '@/types';
import { mockCards } from '@/data/mockCards';
import CardDisplay from '@/components/cards/CardDisplay';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { XCircle, Search, LayoutGrid, List } from 'lucide-react';

const ALL_OPTION = "all";

export default function CardViewerPage() {
  const [cards, setCards] = useState<AlteredCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFaction, setSelectedFaction] = useState<string>(ALL_OPTION);
  const [selectedType, setSelectedType] = useState<string>(ALL_OPTION);
  const [selectedRarity, setSelectedRarity] = useState<string>(ALL_OPTION);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCard, setSelectedCard] = useState<AlteredCard | null>(null); // For modal or detailed view

  // Simulate fetching cards
  useEffect(() => {
    // In a real app, this would be an API call.
    // For offline, this could try to load from localStorage or IndexedDB.
    setCards(mockCards);
  }, []);
  
  const factions = useMemo(() => [ALL_OPTION, ...new Set(mockCards.map(card => card.faction).filter(Boolean))], [mockCards]);
  const types = useMemo(() => [ALL_OPTION, ...new Set(mockCards.map(card => card.type).filter(Boolean))], [mockCards]);
  const rarities = useMemo(() => [ALL_OPTION, ...new Set(mockCards.map(card => card.rarity).filter(Boolean))], [mockCards]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearchTerm = card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                card.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (card.keywords && card.keywords.join(' ').toLowerCase().includes(searchTerm.toLowerCase()));
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
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')}>
                <LayoutGrid className="h-5 w-5" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}>
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
               // Simplified list view item, can be expanded
              <Card key={card.id} className="p-4 flex items-start gap-4 hover:shadow-md transition-shadow">
                <Image src={card.imageUrl || `https://placehold.co/100x140.png?text=${encodeURIComponent(card.name)}`} alt={card.name} width={75} height={105} className="rounded" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />
                <div className="flex-grow">
                  <h3 className="font-headline text-lg font-semibold text-primary">{card.name}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{card.type} - {card.rarity}</p>
                  <p className="text-xs mt-1 line-clamp-2">{card.description}</p>
                </div>
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

      {/* Modal for selected card - Basic implementation */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedCard(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-w-md w-full">
             <CardDisplay card={selectedCard} />
          </div>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white" onClick={() => setSelectedCard(null)}>
            <XCircle className="h-8 w-8" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Helper components for card display if needed (e.g. CardGridItem)
// For now, CardDisplay is used directly.
