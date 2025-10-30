<script lang="ts">
	import { onMount } from 'svelte';
	import { loader } from '@monaco-editor/react';

	import * as monaco from 'monaco-editor';
	import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
	import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
	import { createSqlIntelliSense } from './intellisense';
	// import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
	// import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
	// import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

	self.MonacoEnvironment = {
		getWorker(_, label) {
			return new editorWorker();
		}
	};

	loader.config({ monaco });

	loader.init().then(/* ... */);

	let editorContainer: HTMLDivElement;
	let editorInstance: monaco.editor.IStandaloneCodeEditor;

	let { sourceCode = $bindable(), width = '100%', height = '90vh' } = $props();

	onMount(() => {
		editorInstance = monaco.editor.create(editorContainer, {
			value: sourceCode,
			language: 'sql',
			automaticLayout: true,
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			theme: 'vs-light',
			scrollBeyondLastLine: true,
			tabSize: 4,
			hover: {
				delay: 300,
				sticky: true,
				enabled: true,
				hidingDelay: 300
			}
		});

		const sql = createSqlIntelliSense({
			monaco,
			editor: editorInstance,
			fetchers: {
				// fetchTables: () => fetch('/api/tables').then((r) => r.json()),
				// fetchScalarFunctions: () => fetch('/api/functions/scalar').then((r) => r.json()),
				// fetchTableFunctions: () => fetch('/api/functions/table').then((r) => r.json())
				fetchTableFunctions: () => {
					return fetch('http://localhost:5001/api/table-functions').then((r) => r.json());
				},
				fetchScalarFunctions: () => {
					return fetch('http://localhost:5001/api/functions').then((r) => r.json());
				},
				fetchTables: () => {
					return fetch('http://localhost:5001/api/tables-with-schema').then((r) => r.json());
				}
			},
			options: { keywordCase: 'upper' } // "upper" | "lower" | "preserve"
		});

		editorInstance.onDidChangeModelContent(() => {
			// console.log('Content changed', editorInstance.getValue());
			sourceCode = editorInstance.getValue();
		});

		return () => editorInstance?.dispose();
	});
</script>

<div id="editor" bind:this={editorContainer} style="--width: {width}; --height: {height};"></div>

<style lang="scss">
	#editor {
		flex: 1;
		width: var(--width);
		height: var(--height);
		border-width: 1px;
		border-style: solid;
		border-radius: 0.5rem;
	}
</style>
