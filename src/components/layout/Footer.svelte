<script lang="ts">
	import { Github, Heart } from 'lucide-svelte';
</script>

<footer class="bg-muted/30 border-border border-t">
	<div class="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
		<div class="flex flex-col items-center justify-between md:flex-row">
			<div class="flex flex-col items-center space-y-2 md:flex-row md:space-y-0 md:space-x-4">
				<p class="text-muted-foreground text-sm">
					© 2024 AlterDeck. Built with <Heart class="inline h-4 w-4 text-red-500" /> for Altered TCG
					fans.
				</p>
			</div>

			<div class="mt-4 flex items-center space-x-4 md:mt-0">
				<a
					href="https://github.com"
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted-foreground hover:text-foreground transition-colors"
					aria-label="GitHub"
				>
					<Github class="h-5 w-5" />
				</a>
			</div>
		</div>

		<div class="border-border mt-6 border-t pt-6">
			<p class="text-muted-foreground text-center text-xs">
				This is a fan-made tool for Altered TCG. All card images and game content are property of
				their respective owners.
			</p>
		</div>
	</div>
</footer>
