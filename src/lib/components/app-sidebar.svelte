<script lang="ts" module>
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import Table2Icon from '@lucide/svelte/icons/table-2';
	import DatabaseZapIcon from '@lucide/svelte/icons/database-zap';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
	import SendIcon from '@lucide/svelte/icons/send';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import { resolve } from '$app/paths';

	const data = {
		dataAccess: [
			{
				title: 'Queries',
				url: resolve('/queries'),
				icon: DatabaseIcon,
				items: [
					{
						title: 'Builder',
						url: resolve('/queries/query-builder')
					},
					// {
					// 	title: 'Editor',
					// 	url: resolve('/queries/query-editor')
					// },
					{
						title: 'History',
						url: resolve('/queries/query-history')
					}
				]
			},
			{
				title: 'Visualizations',
				url: resolve('/visualisations'),
				icon: EyeIcon,
				items: [
					{
						title: 'Map Viewer',
						url: resolve('/visualisations/map-viewer')
					},
					{
						title: 'Table Explorer',
						url: resolve('/visualisations/table-explorer')
					},
					{
						title: 'Chart Explorer',
						url: resolve('/visualisations/chart-explorer')
					}
				]
			}
		],
		nodeManagement: [
			{
				title: 'Content',
				url: resolve('/data-browser'),
				icon: Table2Icon,
				items: [
					{
						title: 'Datasets',
						url: resolve('/data-browser/datasets')
					},
					{
						title: 'Data Tables',
						url: resolve('/data-browser/data-tables')
					}
				]
			},
			{
				title: 'System Info',
				url: resolve('/system-info'),
				icon: CpuIcon
			},
			{
				title: 'Settings',
				url: resolve('/settings'),
				icon: Settings2Icon
			}
		],

		navSecondary: [
			{
				title: 'Documentation',
				url: 'https://maris-development.github.io/beacon/',
				icon: BookOpenIcon,
				target: '_blank'
			},
			{
				title: 'Support',
				url: 'https://github.com/maris-development/beacon',
				icon: LifeBuoyIcon,
				target: '_blank'
			},
			{
				title: 'Feedback',
				url: 'https://github.com/maris-development/beacon/issues',
				icon: SendIcon,
				target: '_blank'
			}
		]
	};
</script>

<script lang="ts">
	import NavMain from './nav-main.svelte';
	import NavSecondary from './nav-secondary.svelte';
	import NavInstance from './nav-instance.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { ComponentProps } from 'svelte';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
					{#snippet child({ props })}
						<a class="header-link" href={resolve('/')}>
							<div class=" header-icon">
								<DatabaseZapIcon class="size-4" />
							</div>
							<h1 class="truncate">Beacon Studio</h1>
							<span class="collapse-sidebar">
								<!-- place collapse icon here.  -->
								<PanelLeftCloseIcon class="size-4" />
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>

		<NavInstance />
	</Sidebar.Header>

	<Sidebar.Content>
		<NavMain title="Data Access" items={data.dataAccess} />
		<NavMain title="Node Management" items={data.nodeManagement} />
		<!-- <NavProjects projects={data.projects} /> -->
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>

	<Sidebar.Footer></Sidebar.Footer>
</Sidebar.Root>

<style lang="scss">
	.header-link {
		display: flex;
		// justify-content: space-between;
		align-items: center;
		gap: 0.5rem;

		.header-icon {
			background: var(--background);
			color: var(--foreground);
			display: flex;
			aspect-ratio: 1 / 1;
			width: 2rem; // w-8
			height: 2rem; // h-8
			align-items: center;
			justify-content: center;
			border-radius: 0.5rem; // rounded-lg
		}

		h1 {
			flex-grow: 1;
			font-size: 1rem; // text-base
			font-weight: 600; // font-medium
			line-height: 1.5rem; // leading-6
			margin: 0;
		}
	}
</style>
