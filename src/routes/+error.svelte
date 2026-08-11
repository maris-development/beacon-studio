<script lang="ts">
	import { page } from '$app/state';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
</script>

<Cookiecrumb crumbs={[{ label: page.error.message, href: '#' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h2>Error: {page.error.message}</h2>
		<p>Please try again later or contact support if the issue persists.</p>
	</div>
</div>