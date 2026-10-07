<!--
	Catalog > schema > table > columns. A click on a name inserts it into the editor.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { Input } from '@/components/ui/input';
	import {
		COLUMN_PAGE_SIZE,
		filterTree,
		tableKey,
		type CatalogTree,
		type SchemaColumn
	} from '@/sql/catalog';
	import { quoteIdent, sqlName, type TableRef } from '@/sql/identifiers';
	import { sqlErrorMessage } from '@/sql/statement';

	type Props = {
		tree: CatalogTree | null;
		loading: boolean;
		error: string;
		loadColumns: (ref: TableRef) => Promise<SchemaColumn[]>;
		onInsert: (text: string) => void;
		onRefresh: () => void;
	};

	let { tree, loading, error, loadColumns, onInsert, onRefresh }: Props = $props();

	type ColumnState = { columns: SchemaColumn[]; shown: number } | { error: string } | 'loading';

	let needle = $state('');
	let open = $state<Record<string, boolean>>({});
	let columns = $state<Record<string, ColumnState>>({});

	// A new tree (node change or refresh) starts closed, with the default schema open.
	$effect(() => {
		if (!tree) return;

		open = {
			[`s:${tree.defaults.catalog}.${tree.defaults.schema}`]: true,
			[`c:${tree.defaults.catalog}`]: true
		};
		columns = {};
	});

	function loadedOf(ref: TableRef): SchemaColumn[] | undefined {
		const state = columns[tableKey(ref)];
		if (state && typeof state === 'object' && 'columns' in state) return state.columns;
		return undefined;
	}

	let shown = $derived.by(() => {
		if (!tree) return null;
		return filterTree(tree, needle, loadedOf);
	});

	// A separate value, so the click handlers need no null check on `shown`.
	let defaults = $derived(tree?.defaults ?? { catalog: '', schema: '' });

	// A filter shows every match, so it opens everything.
	let filtering = $derived(needle.trim() !== '');

	function isOpen(key: string): boolean {
		return filtering || open[key] === true;
	}

	function toggle(key: string) {
		open[key] = !open[key];
	}

	async function toggleTable(ref: TableRef) {
		const key = tableKey(ref);
		open[`t:${key}`] = !open[`t:${key}`];
		if (!open[`t:${key}`] || columns[key]) return;

		columns[key] = 'loading';
		try {
			columns[key] = { columns: await loadColumns(ref), shown: COLUMN_PAGE_SIZE };
		} catch (caught) {
			columns[key] = { error: sqlErrorMessage(caught) };
		}
	}

	function showMore(key: string) {
		const state = columns[key];
		if (state && typeof state === 'object' && 'columns' in state) {
			columns[key] = { ...state, shown: state.shown + COLUMN_PAGE_SIZE };
		}
	}
</script>

<div class="catalog">
	<div class="catalog-head">
		<Input type="search" placeholder="Filter tables" bind:value={needle} />
		<button
			type="button"
			class="icon-button"
			title="Refresh"
			aria-label="Refresh"
			onclick={onRefresh}
		>
			<RefreshCwIcon class="size-4" />
		</button>
	</div>

	{#if loading}
		<p class="muted">Loading tables...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if shown && shown.catalogs.length === 0}
		<p class="muted">No tables match.</p>
	{:else if shown}
		<ul class="level">
			{#each shown.catalogs as catalog (catalog.name)}
				{@const catalogKey = `c:${catalog.name}`}
				<li>
					<button type="button" class="row" onclick={() => toggle(catalogKey)}>
						<ChevronRightIcon class="chevron {isOpen(catalogKey) ? 'open' : ''}" />
						<span class="name">{catalog.name}</span>
					</button>

					{#if isOpen(catalogKey)}
						<ul class="level">
							{#each catalog.schemas as schema (schema.name)}
								{@const schemaKey = `s:${catalog.name}.${schema.name}`}
								<li>
									<button type="button" class="row" onclick={() => toggle(schemaKey)}>
										<ChevronRightIcon class="chevron {isOpen(schemaKey) ? 'open' : ''}" />
										<span class="name">{schema.name}</span>
									</button>

									{#if isOpen(schemaKey)}
										<ul class="level">
											{#each schema.tables as table (table.name)}
												{@const ref = {
													catalog: catalog.name,
													schema: schema.name,
													name: table.name
												}}
												{@const key = tableKey(ref)}
												{@const colState = columns[key]}
												<li>
													<div class="row">
														<button
															type="button"
															class="toggle"
															aria-label="Show columns"
															onclick={() => toggleTable(ref)}
														>
															<ChevronRightIcon class="chevron {open[`t:${key}`] ? 'open' : ''}" />
														</button>
														<button
															type="button"
															class="insert"
															title={table.table_type}
															onclick={() => onInsert(sqlName(ref, defaults))}
														>
															{table.name}
														</button>
													</div>

													{#if open[`t:${key}`]}
														{#if colState === 'loading'}
															<p class="muted nested">Loading columns...</p>
														{:else if colState && 'error' in colState}
															<p class="error nested">{colState.error}</p>
														{:else if colState && 'columns' in colState}
															<ul class="level columns">
																{#each colState.columns.slice(0, colState.shown) as column (column.name)}
																	<li>
																		<button
																			type="button"
																			class="insert column"
																			onclick={() => onInsert(quoteIdent(column.name))}
																		>
																			<span>{column.name}</span>
																			<span class="type">{column.dataType}</span>
																		</button>
																	</li>
																{/each}
															</ul>
															{#if colState.columns.length > colState.shown}
																<button type="button" class="more" onclick={() => showMore(key)}>
																	Show more ({colState.columns.length - colState.shown} left)
																</button>
															{/if}
														{/if}
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	.catalog {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
		height: 100%;
		overflow: auto;
		font-size: var(--font-size-sm);
	}

	.catalog-head {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.icon-button,
	.row,
	.toggle,
	.insert,
	.more {
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.level {
		list-style: none;
		margin: 0;
		padding-left: 0.75rem;

		&.columns {
			padding-left: 1.75rem;
		}
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
		padding: 0.125rem 0;
	}

	.insert {
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		word-break: break-all;

		&:hover {
			background: var(--accent);
		}

		&.column {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			width: 100%;
		}
	}

	.type {
		color: var(--muted-foreground);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
	}

	.more {
		padding-left: 1.75rem;
		text-decoration: underline;
		color: var(--muted-foreground);
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}

	.nested {
		padding-left: 1.75rem;
		margin: 0;
	}

	:global(.chevron) {
		width: 0.875rem;
		height: 0.875rem;
		transition: transform 0.15s;
	}

	:global(.chevron.open) {
		transform: rotate(90deg);
	}
</style>
