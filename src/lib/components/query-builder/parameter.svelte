<script lang="ts">
	import type { PresetColumn } from '@/beacon-api/models/preset_table';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { buttonVariants } from '$lib/components/ui/button/index.js';

	import Calendar from '$lib/components/ui/calendar/calendar.svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { getLocalTimeZone } from '@internationalized/date';
	import type { CalendarDate } from '@internationalized/date';
	import Separator from '../ui/separator/separator.svelte';
	import Filter from './filters/filter.svelte';

	let openFrom = $state(false);
	let openTo = $state(false);
	let valueFrom = $state<CalendarDate | undefined>();
	let valueTo = $state<CalendarDate | undefined>();

	const id = $props.id();
	const { column } = $props<{
		column: PresetColumn;
	}>();

	let is_selected = $state(false); // Track checkbox state
</script>

<Label
	class="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
>
	<Checkbox
		bind:checked={is_selected}
		id={column.column_name}
		class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
	/>
	<div class="flex w-full flex-row items-center justify-between gap-1">
		<div class="flex flex-col gap-1">
			<Label for={column.column_name} class="text-sm font-normal">{column.alias}</Label>
			{#if column.description}
				<Separator />
				<div class="text-muted-foreground justify-end text-xs">
					<strong>Description:</strong>
					{column.description}
				</div>
			{/if}
		</div>

		{#if column.filter}
			<Filter filter={column.filter} />
		{/if}
	</div>
</Label>
