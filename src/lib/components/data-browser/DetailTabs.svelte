<script lang="ts">
	type Tab = { id: string; label: string };

	let { tabs, active, onSelect }: { tabs: Tab[]; active: string; onSelect: (id: string) => void } =
		$props();
</script>

<div class="detail-tabs" role="tablist">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			role="tab"
			aria-selected={tab.id === active}
			class:active={tab.id === active}
			onclick={() => onSelect(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style lang="scss">
	.detail-tabs {
		display: flex;
		gap: 0.25rem;
		margin: 1rem 0 0.75rem;
		border-bottom: 1px solid var(--border);

		button {
			padding: 0.5rem 0.75rem;
			border: 0;
			border-bottom: 2px solid transparent;
			background: none;
			color: var(--muted-foreground);
			cursor: pointer;

			&.active {
				border-bottom-color: var(--primary);
				color: var(--foreground);
				font-weight: 600;
			}
		}
	}
</style>
