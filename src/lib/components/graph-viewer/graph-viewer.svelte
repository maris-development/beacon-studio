<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import * as ApacheArrow from 'apache-arrow';
	import { cn } from "$lib/utils.js";

    import "@finos/perspective-viewer/dist/css/themes.css";
    
    // Engine + viewer
    import perspective, { type Client } from "@finos/perspective";
    import perspective_viewer from "@finos/perspective-viewer";

    // Register plugins (datagrid + d3 charts)
    import "@finos/perspective-viewer-datagrid";
    import "@finos/perspective-viewer-d3fc";
    import "@finos/perspective-viewer-openlayers";

    // WASM binaries as URLs (Vite `?url`)
    import SERVER_WASM from "@finos/perspective/dist/wasm/perspective-server.wasm?url";
    import CLIENT_WASM from "@finos/perspective-viewer/dist/wasm/perspective-viewer.wasm?url";

	let { 
        table,
        class: className
     }: { table: ApacheArrow.Table | null, class?: string } = $props();

    
    let viewerEl: HTMLElement;            // <perspective-viewer> ref
    let client: Client;                // Perspective Client (worker)
    let perspectiveTable: any;
    let viewConfig: any = { 
        title: "Query result",
        plugin: "Datagrid", 
        settings: false,
    
    };


    onMount(async () => {
         // 1) Initialize the WASM modules (server + client)
        await Promise.all([
            perspective.init_server(fetch(SERVER_WASM)),
            perspective_viewer.init_client(fetch(CLIENT_WASM)),
        ]);

        // 2) Start a dedicated Web Worker and get a Client connection
        client = await perspective.worker(); // browser worker client per docs. :contentReference[oaicite:2]{index=2}

    });
    
    onDestroy(async () => {
        // Clean up WASM/worker resources to avoid leaks
        try {
            // @ts-ignore
            await viewerEl?.delete?.();  // free viewer-side resources (WASM). :contentReference[oaicite:3]{index=3}
        } catch {}
        try {
            await client?.terminate?.(); // terminate Worker Client cleanly. :contentReference[oaicite:4]{index=4}
        } catch {}
    });


    $effect(() => {
        if(table) {
            drawChart();
        }
    })


	async function drawChart() {
		if (!viewerEl) return console.warn('viewerEl is not defined');

        if(!client){
            return setTimeout(drawChart, 100);
        }

		try {
			console.log('viewerEl', viewerEl);

            const buffer: ArrayBuffer = ApacheArrow.tableToIPC(table).buffer as ArrayBuffer;

            perspectiveTable = await client.table(buffer);

            await tick();

            // @ts-ignore
            await viewerEl.load?.(perspectiveTable);
            
            // @ts-ignore (custom element methods are async)
            await viewerEl.restore?.(viewConfig);

		} catch (err) {
			console.error('Perspective draw failed:', err);
		} 
	}
</script>

<perspective-viewer class={cn("w-full h-full", className)} bind:this={viewerEl}></perspective-viewer>


<style lang="scss">
    perspective-viewer {
        border-radius: 0.625rem;
		padding: 1.5rem;
		box-shadow: var(--shadow-sm);
		border-style: var(--tw-border-style);
		border-width: 1px;
		color: var(--foreground);
        overflow: hidden;
    }
</style>