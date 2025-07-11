<script context="module" lang="ts">
	export type SortDirection = 'asc' | 'desc';
	export type Column = { key: string; header: string; sortable: boolean, rawHtml?: boolean };
	export class AffixString {
		prefix: string;
		main: string | null;
		suffix: string;

		constructor(main: string | null, prefix: string = '', suffix: string = '') {
			this.prefix = prefix;
			this.main = main;
			this.suffix = suffix;
		}

		toString(): string {
			return `${this.prefix}${this.main ?? ''}${this.suffix}`;
		}
	};
	export class VirtualPaginationData<T = any>{
		
		originalData: T[];
		data: T[];
		length: number;

		constructor(data: T[]) {
			this.originalData = data;
			this.data = data;
			this.length = data.length;
		}

		getData(offset: number, limit: number): T[] {
			return this.data.slice(offset, offset + limit);
		}

		setData(data: T[]) {
			this.originalData = data;
			this.data = data;
			this.length = data.length;
		}

		filter(predicate: (item: T) => boolean): number {
			this.data = this.originalData.filter(predicate);
			this.length = this.data.length;
			return this.length;
		}

		resetFilter(): number {
			this.data = this.originalData;
			this.length = this.data.length;
			return this.length;
		}
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '$lib/components/ui/loading-spinner.svelte';

	export let onChangeSort: (column: string, direction: SortDirection) => void = () => {};
	export let onPageChange: (page: number) => void = () => {};
	export let onCellClick: (row: Record<string, any>, column: Column) => void = () => {};

	export let defaultSort: { column: string | null; direction: SortDirection } = {
		column: null,
		direction: 'asc'
	};
	export let columns: Column[];
	export let rows: Record<string, any>[];
	export let pageSize: number = 10;
	export let pageIndex: number = 1;
	export let totalRows: number = 0;
	export let isLoading: boolean = false;
	export let rowClass: string = '';

	$: pageCount = Math.ceil(totalRows / pageSize);

	let currentSortColumn: string = defaultSort.column ?? (columns.length > 0 ? columns[0].key : '');
	let currentSortDirection: SortDirection = 'asc';

	function _changeSort() {
		console.log('_changeSort', this);

		//invert direction:
		if (currentSortColumn === this.dataset.key) {
			// If the same column is clicked, toggle the direction
			this.dataset.sort = this.dataset.sort === 'asc' ? 'desc' : 'asc';
		}

		currentSortDirection = this.dataset.sort;
		currentSortColumn = this.dataset.key;

		onChangeSort(currentSortColumn, currentSortDirection);
	}

	onMount(() => {
		onChangeSort(currentSortColumn, currentSortDirection);
	});

	function toString(value): string {

		//check if value is an object and has no toString method
		if (  typeof value === 'object' && value !== null ) {
			if( typeof value.toString === 'function' ) {
				// If it has a toString method, use it
				const stringValue = value.toString();

				if(stringValue !== '[object Object]') {
					return stringValue;
				}


			}
			// If it's an object without a toString method, return a JSON string
			return JSON.stringify(value, null, 2);
		}

		return String(value) || '';
	}
</script>

<div class="table-wrapper">
	<table class="dataset-table">
		<thead>
			<tr>
				{#each columns as column}
					{#if column.sortable}
						<th data-key={column.key} onclick={_changeSort} data-sort={defaultSort.direction}>
							{column.header}
						</th>

					{:else}
						<th data-key={column.key}>{column.header}</th>
					{/if}
				{/each}
			</tr>
		</thead>
		<tbody>
			{#if rows.length === 0 && !isLoading}
				<tr>
					<td colspan={columns.length} class="no-data">No data available</td>
				</tr>

			{:else if rows.length === 0}
				<tr>
					<td colspan={columns.length} class="no-data">
						<LoadingSpinner></LoadingSpinner>
						<span>Loading data...</span>
					</td>
				</tr>

			{:else}
				{#each rows as row}
					<tr class={rowClass}>
						{#each columns as column}
							{#if column.rawHtml === true}
								<td onclick={() => onCellClick(row, column)}>{@html toString(row[column.key])}</td>

							{:else}
								<td onclick={() => onCellClick(row, column)}>{toString(row[column.key])}</td>

							{/if}
						{/each}
					</tr>
				{/each}

			{/if}
		</tbody>
	</table>

	<div class="pagination">
		<button disabled={pageIndex <= 1} onclick={() => onPageChange(Math.max(1, pageIndex - 1))}>
			Previous
		</button>
		<span>Page {pageIndex} of {pageCount}</span>
		<button
			disabled={pageIndex >= pageCount}
			onclick={() => onPageChange(Math.min(pageCount, pageIndex + 1))}>Next</button
		>
	</div>
</div>

<style lang="scss">
	.table-wrapper {
		border: 1px solid #ddd;
		border-radius: 8px;
		overflow: hidden;
		position: relative;

		margin-bottom: 1rem;

		.dataset-table {
			width: 100%;
			border-collapse: collapse;

			thead {
				background-color: #f9f9f9;

				th {
					padding: 0.75rem 1rem;
					text-align: left;
					font-size: 0.875rem;
					font-weight: 600;
					text-transform: uppercase;
					color: #666;
					border-bottom: 1px solid #ddd;
				}
			}

			tbody {
				tr {
					&:nth-child(even) {
						background-color: #fcfcfc;
					}

					td {
						padding: 0.75rem 1rem;
						font-size: 0.875rem;
						color: #555;
						border-bottom: 1px solid #eee;

						&.no-data {
							display: table-cell;
								text-align: center;

							> * {
								display: inline-block;
								margin: 0 auto;
							}
						}
					}

					&:hover {
						background-color: #f1f1f1;
					}
				}
			}
		}

		.pagination {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.75rem 1rem;
			background-color: var(--background);
			border-top: 1px solid var(--border);

			button {
				background-color: var(--primary);
				color: var(--primary-foreground);
				border: none;
				padding: 0.5rem 1rem;
				font-size: 0.875rem;
				border-radius: 4px;
				cursor: pointer;
				transition: filter 0.2s ease;

				// Since Sass’s darken() won’t work directly on CSS vars,
				// we use a CSS filter for a quick “hover‐darken”.
				&:hover:not(:disabled) {
					filter: brightness(0.9);
				}

				&:disabled {
					background-color: var(--muted);
					color: var(--muted-foreground);
					cursor: not-allowed;
					opacity: 0.6;
					filter: none; // reset any inherited filter
				}
			}

			span {
				font-size: 0.875rem;
				color: var(--foreground);
			}
		}

		
	}
</style>
