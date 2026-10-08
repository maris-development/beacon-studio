<script lang="ts">
	import type { BeaconNode } from '@/beacon-api/types';
	import { nodes, normalizeUrl } from '@/services/beacon-node';
	import { checkAllNodes } from '@/services/beacon-node-connect';
	import { FRESH_MS } from '@/services/beacon-node-health';
	import { openNodes, type OpenNode } from '@/services/open-nodes';
	import { htmlToText, sanitizeHtml } from '@/util/sanitize-html';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import Card from '@/components/card/Card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AddBeaconModal from '@/components/modals/AddBeaconModal.svelte';
	import InfoIcon from '@lucide/svelte/icons/info';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { t } from '@/i18n';

	let editingNode: BeaconNode | null = $state(null);
	let showFormModal = $state(false);

	// The table shows the health of every node. Refresh the stale results.
	onMount(() => {
		void checkAllNodes(FRESH_MS);
	});

	// The newest node first, so an addition lands at the top. `addNode`
	// appends, so the reverse of the list is the order this page needs. A sort on
	// `createdAt` cannot do this: the import writes several records in one
	// millisecond, so their order would change on each start.
	let rows = $derived([...$nodes].reverse());

	/** Opens the form. Pass `null` for an empty form. */
	function openForm(node: BeaconNode | null): void {
		editingNode = node;
		showFormModal = true;
	}

	/** The form writes to the service. This closes it and shows the new list. */
	function closeForm(): void {
		showFormModal = false;
	}

	/** The public list entry for this URL, or `null` if the node is not public. */
	function findPublicNode(url: string): OpenNode | null {
		const target = normalizeUrl(url);
		return $openNodes.find((n) => normalizeUrl(n.url) === target) ?? null;
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('nav.item.beaconNodes') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('nav.item.beaconNodes'), href: resolve('/beacon-nodes') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('nav.item.beaconNodes')}</h1>

		<p>
			{$t('node.page.introBeforeLink')}
			<a href="https://beacon-datalake.org/public-nodes" rel="noopener noreferrer" target="_blank"
				>{$t('node.page.introLink')}</a
			>{$t('node.page.introAfterLink')}
		</p>

		<div class="actions">
			<Button onclick={() => openForm(null)}>
				{$t('node.page.add')}
				<PlusIcon />
			</Button>
		</div>

		<Card class="beacon-nodes">
			<div class="table-scroll">
				<table class="beacon-nodes-table">
					<thead>
						<tr>
							<th>{$t('node.field.name')}</th>
							<th>{$t('node.field.description')}</th>
							<th>{$t('node.field.url')}</th>
							<th>{$t('node.field.status')}</th>
							<th>{$t('node.field.actions')}</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as node (node.id)}
							{@const publicNode = findPublicNode(node.url)}
							<tr>
								<td class="node-name">{node.name}</td>
								<td class="node-description" title={htmlToText(node.description)}>
									<div class="description-cell">
										<!-- The public list writes the description as HTML. -->
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeHtml removes the unsafe tags and attributes -->
										<span class="clamp">{@html sanitizeHtml(node.description)}</span>
										{#if typeof publicNode?.n_code === 'number'}
											<Button
												variant="ghost"
												size="xs"
												href={publicNode.info_url}
												target="_blank"
												rel="noopener noreferrer"
												title={$t('node.page.publicInfo')}
												aria-label={$t('node.page.publicInfo')}
											>
												<InfoIcon />
											</Button>
										{/if}
									</div>
								</td>
								<td class="node-url">
									<a href={node.url} rel="noopener noreferrer" target="_blank">{node.url}</a
									>
								</td>
								<td class="node-status">
									<BeaconNodeStatus health={node} variant="compact" />
								</td>
								<td class="node-actions">
									<Button variant="outline" onclick={() => openForm(node)}>
										{$t('common.edit')}
										<SquarePenIcon />
									</Button>
								</td>
							</tr>
						{:else}
							<tr>
								<td class="no-nodes" colspan="5">{$t('node.page.empty')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	</div>
</div>

{#if showFormModal}
	<AddBeaconModal onSave={closeForm} onClose={closeForm} node={editingNode} />
{/if}

<style lang="scss">
	.page-container {
		:global(.card.beacon-nodes) {
			padding: 0;
			background-color: var(--background);
		}
	}

	.actions {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
		margin: 1rem 0;
	}

	// A narrow screen scrolls the table. The page itself must not scroll.
	.table-scroll {
		overflow-x: auto;
	}

	table.beacon-nodes-table {
		width: 100%;
		text-align: left;
		border-collapse: collapse;

		th,
		td {
			padding: 0.5rem 0.75rem;
			vertical-align: middle;
		}

		thead {
			background-color: var(--muted);
			color: var(--muted-foreground);
		}

		tbody {
			tr {
				&:nth-child(even) {
					background-color: var(--muted);
				}
			}
		}

		.node-name {
			font-weight: bold;
			white-space: nowrap;
		}

		// The description takes the room that the other columns leave. A max-width
		// on a cell does nothing here, because the auto table layout sizes a column
		// from its content.
		.node-description {
			width: 100%;
		}

		// The info link follows the text, so it stays out of the clamped box.
		.description-cell {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		// The clamp needs a box of its own. A cell stretches to the height of the
		// row, so a clamp on the cell never cuts the text. The `min-width` lets the
		// box shrink, because a flex item stops at the width of its content.
		.clamp {
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
			min-width: 0;

			// The description carries its own markup. A margin or a bullet of that
			// markup would push the text out of the clamped box.
			:global(p),
			:global(ul),
			:global(ol) {
				margin: 0;
				padding: 0;
				list-style-position: inside;
			}
		}

		// These columns hold one line each. They must not break a URL in two.
		.node-url,
		.node-status,
		.node-actions {
			white-space: nowrap;
		}

		.no-nodes {
			color: var(--muted-foreground);
			text-align: center;
		}

		a {
			color: var(--primary);
		}
	}
</style>
