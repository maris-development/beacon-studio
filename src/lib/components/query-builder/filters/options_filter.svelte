<script lang="ts">
	import type { OptionsFilterColumn } from '@/beacon-api/types';
	import * as Select from '$lib/components/ui/select/index.js';

	let {
		options_filter,
		selected_options = $bindable()
	}: { options_filter: OptionsFilterColumn; selected_options: Array<string | number> } = $props();

	// store previous reference so effect only reacts to options_filter changes
	let old_options_filter: OptionsFilterColumn | null = null;

	$effect(() => {
		if (options_filter !== old_options_filter) {
			selected_options = [];
			old_options_filter = options_filter;
		}
	});
</script>

<div class="flex justify-between gap-4">
	<p class="text-muted-foreground text-sm m-0">Options Filter:</p>
	<div class="justify-items-end">
		<Select.Root type="multiple" name="dataCollection" bind:value={selected_options as string[]} >
			<Select.Trigger  class="w-[200px]">
				{selected_options.length} options selected
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Label>Tables</Select.Label>
					{#each options_filter.options as option }
						<Select.Item value={option as string} label={option}>
							{option}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	</div>
</div>
