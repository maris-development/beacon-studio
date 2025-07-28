<script lang="ts">
	import { onMount } from 'svelte';

	const sourceCode = `{
    "query_parameters": [
        {
            "column_name": "TIME"
        },
        {
            "column_name": "DOXY"
        },
        {
            "column_name": "DEPH"
        },
        {
            "column_name": "LONGITUDE"
        },
        {
            "column_name": "LATITUDE"
        }
    ],
    "filters": [
        {
            "for_query_parameter": "TIME",
            "min": "2019-11-01T00:00:00",
            "max": "2020-11-30T00:00:00"
        },
        {
            "for_query_parameter": "DEPH",
            "min": 0,
            "max": 5
        }
    ],
    "output": {
        "format": "parquet"
    }
}`;

	onMount(() => {
		let scriptElement = document.createElement('script');
		scriptElement.setAttribute(
			'src',
			'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.40.0/min/vs/loader.min.js'
		);
		document.body.appendChild(scriptElement);

		scriptElement.addEventListener('load', () => {
			require.config({
				paths: {
					vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.40.0/min/vs'
				}
			});

			require(['vs/editor/editor.main'], () => {
				let editorInstance = monaco.editor.create(document.getElementById('editor'), {
					value: sourceCode,
					language: 'json',
					automaticLayout: true,
					overviewRulerLanes: 0,
					overviewRulerBorder: false,
					theme: 'vs-light',
					scrollBeyondLastLine: false
				});

				// Add event listener for value changes
				editorInstance.onDidChangeModelContent(() => {
					const updatedSourceCode = editorInstance.getValue();
					console.log({ updatedSourceCode });
				});
				// Monaco Editor also have several others interesting events to explore such as
				// onDidChangeCursorPosition, onDidChangeCursorSelection, onDidFocusEditor, onDidBlurEditor,
				// onKeyDown, onKeyUp, onMouseDown, onMouseUp, onDidChangeModelLanguage, onDidChangeModel,
				// onDidDisposeModel
			});
		});
	});
	/**
	 * TopBar component (using shadcn-svelte)
	 * Props:
	 *  - breadcrumbs: Array<{ label: string; href: string }>;
	 */
	import CirclePlayIcon from '@lucide/svelte/icons/circle-play';
	import SearchCodeIcon from '@lucide/svelte/icons/search-code';
	import TestTubeIcon from '@lucide/svelte/icons/test-tube';

	import { Button } from '$lib/components/ui/button/index.js';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';

	const handleAnalyze = () => console.log('Analyze action triggered');
	const handleExecute = () => console.log('Execute action triggered');
	const handleInfo = () => console.log('Info action triggered');
</script>

<div class="h-full">
	
	
	<Cookiecrumb crumbs={[
		{ label: 'Queries', href: '/queries' },
		{ label: 'Query Editor', href: '/queries/query-editor' }
	]} >

		<!-- Right: Shadcn Buttons -->
		<div class="actions">
			<Button variant="default" size="sm" onclick={handleInfo}>
				<TestTubeIcon />
				Query Plan
			</Button>
			<Button variant="default" size="sm" onclick={handleAnalyze}>
				<SearchCodeIcon />
				Analyze
			</Button>
			<Button variant="default" size="sm" onclick={handleExecute}>
				<CirclePlayIcon />
				Run
			</Button>
		</div>
	</Cookiecrumb>



	


	<div id="editor" class="!h-[90vh]"></div>
</div>

<style>
	#editor {
		width: 100%;
		height: 100vh;
	}
</style>
