<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Menu, X } from 'lucide-svelte';
	import Button from '$components/ui/button/Button.svelte';

	let mobileMenuOpen = false;

	const navigation = [
		{ name: 'Card Viewer', href: '/cards' },
		{ name: 'Deck Builder', href: '/decks' },
		{ name: 'AI Advisor', href: '/ai-advisor' }
	];

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function navigateTo(href: string) {
		goto(href);
		mobileMenuOpen = false;
	}

	$: currentPath = $page.url.pathname;
</script>

<header class="bg-background border-b border-border">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex justify-between items-center h-16">
			<!-- Logo -->
			<div class="flex-shrink-0">
				<button on:click={() => goto('/')} class="text-2xl font-bold text-primary hover:text-primary/80">
					AlterDeck
				</button>
			</div>

			<!-- Desktop Navigation -->
			<nav class="hidden md:flex space-x-8">
				{#each navigation as item}
					<button
						on:click={() => navigateTo(item.href)}
						class="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium transition-colors {currentPath === item.href ? 'text-foreground border-b-2 border-primary' : ''}"
					>
						{item.name}
					</button>
				{/each}
			</nav>

			<!-- Mobile menu button -->
			<div class="md:hidden">
				<Button variant="ghost" size="sm" onclick={toggleMobileMenu}>
					{#if mobileMenuOpen}
						<X class="h-6 w-6" />
					{:else}
						<Menu class="h-6 w-6" />
					{/if}
				</Button>
			</div>
		</div>

		<!-- Mobile Navigation -->
		{#if mobileMenuOpen}
			<div class="md:hidden">
				<div class="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-border">
					{#each navigation as item}
						<button
							on:click={() => navigateTo(item.href)}
							class="block text-muted-foreground hover:text-foreground px-3 py-2 text-base font-medium w-full text-left transition-colors {currentPath === item.href ? 'text-foreground bg-muted' : ''}"
						>
							{item.name}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</header>