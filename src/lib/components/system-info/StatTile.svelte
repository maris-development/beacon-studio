<script lang="ts">
	let { label, value, detail }: { label: string; value: string; detail?: string } = $props();
</script>

<div class="tile">
	<span class="label">{label}</span>
	<span class="value" title={value}>{value}</span>
	{#if detail}<span class="detail">{detail}</span>{/if}
</div>

<style lang="scss">
	.tile {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.label,
	.detail {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.value {
		overflow: hidden;
		font-size: 1.125rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
