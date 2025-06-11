<script lang="ts">
	import { Github, Heart } from 'lucide-svelte';
</script>

<footer class="bg-muted/30 border-t border-border">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="flex flex-col md:flex-row justify-between items-center">
			<div class="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-4">
				<p class="text-sm text-muted-foreground">
					© 2024 AlterDeck. Built with <Heart class="inline h-4 w-4 text-red-500" /> for Altered TCG fans.
				</p>
			</div>
			
			<div class="flex items-center space-x-4 mt-4 md:mt-0">
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
		
		<div class="mt-6 pt-6 border-t border-border">
			<p class="text-xs text-muted-foreground text-center">
				This is a fan-made tool for Altered TCG. All card images and game content are property of their respective owners.
			</p>
		</div>
	</div>
</footer>