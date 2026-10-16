<script lang="ts">
	/**
	 * One row of the settings page. The component gets a definition, and builds
	 * the control from its type. It reads and writes the settings store itself,
	 * so the page stays a list of definitions.
	 *
	 * The store holds canonical units: bytes, milliseconds and counts. A
	 * definition can carry a `scale`. This component divides by the scale for
	 * display, and multiplies again on write.
	 */
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import {
		DEFAULT_SETTINGS,
		resetSetting,
		setSetting,
		settings,
		type SettingDefinition
	} from '@/stores/settings';
	import { t, type MessageKey } from '@/i18n';

	let { definition }: { definition: SettingDefinition } = $props();

	const inputId = `setting-${definition.key}`;

	/** The stored value of this setting. */
	const stored = $derived($settings[definition.key]);

	/** True while the value is not the default. The reset button needs it. */
	const isChanged = $derived(stored !== DEFAULT_SETTINGS[definition.key]);

	/** The number in display units, with a short decimal tail. */
	const displayNumber = $derived.by(() => {
		if (definition.type !== 'number') return '';

		const scale = definition.scale ?? 1;
		const value = (stored as number) / scale;
		return String(Math.round(value * 1000) / 1000);
	});

	/** The selected value of a select setting. */
	const selectValue = $derived.by(() => {
		if (definition.type !== 'select') return '';
		return stored as string;
	});

	/** The selected label of a select setting. */
	const selectLabel = $derived.by(() => {
		if (definition.type !== 'select') return '';

		const option = definition.options.find((entry) => entry.value === selectValue);
		if (option) return optionLabel(option);
		return selectValue;
	});

	function optionLabel(option: { value: string; label?: string; labelKey?: MessageKey }): string {
		if (option.labelKey) return $t(option.labelKey);
		return option.label ?? option.value;
	}

	/** The stored value of a boolean setting. */
	const booleanValue = $derived(stored === true);

	/** The word beside the checkbox. */
	const booleanLabel = $derived.by(() => {
		if (booleanValue) return $t('common.on');
		return $t('common.off');
	});

	function onNumberChange(event: Event): void {
		if (definition.type !== 'number') return;

		const input = event.currentTarget as HTMLInputElement;
		const parsed = Number(input.value);

		if (!Number.isFinite(parsed)) {
			input.value = displayNumber;
			return;
		}

		setSetting(definition.key, parsed * (definition.scale ?? 1));
		// The store clamps the value to the range, so show what it kept.
		input.value = displayNumber;
	}

	function onTextChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		setSetting(definition.key, input.value.trim());
	}

	function onSelectChange(value: string): void {
		setSetting(definition.key, value);
	}

	function onBooleanChange(value: boolean): void {
		setSetting(definition.key, value);
	}
</script>

<div class="setting-field">
	<div class="text">
		<label for={inputId}>{$t(`settings.field.${definition.key}.label`)}</label>
		<p class="description">{$t(`settings.field.${definition.key}.description`)}</p>
	</div>

	<div class="control">
		{#if definition.type === 'number'}
			<div class="number">
				<Input
					id={inputId}
					type="number"
					min={definition.min}
					max={definition.max}
					step={definition.step ?? 1}
					value={displayNumber}
					onchange={onNumberChange}
				/>
				{#if definition.unit}
					<span class="unit">{$t(definition.unit)}</span>
				{/if}
			</div>
		{:else if definition.type === 'boolean'}
			<div class="boolean">
				<Checkbox id={inputId} checked={booleanValue} onCheckedChange={onBooleanChange} />
				<label class="boolean-label" for={inputId}>{booleanLabel}</label>
			</div>
		{:else if definition.type === 'select'}
			<Select.Root type="single" value={selectValue} onValueChange={onSelectChange}>
				<Select.Trigger id={inputId} class="w-full">{selectLabel}</Select.Trigger>
				<Select.Content>
					<Select.Group>
						{#each definition.options as option (option.value)}
							<Select.Item value={option.value} label={optionLabel(option)}>{optionLabel(option)}</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		{:else}
			<Input
				id={inputId}
				type="text"
				placeholder={definition.placeholder ?? ''}
				value={stored}
				onchange={onTextChange}
			/>
		{/if}

		<Button
			variant="ghost"
			size="icon"
			disabled={!isChanged}
			title={$t('settings.resetOne')}
			onclick={() => resetSetting(definition.key)}
		>
			<RotateCcwIcon size={16} />
		</Button>
	</div>
</div>

<style lang="scss">
	.setting-field {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
		align-items: start;
		gap: 1rem;
		padding: 0.75rem 0;

		.text {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;

			label {
				font-weight: var(--font-weight-semibold);
			}

			.description {
				margin: 0;
				font-size: var(--font-size-sm);
				color: var(--muted-foreground);
			}
		}

		.control {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			.boolean {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				flex: 1;

				.boolean-label {
					font-size: var(--font-size-sm);
					color: var(--muted-foreground);
				}
			}

			.number {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				flex: 1;

				.unit {
					font-size: var(--font-size-sm);
					color: var(--muted-foreground);
					white-space: nowrap;
				}
			}

			:global([data-slot='select-trigger']) {
				flex: 1;
			}
		}

		@media (max-width: 700px) {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
