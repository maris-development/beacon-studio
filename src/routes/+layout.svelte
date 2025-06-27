<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
</script>

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
	.nav-bar {
		background-color: #222;
		padding: 1rem;

		.nav-list {
			list-style: none;
			display: flex;
			gap: 1.5rem;
			margin: 0;
			padding: 0;

			.nav-item {
				a {
					color: #fff;
					text-decoration: none;
					font-weight: 500;

					&:hover {
						text-decoration: underline;
					}
				}
			}
		}
	}

	.main-content {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
</style>
