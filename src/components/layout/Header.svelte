<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Menu, X } from 'lucide-svelte';
	import Button from '$components/ui/button/Button.svelte';

	let mobileMenuOpen = false;

	const mainNavigation = [
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

<header class="bg-background border-border border-b">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<!-- Logo -->
			<div class="flex-shrink-0">
				<button
					on:click={() => navigateTo('/')}
					class="text-primary hover:text-primary/80 text-2xl font-bold"
				>
					AlterDeck
				</button>
			</div>

			<!-- Desktop Navigation -->
			<nav class="hidden items-center space-x-8 md:flex">
				{#each mainNavigation as item}
					<button
						on:click={() => navigateTo(item.href)}
						class="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium transition-colors {currentPath ===
						item.href
							? 'text-foreground border-primary border-b-2'
							: ''}"
					>
						{item.name}
					</button>
				{/each}
			</nav>

			<!-- Mobile menu button -->
			<div class="flex items-center md:hidden">
				<Button variant="ghost" size="icon" on:click={toggleMobileMenu} aria-label="Toggle menu">
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
				<div class="border-border space-y-1 border-t px-2 pt-2 pb-3 sm:px-3">
					{#each mainNavigation as item}
						<button
							on:click={() => navigateTo(item.href)}
							class="text-muted-foreground hover:text-foreground {currentPath === item.href
								? 'bg-accent text-accent-foreground'
								: ''} block w-full rounded-md px-3 py-2 text-left text-base font-medium"
						>
							{item.name}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</header>
