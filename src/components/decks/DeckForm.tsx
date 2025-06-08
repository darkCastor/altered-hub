
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Image from 'next/image';
import { Trash2, Save, X } from 'lucide-react';
import type { AlteredCard, Deck } from '@/types';
import { allCards as availableCardsData } from '@/data/cards';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const deckFormats = ["Standard", "Legacy", "Commander", "Pauper", "Singleton", "Custom"] as const;

const deckFormSchema = z.object({
  name: z.string().min(1, "Deck name is required."),
  description: z.string().optional(),
  format: z.enum(deckFormats).optional(),
  cardIds: z.array(z.string()).min(1, "A deck must contain at least one card."),
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
  
  const form = useForm<DeckFormValues>({
    resolver: zodResolver(deckFormSchema),
    defaultValues: initialData || {
      name: '',
      description: '',
      format: undefined,
      cardIds: [],
    },
  });

  useEffect(() => {
    if (initialData?.cardIds) {
      const initialSelectedCards = initialData.cardIds
        .map(id => availableCardsData.find(card => card.id === id))
        .filter(Boolean) as AlteredCard[];
      setSelectedCards(initialSelectedCards);
    }
  }, [initialData]);

  const handleCardToggle = useCallback((card: AlteredCard) => {
    const currentCardIds = form.getValues('cardIds') || [];
    const isSelected = currentCardIds.includes(card.id);
    let newCardIds: string[];
    let newSelectedCards: AlteredCard[];

    if (isSelected) {
      newCardIds = currentCardIds.filter(id => id !== card.id);
      newSelectedCards = selectedCards.filter(c => c.id !== card.id);
    } else {
      newCardIds = [...currentCardIds, card.id];
      newSelectedCards = [...selectedCards, card];
    }
    form.setValue('cardIds', newCardIds, { shouldValidate: true });
    setSelectedCards(newSelectedCards);
  }, [form, selectedCards]);

  const { watch } = form;
  const watchedCardIds = watch('cardIds', initialData?.cardIds || []);

  useEffect(() => {
    const currentlySelectedCards = watchedCardIds
      .map(id => availableCardsData.find(card => card.id === id))
      .filter(Boolean) as AlteredCard[];
    setSelectedCards(currentlySelectedCards);
  }, [watchedCardIds]);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
              <h3 className="font-semibold mb-2 text-lg">Selected Cards ({selectedCards.length})</h3>
              <ScrollArea className="h-[300px] md:h-[calc(100vh-450px)] border rounded-md p-2 bg-muted/30">
                {selectedCards.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No cards selected yet. Add cards from the list on the right.
                  </p>
                )}
                <div className="space-y-2">
                  {selectedCards.map(card => (
                    <div key={card.id} className="flex items-center justify-between p-2 bg-background rounded shadow">
                      <span className="text-sm font-medium">{card.name}</span>
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
            <h3 className="font-semibold mb-2 text-lg">Available Cards</h3>
            <ScrollArea className="flex-grow border rounded-md p-2 bg-muted/30 min-h-[400px] md:min-h-0 md:h-[calc(100vh-250px)]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {availableCardsData.map(card => (
                  <Card
                    key={card.id}
                    onClick={() => handleCardToggle(card)}
                    className={`p-2 cursor-pointer transition-all transform hover:scale-105 ${selectedCards.find(c => c.id === card.id) ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-card/80 bg-card'}`}
                  >
                    {card.imageUrl ? (
                      <Image src={card.imageUrl} alt={card.name} width={100} height={140} className="rounded-sm mx-auto mb-1 object-contain aspect-[300/420] w-full" data-ai-hint={card.name.toLowerCase().split(' ').slice(0,2).join(' ')} />
                    ) : (
                      <div className="w-full aspect-[300/420] bg-muted flex items-center justify-center rounded-sm mx-auto mb-1">
                        <span className="text-xs text-muted-foreground">No Image</span>
                      </div>
                    )}
                    <p className="text-xs font-medium truncate text-center mt-1">{card.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize text-center truncate">{card.type}</p>
                  </Card>
                ))}
              </div>
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

