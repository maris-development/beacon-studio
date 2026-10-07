<script lang="ts">
	import { formatPercent } from '@/system-info/host';

	let { label, percent, detail }: { label: string; percent: number | null; detail?: string } =
		$props();
</script>

<div class="meter">
	<div class="head">
		<span>{label}</span>
		<span class="value">{detail ?? formatPercent(percent)}</span>
	</div>
	<div
		class="bar"
		role="meter"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={percent ?? 0}
	>
		<span style="width: {percent ?? 0}%"></span>
	</div>
</div>

<style lang="scss">
	.meter {
		display: grid;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.value {
		color: var(--muted-foreground);
	}

	.bar {
		height: 0.5rem;
		overflow: hidden;
		border-radius: 0.25rem;
		background: var(--secondary);

		span {
			display: block;
			height: 100%;
			background: var(--primary);
			transition: width 0.3s;
		}
	}
</style>
