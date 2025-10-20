import type * as monaco from "monaco-editor";
import { type SchemaStore } from "../schema";
import { scanAliasesInStatement, tablesInScope } from "../analysis/scope";
import { KEYWORD_DOCS, MULTIWORD_KEYWORDS } from "./keyword_docs";

// Register the SQL hover provider
export function registerHoverProvider(monacoNS: typeof import("monaco-editor"), store: SchemaStore) {
    return monacoNS.languages.registerHoverProvider("sql", {
        provideHover(model, position) {
            const schema = store.get();

            const { text: stmt } = getCurrentStatement(model, position);
            const aliases = scanAliasesInStatement(stmt);

            // 1) If keyword: show short doc
            const kw = resolveKeywordAtPosition(model, position);
            if (kw) {
                const doc = KEYWORD_DOCS[kw.toUpperCase()];
                if (doc) {
                    return { contents: [{ value: `**${kw.toUpperCase()}**` }, { value: doc }] };
                }
            }

            // 2) Table / alias hover
            const word = model.getWordAtPosition(position)?.word || "";
            if (word) {
                // Alias → table?
                const tableName = aliases[word] ?? word;

                // a) Real table
                const tableCols = schema.tables[tableName];
                if (tableCols) {
                    const md = tableCols
                        .map((c) => `- \`${c.name}\`: \`${c.data_type}\`${c.nullable ? " (nullable)" : ""}`)
                        .join("\n");
                    return {
                        contents: [
                            { value: `**${aliases[word] ? `${word} (alias of ${tableName})` : tableName}**` },
                            { value: md || "_No columns_" },
                        ],
                    };
                }

                // b) Table-valued function (treated as table in FROM/JOIN)
                const tvf = schema.tableFunctions.find((f) => f.name === tableName);
                if (tvf) {
                    const md = tvf.columns.map((c) => `- \`${c.name}\`: \`${c.data_type}\``).join("\n");
                    const sig = `**${tvf.name}**(${(tvf.params ?? []).map((p) => p.name).join(", ")})`;
                    return { contents: [{ value: sig }, { value: "_table function_" }, { value: md || "_No columns_" }] };
                }
            }
            // 3) Column hover (qualified & unqualified)
            //    Try to resolve forms: alias.col | table.col | bare col
            const lineText = model.getLineContent(position.lineNumber);
            const before = lineText.slice(0, position.column - 1);
            const after = lineText.slice(position.column - 1);

            // 3a) Qualified: <owner>.<col>
            const left = /([A-Za-z_][A-Za-z0-9_]*)\.\s*$/.exec(before);
            const right = /^\s*\.([A-Za-z_][A-Za-z0-9_]*)/.exec(after);
            if (left && right) {
                const ownerToken = left[1];
                const colName = right[1];
                const owner = aliases[ownerToken] ?? ownerToken;

                // search in tables OR TVFs
                const fromTable =
                    schema.tables[owner]?.find((c) => c.name === colName) ??
                    schema.tableFunctions.find((f) => f.name === owner)?.columns.find((c) => c.name === colName);

                if (fromTable) {
                    return {
                        contents: [
                            { value: `**${owner}.${fromTable.name}**` },
                            { value: `Type: \`${fromTable.data_type}\`${fromTable.nullable ? " (nullable)" : ""}` },
                        ],
                    };
                }
            }

            // 3b) Unqualified: try to match column name across scope
            if (word) {
                const scope = tablesInScope(stmt);
                if (scope.length) {
                    const matches: { owner: string; col: { name: string; data_type: string; nullable?: boolean } }[] = [];

                    for (const t of scope) {
                        const inTable = schema.tables[t]?.find((c) => c.name === word);
                        if (inTable) matches.push({ owner: t, col: inTable });

                        const tvf = schema.tableFunctions.find((f) => f.name === t);
                        const inTVF = tvf?.columns.find((c) => c.name === word);
                        if (inTVF) matches.push({ owner: t, col: inTVF });
                    }
                    if (matches.length === 1) {
                        const m = matches[0];
                        console.log("Single match for unqualified column hover:", m);
                        return {
                            contents: [
                                { value: `**${m.owner}.${m.col.name}**` },
                                { value: `Type: \`${m.col.data_type}\`${m.col.nullable ? " (nullable)" : ""}` },
                            ],
                        };
                    } else if (matches.length > 1) {
                        console.log("Multiple matches for unqualified column hover:", matches);
                        const list = matches
                            .map((m) => `- ${m.owner}.${m.col.name}: \`${m.col.data_type}\`${m.col.nullable ? " (nullable)" : ""}`)
                            .join("\n");
                        return { contents: [{ value: `**${word}** is defined in:` }, { value: list }] };
                    }
                }
            }

            // 4) Scalar function hover by name
            if (word) {
                const s = schema.scalarFunctions.find((f) => f.function_name.toUpperCase() === word.toUpperCase());
                if (s) {
                    const sig = `${s.function_name}(${(s.params ?? []).map((p) => `${p.name}: ${p.data_type}${p.optional ? "?" : ""}`).join(", ")})`;
                    return { contents: [{ value: `**${sig}** → \`${s.return_type}\`` }, { value: s.description ?? "" }] };
                }
                const tf = schema.tableFunctions.find((f) => f.name.toUpperCase() === word.toUpperCase());
                if (tf) {
                    const sig = `${tf.name}(${(tf.params ?? []).map((p) => `${p.name}: ${p.data_type}${p.optional ? "?" : ""}`).join(", ")})`;
                    const md = tf.columns.map((c) => `- \`${c.name}\`: \`${c.data_type}\``).join("\n");
                    return { contents: [{ value: `**${sig}**` }, { value: "_table function_" }, { value: md || "_No columns_" }] };
                }
            }
            console.log("No hover found");
            // Nothing resolvable → no hover
            return null;
        },
    });
}

