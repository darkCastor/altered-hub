<script lang="ts">
	import Button from '$components/ui/button/Button.svelte';
	import Card from '$components/ui/card/Card.svelte';
	import CardContent from '$components/ui/card/CardContent.svelte';
	import CardDescription from '$components/ui/card/CardDescription.svelte';
	import CardHeader from '$components/ui/card/CardHeader.svelte';
	import CardTitle from '$components/ui/card/CardTitle.svelte';
	import { Zap, BookOpen, Lightbulb, Layers } from 'lucide-svelte';

	const features = [
		{
			icon: BookOpen,
			title: 'Card Viewer',
			description: 'Browse and discover all Altered TCG cards with detailed information.',
			href: '/cards'
		},
		{
			icon: Layers,
			title: 'Deck Builder',
			description: 'Craft, save, and manage your custom decks for competitive play or fun.',
			href: '/decks'
		},
		{
			icon: Lightbulb,
			title: 'AI Deck Advisor',
			description: 'Get AI-powered suggestions to complete your decks and optimize strategies.',
			href: '/ai-advisor'
		}
	];
</script>

<svelte:head>
	<title>AlterDeck - Your Ultimate Altered TCG Companion</title>
	<meta
		name="description"
		content="Explore cards, build powerful decks, and get AI-driven advice for Altered TCG."
	/>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<div class="flex flex-col items-center justify-center space-y-12 p-8 text-center">
		<section class="w-full py-12">
			<div class="container px-4 md:px-6">
				<div class="flex flex-col items-center space-y-6 text-center">
					<h1 class="text-4xl font-bold text-primary">Welcome to AlterDeck</h1>
					<p class="max-w-[700px] text-lg text-muted-foreground">
						Your ultimate companion for Altered TCG. Explore cards, build powerful decks, and get
						AI-driven advice.
					</p>
					<div>
						<button
							class="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90"
							on:click={() => (window.location.href = '/cards')}
						>
							Explore Cards
							<Zap class="ml-2 h-5 w-5" />
						</button>
					</div>
				</div>
			</div>
		</section>

		<section class="w-full py-12">
			<div class="container px-4 md:px-6">
				<h2 class="mb-12 text-center text-3xl font-bold">Features</h2>
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{#each features as feature}
						<div class="rounded-lg border bg-card p-6 text-card-foreground shadow-lg">
							<div class="flex flex-col items-center space-y-4 text-center">
								<svelte:component this={feature.icon} class="h-8 w-8 text-primary" />
								<h3 class="text-2xl font-bold">{feature.title}</h3>
								<p class="text-muted-foreground">{feature.description}</p>
								<button
									class="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
									on:click={() => (window.location.href = feature.href)}
								>
									Go to {feature.title}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>
	</div>
</div>
