'use server';

/**
 * @fileOverview AI-powered Deck Advisor tool.
 *
 * - getDeckAdvice - A function that provides advice for deck completion.
 * - DeckAdviceInput - The input type for the getDeckAdvice function.
 * - DeckAdviceOutput - The return type for the getDeckAdvice function.
 */

import { ai } from '../genkit.js';
import { z } from 'genkit';

const DeckAdviceInputSchema = z.object({
	theme: z.string().describe('The theme of the deck.'),
	archetype: z.string().describe('The archetype of the deck.'),
	cardSelection: z.string().describe('The specific card selection.')
});
export type DeckAdviceInput = z.infer<typeof DeckAdviceInputSchema>;

const DeckAdviceOutputSchema = z.object({
	advice: z.string().describe('Advice for completing the deck.')
});
export type DeckAdviceOutput = z.infer<typeof DeckAdviceOutputSchema>;

export async function getDeckAdvice(input: DeckAdviceInput): Promise<DeckAdviceOutput> {
	return deckAdvisorFlow(input);
}

const prompt = ai.definePrompt({
	name: 'deckAdvisorPrompt',
	input: { schema: DeckAdviceInputSchema },
	output: { schema: DeckAdviceOutputSchema },
	prompt: `You are an expert deck builder for the Altered TCG.

You will use the following information to give advice for completing the deck.

Theme: {{{theme}}}
Archetype: {{{archetype}}}
Card Selection: {{{cardSelection}}}

Give advice for completing the deck, including specific cards to add and strategies to employ.`
});

const deckAdvisorFlow = ai.defineFlow(
	{
		name: 'deckAdvisorFlow',
		inputSchema: DeckAdviceInputSchema,
		outputSchema: DeckAdviceOutputSchema
	},
	async (input) => {
		const { output } = await prompt(input);
		if (!output) {
			// Or return a default DeckAdviceOutput if that's preferred
			throw new Error('Failed to get advice from AI prompt.');
		}
		return output;
	}
);
