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

	const data = {
		instance: {
			host: 'https://beacon-argo.maris.nl',
			name: 'Beacon Euro Argo',
			description: 'Beacon Instance running on top of the Euro Argo Fleet collection'
		},
		nodeContent: [
			{
				title: 'Data Browser',
				url: '/data-browser',
				icon: Table2Icon,
				isActive: true,
				items: [
					{
						title: 'Datasets',
						url: '/data-browser/datasets'
					},
					{
						title: 'Data Tables',
						url: '/data-browser/data-tables'
					}
					// { // not needed for now
					// 	title: 'Settings',
					// 	url: '/data-browser/settings'
					// }
				]
			}
		],
		dataAccess: [
			{
				title: 'Queries',
				url: '/queries',
				icon: DatabaseIcon,
				isActive: true,
				items: [
					{
						title: 'Builder',
						url: '/queries/query-builder'
					},
					{
						title: 'Editor',
						url: '/queries/query-editor'
					}
				]
			},
			{
				title: 'Visualizations',
				url: '/visualisations',
				icon: EyeIcon,
				isActive: true,
				items: [
					{
						title: 'Map Viewer',
						url: '/visualisations/map-viewer',
					},
					{
						title: 'Table Explorer',
						url: '/visualisations/table-explorer'
					}
				]
			},
		],
		nodeManagement: [
			{
				title: 'System Info',
				url: '/system-info',
				icon: CpuIcon
			},
			{
				title: 'Settings',
				url: '/settings',
				icon: Settings2Icon
			}
		],
		navSecondary: [
			{
				title: 'Documentation',
				url: 'https://maris-development.github.io/beacon/',
				icon: BookOpenIcon
			},
			{
				title: 'Support',
				url: 'https://github.com/maris-development/beacon',
				icon: LifeBuoyIcon
			},
			{
				title: 'Feedback',
				url: 'https://github.com/maris-development/beacon/issues',
				icon: SendIcon
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

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>

		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<DatabaseZapIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">Beacon Studio</span>
								<span class="truncate text-xs">Community</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>

		<NavInstance />

	</Sidebar.Header>


	<Sidebar.Content>
		<NavMain title="Node Content" items={data.nodeContent} />
		<NavMain title="Data Access" items={data.dataAccess} />
		<NavMain title="Node Management" items={data.nodeManagement} />
		<!-- <NavProjects projects={data.projects} /> -->
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>


	<Sidebar.Footer>

	</Sidebar.Footer>
</Sidebar.Root>
