<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import EasyQueryBuilder from '$lib/components/query-builder/easy-query-builder.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';

</script>

<div class="h-full">
	<Cookiecrumb crumbs={[
		{ label: 'Queries', href: '/queries' },
		{ label: 'Query Builder', href: '/queries/query-builder' }
	]} />
		

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
						<EasyQueryBuilder />
					</Card.Content>
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
