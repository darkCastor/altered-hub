<script lang="ts">
	import { page } from '$app/stores';
	import { Package2, Menu } from 'lucide-svelte';
	import Button from '$components/ui/button/Button.svelte';

	const navItems = [
		{ href: '/cards', label: 'Card Viewer' },
		{ href: '/decks', label: 'Deck Builder' },
		{ href: '/ai-advisor', label: 'AI Deck Advisor' }
	];

	let mobileMenuOpen = false;
</script>

<header
	class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
>
	<div class="container flex h-16 max-w-screen-2xl items-center justify-between">
		<a href="/" class="flex items-center gap-2 font-headline text-lg font-semibold">
			<Package2 class="h-6 w-6 text-primary" />
			<span class="text-foreground">AlterDeck</span>
		</a>

		<nav class="hidden md:flex items-center space-x-4 lg:space-x-6">
			{#each navItems as item}
				<a
					href={item.href}
					class="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
					class:text-primary={$page.url.pathname === item.href}
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<!-- Mobile Menu Trigger -->
		<div class="md:hidden">
			<Button variant="ghost" size="icon" on:click={() => (mobileMenuOpen = !mobileMenuOpen)}>
				<Menu class="h-4 w-4" />
				<span class="sr-only">Toggle menu</span>
			</Button>
		</div>
	</div>

	<!-- Mobile Navigation Menu -->
	{#if mobileMenuOpen}
		<div class="md:hidden border-t bg-background">
			<nav class="container flex flex-col space-y-2 py-4">
				{#each navItems as item}
					<a
						href={item.href}
						class="text-sm font-medium text-muted-foreground transition-colors hover:text-primary px-2 py-1"
						class:text-primary={$page.url.pathname === item.href}
						on:click={() => (mobileMenuOpen = false)}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	{/if}
</header>