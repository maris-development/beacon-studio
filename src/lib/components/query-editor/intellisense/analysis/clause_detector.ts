export type Clause = "SELECT" | "FROM" | "WHERE" | "GROUP_BY" | "HAVING" | "ORDER_BY" | "UNKNOWN";

const RE = {
    SELECT: /\bSELECT\b/i,
    FROM: /\bFROM\b/i,
    WHERE: /\bWHERE\b/i,
    GROUP_BY: /\bGROUP\s+BY\b/i,
    HAVING: /\bHAVING\b/i,
    ORDER_BY: /\bORDER\s+BY\b/i,
};

export function clauseAtCursor(stmt: string, cursorLocal: number): Clause {
    const found: { c: Clause; i: number }[] = [];
    const scan = (rx: RegExp, c: Clause) => {
        let m: RegExpExecArray | null; const r = new RegExp(rx.source, "ig");
        while ((m = r.exec(stmt))) found.push({ c, i: m.index });
    };
    scan(RE.SELECT, "SELECT"); scan(RE.FROM, "FROM"); scan(RE.WHERE, "WHERE");
    scan(RE.GROUP_BY, "GROUP_BY"); scan(RE.HAVING, "HAVING"); scan(RE.ORDER_BY, "ORDER_BY");
    const active = found.filter(p => p.i <= cursorLocal).sort((a, b) => a.i - b.i).map(p => p.c);
    return active.length ? active[active.length - 1] : "UNKNOWN";
}

export function hasFrom(stmt: string): boolean {
    return RE.FROM.test(stmt);
}

export function findSelectSpan(stmt: string) {
    const rSel = /\bSELECT\b/ig, rFrom = /\bFROM\b/ig;
    const sel = rSel.exec(stmt); if (!sel) return null;
    rFrom.lastIndex = sel.index + sel[0].length;
    const frm = rFrom.exec(stmt); if (!frm) return null;
    return { start: sel.index + sel[0].length, end: frm.index };
}

export function inSelectList(stmt: string, cursorLocal: number) {
    const span = findSelectSpan(stmt); if (!span) return false;
    return cursorLocal >= span.start && cursorLocal <= span.end;
}
