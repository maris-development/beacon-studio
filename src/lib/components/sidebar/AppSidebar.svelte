<script lang="ts">
	// Node service
	import { currentNode, nodes, selectFirstIfNone } from '@/services/beacon-node';
	import { ensureFresh } from '@/services/beacon-node-connect';
	import { openNodesSettled } from '@/services/open-nodes-import';
	import logo from '$lib/assets/logo-gradient.svg';

	// Svelte lifecycle and navigation
	import { onMount } from 'svelte';
	import { goto, beforeNavigate, afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { addToast, dismissToast } from '@/stores/toasts';

	// Icons
	import EyeIcon from '@lucide/svelte/icons/eye';
	import TextSearchIcon from '@lucide/svelte/icons/text-search';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import Table2Icon from '@lucide/svelte/icons/table-2';
	import LinkIcon from '@lucide/svelte/icons/link-2';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
	import SendIcon from '@lucide/svelte/icons/send';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import MenuIcon from '@lucide/svelte/icons/menu';

	// Components
	import ChooseBeaconModal from '../modals/ChooseBeaconModal.svelte';
	import FeedbackModal from '../modals/FeedbackModal.svelte';
	import BeaconNodeStatus from '../BeaconNodeStatus.svelte';
	import SidebarMenuItem from './SidebarMenuItem.svelte';
	import SidebarCollapsibleMenu from './SidebarCollapsibleMenu.svelte';
	import BuildVersion from './BuildVersion.svelte';

	type SubItem = { title: string; url: string };
	type MenuItem = {
		title: string;
		url: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: any;
		children?: SubItem[];
		target?: string;
	};
	type Group = { title: string; items: MenuItem[] };

	const groups: Group[] = [
		{
			title: 'Data Access',
			items: [
				{
					title: 'Queries',
					url: resolve('/queries/workbench'),
					icon: TextSearchIcon,
					children: [
						{ title: 'Query Builder', url: resolve('/queries/workbench') },
						{ title: 'Saved Queries', url: resolve('/queries/saved') },
						{ title: 'Query History', url: resolve('/queries/history') }
					]
				}
			]
		},
		{
			title: 'Explore and Analyze',
			items: [
				{
					title: 'Workspace',
					url: resolve('/visualisations/map-viewer'),
					icon: EyeIcon,
					children: [
						{ title: 'Map Viewer', url: resolve('/visualisations/map-viewer') },
						{ title: 'Table Explorer', url: resolve('/visualisations/table-explorer') },
						{ title: 'Chart Explorer', url: resolve('/visualisations/chart-explorer') }
					]
				}
			]
		},
		{
			title: 'Node Management',
			items: [
				{
					title: 'Data Browser',
					url: resolve('/data-browser'),
					icon: Table2Icon,
					children: [
						{ title: 'Datasets', url: resolve('/data-browser/datasets') },
						{ title: 'Data Tables', url: resolve('/data-browser/data-tables') }
					]
				},
				{ title: 'System Info', url: resolve('/system-info'), icon: CpuIcon }
			]
		},
		{
			title: 'Beacon Studio',
			items: [
				{ title: 'Beacon Nodes', url: resolve('/beacon-nodes'), icon: LinkIcon },
				{ title: 'Settings', url: resolve('/settings'), icon: Settings2Icon }
			]
		}
	];

	const footer: MenuItem[] = [
		{
			title: 'Documentation',
			url: 'https://maris-development.github.io/beacon/',
			icon: BookOpenIcon,
			target: '_blank'
		},
		{
			title: 'GitHub',
			url: 'https://github.com/maris-development/beacon',
			icon: LifeBuoyIcon,
			target: '_blank'
		}
	];

	let collapsed = $state(false);
	let isMobile = $state(false);
	let showChooseBeaconModal: boolean = $state(false);
	let showFeedbackModal: boolean = $state(false);

	function openBeaconNodePicker(): void {
		showChooseBeaconModal = true;
	}

	// The sidebar shows the status of the selection on every page. Refresh a
	// stale result. `ensureFresh` skips a check that is not due.
	$effect(() => {
		const node = $currentNode;
		if (node) void ensureFresh(node);
	});

	// The routes that work with an empty list. Both of them can add a node.
	const NODE_FREE_ROUTES = new Set(['/', '/beacon-nodes']);

	// `page.route.id` carries no base path, so it needs no `resolve`.
	function needsNode(routeId: string | null | undefined): boolean {
		return !NODE_FREE_ROUTES.has(routeId ?? '');
	}

	function warnNoNode(): void {
		addToast({
			type: 'error',
			message: 'This page needs a Beacon node. Add one on the Beacon Nodes page.'
		});
	}

	// The app needs at least one node for every route but the two above: this
	// selection is the node of the browse pages and of a new query, and a query
	// record holds its own node. Block the navigation instead of following it, so
	// the user stays on the page they came from and sees why the target failed.
	beforeNavigate((navigation) => {
		// The public list can still add a node. Let the move through until it lands.
		if (!$openNodesSettled) return;
		if ($nodes.length > 0) return;
		if (!needsNode(navigation.to?.route.id)) return;

		navigation.cancel();
		warnNoNode();
	});

	onMount(() => {
		// Track mobile viewport; start collapsed (closed overlay) on mobile
		const mobileQuery = window.matchMedia('(max-width: 767px)');
		const applyMobile = (matches: boolean) => {
			isMobile = matches;
			collapsed = matches;
		};
		applyMobile(mobileQuery.matches);
		const onMobileChange = (e: MediaQueryListEvent) => applyMobile(e.matches);
		mobileQuery.addEventListener('change', onMobileChange);

		// Give the browse pages a node, with no modal. A query carries its own node,
		// and the builder asks for one where it is missing.
		selectFirstIfNone();

		return () => mobileQuery.removeEventListener('change', onMobileChange);
	});

	// `beforeNavigate` never runs for the page a session opens on. A direct load of
	// a blocked route (a bookmark, a refresh, a shared link) has no prior page to
	// stay on, so send it home instead. A first visit has no saved node, so this
	// waits for the public list before the app gives up on the page.
	$effect(() => {
		if (!$openNodesSettled) return;
		if ($nodes.length > 0) return;
		if (!needsNode(page.route.id)) return;

		warnNoNode();
		goto(resolve('/'));
	});

	// The id of the open "please wait" toast. A plain let, so the effect below
	// does not re-run on its own write.
	let waitToastId: number | null = null;

	// Name the wait. The app reads the public node list on a first visit only.
	$effect(() => {
		if ($openNodesSettled) {
			if (waitToastId !== null) {
				dismissToast(waitToastId);
				waitToastId = null;
			}
			return;
		}

		if (waitToastId !== null) return;
		if ($nodes.length > 0) return;
		if (!needsNode(page.route.id)) return;

		waitToastId = addToast({
			type: 'info',
			timeout: 0,
			message:
				'Beacon Studio reads the public Beacon nodes. This happens on the first visit only. Your query starts when they arrive.'
		});
	});

	// Close the overlay sidebar after navigating on mobile
	afterNavigate(() => {
		if (isMobile) collapsed = true;
	});
</script>

{#if showChooseBeaconModal}
	<ChooseBeaconModal onClose={() => (showChooseBeaconModal = false)} />
{/if}

{#if showFeedbackModal}
	<FeedbackModal onClose={() => (showFeedbackModal = false)} />
{/if}

{#if isMobile && !collapsed}
	<button class="sidebar-backdrop" 
			aria-label="Close menu" 
			onclick={() => (collapsed = true)}></button>
{/if}

<div class="sidebar" class:collapsed>
	<div class="sidebar-header">
		<div class="logo-wrapper">
			<a class="header-link" href={resolve('/')}>
				<img src={logo} alt="Beacon Logo" class="beacon-logo" />
				<span class="app-name">Beacon Studio</span>
			</a>
			<button
				class="collapse-toggle"
				onclick={(e) => {
					e.stopPropagation();
					collapsed = !collapsed;
				}}
			>
				{#if isMobile}
					<MenuIcon class="toggle-icon" />
				{:else if collapsed}
					<PanelLeftOpenIcon class="toggle-icon" />
				{:else}
					<PanelLeftCloseIcon class="toggle-icon" />
				{/if}
			</button>
		</div>

		<!--
			The node of the browse pages, and the node of a new query block. It is
			not the node of an open query: a query record owns that one, and the
			workbench shows it. See `QueryWorkspace.activeNode`.
		-->
		<!-- <button
			class="current-node"
			title="The node for browsing, and for a new query"
			onclick={openBeaconNodePicker}
		>
			<span class="node-icon"><LinkIcon /></span>
			<div class="node-text">
				<span class="node-name">{$currentNode?.name ?? 'No node picked'}</span>
				<span class="node-url">{$currentNode?.url ?? ''}</span>
			</div>
			{#if $currentNode}
				<BeaconNodeStatus health={$currentNode} variant="dot" />
			{/if}
		</button> -->
	</div>

	<div class="sidebar-content">
		{#each groups as group (group.title)}
			<div class="menu-group">
				<span class="menu-title">{group.title}</span>
				{#each group.items as item (item.url)}
					{#if item.children?.length}
						<SidebarCollapsibleMenu
							title={item.title}
							url={item.url}
							icon={item.icon}
							items={item.children}
						/>
					{:else}
						<SidebarMenuItem title={item.title} url={item.url} icon={item.icon} />
					{/if}
				{/each}
			</div>
		{/each}
	</div>

	<div class="sidebar-footer">
		<div class="menu-group">
			{#each footer as item (item.url)}
				<SidebarMenuItem title={item.title} url={item.url} icon={item.icon} target={item.target} />
			{/each}
			<SidebarMenuItem
				title="Feedback"
				icon={SendIcon}
				onclick={() => (showFeedbackModal = true)}
			/>
		</div>
	</div>
</div>

<BuildVersion />

<style lang="scss">
	.sidebar {
		--sidebar-bold-font-weight: 600;

		background: var(--sidebar);
		border-right: 1px solid var(--sidebar-border);

		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		min-width: 250px;
		transition:
			min-width 0.2s ease,
			width 0.2s ease;

		.sidebar-header {
			padding-bottom: 1rem;
			border-bottom: 1px solid var(--sidebar-border);

			.logo-wrapper {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				padding: 0.5rem;

				.header-link {
					flex-grow: 1;
					display: flex;
					align-items: center;
					gap: 0.5rem;
					text-decoration: none;
					color: inherit;
					border-radius: 0.5rem;

					.beacon-logo {
						width: 1.75rem;
						height: 1.75rem;
						// padding: 0.5rem;
						margin: 0.25rem;
					}

					.app-name {
						flex-grow: 1;
						font-size: 1rem;
						font-weight: 600;
						line-height: 1.5rem;
						margin: 0;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}

					&:hover {
						background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
					}
				}

				.collapse-toggle {
					flex-shrink: 0;
					display: flex;
					align-items: center;
					justify-content: center;
					background: none;
					border: none;
					cursor: pointer;
					padding: 0.25rem;
					border-radius: 0.375rem;
					color: inherit;

					:global(.toggle-icon) {
						width: 1rem;
						height: 1rem;
					}

					&:hover {
						background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
					}
				}
			}

			.current-node {
				display: flex;
				appearance: none;
				width: 100%;
				align-items: center;
				margin-top: 1rem;
				gap: 0.5rem;
				padding: 0.5rem;
				border-radius: 0.5rem;
				background-color: var(--background);
				border: none;
				cursor: pointer;

				background-color: rgba(255, 255, 255, 0.25);

				.node-icon {
					display: flex;
					flex-shrink: 0;

					:global(svg) {
						width: 1rem;
						height: 1rem;
					}
				}

				.node-text {
					display: grid;
					flex: 1;
					min-width: 0;
					text-align: left;
					font-size: 0.875rem;
					line-height: 1.25;
				}

				.node-name {
					font-weight: var(--sidebar-bold-font-weight);
				}

				.node-name,
				.node-url {
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.node-url {
					font-size: 0.75rem;
				}

				&:hover {
					background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
				}
			}
		}

		.sidebar-content {
			flex-grow: 1;
		}

		.sidebar-footer {
			.menu-group {
				border-top: 1px solid var(--sidebar-border);
			}
		}

		.menu-group {
			padding-top: 1rem;
			padding-bottom: 1rem;
			gap: 0.5rem;
			display: flex;
			flex-direction: column;

			.menu-title {
				font-size: 0.75rem;
				font-weight: 600;
				line-height: 1rem;
				text-transform: uppercase;
				color: var(--foreground);
			}

			:global(> .menu-item > .item-title),
			:global(.submenu-title) {
				font-weight: var(--sidebar-bold-font-weight);
			}
		}

		&.collapsed {
			min-width: unset;
			width: 2.5rem;

			.sidebar-content,
			.sidebar-footer,
			.current-node,
			.logo-wrapper .header-link {
				display: none;
			}

			.logo-wrapper {
				justify-content: center;
			}
		}

		// --- Mobile: overlay the content instead of taking layout space ---
		@media (max-width: 767px) {
			position: fixed;
			top: 0;
			left: 0;
			height: 100vh;
			width: 16rem;
			max-width: 85vw;
			z-index: 50;
			background: var(--app-background);
			box-shadow: 0 0 1rem rgba(0, 0, 0, 0.25);

			&.collapsed {
				// Closed: shrink to a floating hamburger, leaving the content clickable
				width: auto;
				min-width: unset;
				height: auto;
				background: transparent;
				box-shadow: none;

				.logo-wrapper .collapse-toggle {
					background: var(--app-background);
					box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.2);
				}
			}
		}
	}

	.sidebar-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: none;
		padding: 0;
		background: rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}
</style>
