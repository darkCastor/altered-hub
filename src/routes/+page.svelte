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
	<meta name="description" content="Explore cards, build powerful decks, and get AI-driven advice for Altered TCG." />
</svelte:head>

<div class="flex flex-col items-center justify-center text-center space-y-12">
	<section class="w-full py-12 md:py-24 lg:py-32">
		<div class="container px-4 md:px-6">
			<div class="flex flex-col items-center space-y-6 text-center">
				<h1
					class="font-headline text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent"
				>
					Welcome to AlterDeck
				</h1>
				<p class="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
					Your ultimate companion for Altered TCG. Explore cards, build powerful decks, and get
					AI-driven advice.
				</p>
				<div>
					<Button
						size="lg"
						class="bg-primary hover:bg-primary/90 text-primary-foreground"
						onclick={() => (window.location.href = '/cards')}
					>
						Explore Cards
						<Zap class="ml-2 h-5 w-5" />
					</Button>
				</div>
			</div>
		</div>
	</section>

	<section class="w-full py-12 md:py-24">
		<div class="container px-4 md:px-6">
			<h2
				class="font-headline text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-center mb-12"
			>
				Features
			</h2>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature}
					<Card
						class="flex flex-col shadow-lg hover:shadow-primary/30 transition-shadow duration-300"
					>
						<CardHeader class="items-center">
							<svelte:component this={feature.icon} class="h-8 w-8 text-primary" />
							<CardTitle class="font-headline mt-4 text-2xl">{feature.title}</CardTitle>
						</CardHeader>
						<CardContent class="flex-grow">
							<CardDescription class="text-center">{feature.description}</CardDescription>
						</CardContent>
						<CardContent class="mt-auto">
							<Button
								variant="outline"
								class="w-full border-primary text-primary hover:bg-primary/10"
								onclick={() => (window.location.href = feature.href)}
							>
								Go to {feature.title}
							</Button>
						</CardContent>
					</Card>
				{/each}
			</div>
		</div>
	</section>
</div>