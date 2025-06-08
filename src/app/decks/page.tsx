
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PlusCircle, Trash2, Edit3 } from 'lucide-react';
import type { Deck, DeckListItem, AlteredCard } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
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
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleDeleteDeck = (deckId: string) => {
    const deckToDelete = decks.find(d => d.id === deckId);
    setDecks(decks.filter(d => d.id !== deckId));
    toast({ title: "Deck Deleted", description: `The deck "${deckToDelete?.name || 'deck'}" has been removed.` });
  };
  
  const deckListItems: DeckListItem[] = decks.map(deck => ({
    id: deck.id,
    name: deck.name,
    cardCount: deck.cards.length,
    updatedAt: deck.updatedAt,
    heroImageUrl: deck.hero?.imageUrl || deck.cards[0]?.imageUrl,
    format: deck.format || "N/A",
  })).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());


  if (!isMounted) {
    // Return a loading indicator or null to prevent hydration mismatch
    return <div className="text-center p-10">Loading decks...</div>; 
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
        <Link href="/decks/create">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
            <PlusCircle className="mr-2 h-5 w-5" /> Create New Deck
          </Button>
        </Link>
      </section>

      {deckListItems.length === 0 ? (
        <Card className="text-center py-12 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-muted-foreground">No Decks Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Start building your first deck to see it here.</p>
            <Link href="/decks/create">
              <Button variant="outline" className="mt-6 border-primary text-primary hover:bg-primary/10">
                Create Your First Deck
              </Button>
            </Link>
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
                    <CardDescription>{deck.cardCount} cards - Format: {deck.format}</CardDescription>
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
                <Link href={`/decks/edit/${deck.id}`}>
                  <Button variant="outline" size="sm">
                    <Edit3 className="mr-1 h-4 w-4" /> Edit
                  </Button>
                </Link>
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
    </div>
  );
}
