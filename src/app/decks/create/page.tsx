
'use client';

import { useRouter } from 'next/navigation';
import DeckForm, { type DeckFormValues } from '@/components/decks/DeckForm';
import useLocalStorage from '@/hooks/useLocalStorage';
import type { Deck, AlteredCard } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { allCards, cardTypesLookup } from '@/data/cards'; // Updated import

const DECK_STORAGE_KEY = 'alterdeck-decks';

export default function CreateDeckPage() {
  const router = useRouter();
  const [decks, setDecks] = useLocalStorage<Deck[]>(DECK_STORAGE_KEY, []);
  const { toast } = useToast();

  const handleSubmit = (data: DeckFormValues) => {
    const now = new Date().toISOString();
    const selectedFullCards: AlteredCard[] = data.cardIds
      .map(id => allCards.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];

    const newDeck: Deck = {
      id: `deck-${Date.now()}`,
      name: data.name,
      description: data.description,
      format: data.format,
      cards: selectedFullCards,
      createdAt: now,
      updatedAt: now,
      hero: selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name),
    };

    setDecks(prevDecks => [...prevDecks, newDeck]);
    toast({ title: "Deck Created", description: `"${newDeck.name}" has been successfully created.` });
    router.push('/decks');
  };

  const handleCancel = () => {
    router.push('/decks');
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl text-primary">Create New Deck</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Assemble your cards and choose a format for your new deck.
        </p>
      </section>
      <DeckForm 
        onSubmit={handleSubmit} 
        isEditing={false}
        onCancel={handleCancel}
      />
    </div>
  );
}
