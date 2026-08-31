<!--
 QueryWorkbench — the combined query builder + visualiser.

 Owns the single QueryWorkspace and lays out the always-visible top section:
     [A] action bar + [B] query blocks (selector-block)
 then a Build | Visualise mode switch whose content is the builder or the viewer.
 A + B stay visible in both modes.
-->

<script lang="ts">
    import { onMount } from 'svelte';
    import QuerySelectorHeader from './QuerySelectorHeader.svelte';
    import QueryWorkbenchPanes from './QueryWorkbenchPanes.svelte';
    import { page } from '$app/state';
    import { QueryWorkspace } from './QueryWorkspace.svelte';
    import { resolveUrlQuery } from '@/stores/query-library';
    import { getDefaultQueryActions } from './QueryActions';

	const workspace = $state(new QueryWorkspace());

    onMount(() => {
        // A deep-link opens one more block. `?q=` comes from "open in workbench"
        // and brings the saved builder state. `?query=` comes from a share link.
        workspace.openFromUrl(resolveUrlQuery(page.url));

        return () => workspace.destroy();
    });

    // const status = $derived(workspace.statusFor(workspace.activeBlock));

    const queryActions = $derived(getDefaultQueryActions(workspace));

</script>

<div class="workbench">
    <QuerySelectorHeader {workspace} {queryActions} />

    <QueryWorkbenchPanes {workspace} {queryActions} />

</div>

<style lang="scss">
	.workbench {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
