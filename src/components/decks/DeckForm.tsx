
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
  initialData: DeckFormValues;
  isEditing: boolean;
  onCancel: () => void;
  allCardsData: AlteredCard[];
}

interface GroupedCardDisplay {
  card: AlteredCard;
  quantity: number;
}

export default function DeckForm({ onSubmit, initialData, isEditing, onCancel, allCardsData }: DeckFormProps) {
  const [selectedHeroFaction, setSelectedHeroFaction] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<DeckFormValues>({
    resolver: zodResolver(deckFormSchema),
    defaultValues: initialData,
  });

  const { watch, setValue, trigger, reset } = form;
  const watchedCardIds = watch('cardIds');

  useEffect(() => {
    reset(initialData);
  }, [initialData, reset]);

  const selectedFullCards = useMemo(() => {
    return watchedCardIds
      .map(id => allCardsData.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];
  }, [watchedCardIds, allCardsData]);

  useEffect(() => {
    const hero = selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);
    const newHeroFaction = hero?.faction || null;

    if (newHeroFaction !== selectedHeroFaction) {
      setSelectedHeroFaction(newHeroFaction);
      if (newHeroFaction) {
        const cardsToKeep = selectedFullCards.filter(card => {
          if (card.type === cardTypesLookup.HERO.name) return true;
          return card.faction === newHeroFaction || card.faction === NEUTRAL_FACTION_NAME;
        });
        if (cardsToKeep.length < selectedFullCards.length) {
          toast({title: "Faction Update", description: "Some cards were removed as they didn't match the new Hero's faction.", variant: "default"});
        }
        setValue('cardIds', cardsToKeep.map(c => c.id), { shouldValidate: true });
      }
    }
  }, [selectedFullCards, setValue, toast, selectedHeroFaction]);


  const internalOnSubmit = (data: DeckFormValues) => {
    const finalSelectedFullCardsOnSubmit = data.cardIds
        .map(id => allCardsData.find(card => card.id === id))
        .filter(Boolean) as AlteredCard[];

    const errors: string[] = [];

    const heroesInDeck = finalSelectedFullCardsOnSubmit.filter(c => c.type === cardTypesLookup.HERO.name);
    if (heroesInDeck.length !== EXACT_HERO_COUNT) {
        errors.push(`Deck must contain exactly ${EXACT_HERO_COUNT} Hero. Found: ${heroesInDeck.length}.`);
    }
    const heroCard = heroesInDeck[0]; // This will be undefined if not EXACT_HERO_COUNT, which is fine for subsequent checks

    const nonHeroCardsInDeck = finalSelectedFullCardsOnSubmit.filter(c => c.type !== cardTypesLookup.HERO.name);

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
    }


    if (errors.length > 0) {
        errors.forEach(err => toast({ title: "Deck Validation Error", description: err, variant: "destructive", duration: 7000 }));
        return;
    }

    onSubmit(data);
  };

  const groupedSelectedCardsForDisplay: GroupedCardDisplay[] = useMemo(() => {
    const cardCounts = new Map<string, { card: AlteredCard; quantity: number }>();
    selectedFullCards.forEach(card => {
      if (cardCounts.has(card.id)) {
        cardCounts.get(card.id)!.quantity++;
      } else {
        cardCounts.set(card.id, { card, quantity: 1 });
      }
    });
    return Array.from(cardCounts.values()).sort((a, b) => a.card.name.localeCompare(b.card.name));
  }, [selectedFullCards]);


  const currentNonHeroCount = selectedFullCards.filter(c => c.type !== cardTypesLookup.HERO.name).length;
  const currentRareNonHeroCount = selectedFullCards.filter(c => c.rarity === raritiesLookup.RARE.name && c.type !== cardTypesLookup.HERO.name).length;
  const heroInDeck = selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);

  const handleRemoveCardFromDeckPanel = (cardIdToRemove: string) => {
    const currentCardIds = [...watchedCardIds];
    const lastIndexOfCard = currentCardIds.lastIndexOf(cardIdToRemove);

    if (lastIndexOfCard > -1) {
      currentCardIds.splice(lastIndexOfCard, 1);
      setValue('cardIds', currentCardIds, { shouldValidate: true, shouldDirty: true });
      trigger('cardIds');
    }
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
              <h3 className="font-semibold mb-1 text-lg">Selected Cards ({selectedFullCards.length})</h3>
              {heroInDeck && <p className="text-xs text-primary mb-1">Hero Faction: {heroInDeck.faction || 'N/A'}</p>}
               <p className="text-xs text-muted-foreground mb-2">
                Non-Hero Cards: {currentNonHeroCount} (Min: {MIN_DECK_CARDS_NON_HERO}, Max: {MAX_DECK_CARDS_NON_HERO})<br/>
                Rare Non-Hero Cards: {currentRareNonHeroCount} / {MAX_RARE_CARDS_NON_HERO}
              </p>
              <ScrollArea className="h-[250px] md:h-[calc(100vh-620px)] border rounded-md p-2 bg-muted/30">
                {groupedSelectedCardsForDisplay.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No cards selected. Click cards from the main viewer to add them.
                  </p>
                )}
                <div className="space-y-2">
                  {groupedSelectedCardsForDisplay.map(({ card, quantity }) => (
                    <div key={card.id} className="flex items-center justify-between p-2 bg-card rounded shadow">
                      <span className="text-sm font-medium">
                        {card.name} ({card.type === cardTypesLookup.HERO.name ? 'Hero' : card.rarity})
                        {quantity > 1 && <span className="text-muted-foreground"> x{quantity}</span>}
                      </span>
                      <Button variant="ghost" size="icon" type="button" onClick={() => handleRemoveCardFromDeckPanel(card.id)} aria-label={`Remove one ${card.name}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
               <FormMessage>{form.formState.errors.cardIds?.message}</FormMessage>
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
