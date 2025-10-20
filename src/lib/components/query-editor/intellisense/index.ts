import * as monacoNS from "monaco-editor";
import { DEFAULT_OPTIONS, type IntelliSenseOptions } from "./config";
import { loadSchema, makeSchemaStore, type SchemaStore } from "./schema";
import { registerProviders } from "./providers";
import { attachValidation } from "./features/validation";

export type Fetchers = import("./schema").Fetchers;
export type Schema = import("./schema").Schema;

export interface CreateOpts {
    monaco: typeof monacoNS;
    editor: monacoNS.editor.IStandaloneCodeEditor;
    fetchers: Fetchers;
    options?: IntelliSenseOptions;
}

export function createSqlIntelliSense({ monaco, editor, fetchers, options }: CreateOpts) {
    let disposables: { dispose(): void }[] = [];
    let store: SchemaStore;

    async function init() {
        const schema = await loadSchema(fetchers);
        store = makeSchemaStore(schema);
        const regs = registerProviders(monaco, store, options ?? DEFAULT_OPTIONS);
        const val = attachValidation(monaco, editor, store);
        disposables = [...regs, val].filter(Boolean) as any;
    }

    function dispose() {
        disposables.forEach(d => d?.dispose());
        disposables = [];
    }

    async function reloadSchema() {
        const schema = await loadSchema(fetchers);
        store.set(schema);
    }

    // initialize immediately
    // (callers can await init() if they want to ensure ready)
    const ready = init();

    return {
        ready,
        reloadSchema,
        dispose,
        getStore: () => store,
    };
}

export * from "./schema";
export * from "./config";
