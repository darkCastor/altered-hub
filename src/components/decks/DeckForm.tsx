
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Image from 'next/image';
import { Trash2, Save, X, Loader2 } from 'lucide-react';
import type { AlteredCard } from '@/types';
import { allCards as allAvailableCardsData, cardTypesLookup, raritiesLookup, factionsLookup } from '@/data/cards';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';

const deckFormats = ["Standard", "Legacy", "Commander", "Pauper", "Singleton", "Custom"] as const;

const MIN_DECK_CARDS_NON_HERO = 39;
const MAX_DECK_CARDS_NON_HERO = 60; 
const EXACT_HERO_COUNT = 1;
const MAX_DUPLICATES_NON_HERO_BY_NAME = 3;
const MAX_RARE_CARDS_NON_HERO = 15;

const NEUTRAL_FACTION_NAME = factionsLookup.NE?.name || "Neutre"; 
const CARDS_PER_LOAD_DECK_FORM = 50;


const deckFormSchema = z.object({
  name: z.string().min(1, "Deck name is required."),
  description: z.string().optional(),
  format: z.enum(deckFormats).optional(),
  cardIds: z.array(z.string()).min(1, "A deck must contain at least one card (a Hero)."),
});

export type DeckFormValues = z.infer<typeof deckFormSchema>;

interface DeckFormProps {
  onSubmit: (data: DeckFormValues) => void;
  initialData?: Partial<DeckFormValues>;
  isEditing: boolean;
  onCancel: () => void;
}

