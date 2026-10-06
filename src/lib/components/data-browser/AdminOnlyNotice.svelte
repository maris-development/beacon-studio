<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<p class="notice">
	This page needs admin features. Turn on "Show admin features" in
	<a href={resolve('/settings')}>Settings</a>.
</p>

<style lang="scss">
	.notice {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		color: var(--muted-foreground);
	}
</style>
