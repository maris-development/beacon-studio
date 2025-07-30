<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Card from '@/components/card/card.svelte';
	import EasyQueryBuilder from '$lib/components/query-builder/easy-query-builder.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
</script>

<div class="h-full">
	<Cookiecrumb
		crumbs={[
			{ label: 'Queries', href: '/queries' },
			{ label: 'Query Builder', href: '/queries/query-builder' }
		]}
	/>

	<div class="flex w-full flex-col gap-6 p-4">
		<Tabs.Root value="easy-builder" class="w-full">
			<Tabs.List class="self-center">
				<Tabs.Trigger value="easy-builder">Easy Builder</Tabs.Trigger>
				<Tabs.Trigger value="advanced-builder">Advanced Builder</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="easy-builder">
				<Card>
					{#snippet header()}
						<h2 class="title">Easy Query Builder</h2>
						<p class="description">
							Use this simple form to build your queries. It&apos;s great for quick tasks.
						</p>
					{/snippet}

					{#snippet content()}
						<div slot="content" >
							<EasyQueryBuilder />
						</div>
					{/snippet}
				</Card>

				
			</Tabs.Content>
			<Tabs.Content value="advanced-builder">
				<Card>
					{#snippet header()}
						<h2 class="title">Advanced Query Builder</h2>
						<p class="description">
							Use this advanced form to build more complex queries.
						</p>
					{/snippet}

					{#snippet content()}
						<div slot="content">
							<EasyQueryBuilder />
						</div>
					{/snippet}
				</Card>

			</Tabs.Content>
		</Tabs.Root>
	</div>
</div>
