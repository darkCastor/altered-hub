
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Save, X } from 'lucide-react';
import type { AlteredCard } from '@/types';
import { cardTypesLookup, raritiesLookup, factionsLookup } from '@/data/cards';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';

const deckFormats = ["Standard", "Legacy", "Commander", "Pauper", "Singleton", "Custom"] as const;

const MIN_DECK_CARDS_NON_HERO = 39;
const MAX_DECK_CARDS_NON_HERO = 60; 
const EXACT_HERO_COUNT = 1;
const MAX_DUPLICATES_NON_HERO_BY_NAME = 3;
const MAX_RARE_CARDS_NON_HERO = 15;
const NEUTRAL_FACTION_NAME = factionsLookup.NE?.name || "Neutre"; 

const deckFormSchema = z.object({
  name: z.string().min(1, "Deck name is required."),
  description: z.string().optional(),
  format: z.enum(deckFormats).optional(),
  cardIds: z.array(z.string()).min(1, "A deck must contain at least one card (a Hero)."),
});

export type DeckFormValues = z.infer<typeof deckFormSchema>;

interface DeckFormProps {
  onSubmit: (data: DeckFormValues) => void;
  initialData: DeckFormValues; // Made non-optional as parent will always provide it
  isEditing: boolean;
  onCancel: () => void;
  allCardsData: AlteredCard[]; // Pass all cards for hero faction check and other logic
}

