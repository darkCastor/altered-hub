'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PlusCircle, Trash2, Edit3, Eye } from 'lucide-react';
import type { Deck, AlteredCard, DeckListItem } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mockCards } from '@/data/mockCards'; // For adding cards to deck
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DECK_STORAGE_KEY = 'alterdeck-decks';

export default function DeckBuilderPage() {
  const [decks, setDecks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);
  const [isMounted, setIsMounted] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [deckName, setDeckName] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [selectedCards, setSelectedCards] = useState<AlteredCard[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const openFormForNew = () => {
    setEditingDeck(null);
    setDeckName('');
    setDeckDescription('');
    setSelectedCards([]);
    setIsFormOpen(true);
  };

  const openFormForEdit = (deck: Deck) => {
    setEditingDeck(deck);
    setDeckName(deck.name);
    setDeckDescription(deck.description || '');
    setSelectedCards([...deck.cards]);
    setIsFormOpen(true);
  };

  const handleCardToggle = (card: AlteredCard) => {
    setSelectedCards(prev => {
      const isSelected = prev.find(c => c.id === card.id);
      if (isSelected) {
        return prev.filter(c => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  };

  const handleSubmitDeck = () => {
    if (!deckName.trim()) {
      toast({ title: "Error", description: "Deck name cannot be empty.", variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    if (editingDeck) {
      const updatedDecks = decks.map(d =>
        d.id === editingDeck.id ? { ...editingDeck, name: deckName, description: deckDescription, cards: selectedCards, updatedAt: now } : d
      );
      setDecks(updatedDecks);
      toast({ title: "Deck Updated", description: `"${deckName}" has been saved.` });
    } else {
      const newDeck: Deck = {
        id: `deck-${Date.now()}`,
        name: deckName,
        description: deckDescription,
        cards: selectedCards,
        createdAt: now,
        updatedAt: now,
      };
      setDecks(prevDecks => [...prevDecks, newDeck]);
      toast({ title: "Deck Created", description: `"${deckName}" has been added.` });
    }
    setIsFormOpen(false);
  };

  const handleDeleteDeck = (deckId: string) => {
    setDecks(decks.filter(d => d.id !== deckId));
    toast({ title: "Deck Deleted", description: "The deck has been removed." });
  };
  
  const deckListItems: DeckListItem[] = decks.map(deck => ({
    id: deck.id,
    name: deck.name,
    cardCount: deck.cards.length,
    updatedAt: deck.updatedAt,
    heroImageUrl: deck.hero?.imageUrl || deck.cards[0]?.imageUrl,
  })).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());


  if (!isMounted) {
    return <div className="text-center p-10">Loading decks...</div>; // Or a skeleton loader
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl text-primary">Deck Builder</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Create, manage, and refine your Altered TCG decks.
          </p>
        </div>
        <Button onClick={openFormForNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <PlusCircle className="mr-2 h-5 w-5" /> Create New Deck
        </Button>
      </section>

      {decks.length === 0 ? (
        <Card className="text-center py-12 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-muted-foreground">No Decks Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Start building your first deck to see it here.</p>
            <Button onClick={openFormForNew} variant="outline" className="mt-6 border-primary text-primary hover:bg-primary/10">
              Create Your First Deck
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {deckListItems.map((deck) => (
            <Card key={deck.id} className="flex flex-col shadow-lg hover:shadow-primary/30 transition-shadow duration-300">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="font-headline text-xl">{deck.name}</CardTitle>
                    <CardDescription>{deck.cardCount} cards</CardDescription>
                  </div>
                  {deck.heroImageUrl && (
                    <Image src={deck.heroImageUrl} alt={deck.name} width={60} height={84} className="rounded-md border border-border object-cover" data-ai-hint={deck.name.toLowerCase().split(' ').slice(0,2).join(' ')}/>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-xs text-muted-foreground">Last updated: {new Date(deck.updatedAt).toLocaleDateString()}</p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                    const fullDeck = decks.find(d => d.id === deck.id);
                    if (fullDeck) openFormForEdit(fullDeck);
                  }}>
                  <Edit3 className="mr-1 h-4 w-4" /> Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-1 h-4 w-4" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the deck "{deck.name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteDeck(deck.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">{editingDeck ? 'Edit Deck' : 'Create New Deck'}</DialogTitle>
            <DialogDescription>
              {editingDeck ? 'Modify your deck details and card selection.' : 'Fill in the details to create your new deck.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 flex-grow min-h-0">
            <div className="space-y-4">
              <Input
                placeholder="Deck Name"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                className="text-lg"
              />
              <Textarea
                placeholder="Deck Description (optional)"
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                rows={3}
              />
              <div>
                <h3 className="font-semibold mb-2">Selected Cards ({selectedCards.length})</h3>
                <ScrollArea className="h-[calc(90vh-400px)] md:h-[calc(90vh-350px)] border rounded-md p-2">
                  {selectedCards.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No cards selected yet. Add cards from the list on the right.</p>}
                  <div className="space-y-2">
                    {selectedCards.map(card => (
                      <div key={card.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm">{card.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => handleCardToggle(card)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="flex flex-col min-h-0">
              <h3 className="font-semibold mb-2">Available Cards</h3>
              <ScrollArea className="h-full border rounded-md p-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {mockCards.map(card => (
                  <Card 
                    key={card.id} 
                    onClick={() => handleCardToggle(card)}
                    className={`p-2 cursor-pointer transition-all ${selectedCards.find(c => c.id === card.id) ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted/50'}`}
                  >
                    {card.imageUrl && <Image src={card.imageUrl} alt={card.name} width={80} height={112} className="rounded-sm mx-auto mb-1 object-cover" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />}
                    <p className="text-xs font-medium truncate text-center">{card.name}</p>
                    <p className="text-xs text-muted-foreground capitalize text-center">{card.type}</p>
                  </Card>
                ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmitDeck} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {editingDeck ? 'Save Changes' : 'Create Deck'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
