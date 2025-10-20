import type * as monaco from "monaco-editor";

export function getCurrentStatement(model: monaco.editor.ITextModel, pos: monaco.Position) {
    const full = model.getValue();
    const cursor = model.getOffsetAt(pos);
    const start = full.lastIndexOf(";", cursor - 1) + 1 || 0;
    const endIdx = full.indexOf(";", cursor);
    const end = endIdx === -1 ? full.length : endIdx;
    return { text: full.slice(start, end), startOffset: start, cursorLocal: cursor - start };
}
