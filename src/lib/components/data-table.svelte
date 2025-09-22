
<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '@/components/loading-overlay/loading-spinner.svelte';
	import ChrevonUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import ChrevonUpIcon from '@lucide/svelte/icons/chevron-up';
	import ChrevonDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { Column, SortDirection } from '@/util-types';



	type Props = {
		onChangeSort?: (column: string, direction: SortDirection) => void;
		onPageChange?: (page: number) => void;
		onCellClick?: (row: Record<string, any>, column: Column) => void;
		columns: Column[];
		rows: Record<string, any>[];
		pageSize?: number;
		pageIndex?: number;
		totalRows?: number;
		isLoading?: boolean;
		rowClass?: string;
		size?: 'small' | 'medium' | 'large';
	};

	let {
		onChangeSort = () => {},
		onPageChange = () => {},
		onCellClick = () => {},
		columns,
		rows,
		pageSize = 10,
		pageIndex = 1,
		totalRows = 0,
		isLoading = false,
		rowClass = '',
		size = 'medium'
	}: Props = $props();

	let pageCount: number = $state(0);

	$effect(() => {
		pageCount = Math.ceil(totalRows / pageSize);
		// console.log('Page count updated:', pageCount, totalRows, pageSize, totalRows/pageSize);
	});

	function _changeSort(column: Column) {
		const columnRef = column.ref;

		console.log('_changeSort', columnRef);

		//invert direction:
		if (column.isSorted == true) {
			// If the same column is clicked, toggle the direction
			column.sortDirection = column.sortDirection === 'asc' ? 'desc' : 'asc';

		} else {
			columns.forEach(col => {
				col.isSorted = false;
				col.sortDirection = undefined;
			});

			column.isSorted = true;
			column.sortDirection = 'asc'; // default to ascending
		}

		onChangeSort(column.key, column.sortDirection);
	}

	function toString(value): string {
		//check if value is an object and has no toString method
		if (typeof value === 'object' && value !== null) {
			if (typeof value.toString === 'function') {
				// If it has a toString method, use it
				const stringValue = value.toString();

				if (stringValue !== '[object Object]') {
					return stringValue;
				}
			}
			// If it's an object without a toString method, return a JSON string
			return JSON.stringify(value, null, 2);
		}

		return String(value) || '';
	}
</script>

<div class="data-table-wrapper">
	<div class="table-wrapper">
		<table class="dataset-table {size}">
			<thead>
				<tr>
					{#each columns as column}
						{#if column.sortable}
							<th class:sortable={column.sortable} data-key={column.key} onclick={() => _changeSort(column)} bind:this={column.ref} data-sort="">
								{column.header}
								{#if column.sortable == true}
									 {#if (column.isSorted == true)}
										{#if (column.sortDirection === 'asc')}
											<span class="sort-indicator asc">
												<ChrevonUpIcon size="1.25em" />
											</span>
										{/if}
										{#if (column.sortDirection === 'desc')}
											<span class="sort-indicator desc">
												<ChrevonDownIcon size="1.25em" />
											</span>
										{/if}
									{:else}
										<span class="sort-indicator none">
											<ChrevonUpDownIcon size="1.25em" />
										</span>
									{/if}
								{/if}
								
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
									<td onclick={() => onCellClick(row, column)}>{@html toString(row[column.key])}</td
									>
								{:else}
									<td onclick={() => onCellClick(row, column)}>{toString(row[column.key])}</td>
								{/if}
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
	<div class="pagination">
		<button disabled={pageIndex <= 1} onclick={() => onPageChange(Math.max(1, pageIndex - 1))}>
			Previous
		</button>
		<div class="page-info">
			Page 
			<input type="number" min="1" max={pageCount} bind:value={pageIndex} oninput={() => onPageChange(pageIndex)} />
			of {pageCount}

			

		</div>
		<button
			disabled={pageIndex >= pageCount}
			onclick={() => onPageChange(Math.min(pageCount, pageIndex + 1))}>Next</button
		>
	</div>
</div>

<style lang="scss">
	@use 'sass:color';
	
	.data-table-wrapper {
		border: 1px solid #ddd;
		border-radius: 8px;
		overflow: hidden;
		position: relative;


		.table-wrapper {
			overflow-x: auto;
			//nice scrollbar
			// &::-webkit-scrollbar {
			// 	display: none;
			// }
			// -ms-overflow-style: none;
			// scrollbar-width: none;

			table.dataset-table {
				width: 100%;
				border-collapse: collapse;

				thead th, 
				tbody td {
					padding: 0.5rem 0.75rem;
					font-size: 0.875rem;
					border-bottom: 1px solid #ddd;
				}

				&.small {
					thead th, 
					tbody td {
						padding: 0.25rem 0.5rem;
						font-size: 0.7rem;
					}
				}

				&.large {
					thead th, 
					tbody td {
						padding: 1rem 1.5rem;
						font-size: 1rem;
					}
				}
				
				
				thead {
					background-color: #f9f9f9;

					th {
						text-align: left;
						font-weight: 600;
						text-transform: uppercase;
						color: #666;

						&.sortable {
							cursor: pointer;

							&:hover {
								background-color: color.mix(black, #f9f9f9, 5%); 
							}
						}

						.sort-indicator {
							// margin-left: 0.5rem;
							display: inline-block;
							vertical-align: middle;

							&.none {
								opacity: 0.5;
							}

						}
					}
				}

				tbody {
					tr {
						&:nth-child(even) {
							background-color: #fcfcfc;
						}

						td {
							color: #555;

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

			.page-info {
				font-size: 0.875rem;
				color: var(--foreground);
			}
		}
	}
</style>
