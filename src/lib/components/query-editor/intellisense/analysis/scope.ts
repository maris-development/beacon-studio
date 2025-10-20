export function scanAliasesInStatement(stmt: string): Record<string, string> {
    const aliases: Record<string, string> = {};
    const re = /\b(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+AS)?\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stmt))) aliases[m[3]] = m[2];
    return aliases;
}

export function tablesInScope(stmt: string): string[] {
    const out: string[] = [];
    const re = /\b(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*|\w+\s*\()/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stmt))) {
        const raw = m[2];
        const tvf = /^([A-Za-z_][A-Za-z0-9_]*)\s*\($/.exec(raw);
        out.push(tvf ? tvf[1] : raw);
    }
    return [...new Set(out)];
}

export function parseSelectColumns(stmt: string): string[] {
    const sel = (() => {
        const rSel = /\bSELECT\b/ig, rFrom = /\bFROM\b/ig;
        const s = rSel.exec(stmt); if (!s) return null;
        rFrom.lastIndex = s.index + s[0].length;
        const f = rFrom.exec(stmt); if (!f) return null;
        return { start: s.index + s[0].length, end: f.index };
    })();
    if (!sel) return [];
    const list = stmt.slice(sel.start, sel.end);
    const cols = new Set<string>();
    const re = /([A-Za-z_][A-Za-z0-9_]*)(?:\s*\.\s*([A-Za-z_][A-Za-z0-9_]*))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(list))) { const a = m[1], b = m[2]; cols.add(b ? `${a}.${b}` : a); }
    return [...cols];
}
