import type * as monaco from "monaco-editor";
import { type Schema } from "../schema";

export function scalarFuncItems(
    monaco: typeof import("monaco-editor"),
    schema: Schema,
    range: monaco.IRange
): monaco.languages.CompletionItem[] {
    return schema.scalarFunctions.map(f => ({
        label: f.function_name,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: f.function_name + makeFunctionSnippet(f.params),
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: signatureLabel(f.function_name, f.params) + ` → ${f.return_type}`,
        sortText: "3f" + f.function_name,
        range,
    }));
}

function makeFunctionSnippet(params?: { name: string, data_type: string, optional?: boolean }[]) {
    if (!params || params.length === 0) return "()";
    return "(" + params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ") + ")";
}
function signatureLabel(name: string, params?: { name: string; data_type: string; optional?: boolean }[]) {
    const ps = (params ?? []).map(p => `${p.name}: ${p.data_type}${p.optional ? "?" : ""}`).join(", ");
    return `${name}(${ps})`;
}
