<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import type { Snippet } from "svelte";
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import { Utils } from '@/utils';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { goto } from '$app/navigation';

	let {
		onEditClick = () => {},
		compiledQuery,
        children
	}: {
		onEditClick: () => void;
		compiledQuery: CompiledQuery
        children?: Snippet
	} = $props();

	async function handleChartVisualise() {
		const gzippedQuery = Utils.objectToGzipString(compiledQuery);
		if(gzippedQuery){
			goto(`/visualisations/chart-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleTableVisualise() {
		const gzippedQuery = Utils.objectToGzipString(compiledQuery);
		if(gzippedQuery){
			goto(`/visualisations/table-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}
	
</script>


<div class="my-ctrl-group">
	<div class="buttons-header">
		<Button onclick={() => onEditClick()}>
			Edit query JSON
			<FileJson2Icon size=1rem />
		</Button>
		
		<span>or</span>

		<Button onclick={handleTableVisualise}>
			View as table
			<SheetIcon />
		</Button>

		<Button onclick={handleChartVisualise}>
			View on chart
			<ChartPieIcon />
		</Button>
	</div>
    {@render children?.()}

</div>

<style lang="scss">
	.my-ctrl-group {
		// largely copied from maplibregl's ctrl group
		padding: 0.5rem;
		background: #fff;
		border-radius: 4px;
		box-shadow: 0 0 0 2px rgba(0,0,0,.1);
		clear: both;
		pointer-events: auto;
		transform: translate(0);
		margin: 10px;

		// p {
		// 	margin: 0;
		// }
	}
</style>
