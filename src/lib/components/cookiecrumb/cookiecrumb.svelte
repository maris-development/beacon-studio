<script lang="ts">
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import type { Snippet } from 'svelte';
	import HouseIcon from '@lucide/svelte/icons/house';

    export type Crumb = {
        label: string;
        href: string | undefined;
    }

    let {
		crumbs,
        children
	}: { crumbs?: Crumb[]; children?: Snippet } = $props();

</script>  

<Breadcrumb.Root flexChildren={children}>
    <Breadcrumb.List>
        <Breadcrumb.Item>
            <Breadcrumb.Link href="/">
                <HouseIcon size=1rem />
            </Breadcrumb.Link>
        </Breadcrumb.Item>

        {#each crumbs as crumb}
            <Breadcrumb.Item>
                <Breadcrumb.Link href={crumb.href ?? '#'}>{crumb.label}</Breadcrumb.Link>
            </Breadcrumb.Item>
        {/each}
    </Breadcrumb.List>
</Breadcrumb.Root>

<style lang="scss">
</style>