import type * as monaco from "monaco-editor";
import { type Schema } from "../schema";

export function fromLikeItems(
    monaco: typeof import("monaco-editor"),
    schema: Schema,
    range: monaco.IRange
): monaco.languages.CompletionItem[] {
    const out: monaco.languages.CompletionItem[] = [];
    for (const t of Object.keys(schema.tables)) {
        out.push({
            label: t,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t,
            sortText: "1" + t,
            range,
        });
    }
    for (const f of schema.tableFunctions) {
        out.push({
            label: f.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: f.name + makeFunctionSnippet(f.params),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: `(table function) ${signatureLabel(f.name, f.params)}`,
            sortText: "1tf" + f.name,
            range,
        });
    }
    return out;
}

function makeFunctionSnippet(params?: { name: string }[]) {
    if (!params || params.length === 0) return "()";
    return "(" + params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ") + ")";
}
function signatureLabel(name: string, params?: { name: string; type?: string; optional?: boolean }[]) {
    const ps = (params ?? []).map(p => `${p.name}${p.optional ? "?" : ""}`).join(", ");
    return `${name}(${ps})`;
}
