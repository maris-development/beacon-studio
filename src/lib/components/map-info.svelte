<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import type { Snippet } from "svelte";
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import { Utils } from '@/utils';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { goto } from '$app/navigation';
  	import { resolve } from '$app/paths';

	let {
		onEditClick = () => {},
		onEditBuilderClick = () => {},
		compiledQuery,
		storedQueryId,
        children
	}: {
		onEditClick: () => void;
		onEditBuilderClick?: () => void;
		compiledQuery: CompiledQuery
		/** The library record of the current query, if the page opened from one. */
		storedQueryId?: string;
        children?: Snippet
	} = $props();

	/**
	 * Send the current query to another page. The link uses `?q=<record id>`. If
	 * the query has no record, the link carries the query as gzip.
	 */
	function handOff(resolvedPath: string) {
		if (storedQueryId) {
			goto(`${resolvedPath}?q=${encodeURIComponent(storedQueryId)}`);
			return;
		}

		const gzippedQuery = Utils.objectToGzipString(compiledQuery);
		if (gzippedQuery) {
			goto(`${resolvedPath}?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleChartVisualise() {
		handOff(resolve('/visualisations/chart-explorer'));
	}

	async function handleTableVisualise() {
		handOff(resolve('/visualisations/table-explorer'));
	}

</script>


<div class="my-ctrl-group">
	<div class="buttons-header">
		<Button onclick={() => onEditBuilderClick()}>
			Edit query
			<PencilIcon size=1rem />
		</Button>

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
