<script lang="ts">
	import { onMount } from 'svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
</script>

<div class="h-full">
	<div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Queries</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/docs/components">Builder</Breadcrumb.Link>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>

	<div class="flex w-full flex-col gap-6 p-4">
		<Tabs.Root value="easy-builder" class="w-full">
			<Tabs.List class="self-center">
				<Tabs.Trigger value="easy-builder">Easy Builder</Tabs.Trigger>
				<Tabs.Trigger value="advanced-builder">Advanced Builder</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="easy-builder">
				<Card.Root>
					<Card.Header>
						<Card.Title>Easy Query Builder</Card.Title>
						<Card.Description>
							Use this simple form to build your queries. It&apos;s great for quick tasks.
						</Card.Description>
					</Card.Header>
					<Card.Content class="grid gap-6">
						<!-- <div class="grid gap-3">
							<Label for="tabs-demo-name">Name</Label>
							<Input id="tabs-demo-name" value="Pedro Duarte" />
						</div>
						<div class="grid gap-3">
							<Label for="tabs-demo-username">Username</Label>
							<Input id="tabs-demo-username" value="@peduarte" />
						</div> -->
					</Card.Content>
					<Card.Footer>
						<Button>Query</Button>
					</Card.Footer>
				</Card.Root>
			</Tabs.Content>
			<Tabs.Content value="advanced-builder">
				<Card.Root>
					<Card.Header>
						<Card.Title>Advanced Query Builder</Card.Title>
						<Card.Description>
							Use this advanced form to build more complex queries.
						</Card.Description>
					</Card.Header>
					<Card.Content class="grid gap-6">
						<!-- <div class="grid gap-3">
							<Label for="tabs-demo-current">Current password</Label>
							<Input id="tabs-demo-current" type="password" />
						</div>
						<div class="grid gap-3">
							<Label for="tabs-demo-new">New password</Label>
							<Input id="tabs-demo-new" type="password" />
						</div> -->
					</Card.Content>
					<Card.Footer>
						<Button>Query</Button>
					</Card.Footer>
				</Card.Root>
			</Tabs.Content>
		</Tabs.Root>
	</div>
</div>
