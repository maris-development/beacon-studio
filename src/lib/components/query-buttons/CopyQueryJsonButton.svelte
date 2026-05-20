<script lang="ts">
	import type { CompiledQuery } from "@/beacon-api/types";
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import { Button } from '$lib/components/ui/button/index.js';
	import { addToast } from "@/stores/toasts";
	import { Utils } from "@/utils";


	let {
		compileQuery
	}: {
		compileQuery: () => CompiledQuery;
	} = $props();


    function handleCopyQuery(){
        let compiledQuery: CompiledQuery;

		try {
			compiledQuery = compileQuery();
		} catch (error) {
			
			console.error('Error compiling query:', error);

			addToast({
				message: `Error compiling query: ${error.message}`,
				type: 'error'
			});
			return;
		}

		let queryJson = JSON.stringify(compiledQuery, null, 2);

		Utils.copyToClipboard(queryJson);

		addToast({
			message: 'Query JSON copied to clipboard',
			type: 'success'
		});

    }

</script>

<Button onclick={handleCopyQuery}>
    Copy query JSON
    <FileJson2Icon />
</Button>