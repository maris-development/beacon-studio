<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import ChooseBeaconModal from './modals/ChooseBeaconModal.svelte';
	import { currentBeaconInstance } from '$lib/stores/config';

	let currentBeaconInstanceValue = $state($currentBeaconInstance);
	let showChooseBeaconModal = $state(false);

	const sidebar = useSidebar();

	function pickInstanceIfNonePicked() {
		if (currentBeaconInstanceValue == null) {
			// If no current instance is set, set the first one
			openBeaconInstancePicker();
		}
	}

	function openBeaconInstancePicker() {
		showChooseBeaconModal = true;
	}

	function visitSourceCollection() {
		console.log('Visiting Source Collection');
		alert('Not implemented yet');
	}
</script>

{#if showChooseBeaconModal}
	<ChooseBeaconModal onClose={() => {
		showChooseBeaconModal = false;
		currentBeaconInstanceValue = $currentBeaconInstance;	
	}}/>
{/if}

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						onclick={pickInstanceIfNonePicked}
						{...props}
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<DatabaseIcon class="size-2" />
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{currentBeaconInstanceValue?.name ?? "No instance picked"}</span>
							<span class="truncate text-xs">{currentBeaconInstanceValue?.url ?? ""}</span>
						</div>
						<ChevronsUpDownIcon class="ml-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>

			<!-- content of the dropdown menu -->
			{#if currentBeaconInstanceValue != null}
				<DropdownMenu.Content
					class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
					side={sidebar.isMobile ? 'bottom' : 'right'}
					align="end"
					sideOffset={4}
				>
					<DropdownMenu.Item onSelect={openBeaconInstancePicker}>
						<DatabaseIcon />
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{currentBeaconInstanceValue.name}</span>
							<span class="truncate text-xs">{currentBeaconInstanceValue.url}</span>
							<span class="truncate text-xs">v1.0.3 - Community Edition</span>
						</div>
					</DropdownMenu.Item>

					<DropdownMenu.Separator />

					<DropdownMenu.Item onSelect={visitSourceCollection}>
						<EyeIcon />
						Visit Source Collection
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			{/if}

		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
