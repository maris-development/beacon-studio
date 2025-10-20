import type * as monaco from "monaco-editor";

export function getReplaceRange(model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange {
    const word = model.getWordUntilPosition(position);
    return {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
    };
}

export function getLinePrefix(model: monaco.editor.ITextModel, pos: monaco.Position): string {
    return model.getValueInRange({
        startLineNumber: pos.lineNumber,
        startColumn: 1,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column,
    });
}
