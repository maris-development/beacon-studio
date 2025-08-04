<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';

	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/models/misc';
	import Button from '../ui/button/button.svelte';

	let is_selected: boolean = $state(true);

	let { column = $bindable() }: { column: { name: string; type: DataType } } = $props();
</script>

<Label class="flex items-center gap-3 rounded-lg border border-blue-600 bg-blue-50 p-3">
	<div class="flex w-full flex-row items-center justify-between gap-1">
		<div class="flex flex-col gap-1">
			<Label for={column.name} class="text-sm font-normal">{column.name}</Label>
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-muted-foreground text-xs">{column.type}</span>
		</div>
	</div>
	<div>
		<Button><PlusIcon /> Add Filter</Button>
	</div>
	<div>
		<Button variant="destructive"><CircleXIcon /> Remove Field</Button>
	</div>
</Label>
