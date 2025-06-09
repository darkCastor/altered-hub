
'use client';

import { useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X } from 'lucide-react';
import type { AlteredCard } from '@/types';
import { cardTypesLookup, raritiesLookup, factionsLookup } from '@/data/cards';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const deckFormats = ["Standard", "Legacy", "Commander", "Pauper", "Singleton", "Custom"] as const;

const REQUIRED_NON_HERO_CARDS_COUNT = 39;
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
  const { toast } = useToast();

  const form = useForm<DeckFormValues>({
    resolver: zodResolver(deckFormSchema),
    defaultValues: initialData,
  });

  const { watch, setValue, reset } = form;
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
    const currentHeroFaction = hero?.faction || null;

    const nonHeroCards = selectedFullCards.filter(c => c.type !== cardTypesLookup.HERO.name);
    const cardsToKeep = selectedFullCards.filter(card => {
      if (card.type === cardTypesLookup.HERO.name) return true; 
      if (currentHeroFaction) { 
        return card.faction === currentHeroFaction || card.faction === NEUTRAL_FACTION_NAME;
      }
      return true; 
    });

    if (cardsToKeep.length < selectedFullCards.length) {
      const removedCount = selectedFullCards.length - cardsToKeep.length;
      toast({title: "Faction Update", description: `${removedCount} card(s) removed due to faction mismatch with the Hero.`, variant: "default"});
      setValue('cardIds', cardsToKeep.map(c => c.id), { shouldValidate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFullCards, setValue, toast]);


  const internalOnSubmit = (data: DeckFormValues) => {
    const finalSelectedFullCardsOnSubmit = data.cardIds
        .map(id => allCardsData.find(card => card.id === id))
        .filter(Boolean) as AlteredCard[];

    const errors: string[] = [];

    const heroesInDeck = finalSelectedFullCardsOnSubmit.filter(c => c.type === cardTypesLookup.HERO.name);
    if (heroesInDeck.length !== EXACT_HERO_COUNT) {
        errors.push(`Deck must contain exactly ${EXACT_HERO_COUNT} Hero. Found: ${heroesInDeck.length}.`);
    }
    const heroCard = heroesInDeck[0]; 

    const nonHeroCardsInDeck = finalSelectedFullCardsOnSubmit.filter(c => c.type !== cardTypesLookup.HERO.name);

    if (nonHeroCardsInDeck.length !== REQUIRED_NON_HERO_CARDS_COUNT) {
        errors.push(`Deck must contain exactly ${REQUIRED_NON_HERO_CARDS_COUNT} non-Hero cards (for a total of ${REQUIRED_NON_HERO_CARDS_COUNT + EXACT_HERO_COUNT} cards with the Hero). Found: ${nonHeroCardsInDeck.length} non-Hero cards.`);
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
    
    return Array.from(cardCounts.values()).sort((a, b) => {
      if (a.card.type === cardTypesLookup.HERO.name && b.card.type !== cardTypesLookup.HERO.name) return -1;
      if (a.card.type !== cardTypesLookup.HERO.name && b.card.type === cardTypesLookup.HERO.name) return 1;
      return a.card.name.localeCompare(b.card.name);
    });
  }, [selectedFullCards]);


  const currentNonHeroCount = selectedFullCards.filter(c => c.type !== cardTypesLookup.HERO.name).length;
  const currentRareNonHeroCount = selectedFullCards.filter(c => c.rarity === raritiesLookup.RARE.name && c.type !== cardTypesLookup.HERO.name).length;
  const heroInDeck = selectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(internalOnSubmit)} className="space-y-4 h-full flex flex-col">
        <div className="flex-grow flex flex-col space-y-3 overflow-y-auto pr-1 custom-scrollbar">
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
                    <Textarea placeholder="A brief description of your deck..." {...field} rows={2} />
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
                  <Select onValueChange={field.onChange} value={field.value || 'Standard'} >
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
            <div className="flex flex-col flex-1 min-h-0 space-y-1">
              <h3 className="font-semibold text-base">Selected Cards ({selectedFullCards.length})</h3>
              {heroInDeck && <p className="text-xs text-primary">Hero Faction: {heroInDeck.faction || 'N/A'}</p>}
               <p className="text-xs text-muted-foreground">
                Non-Hero: {currentNonHeroCount} / {REQUIRED_NON_HERO_CARDS_COUNT} | Rare Non-Hero: {currentRareNonHeroCount}/{MAX_RARE_CARDS_NON_HERO}
              </p>
              <ScrollArea className="flex-1 border rounded-md p-1.5 bg-muted/20">
                {groupedSelectedCardsForDisplay.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No cards selected. Click cards from the main viewer to add them.
                  </p>
                )}
                <div className="space-y-1">
                  {groupedSelectedCardsForDisplay.map(({ card, quantity }) => (
                    <div key={card.id} className="flex items-center justify-between py-2 px-2.5 bg-card rounded-md shadow-sm hover:bg-muted/40 transition-colors">
                      <div className="flex flex-col">
                        <span className={`text-sm font-semibold leading-tight ${card.type === cardTypesLookup.HERO.name ? 'text-primary' : 'text-card-foreground'}`}>
                          {card.name}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight">
                          {card.type === cardTypesLookup.HERO.name ? 'Hero' : `${card.rarity} - ${card.type}`}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-primary ml-2">
                        x{quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
               <FormMessage>{form.formState.errors.cardIds?.message}</FormMessage>
            </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 pb-2 border-t sticky bottom-0 bg-card">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="icon" onClick={onCancel}>
                  <X className="h-5 w-5" />
                  <span className="sr-only">Cancel</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cancel</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Save className="h-5 w-5" />
                  <span className="sr-only">{isEditing ? 'Save Changes' : 'Create Deck'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isEditing ? 'Save Changes' : 'Create Deck'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </form>
    </Form>
  );
}
