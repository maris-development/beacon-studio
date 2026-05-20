<script lang="ts">
	import { onMount } from 'svelte';
	import { beaconInstances, currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { PythonQueryBuilder } from '@/beacon-api/query';

	let beaconInstanceArray: BeaconInstance[] = $beaconInstances;
	let currentBeaconInstanceValue: BeaconInstance | null = $currentBeaconInstance;
	const query: CompiledQuery = {
		from: 'easy_ihm_aquadesk_api',
		query_parameters: [
			{
				column: 'ResultTime',
				alias: null
			},
			{
				column: 'longitude',
				alias: null
			},
			{
				column: 'latitude',
				alias: null
			},
			{
				column: 'parameter',
				alias: null
			},
			{
				column: 'Value',
				alias: null
			},
			{
				column: 'uom',
				alias: null
			},
			{
				column: 'count',
				alias: null
			},
			{
				column: 'quantity',
				alias: null
			}
		],
		filters: [
			{
				for_query_parameter: 'ResultTime',
				min: '1',
				max: '2'
			},
			{
				for_query_parameter: 'longitude',
				gt: '3'
			},
			{
				for_query_parameter: 'longitude',
				gt_eq: '33'
			},
			{
				for_query_parameter: 'latitude',
				lt: '4'
			},
			{
				for_query_parameter: 'parameter',
				lt_eq: '5'
			},
			{
				for_query_parameter: 'Value',
				eq: '6'
			},
			{
				for_query_parameter: 'uom',
				neq: '7'
			},
			{
				or: [
					{
						for_query_parameter: 'parameter',
						eq: '8'
					},
					{
						for_query_parameter: 'uom',
						eq: '9'
					}
				]
			},
			{
				and: [
					{
						for_query_parameter: 'Value',
						gt_eq: '10'
					},
					{
						for_query_parameter: 'Value',
						lt_eq: '20'
					}
				]
			},
			{
				is_null: {
					for_query_parameter: 'count'
				}
			},
			{
				is_not_null: {
					for_query_parameter: 'quantity'
				}
			}
		],
		output: {
			format: 'parquet'
		}
	};

    let pythonCode: string = $state('');

	onMount(() => {
		beaconInstanceArray = $beaconInstances;
		currentBeaconInstanceValue = $currentBeaconInstance;

        pythonCode = PythonQueryBuilder.toPythonCode(query);



        
	});
</script>

<svelte:head>
	<title>Beacon Studio Test</title>
</svelte:head>

<Cookiecrumb />

<div class="page-container">
	<h1 class="">Test page</h1>

	<p>
		Visit <a href="https://maris-development.github.io/beacon/">
			maris-development.github.io/beacon/
		</a> to read the documentation.
	</p>

	<div>
        <pre>{pythonCode}</pre>


    </div>
</div>
