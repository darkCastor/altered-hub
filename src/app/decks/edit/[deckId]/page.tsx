
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DeckForm, { type DeckFormValues } from '@/components/decks/DeckForm';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { Deck, AlteredCard } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { allCards, cardTypesLookup } from '@/data/cards';

const DECK_STORAGE_KEY = 'alterdeck-decks';

export default function EditDeckPage() {
  const router = useRouter();
  const params = useParams();
  const deckId = params.deckId as string;
  
  const [decks, setDecks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);
  const { toast } = useToast();
  const [initialDeckData, setInitialDeckData] = useState<DeckFormValues | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (deckId) {
      const deckToEdit = decks.find(d => d.id === deckId);
      if (deckToEdit) {
        setInitialDeckData({
          name: deckToEdit.name,
          description: deckToEdit.description || '',
          format: deckToEdit.format as DeckFormValues['format'],
          cardIds: deckToEdit.cards.map(c => c.id),
        });
      } else {
        toast({ title: "Error", description: "Deck not found.", variant: "destructive" });
        router.replace('/decks'); 
      }
    }
    setIsLoading(false);
  }, [deckId, decks, router, toast]);

  const handleSubmit = (data: DeckFormValues) => {
    const now = new Date().toISOString();
    const selectedFullCards: AlteredCard[] = data.cardIds
      .map(id => allCards.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];

    const updatedDecks = decks.map(d =>
      d.id === deckId
        ? { 
            ...d, 
            name: data.name, 
            description: data.description, 
            format: data.format,
            cards: selectedFullCards, 
            updatedAt: now,
            hero: selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name),
            faction: selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name)?.faction,
          }
        : d
    );
    setDecks(updatedDecks);
    toast({ title: "Deck Updated", description: `"${data.name}" has been successfully updated.` });
    router.push('/decks'); // Navigate to deck list after editing
  };

  const handleCancel = () => {
    router.back(); // Navigate to the previous page
  };

  if (isLoading || !initialDeckData) {
    // It's important to return some UI here, even if minimal,
    // to avoid React hydration errors if the server renders nothing/different.
    return <div className="flex justify-center items-center h-64 text-muted-foreground">Loading deck data...</div>;
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl text-primary">Edit Deck</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Modify your deck's details, card selection, and format.
        </p>
      </section>
      <DeckForm 
        onSubmit={handleSubmit} 
        initialData={initialDeckData}
        isEditing={true}
        onCancel={handleCancel}
      />
    </div>
  );
}