export default function DeckForm({ onSubmit, initialData, isEditing, onCancel, allCardsData }: DeckFormProps) {
  const [selectedCards, setSelectedCards] = useState<AlteredCard[]>([]);
  const [selectedHeroFaction, setSelectedHeroFaction] = useState<string | null>(null);
  const { toast } = useToast();
  
  const form = useForm<DeckFormValues>({
    resolver: zodResolver(deckFormSchema),
    defaultValues: initialData,
  });

  const { watch, setValue, trigger } = form;
  const watchedCardIds = watch('cardIds');

  useEffect(() => {
    // When initialData changes (e.g. parent updates cardIds), reset the form
    form.reset(initialData);
  }, [initialData, form.reset]);

  useEffect(() => {
    const currentSelectedFullCards = watchedCardIds
      .map(id => allCardsData.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];
    setSelectedCards(currentSelectedFullCards);

    const hero = currentSelectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);
    const newHeroFaction = hero?.faction || null;

    if (newHeroFaction !== selectedHeroFaction) {
      setSelectedHeroFaction(newHeroFaction);
      if (newHeroFaction) { // If a new hero faction is set (not cleared)
        // Re-validate and potentially remove cards that don't match the new faction
        const cardsToKeep = currentSelectedFullCards.filter(card => {
          if (card.type === cardTypesLookup.HERO.name) return true; 
          return card.faction === newHeroFaction || card.faction === NEUTRAL_FACTION_NAME;
        });
        if (cardsToKeep.length < currentSelectedFullCards.length) {
          toast({title: "Faction Update", description: "Some cards were removed as they didn't match the new Hero's faction.", variant: "default"});
        }
        setValue('cardIds', cardsToKeep.map(c => c.id), { shouldValidate: true });
      }
    }
  }, [watchedCardIds, allCardsData, setValue, toast, selectedHeroFaction]);


  const internalOnSubmit = (data: DeckFormValues) => {
    const finalSelectedCards = data.cardIds
        .map(id => allCardsData.find(card => card.id === id))
        .filter(Boolean) as AlteredCard[];
    
    const errors: string[] = [];

    const heroesInDeck = finalSelectedCards.filter(c => c.type === cardTypesLookup.HERO.name);
    if (heroesInDeck.length !== EXACT_HERO_COUNT) {
        errors.push(`Deck must contain exactly ${EXACT_HERO_COUNT} Hero. Found: ${heroesInDeck.length}.`);
    }
    const heroCard = heroesInDeck[0];

    const nonHeroCardsInDeck = finalSelectedCards.filter(c => c.type !== cardTypesLookup.HERO.name);

    if (nonHeroCardsInDeck.length < MIN_DECK_CARDS_NON_HERO) {
        errors.push(`Deck must contain at least ${MIN_DECK_CARDS_NON_HERO} non-Hero cards. Found: ${nonHeroCardsInDeck.length}.`);
    }
    if (nonHeroCardsInDeck.length > MAX_DECK_CARDS_NON_HERO) {
      errors.push(`Deck cannot exceed ${MAX_DECK_CARDS_NON_HERO} non-Hero cards. Found: ${nonHeroCardsInDeck.length}.`);
    }

    const cardCountsByName: { [name: string]: number } = {};
    nonHeroCardsInDeck.forEach(card => {
        cardCountsByName[card.name] = (cardCountsByName[card.name] || 0) + 1;
    });

    for (const cardName in cardCountsByName) {
        if (cardCountsByName[cardName] > MAX_DUPLICATES_NON_HERO_BY_NAME) {
            errors.push(`Too many copies of non-Hero card "${cardName}". Max allowed: ${MAX_DUPLICATES_NON_HERO_BY_NAME}, Found: ${cardCountsByName[cardName]}.`);
        }
    }

    const rareNonHeroCards = nonHeroCardsInDeck.filter(c => c.rarity === raritiesLookup.RARE.name && c.type !== cardTypesLookup.HERO.name);
    if (rareNonHeroCards.length > MAX_RARE_CARDS_NON_HERO) {
        errors.push(`Too many Rare non-Hero cards. Max allowed: ${MAX_RARE_CARDS_NON_HERO}, Found: ${rareNonHeroCards.length}.`);
    }

    if (heroCard && heroCard.faction) {
      const heroDeckFaction = heroCard.faction;
      nonHeroCardsInDeck.forEach(card => {
        if (card.faction !== heroDeckFaction && card.faction !== NEUTRAL_FACTION_NAME) {
          errors.push(`Card "${card.name}" (Faction: ${card.faction}) does not match Hero's faction (${heroDeckFaction}) and is not Neutral.`);
        }
      });
    } else if (heroesInDeck.length === 0 && nonHeroCardsInDeck.length > 0) {
      // This case might be caught by EXACT_HERO_COUNT already, but good to have
      errors.push("A Hero must be selected to determine deck faction if other cards are present.");
    } else if (heroesInDeck.length === 0 && nonHeroCardsInDeck.length === 0 && data.cardIds.length > 0) {
      // If cardIds has something but it's not a hero and no other cards (e.g., started with non-hero)
      if(!finalSelectedCards.find(c => c.type === cardTypesLookup.HERO.name)) {
         errors.push("Deck must start with a Hero card if it's the only card.");
      }
    }
    
    if (errors.length > 0) {
        errors.forEach(err => toast({ title: "Deck Validation Error", description: err, variant: "destructive", duration: 7000 }));
        return; 
    }

    onSubmit(data);
  };

  const currentNonHeroCount = selectedCards.filter(c => c.type !== cardTypesLookup.HERO.name).length;
  const currentRareNonHeroCount = selectedCards.filter(c => c.rarity === raritiesLookup.RARE.name && c.type !== cardTypesLookup.HERO.name).length;
  const heroInDeck = selectedCards.find(c => c.type === cardTypesLookup.HERO.name);

  const handleRemoveCardFromDeck = (cardId: string) => {
    const updatedCardIds = watchedCardIds.filter(id => id !== cardId);
    setValue('cardIds', updatedCardIds, { shouldValidate: true, shouldDirty: true });
    trigger('cardIds'); // Manually trigger validation for cardIds
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(internalOnSubmit)} className="space-y-6 h-full flex flex-col">
        <div className="flex-grow space-y-4 overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deck Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Awesome Deck" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="A brief description of your deck..." {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deck Format</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''} >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a format" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {deckFormats.map(format => (
                        <SelectItem key={format} value={format}>{format}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <h3 className="font-semibold mb-1 text-lg">Selected Cards ({selectedCards.length})</h3>
              {heroInDeck && <p className="text-xs text-primary mb-1">Hero Faction: {heroInDeck.faction || 'N/A'}</p>}
               <p className="text-xs text-muted-foreground mb-2">
                Non-Hero Cards: {currentNonHeroCount} (Min: {MIN_DECK_CARDS_NON_HERO}, Max: {MAX_DECK_CARDS_NON_HERO})<br/>
                Rare Non-Hero Cards: {currentRareNonHeroCount} / {MAX_RARE_CARDS_NON_HERO}
              </p>
              <ScrollArea className="h-[250px] md:h-[calc(100vh-620px)] border rounded-md p-2 bg-muted/30">
                {selectedCards.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No cards selected. Click cards from the main viewer to add them.
                  </p>
                )}
                <div className="space-y-2">
                  {selectedCards.sort((a,b) => a.name.localeCompare(b.name)).map(card => (
                    <div key={card.id} className="flex items-center justify-between p-2 bg-card rounded shadow">
                      <span className="text-sm font-medium">{card.name} ({card.type === cardTypesLookup.HERO.name ? 'Hero' : card.rarity})</span>
                      <Button variant="ghost" size="icon" type="button" onClick={() => handleRemoveCardFromDeck(card.id)} aria-label={`Remove ${card.name}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t sticky bottom-0 bg-card py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Save className="mr-2 h-4 w-4" /> {isEditing ? 'Save Changes' : 'Create Deck'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

    