<script lang="ts">
	import type { CompiledQuery } from "@/beacon-api/types";
	import FileCodeCornerIcon from '@lucide/svelte/icons/file-code-corner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { addToast } from "@/stores/toasts";
	import { Utils } from "@/utils";
	import { PythonQueryBuilder, QueryBuilder } from "@/beacon-api/query";


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

		let pythonCode: string;

		try {
			pythonCode = PythonQueryBuilder.toPythonCode(compiledQuery);

		} catch (error) {
			console.error('Error generating Python code:', error);
			
			addToast({
				message: `Error generating Python code: ${error.message}`,
				type: 'error'
			});
			
			return;
		}

		try {
			if(!pythonCode){
				return;
			}

			Utils.copyToClipboard(pythonCode);

			addToast({
				message: 'Python code copied to clipboard',
				type: 'success'
			});
		} catch (error) {
			console.error('Error copying Python code to clipboard:', error);

			addToast({
				message: `Error copying Python code to clipboard: ${error.message}`,
				type: 'error'
			});

			return;
		}
    }

</script>

<Button onclick={handleCopyQuery}>
    Copy Python code
    <FileCodeCornerIcon />
</Button>