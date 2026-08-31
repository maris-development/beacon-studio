<script lang="ts">
	import { onMount } from 'svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { PythonQueryBuilder } from '@/beacon-api/query';
	import { getCurrentInstance } from '@/services/beacon-instance';
	import Button from '@/components/buttons/Button.svelte';

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

        pythonCode = PythonQueryBuilder.toPythonCode(query, getCurrentInstance());



        
	});

</script>

<svelte:head>
	<title>Beacon Studio Test</title>
</svelte:head>

<Cookiecrumb />

<div class="page-wrapper">
	<div class="page-container">
		<h1 class="">Test page</h1>

		<p>
			Visit <a href="https://maris-development.github.io/beacon/">
				maris-development.github.io/beacon/
			</a> to read the documentation.
		</p>
	</div>


		<div class=" page-container">
			
			<h3>Button variants</h3>

			<div>
				<Button variant="default">Default</Button>
				<Button variant="destructive">Destructive</Button>
				<Button variant="outline">Outline</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="link">Link</Button>
				<Button variant="confirm">Confirm</Button>
				<Button variant="deny">Deny</Button>


			</div>


			<div>
				
				<pre>{pythonCode}</pre>

			</div>
		</div>
</div>


<style lang="scss">
	.page-wrapper {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;

	
	}
</style>