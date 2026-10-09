<script lang="ts">
	/**
	 * CoordinateColumnsDialog — pick the latitude and the longitude column of a query.
	 *
	 * The map viewer and the geospatial filter modal both open this dialog. The
	 * pair it gives is the one pair of the block: the map plots it, and the area
	 * filter tests it.
	 *
	 * The dialog edits a copy. Only Apply gives the pair back.
	 */
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Button from '@/components/buttons/Button.svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { untrack } from 'svelte';
	import type { CoordinatePair } from '@/geo/spatial-selection';
	import { t, type MessageKey } from '@/i18n';

	let {
		open = $bindable(false),
		candidates,
		pair = null,
		onApply
	}: {
		open?: boolean;
		/** The columns the user can pick. Usually the number columns of the query. */
		candidates: string[];
		/** The pair in use now. It fills the two pickers. */
		pair?: CoordinatePair | null;
		/** Called with the picked pair, or with null to detect the pair again. */
		onApply: (pair: CoordinatePair | null) => void;
	} = $props();

	let latitude = $state('');
	let longitude = $state('');

	// Fill the pickers at every open. A cancel loses the edit.
	$effect(() => {
		if (!open) return;

		untrack(() => {
			latitude = pair?.latitude ?? '';
			longitude = pair?.longitude ?? '';
		});
	});

	const sameColumn = $derived(!!latitude && latitude === longitude);

	/** The reason that Apply must stay off, or null. */
	const applyReason = $derived.by((): MessageKey | null => {
		if (candidates.length < 2) {
			return 'map.needsCoordinates';
		}

		if (!latitude || !longitude) {
			return 'map.columns.pickBoth';
		}

		if (sameColumn) {
			return 'map.columns.mustDiffer';
		}

		return null;
	});

	function apply(): void {
		if (applyReason) return;

		onApply({ latitude, longitude });
		open = false;
	}

	function detect(): void {
		onApply(null);
		open = false;
	}
</script>

{#if open}
	<Modal title={$t('map.columns.title')} width="420px" onClose={() => (open = false)}>
		<div class="coordinate-columns">
			<p class="description">{$t('map.columns.description')}</p>

			{#if candidates.length < 2}
				<p class="warning" role="alert">
					<TriangleAlertIcon size={16} />
					{$t('map.columns.tooFew')}
				</p>
			{:else}
				<div class="field">
					<Label size="sm" for="coordinateLatitude">{$t('map.columns.latitude')}</Label>

					<Select.Root type="single" name="coordinateLatitude" bind:value={latitude}>
						<Select.Trigger id="coordinateLatitude" class="full-width">
							{latitude || $t('visualisation.selectColumn')}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Label>{$t('map.columns.queryColumns')}</Select.Label>
								{#each candidates as column (column)}
									<Select.Item value={column} label={column}>{column}</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="field">
					<Label size="sm" for="coordinateLongitude">{$t('map.columns.longitude')}</Label>

					<Select.Root type="single" name="coordinateLongitude" bind:value={longitude}>
						<Select.Trigger id="coordinateLongitude" class="full-width">
							{longitude || $t('visualisation.selectColumn')}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Label>{$t('map.columns.queryColumns')}</Select.Label>
								{#each candidates as column (column)}
									<Select.Item value={column} label={column}>{column}</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>

				{#if sameColumn}
					<p class="warning" role="alert">
						<TriangleAlertIcon size={16} />
						{$t('map.columns.mustDiffer')}
					</p>
				{/if}
			{/if}
		</div>

		<div slot="footer" class="footer">
			<Button
				variant="ghost"
				title={$t('map.columns.detectTitle')}
				onclick={detect}
			>
				{$t('map.columns.detect')}
			</Button>

			<span class="spacer"></span>

			<Button variant="outline" onclick={() => (open = false)}>{$t('common.cancel')}</Button>

			<Button
				variant="default"
				title={$t(applyReason ?? 'map.columns.applyTitle')}
				disabled={!!applyReason}
				onclick={apply}
			>
				{$t('common.apply')}
			</Button>
		</div>
	</Modal>
{/if}

<style lang="scss">
	.coordinate-columns {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		.description {
			margin: 0;
			font-size: 0.85rem;
			color: var(--muted-foreground);
		}

		.field {
			display: flex;
			flex-direction: column;
			gap: 0.1875rem;
			min-width: 0;
		}

		:global(.full-width) {
			width: 100%;
		}
	}

	.warning {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--destructive);
		border-radius: var(--radius, 0.5rem);
		font-size: 0.85rem;
		color: var(--destructive);

		:global(svg) {
			flex-shrink: 0;
		}
	}

	.footer {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;

		.spacer {
			flex-grow: 1;
		}
	}
</style>
