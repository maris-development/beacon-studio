<script lang="ts">
	import { onMount } from 'svelte';
	import { loader } from '@monaco-editor/react';

	import * as monaco from 'monaco-editor';
	import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
	import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
	// import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
	// import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
	// import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

	self.MonacoEnvironment = {
		getWorker(_, label) {
			if (label === 'json') {
				return new jsonWorker();
			}
			// if (label === 'css' || label === 'scss' || label === 'less') {
			// 	return new cssWorker();
			// }
			// if (label === 'html' || label === 'handlebars' || label === 'razor') {
			// 	return new htmlWorker();
			// }
			// if (label === 'typescript' || label === 'javascript') {
			// 	return new tsWorker();
			// }
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
			language: 'json',
			automaticLayout: true,
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			theme: 'vs-light',
			scrollBeyondLastLine: true
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
		overflow: hidden;
	}
</style>
