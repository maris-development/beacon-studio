<script lang="ts">
	import { onMount } from 'svelte';
	import { loader } from '@monaco-editor/react';

	import * as monaco from 'monaco-editor';
	import '@/monaco/environment';

	loader.config({ monaco });

	loader.init().then(/* ... */);

    let editorContainer: HTMLDivElement;
	let editorInstance: monaco.editor.IStandaloneCodeEditor;

    let {
        sourceCode = $bindable(),
        width = '100%',
        height = '40vh',
        readOnly = false
    } = $props();

	onMount(() => {
		editorInstance = monaco.editor.create(editorContainer, {
			value: sourceCode,
			language: 'json',
			automaticLayout: true,
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			theme: 'vs-light',
			scrollBeyondLastLine: false,
			readOnly
		});

		editorInstance.onDidChangeModelContent(() => {
            // console.log('Content changed', editorInstance.getValue());
			sourceCode = editorInstance.getValue();
		});

		return () => editorInstance?.dispose();
	});

	$effect(() => {
		if (editorInstance && sourceCode !== editorInstance.getValue()) {
			editorInstance.setValue(sourceCode);
		}
	});
</script>

<div id="editor" bind:this={editorContainer}
    style="--width: {width}; --height: {height};"
></div>


<style lang="scss">
    #editor {
        flex: 1;
		width: var(--width);
        height: var(--height);
		min-height: 10ch;
		border-width: 1px;
		border-style: solid;
			border-radius: 0.5rem;
		overflow: hidden;
    }
</style>