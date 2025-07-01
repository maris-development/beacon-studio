<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';

	// Example data: 3 rows, each with 4 cards
	const rows = Array.from({ length: 4 }, (_, rowIndex) => ({
		id: rowIndex,
		cards: Array.from({ length: 4 }, (_, cardIndex) => ({
			id: cardIndex,
			title: `Card ${rowIndex * 4 + cardIndex + 1}`,
			description: `Description for card ${rowIndex * 4 + cardIndex + 1}`
		}))
	}));
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		<main class="main-content">
			<!-- this is where the current page’s +page.svelte will render -->
			<slot />
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

<style lang="scss">
	.main-content {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
</style>