/* --------------------------
   Helpers
---------------------------*/

// Find if cursor is over a SQL keyword (supports multi-word like "GROUP BY", "LEFT JOIN")
function resolveKeywordAtPosition(model: monaco.editor.ITextModel, position: monaco.Position): string | null {
    const line = model.getLineContent(position.lineNumber);
    const wordInfo = model.getWordAtPosition(position);

    if (!wordInfo) return null;

    const cur = wordInfo.word;
    const prevWord = getPreviousWord(line, wordInfo.startColumn - 1);
    const nextWord = getNextWord(line, wordInfo.endColumn);

    // Try multi-word matches first (longest-first)
    for (const phrase of MULTIWORD_KEYWORDS) {
        const [a, b] = phrase.split(" ");
        // candidates: "<a> <b>" where cursor may be on a or b
        if (
            (curEquals(cur, a) && curEquals(nextWord, b)) ||
            (curEquals(prevWord, a) && curEquals(cur, b))
        ) {
            return phrase;
        }
    }

    // Single-word keyword
    const single = cur.toUpperCase();
    return KEYWORD_DOCS[single] ? single : null;
}

function curEquals(a?: string | null, b?: string | null) {
    return (a ?? "").toUpperCase() === (b ?? "").toUpperCase();
}

function getPreviousWord(line: string, endColumnExclusive: number): string | null {
    // Take substring up to endColumnExclusive-1 and scan backwards for a word
    const s = line.slice(0, Math.max(0, endColumnExclusive - 1));
    const m = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(s);
    return m ? m[1] : null;
}

function getNextWord(line: string, startColumn: number): string | null {
    const s = line.slice(startColumn - 1);
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(s);
    return m ? m[1] : null;
}

function getCurrentStatement(model: monaco.editor.ITextModel, pos: monaco.Position) {
    const full = model.getValue();
    const cursor = model.getOffsetAt(pos);
    const start = full.lastIndexOf(";", cursor - 1) + 1 || 0;
    const endIdx = full.indexOf(";", cursor);
    const end = endIdx === -1 ? full.length : endIdx;
    return { text: full.slice(start, end), startOffset: start, cursorLocal: cursor - start };
}
