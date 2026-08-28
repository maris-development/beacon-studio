<!--
	The health of one Beacon instance.

	The component shows a value only. It starts no check. Call `ensureFresh` of
	`@/services/beacon-instance-connect` where the app shows the instance.
-->
<script lang="ts">
	import type { BeaconInstance } from '@/beacon-api/types';

	import GlobeCheckIcon from '@lucide/svelte/icons/globe-check';
	import GlobeXIcon from '@lucide/svelte/icons/globe-x';
	import GlobeIcon from '@lucide/svelte/icons/globe';

	type Props = {
		instance: BeaconInstance;
		/**
		 * `full` shows a badge and a separate latency block. `compact` shows one
		 * badge with the latency in it. `dot` shows a coloured dot only.
		 */
		variant?: 'full' | 'compact' | 'dot';
	};

	let { instance, variant = 'full' }: Props = $props();

	let Icon = $derived.by(() => {
		if (instance.status === 'online') return GlobeCheckIcon;
		if (instance.status === 'offline') return GlobeXIcon;

		return GlobeIcon;
	});

	let latencyText = $derived(instance.latencyMs === null ? '-' : `${instance.latencyMs}ms`);

	let title = $derived(
		instance.status === 'online' ? `online, ${latencyText}` : instance.status
	);
</script>

{#if variant === 'dot'}
	<span class="dot {instance.status}" {title} aria-label="Status: {title}"></span>
{:else}
	<div class="instance-status" class:compact={variant === 'compact'}>
		<span class="badge {instance.status}">
			<Icon size={variant === 'compact' ? 12 : 16} />
			<span class="label">{instance.status}</span>
			{#if variant === 'compact' && instance.status === 'online'}
				<span class="inline-latency">{latencyText}</span>
			{/if}
		</span>

		{#if variant === 'full'}
			<div class="latency">
				<span class="latency-label">Latency</span>
				<span class="latency-value">{latencyText}</span>
			</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	.dot {
		display: inline-block;
		flex: 0 0 auto;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background-color: var(--muted-foreground);

		&.online {
			background-color: MediumSeaGreen;
		}

		&.offline {
			background-color: IndianRed;
		}
	}

	.instance-status {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 1rem;

		.badge {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 0.25rem;
			border-radius: 99px;
			padding: 0.25rem 0.5rem;
			color: white;
			background-color: var(--muted-foreground);
			font-size: 0.875rem;
			line-height: 1;

			&.online {
				background-color: MediumSeaGreen;
			}

			&.offline {
				background-color: IndianRed;
			}
		}

		.inline-latency {
			opacity: 0.85;
			padding-left: 0.35rem;
			border-left: 1px solid rgba(255, 255, 255, 0.4);
			margin-left: 0.15rem;
		}

		.latency {
			display: flex;
			flex-direction: column;
			border-left: 1.5px solid var(--border);
			padding-left: 1rem;

			.latency-label {
				text-transform: uppercase;
				color: var(--muted-foreground);
				font-size: 0.75rem;
			}

			.latency-value {
				font-weight: bold;
			}
		}

		&.compact {
			gap: 0.5rem;

			.badge {
				padding: 0.125rem 0.5rem;
				font-size: 0.75rem;
			}
		}
	}
</style>
