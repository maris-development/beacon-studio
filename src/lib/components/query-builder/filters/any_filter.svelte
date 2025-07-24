<script lang="ts">
	import type { AnyFilterColumn } from '@/beacon-api/models/preset_table';
	import { Input } from '@/components/ui/input';

	const { filter } = $props<{
		filter: AnyFilterColumn;
	}>();
</script>

<div class="flex flex-col gap-2">
	<div class="flex gap-4">
		<p class="text-muted-foreground text-sm">From:</p>
		<div class="flex flex-1 flex-col gap-3"></div>
		<div class="flex flex-col gap-3">
			<Input value="" class="bg-background appearance-none" />
		</div>
	</div>
	<div class="flex gap-4">
		<p class="text-muted-foreground text-sm">To:</p>
		<div class="flex flex-col gap-3">
			<Input value="" class="bg-background appearance-none" />
		</div>
	</div>
</div>
