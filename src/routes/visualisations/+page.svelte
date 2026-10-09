<script lang="ts">
	import Card from '@/components/card/Card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { resolve } from '$app/paths';
	import { t } from '@/i18n';
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('visualisation.title') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('visualisation.title'), href: '/visualisations' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('visualisation.title')}</h1>

		<p>{$t('visualisation.intro')}</p>

		<div class="visualisation-functions">
			<Card href={resolve('/visualisations/map-viewer')}>
				<h3>{$t('map.title')}</h3>
				<p>{$t('visualisation.card.map')}</p>
			</Card>

			<Card href={resolve('/visualisations/table-explorer')}>
				<h3>{$t('table.title')}</h3>
				<p>{$t('visualisation.card.table')}</p>
			</Card>

			<Card href={resolve('/visualisations/chart-explorer')}>
				<h3>{$t('chart.title')}</h3>
				<p>{$t('visualisation.card.chart')}</p>
			</Card>
		</div>
	</div>
</div>

<style lang="scss">
	.visualisation-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
