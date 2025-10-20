import type * as monaco from "monaco-editor";
import { type SchemaStore } from "../schema";
import { clauseAtCursor, inSelectList, hasFrom } from "../analysis/clause_detector";
import { scanAliasesInStatement, tablesInScope, parseSelectColumns } from "../analysis/scope";
import { keywordItems, joinSubtypeItems } from "./keywords";
import { fromLikeItems } from "./tables";
import { scalarFuncItems } from "./functions";
import { scopedColumnItems } from "./columns";
import { type KeywordCase } from "../config";

export function provideCompletions(
    monaco: typeof import("monaco-editor"),
    store: SchemaStore,
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    range: monaco.IRange,
    linePrefix: string,
    kwCase: KeywordCase
): monaco.languages.CompletionList {
    const schema = store.get();

    // Dot completion
    const dot = /([A-Za-z_][A-Za-z0-9_]*)\.\s*$/.exec(linePrefix);
    if (dot) {
        const { text: stmt } = getCurrentStatement(model, position);
        const aliases = scanAliasesInStatement(stmt);
        const token = dot[1];
        const owner = aliases[token] ?? token;
        let cols =
            schema.tables[owner] ?? schema.tableFunctions.find(f => f.name === owner)?.columns ?? [];
        return {
            suggestions: cols.map(c => ({
                label: c.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: c.name,
                detail: `(from ${token}) • ${c.data_type}`,
                sortText: "1" + c.name,
                range,
            })),
        };
    }

    const { text: stmt, cursorLocal } = getCurrentStatement(model, position);
    const clause = clauseAtCursor(stmt, cursorLocal);
    const aliases = scanAliasesInStatement(stmt);
    const scope = tablesInScope(stmt);

    // statement start
    const atStmtStart =
        /^\s*$/.test(linePrefix) ||
        /;\s*$/.test(model.getValue().slice(0, model.getOffsetAt(position)));
    if (atStmtStart) {
        return { suggestions: keywordItems(monaco, ["SELECT"], range, kwCase) };
    }

    const justAfterSelect = /\bSELECT\s*$/i.test(linePrefix) || /\bSELECT\s+$/i.test(linePrefix);

    switch (clause) {
        case "SELECT": {
            const items: monaco.languages.CompletionItem[] = [];
            if (!/\bSELECT\s+DISTINCT\b/i.test(stmt) && justAfterSelect) {
                items.push(...keywordItems(monaco, ["DISTINCT"], range, kwCase));
            }
            items.push(...scopedColumnItems(monaco, schema, aliases, scope, range));
            items.push({
                label: "*",
                kind: monaco.languages.CompletionItemKind.Operator,
                insertText: "*",
                sortText: "1*",
                range,
            });
            items.push(...scalarFuncItems(monaco, schema, range));

            const selectHasExpr = inSelectList(stmt, cursorLocal)
                ? /\S/.test(stmt.slice((/SELECT/i.exec(stmt)?.index ?? 0) + "SELECT".length, cursorLocal))
                : false;
            if (!hasFrom(stmt)) {
                items.unshift(...keywordItems(monaco, ["FROM"], range, kwCase));
            }
            return { suggestions: items };
        }
        case "FROM": {
            if (/\b(FROM)\s+[A-Za-z_0-9]*$/i.test(linePrefix) || /\bFROM\s*$/i.test(linePrefix)) {
                return { suggestions: [...fromLikeItems(monaco, schema, range), ...joinSubtypeItems(monaco, range, kwCase)] };
            }
            const next = keywordItems(monaco, ["WHERE", "JOIN", "GROUP BY", "ORDER BY"], range, kwCase);
            return { suggestions: [...fromLikeItems(monaco, schema, range), ...joinSubtypeItems(monaco, range, kwCase), ...next] };
        }
        case "WHERE": {
            const ops = keywordItems(monaco, ["AND", "OR", "IN", "BETWEEN", "LIKE", "EXISTS", "NOT"], range, kwCase);
            return { suggestions: [...scopedColumnItems(monaco, schema, aliases, scope, range), ...scalarFuncItems(monaco, schema, range), ...ops] };
        }
        case "GROUP_BY": {
            const selected = parseSelectColumns(stmt);
            const items: monaco.languages.CompletionItem[] = [];
            if (selected.length) {
                for (const lab of selected) {
                    items.push({
                        label: lab,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: lab,
                        detail: `(from SELECT)`,
                        sortText: "2sel_" + lab,
                        range,
                    });
                }
            } else {
                items.push(...scopedColumnItems(monaco, schema, aliases, scope, range));
            }
            items.push(...keywordItems(monaco, ["HAVING", "ORDER BY"], range, kwCase));
            return { suggestions: items };
        }
        case "HAVING": {
            return { suggestions: [...scopedColumnItems(monaco, schema, aliases, scope, range), ...scalarFuncItems(monaco, schema, range)] };
        }
        case "ORDER_BY": {
            const selected = parseSelectColumns(stmt);
            const items: monaco.languages.CompletionItem[] = [];
            if (selected.length) {
                for (const lab of selected) {
                    items.push({
                        label: lab,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: lab,
                        detail: `(from SELECT)`,
                        sortText: "2sel_" + lab,
                        range,
                    });
                }
            } else {
                items.push(...scopedColumnItems(monaco, schema, aliases, scope, range));
            }
            items.push(
                ...["ASC", "DESC"].map(k => ({
                    label: k,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: k,
                    sortText: "3" + k,
                    range,
                }))
            );
            return { suggestions: items };
        }
        default: {
            const common = keywordItems(monaco, ["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "JOIN", "ON"], range, kwCase);
            return { suggestions: [...common, ...fromLikeItems(monaco, schema, range), ...scalarFuncItems(monaco, schema, range), ...scopedColumnItems(monaco, schema, aliases, scope, range)] };
        }
    }
}

// small helper
function getCurrentStatement(model: monaco.editor.ITextModel, pos: monaco.Position) {
    const full = model.getValue();
    const cursor = model.getOffsetAt(pos);
    const start = full.lastIndexOf(";", cursor - 1) + 1 || 0;
    const endIdx = full.indexOf(";", cursor);
    const end = endIdx === -1 ? full.length : endIdx;
    return { text: full.slice(start, end), startOffset: start, cursorLocal: cursor - start };
}
