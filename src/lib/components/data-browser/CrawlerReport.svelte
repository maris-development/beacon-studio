<script lang="ts">
	import type { CrawlReport } from '@/beacon-api/crawler-run';

	let { report, tableHref }: { report: CrawlReport; tableHref: (name: string) => string } =
		$props();
</script>

<div class="report">
	<p>Found {report.discovered} tables.</p>

	{#if report.created.length > 0}
		<p>
			<strong>Created:</strong>
			{#each report.created as name, index (index)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- tableHref resolves the path -->
				{#if index > 0},
				{/if}<a href={tableHref(name)}>{name}</a>
			{/each}
		</p>
	{/if}

	{#if report.updated.length > 0}
		<p>
			<strong>Updated:</strong>
			{#each report.updated as name, index (index)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- tableHref resolves the path -->
				{#if index > 0},
				{/if}<a href={tableHref(name)}>{name}</a>
			{/each}
		</p>
	{/if}

	{#if report.skipped.length > 0}
		<p>
			<strong>Skipped (owned by another crawler or made by hand):</strong>
			{report.skipped.join(', ')}
		</p>
	{/if}

	{#if report.failed.length > 0}
		<div class="failed">
			<strong>Failed:</strong>
			<ul>
				<!-- The server can list one table more than once. -->
				{#each report.failed as [name, reason], index (index)}
					<li><span class="name">{name}</span>: {reason}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if report.skippedFiles > 0}
		<p class="muted">{report.skippedFiles} files matched no format.</p>
	{/if}
</div>

<style lang="scss">
	.report {
		margin-top: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.375rem;
		background: var(--secondary);
		font-size: var(--font-size-sm);

		p {
			margin: 0 0 0.375rem;
		}
	}

	.failed {
		color: var(--destructive);

		ul {
			margin: 0.25rem 0 0;
			padding-left: 1.25rem;
		}
	}

	.muted {
		color: var(--muted-foreground);
	}
</style>
