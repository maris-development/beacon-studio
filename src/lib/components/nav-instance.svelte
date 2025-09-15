<script lang="ts">
	// Icons
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import DatabaseIcon from '@lucide/svelte/icons/database';

	// UI components
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import ChooseBeaconModal from './modals/ChooseBeaconModal.svelte';

	// Stores and types
	import { currentBeaconInstance, beaconInstances, type BeaconInstance } from '$lib/stores/config';

	// Svelte lifecycle and navigation
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
  	import { base } from '$app/paths';

	// State variables
	let currentBeaconInstanceValue: BeaconInstance | null = null; // holds the selected beacon instance
	let showChooseBeaconModal: boolean = false; // controls visibility of the picker modal
	let instancesList: BeaconInstance[] = [];

	const sidebar = useSidebar(); // custom sidebar hook from your UI library

	/**
	 * If no instance is picked yet, open the picker modal
	 */
	function pickInstanceIfNonePicked(): void {
		if (currentBeaconInstanceValue == null) {
			openBeaconInstancePicker();
		}
	}

	/**
	 * Show the modal to choose a beacon instance
	 */
	function openBeaconInstancePicker(): void {
		console.log('Opening Beacon Instance Picker');
		showChooseBeaconModal = true;
	}

	/**
	 * Placeholder for visiting source collection feature
	 */
	function visitSourceCollection(): void {
		console.log('Visiting Source Collection');
		alert('Not implemented yet');
	}

	/**
	 * If no instances exist and none selected, redirect to home
	 */
	function checkAndRedirect(): void {
		if (currentBeaconInstanceValue == null && instancesList.length === 0) {
			goto(`${base}/`); // Redirect to home page to set up an instance
		}
	}

	// Subscribe to stores after component mounts
	onMount(() => {
		let unsubInstances: () => void;
		let unsubCurrent: () => void;

		// subscribe to list of all beacon instances
		unsubInstances = beaconInstances.subscribe((list) => {
			instancesList = list;
			checkAndRedirect();
		});

		// subscribe to the currently selected instance
		unsubCurrent = currentBeaconInstance.subscribe((value) => {
			currentBeaconInstanceValue = value;
			checkAndRedirect();
		});

		

		// cleanup subscriptions when component is destroyed
		onDestroy(() => {
			unsubInstances();
			unsubCurrent();
		});
	});
</script>

{#if showChooseBeaconModal}
	<ChooseBeaconModal
		onClose={() => {
			showChooseBeaconModal = false;
			currentBeaconInstanceValue = $currentBeaconInstance;
		}}
	/>
{/if}

<Sidebar.Menu>
	<Sidebar.GroupLabel>Connected Beacon Instance</Sidebar.GroupLabel>

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
							<span class="truncate font-medium"
								>{currentBeaconInstanceValue?.name ?? 'No instance picked'}</span
							>
							<span class="truncate text-xs">{currentBeaconInstanceValue?.url ?? ''}</span>
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
