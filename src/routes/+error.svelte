<script lang="ts">
	import { page } from '$app/state';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { t } from '@/i18n';
</script>

<Cookiecrumb crumbs={[{ label: page.error.message, href: '#' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('errorPage.title', { message: page.error.message })}</h1>
		<p>{$t('errorPage.hint')}</p>
	</div>
</div>