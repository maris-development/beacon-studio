<!--
	Monaco in SQL mode. Each tab has its own model, so each tab keeps its own undo history.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as monaco from 'monaco-editor';
	import '@/monaco/environment';
	import type { CompletionEntry, CompletionKind } from '@/sql/completion';

	type Props = {
		tabId: string;
		value: string;
		tabIds: string[];
		completions: CompletionEntry[];
		onChange: (tabId: string, sql: string) => void;
		onRun: () => void;
	};

	let { tabId, value, tabIds, completions, onChange, onRun }: Props = $props();

	let container: HTMLDivElement;
	let editor = $state.raw<monaco.editor.IStandaloneCodeEditor | null>(null);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- models are not view state
	const models = new Map<string, monaco.editor.ITextModel>();

	const KIND: Record<CompletionKind, monaco.languages.CompletionItemKind> = {
		table: monaco.languages.CompletionItemKind.Struct,
		column: monaco.languages.CompletionItemKind.Field,
		function: monaco.languages.CompletionItemKind.Function,
		keyword: monaco.languages.CompletionItemKind.Keyword
	};

	function modelFor(id: string, text: string): monaco.editor.ITextModel {
		let model = models.get(id);

		if (!model) {
			const created = monaco.editor.createModel(text, 'sql');
			created.onDidChangeContent(() => onChange(id, created.getValue()));
			models.set(id, created);
			model = created;
		}

		return model;
	}

	export function selectedText(): string {
		const selection = editor?.getSelection();
		const model = editor?.getModel();
		if (!selection || !model || selection.isEmpty()) return '';

		return model.getValueInRange(selection);
	}

	export function insert(text: string): void {
		const selection = editor?.getSelection();
		if (!editor || !selection) return;

		editor.executeEdits('catalogue', [{ range: selection, text, forceMoveMarkers: true }]);
		editor.focus();
	}

	onMount(() => {
		const created = monaco.editor.create(container, {
			model: modelFor(tabId, value),
			automaticLayout: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			fontSize: 13,
			theme: 'vs'
		});

		created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun());

		// The provider is global for the `sql` language, so it answers for this editor only.
		const provider = monaco.languages.registerCompletionItemProvider('sql', {
			provideCompletionItems(model, position) {
				if (model !== created.getModel()) return { suggestions: [] };

				const word = model.getWordUntilPosition(position);
				const range = new monaco.Range(
					position.lineNumber,
					word.startColumn,
					position.lineNumber,
					word.endColumn
				);

				const suggestions = completions.map((entry) => {
					let insertTextRules: monaco.languages.CompletionItemInsertTextRule | undefined;
					if (entry.snippet) {
						insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
					}

					let documentation: monaco.IMarkdownString | undefined;
					if (entry.documentation) documentation = { value: entry.documentation };

					return {
						label: entry.label,
						kind: KIND[entry.kind],
						insertText: entry.insertText,
						insertTextRules,
						detail: entry.detail,
						documentation,
						range
					};
				});

				return { suggestions };
			}
		});

		editor = created;

		return () => {
			provider.dispose();
			created.dispose();
			for (const model of models.values()) model.dispose();
			models.clear();
			editor = null;
		};
	});

	// A tab switch swaps the model. The tab SQL seeds a new model only.
	$effect(() => {
		const id = tabId;
		if (!editor) return;

		const model = modelFor(
			id,
			untrack(() => value)
		);
		if (editor.getModel() !== model) editor.setModel(model);
	});

	// The model of a closed tab goes away.
	$effect(() => {
		const keep = new Set(tabIds);

		for (const [id, model] of models) {
			if (!keep.has(id)) {
				model.dispose();
				models.delete(id);
			}
		}
	});
</script>

<div class="sql-editor" bind:this={container}></div>

<style lang="scss">
	.sql-editor {
		width: 100%;
		height: 100%;
		min-height: 8rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		overflow: hidden;
	}
</style>
