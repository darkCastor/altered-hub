<script lang="ts">
	import { createForm } from 'felte';
	import { validator } from '@felte/validator-zod';
	import { z } from 'zod';
	import { getDeckAdvice, type DeckAdviceInput, type DeckAdviceOutput } from '$ai/flows/deck-advisor';
	import Button from '$components/ui/button/Button.svelte';
	import Card from '$components/ui/card/Card.svelte';
	import CardContent from '$components/ui/card/CardContent.svelte';
	import CardDescription from '$components/ui/card/CardDescription.svelte';
	import CardFooter from '$components/ui/card/CardFooter.svelte';
	import CardHeader from '$components/ui/card/CardHeader.svelte';
	import CardTitle from '$components/ui/card/CardTitle.svelte';
	import { Loader2, Lightbulb } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	const DeckAdviceInputSchema = z.object({
		theme: z.string().min(3, "Theme must be at least 3 characters long."),
		archetype: z.string().min(3, "Archetype must be at least 3 characters long."),
		cardSelection: z.string().min(10, "Card selection description must be at least 10 characters long."),
	});

	let adviceOutput: DeckAdviceOutput | null = null;
	let isLoading = false;

	const { form, errors, isValid } = createForm<DeckAdviceInput>({
		extend: validator({ schema: DeckAdviceInputSchema }),
		initialValues: {
			theme: '',
			archetype: '',
			cardSelection: '',
		},
		onSubmit: async (values) => {
			isLoading = true;
			adviceOutput = null;
			try {
				const result = await getDeckAdvice(values);
				adviceOutput = result;
				toast.success("Advice Received!", {
					description: "AI has provided suggestions for your deck."
				});
			} catch (error) {
				console.error("Error getting deck advice:", error);
				toast.error("Error", {
					description: "Failed to get deck advice. Please try again."
				});
			} finally {
				isLoading = false;
			}
		}
	});
</script>

<div class="grid md:grid-cols-2 gap-8">
	<Card class="shadow-xl">
		<CardHeader>
			<CardTitle class="font-headline text-2xl flex items-center gap-2">
				<Lightbulb class="h-6 w-6 text-primary" />
				Deck Advisor Input
			</CardTitle>
			<CardDescription>
				Provide details about your deck idea, and our AI will help you complete it.
			</CardDescription>
		</CardHeader>
		<form use:form>
			<CardContent class="space-y-6">
				<div class="space-y-2">
					<label for="theme" class="text-sm font-medium">Deck Theme</label>
					<input 
						id="theme" 
						name="theme"
						placeholder="e.g., Aggro, Control, Forest Control" 
						class="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<p class="text-sm text-muted-foreground">What is the central theme or strategy of your deck?</p>
					{#if $errors.theme}
						<p class="text-sm text-destructive">{$errors.theme[0]}</p>
					{/if}
				</div>
				
				<div class="space-y-2">
					<label for="archetype" class="text-sm font-medium">Deck Archetype</label>
					<input 
						id="archetype" 
						name="archetype"
						placeholder="e.g., Axiom Tempo, Bravos Aggro" 
						class="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<p class="text-sm text-muted-foreground">What is the general playstyle or archetype?</p>
					{#if $errors.archetype}
						<p class="text-sm text-destructive">{$errors.archetype[0]}</p>
					{/if}
				</div>
				
				<div class="space-y-2">
					<label for="cardSelection" class="text-sm font-medium">Current Cards / Core Ideas</label>
					<textarea
						id="cardSelection"
						name="cardSelection"
						placeholder="List key cards you want to include, or describe core card interactions..."
						rows="5"
						class="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
					></textarea>
					<p class="text-sm text-muted-foreground">Describe the cards you've already selected or the core mechanics.</p>
					{#if $errors.cardSelection}
						<p class="text-sm text-destructive">{$errors.cardSelection[0]}</p>
					{/if}
				</div>
			</CardContent>
			<CardFooter>
				<Button 
					type="submit" 
					disabled={isLoading || !$isValid} 
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
			<CardDescription>
				Suggestions and insights from our AI deck building expert.
			</CardDescription>
		</CardHeader>
		<CardContent class="min-h-[200px]">
			{#if isLoading && !adviceOutput}
				<div class="flex flex-col items-center justify-center h-full">
					<Loader2 class="h-12 w-12 text-primary animate-spin mb-4" />
					<p class="text-muted-foreground">Thinking...</p>
				</div>
			{:else if adviceOutput}
				<div class="h-[400px] overflow-y-auto p-1">
					<pre class="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-md font-mono">{adviceOutput.advice}</pre>
				</div>
			{:else}
				<p class="text-muted-foreground text-center pt-10">Enter your deck details and click "Get AI Deck Advice" to see suggestions here.</p>
			{/if}
		</CardContent>
	</Card>
</div>