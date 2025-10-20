import type * as monaco from "monaco-editor";
import { type SchemaStore } from "../schema";
import { DEFAULT_OPTIONS, type IntelliSenseOptions } from "../config";
import { getReplaceRange, getLinePrefix } from "../utils/range";
import { provideCompletions } from "../suggestions/completions";
import { registerHoverProvider } from "../features/hover";
import { registerSignatureHelp } from "../features/signature_help";

export function registerProviders(
    monaco: typeof import("monaco-editor"),
    store: SchemaStore,
    options: Required<IntelliSenseOptions> = DEFAULT_OPTIONS
) {
    const completion = monaco.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [".", " ", "(", ",", "*"],
        provideCompletionItems(model, position) {
            const range = getReplaceRange(model, position);
            const linePrefix = getLinePrefix(model, position);
            return provideCompletions(monaco, store, model, position, range, linePrefix, options.keywordCase);
        },
    });

    const hover = registerHoverProvider(monaco, store);
    const sig = registerSignatureHelp(monaco, store);

    return [completion, hover, sig];
}
