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

<AlertDialog.Root open={true}>
	<AlertDialog.Content class="max-h-[75%] min-h-[75%] max-w-[75%] min-w-[75%]">
		<AlertDialog.Header class="flex flex-row justify-between">
			<AlertDialog.Title>My Beacon Instances</AlertDialog.Title>
			<!-- <AlertDialog.Description>Browse through the cards arranged in rows.</AlertDialog.Description -->
			<!-- Add Button -->
			<Button variant="outline" size="icon" aria-label="Add new card">
				<PlusIcon class="h-5 w-5" />
			</Button>
		</AlertDialog.Header>
		<!-- <AlertDialog.Header>
			<AlertDialog.Title>Connect to a Beacon Instance</AlertDialog.Title>
			<AlertDialog.Description>
				Connect to a Beacon instance to start using the interface. You can connect to a local or
				remote instance.
			</AlertDialog.Description>
		</AlertDialog.Header> -->
		<div class="grid h-[60vh] grid-cols-4 gap-4 overflow-auto">
			{#each rows as row}
				<div class="col-span-1 space-y-4">
					{#each row.cards as card}
						<Card.Root>
							<Card.Header>
								<Card.Title>{card.title}</Card.Title>
								<Card.Description>{card.description}</Card.Description>
							</Card.Header>
							<Card.Content>
								<p>Content for {card.title}</p>
								<p>This is a placeholder for the card content.</p>
							</Card.Content>
							<Card.Footer>
								<Button variant="outline" size="sm">Test</Button>
							</Card.Footer>
						</Card.Root>
					{/each}
				</div>
			{/each}
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Action>Select</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

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
