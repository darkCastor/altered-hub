<script lang="ts">
	import { z } from 'zod';
	// Temporarily disabled AI functionality for build
	// import { getDeckAdvice, type DeckAdviceInput, type DeckAdviceOutput } from '$ai/flows/deck-advisor';

	interface DeckAdviceInput {
		theme: string;
		archetype: string;
		cardSelection: string;
	}

	interface DeckAdviceOutput {
		advice: string;
	}
	import Button from '$components/ui/button/Button.svelte';
	import Card from '$components/ui/card/Card.svelte';
	import CardContent from '$components/ui/card/CardContent.svelte';
	import CardDescription from '$components/ui/card/CardDescription.svelte';
	import CardFooter from '$components/ui/card/CardFooter.svelte';
	import CardHeader from '$components/ui/card/CardHeader.svelte';
	import CardTitle from '$components/ui/card/CardTitle.svelte';
	import { Loader2, Lightbulb } from 'lucide-svelte';

	const DeckAdviceInputSchema = z.object({
		theme: z.string().min(3, 'Theme must be at least 3 characters long.'),
		archetype: z.string().min(3, 'Archetype must be at least 3 characters long.'),
		cardSelection: z
			.string()
			.min(10, 'Card selection description must be at least 10 characters long.')
	});

	let adviceOutput: DeckAdviceOutput | null = null;
	let isLoading = false;

	let formData = {
		theme: '',
		archetype: '',
		cardSelection: ''
	};

	let errors: Record<string, string[]> = {};

	function validateForm() {
		errors = {};
		if (formData.theme.length < 3) {
			errors.theme = ['Theme must be at least 3 characters long.'];
		}
		if (formData.archetype.length < 3) {
			errors.archetype = ['Archetype must be at least 3 characters long.'];
		}
		if (formData.cardSelection.length < 10) {
			errors.cardSelection = ['Card selection description must be at least 10 characters long.'];
		}
		return Object.keys(errors).length === 0;
	}

	async function handleSubmit() {
		if (!validateForm()) return;

		isLoading = true;
		adviceOutput = null;
		try {
			// Simulate AI response for now
			await new Promise((resolve) => setTimeout(resolve, 2000));
			adviceOutput = {
				advice:
					`Based on your ${formData.theme} theme and ${formData.archetype} archetype:\n\n` +
					`• Consider adding cards that synergize with your core strategy\n` +
					`• Balance your mana curve for consistent gameplay\n` +
					`• Include versatile cards that work in multiple situations\n` +
					`• Don't forget defensive options to protect your strategy\n\n` +
					`Note: AI advisor is temporarily disabled during development.`
			};
			alert('Advice Received! AI has provided suggestions for your deck.');
		} catch (error) {
			console.error('Error getting deck advice:', error);
			alert('Failed to get deck advice. Please try again.');
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="grid gap-8 md:grid-cols-2">
	<Card class="shadow-xl">
		<CardHeader>
			<CardTitle class="flex items-center gap-2 font-headline text-2xl">
				<Lightbulb class="h-6 w-6 text-primary" />
				Deck Advisor Input
			</CardTitle>
			<CardDescription>
				Provide details about your deck idea, and our AI will help you complete it.
			</CardDescription>
		</CardHeader>
		<form on:submit|preventDefault={handleSubmit}>
			<CardContent class="space-y-6">
				<div class="space-y-2">
					<label for="theme" class="text-sm font-medium">Deck Theme</label>
					<input
						id="theme"
						bind:value={formData.theme}
						on:input={validateForm}
						placeholder="e.g., Aggro, Control, Forest Control"
						class="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<p class="text-sm text-muted-foreground">
						What is the central theme or strategy of your deck?
					</p>
					{#if errors.theme}
						<p class="text-sm text-destructive">{errors.theme[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<label for="archetype" class="text-sm font-medium">Deck Archetype</label>
					<input
						id="archetype"
						bind:value={formData.archetype}
						on:input={validateForm}
						placeholder="e.g., Axiom Tempo, Bravos Aggro"
						class="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<p class="text-sm text-muted-foreground">What is the general playstyle or archetype?</p>
					{#if errors.archetype}
						<p class="text-sm text-destructive">{errors.archetype[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<label for="cardSelection" class="text-sm font-medium">Current Cards / Core Ideas</label>
					<textarea
						id="cardSelection"
						bind:value={formData.cardSelection}
						on:input={validateForm}
						placeholder="List key cards you want to include, or describe core card interactions..."
						rows="5"
						class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
					></textarea>
					<p class="text-sm text-muted-foreground">
						Describe the cards you've already selected or the core mechanics.
					</p>
					{#if errors.cardSelection}
						<p class="text-sm text-destructive">{errors.cardSelection[0]}</p>
					{/if}
				</div>
			</CardContent>
			<CardFooter>
				<Button
					type="submit"
					disabled={isLoading || Object.keys(errors).length > 0}
					class="w-full bg-accent text-accent-foreground hover:bg-accent/90"
				>
					{#if isLoading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Getting Advice...
					{:else}
						Get AI Deck Advice
					{/if}
				</Button>
			</CardFooter>
		</form>
	</Card>

	<Card class="shadow-xl">
		<CardHeader>
			<CardTitle class="font-headline text-2xl">AI Generated Advice</CardTitle>
			<CardDescription>Suggestions and insights from our AI deck building expert.</CardDescription>
		</CardHeader>
		<CardContent class="min-h-[200px]">
			{#if isLoading && !adviceOutput}
				<div class="flex h-full flex-col items-center justify-center">
					<Loader2 class="mb-4 h-12 w-12 animate-spin text-primary" />
					<p class="text-muted-foreground">Thinking...</p>
				</div>
			{:else if adviceOutput}
				<div class="h-[400px] overflow-y-auto p-1">
					<pre
						class="whitespace-pre-wrap rounded-md bg-muted/50 p-4 font-mono text-sm">{adviceOutput.advice}</pre>
				</div>
			{:else}
				<p class="pt-10 text-center text-muted-foreground">
					Enter your deck details and click "Get AI Deck Advice" to see suggestions here.
				</p>
			{/if}
		</CardContent>
	</Card>
</div>
