<script lang="ts">
	import { onMount } from 'svelte';

	let sourceCode = $state(`{
		"query_parameters": [
			{
				"column_name": "TIME"
			},
			{
				"column_name": "DOXY"
			},
			{
				"column_name": "DEPH"
			},
			{
				"column_name": "LONGITUDE"
			},
			{
				"column_name": "LATITUDE"
			}
		],
		"filters": [
			{
				"for_query_parameter": "TIME",
				"min": "2019-11-01T00:00:00",
				"max": "2020-11-30T00:00:00"
			},
			{
				"for_query_parameter": "DEPH",
				"min": 0,
				"max": 5
			}
		],
		"output": {
			"format": "parquet"
		}
	}`);
	


	/**
	 * TopBar component (using shadcn-svelte)
	 * Props:
	 *  - breadcrumbs: Array<{ label: string; href: string }>;
	 */
	import CirclePlayIcon from '@lucide/svelte/icons/circle-play';
	import SearchCodeIcon from '@lucide/svelte/icons/search-code';
	import TestTubeIcon from '@lucide/svelte/icons/test-tube';

	import { Button } from '$lib/components/ui/button/index.js';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import QueryEditor from '@/components/query-editor/QueryEditor.svelte';

	const handleAnalyze = () => console.log('Analyze action triggered');
	const handleExecute = () => console.log('Execute action triggered');
	const handleInfo = () => console.log('Info action triggered');

	onMount(() => {
	});


</script>

<div>
	<Cookiecrumb
		crumbs={[
			{ label: 'Queries', href: '/queries' },
			{ label: 'Query Editor', href: '/queries/query-editor' }
		]}
	>
		<!-- Right: Shadcn Buttons -->
		<div class="actions">
			<Button variant="default" size="sm" onclick={handleInfo}>
				<TestTubeIcon />
				Query Plan
			</Button>
			<Button variant="default" size="sm" onclick={handleAnalyze}>
				<SearchCodeIcon />
				Analyze
			</Button>
			<Button variant="default" size="sm" onclick={handleExecute}>
				<CirclePlayIcon />
				Run
			</Button>
		</div>
	</Cookiecrumb>

	<QueryEditor  bind:sourceCode />
</div>