export default function DeckForm({ onSubmit, initialData, isEditing, onCancel }: DeckFormProps) {
  const [selectedCards, setSelectedCards] = useState<AlteredCard[]>([]);
  const [selectedHeroFaction, setSelectedHeroFaction] = useState<string | null>(null);
  const { toast } = useToast();
  
  const form = useForm<DeckFormValues>({
    resolver: zodResolver(deckFormSchema),
    defaultValues: initialData || {
      name: '',
      description: '',
      format: undefined,
      cardIds: [],
    },
  });

  const { watch, setValue, getValues } = form;
  const watchedCardIds = watch('cardIds', initialData?.cardIds || []);

  // --- Infinite scroll for Available Cards ---
  const [availableCardsDisplayCount, setAvailableCardsDisplayCount] = useState<number>(CARDS_PER_LOAD_DECK_FORM);
  const [isLoadingMoreAvailableCards, setIsLoadingMoreAvailableCards] = useState<boolean>(false);
  const availableCardsObserverRef = useRef<HTMLDivElement | null>(null);
  // --- End Infinite scroll ---

  useEffect(() => {
    const currentSelectedFullCards = watchedCardIds
      .map(id => allAvailableCardsData.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];
    setSelectedCards(currentSelectedFullCards);

    const hero = currentSelectedFullCards.find(c => c.type === cardTypesLookup.HERO.name);
    setSelectedHeroFaction(hero?.faction || null);
  }, [watchedCardIds]);


  const displayableAvailableCards = useMemo(() => {
    let filtered = allAvailableCardsData;
    if (selectedHeroFaction) {
      filtered = allAvailableCardsData.filter(card => {
        if (card.type === cardTypesLookup.HERO.name) return true;
        return card.faction === selectedHeroFaction || card.faction === NEUTRAL_FACTION_NAME;
      });
    }
    // Reset display count when filtered list changes
    setAvailableCardsDisplayCount(CARDS_PER_LOAD_DECK_FORM);
    return filtered;
  }, [selectedHeroFaction]);
  
  const availableCardsToShow = useMemo(() => {
    return displayableAvailableCards.slice(0, availableCardsDisplayCount);
  }, [displayableAvailableCards, availableCardsDisplayCount]);

  const handleLoadMoreAvailableCards = useCallback(() => {
    if (isLoadingMoreAvailableCards || availableCardsDisplayCount >= displayableAvailableCards.length) return;

    setIsLoadingMoreAvailableCards(true);
    setTimeout(() => { 
      setAvailableCardsDisplayCount(prevCount => Math.min(prevCount + CARDS_PER_LOAD_DECK_FORM, displayableAvailableCards.length));
      setIsLoadingMoreAvailableCards(false);
    }, 300); // Shorter delay for deck form
  }, [isLoadingMoreAvailableCards, availableCardsDisplayCount, displayableAvailableCards.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMoreAvailableCards && availableCardsDisplayCount < displayableAvailableCards.length) {
          handleLoadMoreAvailableCards();
        }
      },
      { 
        threshold: 1.0,
        rootMargin: "0px 0px 200px 0px" // Trigger earlier
      } 
    );

    const currentObserverRef = availableCardsObserverRef.current;
    if (currentObserverRef) {
      observer.observe(currentObserverRef);
    }

    return () => {
      if (currentObserverRef) {
        observer.unobserve(currentObserverRef);
      }
    };
  }, [isLoadingMoreAvailableCards, availableCardsDisplayCount, displayableAvailableCards.length, handleLoadMoreAvailableCards]);


  const handleCardToggle = useCallback((cardToAddOrRemove: AlteredCard) => {
    const currentCardIds = getValues('cardIds') || [];
    const isCurrentlySelected = currentCardIds.includes(cardToAddOrRemove.id);
    
    let potentialSelectedCards: AlteredCard[];
    if (isCurrentlySelected) {
      potentialSelectedCards = selectedCards.filter(c => c.id !== cardToAddOrRemove.id);
    } else {
      potentialSelectedCards = [...selectedCards, cardToAddOrRemove];
    }

    const heroInPotentialDeck = potentialSelectedCards.find(c => c.type === cardTypesLookup.HERO.name);
    
    if (!isCurrentlySelected) { 
      if (cardToAddOrRemove.type === cardTypesLookup.HERO.name) {
        const existingHeroes = selectedCards.filter(c => c.type === cardTypesLookup.HERO.name);
        if (existingHeroes.length >= EXACT_HERO_COUNT && existingHeroes[0].id !== cardToAddOrRemove.id) {
          toast({ title: "Deck Rule Violation", description: `Cannot add more than ${EXACT_HERO_COUNT} Hero. Please remove the current Hero first.`, variant: "destructive" });
          return;
        }
      }

      const deckHeroForFactionCheck = cardToAddOrRemove.type === cardTypesLookup.HERO.name ? cardToAddOrRemove : heroInPotentialDeck;
      if (deckHeroForFactionCheck && cardToAddOrRemove.type !== cardTypesLookup.HERO.name) {
        if (cardToAddOrRemove.faction !== deckHeroForFactionCheck.faction && cardToAddOrRemove.faction !== NEUTRAL_FACTION_NAME) {
          toast({ title: "Deck Rule Violation", description: `Card "${cardToAddOrRemove.name}" faction (${cardToAddOrRemove.faction}) does not match Hero's faction (${deckHeroForFactionCheck.faction}) and is not Neutral.`, variant: "destructive" });
          return;
        }
      }
      
      if (cardToAddOrRemove.type !== cardTypesLookup.HERO.name) {
        const countOfSameName = potentialSelectedCards.filter(c => c.name === cardToAddOrRemove.name && c.type !== cardTypesLookup.HERO.name).length;
        if (countOfSameName > MAX_DUPLICATES_NON_HERO_BY_NAME) {
          toast({ title: "Deck Rule Violation", description: `Cannot add more than ${MAX_DUPLICATES_NON_HERO_BY_NAME} copies of non-Hero card "${cardToAddOrRemove.name}".`, variant: "destructive" });
          return;
        }
      }
      
      if (cardToAddOrRemove.type !== cardTypesLookup.HERO.name && cardToAddOrRemove.rarity === raritiesLookup.RARE.name) {
        const currentRareNonHeroCount = potentialSelectedCards.filter(c => c.type !== cardTypesLookup.HERO.name && c.rarity === raritiesLookup.RARE.name).length;
        if (currentRareNonHeroCount > MAX_RARE_CARDS_NON_HERO) {
           toast({ title: "Deck Rule Violation", description: `Cannot add more than ${MAX_RARE_CARDS_NON_HERO} Rare non-Hero cards.`, variant: "destructive" });
           return;
        }
      }

      const nonHeroCardsInPotentialDeck = potentialSelectedCards.filter(c => c.type !== cardTypesLookup.HERO.name);
      if (nonHeroCardsInPotentialDeck.length > MAX_DECK_CARDS_NON_HERO) {
         toast({ title: "Deck Rule Violation", description: `Deck cannot exceed ${MAX_DECK_CARDS_NON_HERO} non-Hero cards.`, variant: "destructive" });
         return;
      }
    }
    
    let updatedCardIds: string[];
    if (isCurrentlySelected) {
      updatedCardIds = currentCardIds.filter(id => id !== cardToAddOrRemove.id);
    } else {
      updatedCardIds = [...currentCardIds, cardToAddOrRemove.id];
    }
    
    setValue('cardIds', updatedCardIds, { shouldValidate: true });
  }, [getValues, selectedCards, toast, setValue, selectedHeroFaction]);


  useEffect(() => {
    const currentlySelectedCards = watchedCardIds
      .map(id => allAvailableCardsData.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];
    
    const currentHero = currentlySelectedCards.find(c => c.type === cardTypesLookup.HERO.name);
    const newHeroFaction = currentHero?.faction || null;

    if (newHeroFaction !== selectedHeroFaction) {
      setSelectedHeroFaction(newHeroFaction); // This will trigger displayableAvailableCards recalc
      if (newHeroFaction) {
        const cardsToKeep = currentlySelectedCards.filter(card => {
          if (card.type === cardTypesLookup.HERO.name) return true; 
          return card.faction === newHeroFaction || card.faction === NEUTRAL_FACTION_NAME;
        });
        if (cardsToKeep.length < currentlySelectedCards.length) {
          toast({title: "Faction Update", description: "Some cards were removed as they didn't match the new Hero's faction.", variant: "default"});
        }
        setValue('cardIds', cardsToKeep.map(c => c.id), { shouldValidate: true });
      }
    } else {
      // If faction didn't change, just update selected cards
      setSelectedCards(currentlySelectedCards);
    }
  }, [watchedCardIds, setValue, selectedHeroFaction, toast]);


  const internalOnSubmit = (data: DeckFormValues) => {
    const finalSelectedCards = data.cardIds
        .map(id => allAvailableCardsData.find(card => card.id === id))
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

    const rareNonHeroCards = nonHeroCardsInDeck.filter(c => c.rarity === raritiesLookup.RARE.name);
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
      errors.push("A Hero must be selected to determine deck faction.");
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


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(internalOnSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Deck Details & Selected Cards */}
          <div className="md:col-span-1 space-y-6">
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              <ScrollArea className="h-[300px] md:h-[calc(100vh-580px)] border rounded-md p-2 bg-muted/30">
                {selectedCards.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No cards selected yet. Add cards from the list on the right.
                  </p>
                )}
                <div className="space-y-2">
                  {selectedCards.map(card => (
                    <div key={card.id} className="flex items-center justify-between p-2 bg-card rounded shadow">
                      <span className="text-sm font-medium">{card.name} ({card.type === cardTypesLookup.HERO.name ? 'Hero' : card.rarity})</span>
                      <Button variant="ghost" size="icon" type="button" onClick={() => handleCardToggle(card)} aria-label={`Remove ${card.name}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Column 2: Available Cards */}
          <div className="md:col-span-2 flex flex-col">
            <h3 className="font-semibold mb-2 text-lg">Available Cards {selectedHeroFaction ? `(${selectedHeroFaction} & ${NEUTRAL_FACTION_NAME} only)` : '(Select a Hero to filter by faction)'}</h3>
            <ScrollArea className="flex-grow border rounded-md p-2 bg-muted/30 min-h-[400px] md:min-h-0 md:h-[calc(100vh-280px)]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {availableCardsToShow.map(card => (
                  <Card
                    key={card.id}
                    onClick={() => handleCardToggle(card)}
                    className={`p-2 cursor-pointer transition-all transform hover:scale-105 
                                ${selectedCards.find(c => c.id === card.id) ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-card/80 bg-card'}
                                ${selectedHeroFaction && card.type !== cardTypesLookup.HERO.name && card.faction !== selectedHeroFaction && card.faction !== NEUTRAL_FACTION_NAME ? 'opacity-50 cursor-not-allowed' : ''}
                              `}
                    title={selectedHeroFaction && card.type !== cardTypesLookup.HERO.name && card.faction !== selectedHeroFaction && card.faction !== NEUTRAL_FACTION_NAME ? `This card's faction (${card.faction}) does not match the Hero's faction (${selectedHeroFaction}) and is not Neutral.` : card.name}
                  >
                    {card.imageUrl ? (
                      <Image src={card.imageUrl} alt={card.name} width={100} height={140} className="rounded-sm mx-auto mb-1 object-contain aspect-[300/420] w-full" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />
                    ) : (
                      <div className="w-full aspect-[300/420] bg-muted flex items-center justify-center rounded-sm mx-auto mb-1">
                        <span className="text-xs text-muted-foreground">No Image</span>
                      </div>
                    )}
                    <p className="text-xs font-medium truncate text-center mt-1">{card.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize text-center truncate">{card.type} - {card.rarity}</p>
                  </Card>
                ))}
              </div>
              {displayableAvailableCards.length > availableCardsDisplayCount && !isLoadingMoreAvailableCards && (
                <div ref={availableCardsObserverRef} style={{ height: '50px', marginTop: '20px' }} aria-hidden="true" />
              )}
              {isLoadingMoreAvailableCards && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              )}
              {availableCardsToShow.length === 0 && !isLoadingMoreAvailableCards && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  No cards match the current faction filter.
                </p>
              )}
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t">
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
