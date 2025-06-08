'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { suggestLook, type SuggestLookInput, type SuggestLookOutput } from '@/ai/flows/look-suggestion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";


const SuggestLookInputClientSchema = z.object({
  partialLookDescription: z.string().min(10, "Partial look description must be at least 10 characters long."),
  additionalConstraints: z.string().optional(),
});


export default function LookSuggesterClient() {
  const [suggestionOutput, setSuggestionOutput] = useState<SuggestLookOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<SuggestLookInput>({
    resolver: zodResolver(SuggestLookInputClientSchema),
    defaultValues: {
      partialLookDescription: '',
      additionalConstraints: '',
    },
  });

  const onSubmit: SubmitHandler<SuggestLookInput> = async (data) => {
    setIsLoading(true);
    setSuggestionOutput(null);
    try {
      const result = await suggestLook(data);
      setSuggestionOutput(result);
      toast({
        title: "Suggestions Received!",
        description: "AI has provided complements for your look.",
      });
    } catch (error) {
      console.error("Error getting look suggestions:", error);
      toast({
        title: "Error",
        description: "Failed to get look suggestions. Please try again. Check console for details.",
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
            <Sparkles className="h-6 w-6 text-primary" />
            Look Suggestion Input
          </CardTitle>
          <CardDescription>
            Describe your partial look or constraints, and let AI find perfect complements.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="partialLookDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="partialLookDescription">Partial Look Description</FormLabel>
                    <FormControl>
                      <Textarea
                        id="partialLookDescription"
                        placeholder="e.g., 'A set of cards featuring fiery dragons and volcanic landscapes', or 'Blue and silver themed hero cards'..."
                        rows={5}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Describe the existing elements of your look or the vibe you're going for.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="additionalConstraints"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="additionalConstraints">Additional Constraints (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        id="additionalConstraints"
                        placeholder="e.g., 'Only cards from the Muna faction', 'Must include at least one legendary card'..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Any specific preferences or limitations for the suggestions.</FormDescription>
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
                    Finding Complements...
                  </>
                ) : (
                  'Get AI Look Suggestions'
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">AI Generated Suggestions</CardTitle>
          <CardDescription>
            Creative ideas from our AI style advisor.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px]">
           {isLoading && !suggestionOutput && (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Generating ideas...</p>
            </div>
          )}
          {suggestionOutput ? (
            <ScrollArea className="h-[400px] p-1 space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">Suggested Complements:</h3>
                {suggestionOutput.suggestedComplements.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 pl-4 bg-muted/50 p-4 rounded-md">
                    {suggestionOutput.suggestedComplements.map((complement, index) => (
                      <li key={index} className="text-sm">{complement}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No specific complements suggested, see reasoning below.</p>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Reasoning:</h3>
                <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-md font-code">{suggestionOutput.reasoning}</pre>
              </div>
            </ScrollArea>
          ) : (
             !isLoading && <p className="text-muted-foreground text-center pt-10">Enter your look details and click "Get AI Look Suggestions" to see ideas here.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
