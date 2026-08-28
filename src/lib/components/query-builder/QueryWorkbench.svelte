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
    import { currentBeaconInstance } from '@/stores/config';
    import { BeaconClient } from '@/beacon-api/client';
    import { getDefaultQueryActions } from './QueryActions';
    import { replaceState } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { SHARE_LINK_PATH } from '@/stores/stored-query';

	const workspace = $state(new QueryWorkspace());
    let client: BeaconClient | null = $state(null);

    onMount(() => {
        const instance = $currentBeaconInstance;
        if (instance) client = BeaconClient.new(instance);
        
        const resolved = resolveUrlQuery(page.url);
        workspace.openFromUrl(resolved);
        
        if (resolved.query && !resolved.entry) {
            queueMicrotask(() => {
                replaceState(resolve('/queries/workbench'), page.state);
            });
        }
    
        return () => workspace.destroy();
    });

    // const status = $derived(workspace.statusFor(workspace.activeBlock));

    const queryActions = $derived(getDefaultQueryActions(workspace, client));

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
