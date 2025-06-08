'use server';

/**
 * @fileOverview AI-powered Look Suggestion tool.
 *
 * - suggestLook - A function that suggests complements for a given partial "look" or constraints.
 * - SuggestLookInput - The input type for the suggestLook function.
 * - SuggestLookOutput - The return type for the suggestLook function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestLookInputSchema = z.object({
  partialLookDescription: z
    .string()
    .describe('Description of the partial look or specific constraints.'),
  additionalConstraints: z
    .string()
    .optional()
    .describe('Any additional constraints or preferences for the look.'),
});
export type SuggestLookInput = z.infer<typeof SuggestLookInputSchema>;

const SuggestLookOutputSchema = z.object({
  suggestedComplements: z
    .array(z.string())
    .describe('Array of suggested complements for the look.'),
  reasoning: z
    .string()
    .describe('Reasoning behind the suggested complements.'),
});
export type SuggestLookOutput = z.infer<typeof SuggestLookOutputSchema>;

export async function suggestLook(input: SuggestLookInput): Promise<SuggestLookOutput> {
  return suggestLookFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestLookPrompt',
  input: {schema: SuggestLookInputSchema},
  output: {schema: SuggestLookOutputSchema},
  prompt: `You are an expert style advisor for altered TCG, skilled at creating visually appealing card combinations.

You are provided with a description of a partial look and optional additional constraints.  Your goal is to suggest excellent complements for this look.

Partial Look Description: {{{partialLookDescription}}}

{{#if additionalConstraints}}
Additional Constraints: {{{additionalConstraints}}}
{{/if}}

Based on this information, suggest complements for the look, and explain your reasoning for the suggestions.

Format your output as a JSON object with "suggestedComplements" (an array of strings) and "reasoning" (a string explaining the choices).`,
});

const suggestLookFlow = ai.defineFlow(
  {
    name: 'suggestLookFlow',
    inputSchema: SuggestLookInputSchema,
    outputSchema: SuggestLookOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
