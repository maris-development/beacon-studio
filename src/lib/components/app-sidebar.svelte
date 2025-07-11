<script lang="ts" module>
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import BotIcon from '@lucide/svelte/icons/bot';
	import MapIcon from '@lucide/svelte/icons/map';
	import FrameIcon from '@lucide/svelte/icons/frame';
	import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
	import SendIcon from '@lucide/svelte/icons/send';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';

	const data = {
		instance: {
			host: 'https://beacon-argo.maris.nl',
			name: 'Beacon Euro Argo',
			description: 'Beacon Instance running on top of the Euro Argo Fleet collection'
		},
		navMain: [
			{
				title: 'Queries',
				url: '#',
				icon: SquareTerminalIcon,
				isActive: true,
				items: [
					{
						title: 'Builder',
						url: '/query-builder'
					},
					{
						title: 'Editor',
						url: '/query-editor'
					}
				]
			},
			{
				title: 'Data Browser',
				url: '/data-browser',
				icon: SquareTerminalIcon,
				isActive: true,
				items: [
					{
						title: 'Datasets',
						url: '/data-browser/datasets'
					},
					{
						title: 'Data Tables',
						url: '/data-browser/data-tables'
					},
					// { // not needed for now
					// 	title: 'Settings',
					// 	url: '/data-browser/settings'
					// }
				]
			},
			{
				title: 'Map Viewer',
				url: '/map',
				icon: MapIcon
			},
			{
				title: 'System Info',
				url: '#',
				icon: FrameIcon
			},
			{
				title: 'Settings',
				url: '#',
				icon: Settings2Icon
			}
		],
		navSecondary: [
			{
				title: 'Documentation',
				url: '#',
				icon: BookOpenIcon
			},
			{
				title: 'Support',
				url: '#',
				icon: LifeBuoyIcon
			},
			{
				title: 'Feedback',
				url: '#',
				icon: SendIcon
			}
		]
	};
</script>

<script lang="ts">
	import NavMain from './nav-main.svelte';
	import NavProjects from './nav-projects.svelte';
	import NavSecondary from './nav-secondary.svelte';
	import NavUser from './nav-user.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import DatabaseZapIcon from '@lucide/svelte/icons/database-zap';
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
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={data.navMain} />
		<!-- <NavProjects projects={data.projects} /> -->
		<NavSecondary items={data.navSecondary} class="mt-auto" />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>
