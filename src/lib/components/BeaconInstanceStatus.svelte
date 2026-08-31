<!--
	The health of one Beacon node.

	The component takes a health value, not an instance, so a node of the public
	list can use it too. A `BeaconInstance` still fits, because it extends
	`BeaconInstanceHealth`.

	The component shows a value only. It starts no check. Call `ensureFresh` of
	`@/services/beacon-instance-connect` where the app shows the node.
-->
<script lang="ts">
	import type { BeaconInstanceHealth } from '@/beacon-api/types';

	import GlobeCheckIcon from '@lucide/svelte/icons/globe-check';
	import GlobeXIcon from '@lucide/svelte/icons/globe-x';
	import GlobeIcon from '@lucide/svelte/icons/globe';

	type Props = {
		health: BeaconInstanceHealth;
		/**
		 * `full` shows a badge and a separate latency block. `compact` shows one
		 * badge with the latency in it. `dot` shows a coloured dot only.
		 */
		variant?: 'full' | 'compact' | 'dot';
	};

	let { health, variant = 'full' }: Props = $props();

	let Icon = $derived.by(() => {
		if (health.status === 'online') return GlobeCheckIcon;
		if (health.status === 'offline') return GlobeXIcon;

		return GlobeIcon;
	});

	let latencyText = $derived(health.latencyMs === null ? '-' : `${health.latencyMs}ms`);

	let title = $derived(health.status === 'online' ? `online, ${latencyText}` : health.status);
</script>

{#if variant === 'dot'}
	<span class="dot {health.status}" {title} aria-label="Status: {title}"></span>
{:else}
	<div class="instance-status" class:compact={variant === 'compact'}>
		<span class="badge {health.status}">
			<Icon size={variant === 'compact' ? 12 : 16} />
			<span class="label">{health.status}</span>
			{#if variant === 'compact' && health.status === 'online'}
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
