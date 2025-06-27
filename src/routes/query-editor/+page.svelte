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
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import CirclePlayIcon from '@lucide/svelte/icons/circle-play';
	import SearchCodeIcon from '@lucide/svelte/icons/search-code';
	import TestTubeIcon from '@lucide/svelte/icons/test-tube';

	import { Button } from '$lib/components/ui/button/index.js';

	export let breadcrumbs: { label: string; href: string }[] = [];

	const handleAnalyze = () => console.log('Analyze action triggered');
	const handleExecute = () => console.log('Execute action triggered');
	const handleInfo = () => console.log('Info action triggered');
</script>

<div class="h-full">
	<div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Queries</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/docs/components">Editor</Breadcrumb.Link>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<!-- Left: Shadcn Breadcrumbs -->
		<!-- <Breadcrumbs>
			{#each breadcrumbs as { label, href }, i}
				<BreadcrumbItem {href} current={i === breadcrumbs.length - 1}>
					{label}
				</BreadcrumbItem>
			{/each}
		</Breadcrumbs> -->

		<!-- Right: Shadcn Buttons -->
		<div class="actions">
			<Button variant="default" size="sm">
				<TestTubeIcon />
				Query Plan
			</Button>
			<Button variant="default" size="sm">
				<SearchCodeIcon />
				Analyze
			</Button>
			<Button variant="default" size="sm">
				<CirclePlayIcon />
				Run
			</Button>
		</div>
	</div>
	<div id="editor" class="!h-[90vh]"></div>
</div>

<style>
	:global(body) {
		margin: 0;
	}
	#editor {
		width: 100%;
		height: 100vh;
	}
</style>
