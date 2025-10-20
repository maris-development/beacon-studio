import type * as monaco from "monaco-editor";
import { type SchemaStore } from "../schema";

export function registerSignatureHelp(monaco: typeof import("monaco-editor"), store: SchemaStore) {
    return monaco.languages.registerSignatureHelpProvider("sql", {
        signatureHelpTriggerCharacters: ["(", ",", ")"],
        provideSignatureHelp(model, position) {
            const schema = store.get();
            const { text: stmt, cursorLocal } = getCurrentStatement(model, position);
            const upto = stmt.slice(0, cursorLocal);
            const m = /([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*[^()]*$/i.exec(upto);
            if (!m) return null;
            const name = m[1];

            const fn =
                schema.scalarFunctions.find(f => f.function_name.toUpperCase() === name.toUpperCase()) ??
                schema.tableFunctions.find(f => f.function_name.toUpperCase() === name.toUpperCase());
            if (!fn) return null;

            const lastParen = upto.lastIndexOf("(");
            const argsPart = upto.slice(lastParen + 1);
            let activeParam = 0; for (const ch of argsPart) if (ch === ",") activeParam++;

            const params = (fn.params ?? []).map(p => ({ label: `${p.name}: ${p.data_type}${p.optional ? "?" : ""}` }));

            return {
                value: {
                    signatures: [{ label: `${fn.function_name}(${(fn.params ?? []).map(p => `${p.name}: ${p.data_type}${p.optional ? "?" : ""}`).join(", ")})`, parameters: params }],
                    activeSignature: 0,
                    activeParameter: Math.min(activeParam, Math.max(0, params.length - 1)),
                },
                dispose: () => { },
            };
        },
    });
}

function getCurrentStatement(model: monaco.editor.ITextModel, pos: monaco.Position) {
    const full = model.getValue();
    const cursor = model.getOffsetAt(pos);
    const start = full.lastIndexOf(";", cursor - 1) + 1 || 0;
    const endIdx = full.indexOf(";", cursor);
    const end = endIdx === -1 ? full.length : endIdx;
    return { text: full.slice(start, end), startOffset: start, cursorLocal: cursor - start };
}
