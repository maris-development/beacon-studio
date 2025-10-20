import type * as monaco from "monaco-editor";
import { type Schema } from "../schema";

export function scopedColumnItems(
    monaco: typeof import("monaco-editor"),
    schema: Schema,
    aliases: Record<string, string>,
    scopeTables: string[],
    range: monaco.IRange
): monaco.languages.CompletionItem[] {
    const items: monaco.languages.CompletionItem[] = [];
    const rev: Record<string, string[]> = {};
    Object.entries(aliases).forEach(([al, t]) => (rev[t] ??= []).push(al));
    const tablesToUse = scopeTables.length ? scopeTables : Object.keys(schema.tables);

    for (const t of tablesToUse) {
        for (const c of schema.tables[t] ?? []) {
            const lbl = (rev[t]?.[0]) || t;
            items.push({
                label: c.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: c.name,
                detail: `(from ${lbl}) • ${c.data_type}`,
                sortText: "2" + lbl + "_" + c.name,
                range,
            });
        }
        const tvf = schema.tableFunctions.find(f => f.name === t);
        if (tvf) {
            const lbl = (rev[t]?.[0]) || t;
            for (const c of tvf.columns) {
                items.push({
                    label: c.name,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: c.name,
                    detail: `(from ${lbl}) • ${c.data_type}`,
                    sortText: "2" + lbl + "_" + c.name,
                    range,
                });
            }
        }
    }
    return items;
}
