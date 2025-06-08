'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getDeckAdvice, type DeckAdviceInput, type DeckAdviceOutput } from '@/ai/flows/deck-advisor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lightbulb } from 'lucide-react';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";


const DeckAdviceInputClientSchema = z.object({
  theme: z.string().min(3, "Theme must be at least 3 characters long."),
  archetype: z.string().min(3, "Archetype must be at least 3 characters long."),
  cardSelection: z.string().min(10, "Card selection description must be at least 10 characters long."),
});

export default function DeckAdvisorClient() {
  const [adviceOutput, setAdviceOutput] = useState<DeckAdviceOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<DeckAdviceInput>({
    resolver: zodResolver(DeckAdviceInputClientSchema),
    defaultValues: {
      theme: '',
      archetype: '',
      cardSelection: '',
    },
  });

  const onSubmit: SubmitHandler<DeckAdviceInput> = async (data) => {
    setIsLoading(true);
    setAdviceOutput(null);
    try {
      const result = await getDeckAdvice(data);
      setAdviceOutput(result);
      toast({
        title: "Advice Received!",
        description: "AI has provided suggestions for your deck.",
      });
    } catch (error) {
      console.error("Error getting deck advice:", error);
      toast({
        title: "Error",
        description: "Failed to get deck advice. Please try again. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-primary" />
            Deck Advisor Input
          </CardTitle>
          <CardDescription>
            Provide details about your deck idea, and our AI will help you complete it.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="theme">Deck Theme</FormLabel>
                    <FormControl>
                      <Input id="theme" placeholder="e.g., Aggro, Control, Murloc Swarm" {...field} />
                    </FormControl>
                    <FormDescription>What is the central theme or strategy of your deck?</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="archetype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="archetype">Deck Archetype</FormLabel>
                    <FormControl>
                     <Input id="archetype" placeholder="e.g., Spell Power Mage, Token Druid" {...field} />
                    </FormControl>
                    <FormDescription>What is the general playstyle or archetype?</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cardSelection"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="cardSelection">Current Cards / Core Ideas</FormLabel>
                     <FormControl>
                      <Textarea
                        id="cardSelection"
                        placeholder="List key cards you want to include, or describe core card interactions..."
                        rows={5}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Describe the cards you've already selected or the core mechanics.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isLoading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Getting Advice...
                  </>
                ) : (
                  'Get AI Deck Advice'
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">AI Generated Advice</CardTitle>
          <CardDescription>
            Suggestions and insights from our AI deck building expert.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px]">
          {isLoading && !adviceOutput && (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Thinking...</p>
            </div>
          )}
          {adviceOutput ? (
            <ScrollArea className="h-[400px] p-1">
              <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-md font-code">{adviceOutput.advice}</pre>
            </ScrollArea>
          ) : (
            !isLoading && <p className="text-muted-foreground text-center pt-10">Enter your deck details and click "Get AI Deck Advice" to see suggestions here.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
