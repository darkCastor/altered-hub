<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
		class?: string;
	}

	let { class: className, children, ...restProps }: CardDescriptionProps = $props();
</script>

<p class={cn('text-sm text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</p>
