<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="page-container">
	<h2>Error: {page.error.message}</h2>
	<p>Please try again later or contact support if the issue persists.</p>
</div>