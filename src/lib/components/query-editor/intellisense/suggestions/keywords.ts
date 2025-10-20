import type * as monaco from "monaco-editor";
import { type KeywordCase } from "../config";

export const JOIN_SUBTYPES = ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "CROSS JOIN"] as const;

export function caseKW(s: string, mode: KeywordCase) {
    if (mode === "upper") return s.toUpperCase();
    if (mode === "lower") return s.toLowerCase();
    return s;
}

export function keywordItems(monaco: typeof import("monaco-editor"), kws: string[], range: monaco.IRange, kwCase: KeywordCase) {
    return kws.map(k => {
        const text = caseKW(k, kwCase);
        return {
            label: text,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: text + (k.endsWith("BY") || k === "AS" ? " " : " "),
            sortText: "0" + k,
            range,
        } as monaco.languages.CompletionItem;
    });
}

export function joinSubtypeItems(monaco: typeof import("monaco-editor"), range: monaco.IRange, kwCase: KeywordCase) {
    return (JOIN_SUBTYPES as readonly string[]).map(j => {
        const text = caseKW(j, kwCase);
        return {
            label: text,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: text + " ",
            sortText: "0J" + j,
            range,
        } as monaco.languages.CompletionItem;
    });
}
