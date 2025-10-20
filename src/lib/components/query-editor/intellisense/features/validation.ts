import type * as monaco from "monaco-editor";
import { type SchemaStore } from "../schema";
import { debounce } from "../utils/debounce";

export function attachValidation(
    monaco: typeof import("monaco-editor"),
    editor: monaco.editor.IStandaloneCodeEditor,
    store: SchemaStore
) {
    const model = editor.getModel();
    if (!model) return { dispose() { } };

    const run = () => {
        const schema = store.get();
        const text = model.getValue();
        const markers: monaco.editor.IMarkerData[] = [];
        const aliases = scanAliases(text);

        // tables / table functions
        const reTbl = /\b(FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
        let m: RegExpExecArray | null;
        while ((m = reTbl.exec(text))) {
            const t = m[2];
            const exists = schema.tables[t] || schema.tableFunctions.find(f => f.name === t);
            if (!exists) {
                markers.push({
                    message: `Unknown table or table function: "${t}"`,
                    severity: monaco.MarkerSeverity.Error,
                    startLineNumber: lineOf(text, m.index),
                    startColumn: colOf(text, m.index + m[1].length + 1),
                    endLineNumber: lineOf(text, m.index + m[0].length),
                    endColumn: colOf(text, m.index + m[0].length),
                });
            }
        }

        // columns
        const reCol = /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g;
        let c: RegExpExecArray | null;
        while ((c = reCol.exec(text))) {
            const ownerToken = c[1];
            const col = c[2];
            const owner = aliases[ownerToken] ?? ownerToken;
            const cols =
                schema.tables[owner] ?? schema.tableFunctions.find(f => f.name === owner)?.columns;
            if (!cols || !cols.find(x => x.name === col)) {
                markers.push({
                    message: cols ? `Unknown column "${col}" on "${owner}"` : `Unknown table/alias "${ownerToken}"`,
                    severity: monaco.MarkerSeverity.Error,
                    startLineNumber: lineOf(text, c.index),
                    startColumn: colOf(text, c.index + ownerToken.length + 2),
                    endLineNumber: lineOf(text, c.index + c[0].length),
                    endColumn: colOf(text, c.index + c[0].length),
                });
            }
        }

        monaco.editor.setModelMarkers(model, "sql-lint", markers);
    };

    const deb = debounce(run, 150);
    const sub1 = editor.onDidChangeModelContent(deb);
    const sub2 = editor.onDidChangeCursorPosition(deb);
    run();

    return {
        dispose() {
            monaco.editor.setModelMarkers(editor.getModel()!, "sql-lint", []);
            sub1.dispose(); sub2.dispose();
        },
    };
}

// tiny helpers
function scanAliases(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    const re = /\b(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+AS)?\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out[m[3]] = m[2];
    return out;
}
function lineOf(text: string, idx: number): number { let line = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) == 10) line++; return line; }
function colOf(text: string, idx: number): number { const last = text.lastIndexOf("\n", idx - 1); return idx - (last === -1 ? -1 : last); }
