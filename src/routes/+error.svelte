<script lang="ts">
	import { page } from '$app/state';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
</script>

<Cookiecrumb crumbs={[{ label: page.error.message, href: '#' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>Error: {page.error.message}</h1>
		<p>Please try again later or contact support if the issue persists.</p>
	</div>
</div>