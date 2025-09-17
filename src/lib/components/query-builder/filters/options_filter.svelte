<script lang="ts">
	import type { OptionsFilterColumn } from '@/beacon-api/types';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import Label from '@/components/ui/label/label.svelte';
	let {
		filter,
		selected_options = $bindable()
	}: { filter: OptionsFilterColumn; selected_options: Array<string | number> } = $props<{
		filter: OptionsFilterColumn;
	}>();

	let origin_filter = $state({ ...filter });

	$effect(() => {
		console.log('OptionsFilter props changed:', { filter, selected_options });
		if (filter !== origin_filter) {
			selected_options = [];
			origin_filter = filter;
		}
	});

	function addToSelectedOptions(option: string | number) {
		if (!selected_options.includes(option)) {
			selected_options = [...selected_options, option];
		}
	}

	function removeFromSelectedOptions(option: string | number) {
		selected_options = selected_options.filter((o) => o !== option);
	}

	function isChecked(option: string | number) {
		return selected_options.includes(option);
	}
</script>

<div class="grid grid-cols-2 gap-2">
	<div class="text-sm">Options Filter:</div>
	<div class="justify-items-end">
		{#each origin_filter.options as option (option)}
			<div class="mt-2 flex items-center gap-3">
				<Label for={option as string}>{option}</Label>
				<Checkbox
					id={option}
					checked={isChecked(option)}
					onCheckedChange={(v) => {
						// console.log('Checkbox changed:', { option, checked: v });
						if (v) {
							addToSelectedOptions(option);
						} else {
							removeFromSelectedOptions(option);
						}
					}}
				/>
			</div>
		{/each}
	</div>
</div>
