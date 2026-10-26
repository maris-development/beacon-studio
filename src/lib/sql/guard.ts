/** The read-only guard of the workbench SQL mode. Every workbench SQL request goes through it. */
import type {
    OutputFormat,
    QueryInput,
    SimpleOutputFormat
} from "@maris-development/beacon-client";
import { message, type Message } from "@/i18n";
import { runPreview, type BatchSource, type PreviewResult } from "./run";

/** The first words of a statement that reads data. */
const READ_STARTS = new Set(["SELECT", "WITH", "VALUES"]);

/** Words that write, or that start a statement that writes. A read query holds none of them. */
export const WRITE_WORDS = new Set([
    "ALTER",
    "ATTACH",
    "CALL",
    "COPY",
    "CREATE",
    "DELETE",
    "DENY",
    "DETACH",
    "DROP",
    "EXEC",
    "EXECUTE",
    "GRANT",
    "INSERT",
    "INSTALL",
    "INTO",
    "MERGE",
    "REFRESH",
    "RENAME",
    "REVOKE",
    "TRUNCATE",
    "UPDATE",
    "UPSERT",
    "VACUUM"
]);

/** Signs that start a dollar string, a backtick name or a `#` comment in some dialects. */
const AMBIGUOUS_SIGNS = new Set(["$", "`", "#"]);

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_]/u;
const DIGIT = /\p{N}/u;
const SPACE = /\s/u;

const EMPTY = message("workbench.sql.guard.empty");
const UNCLOSED = message("workbench.sql.guard.unclosed");
const BACKSLASH_QUOTE = message("workbench.sql.guard.backslashQuote");
const NESTED_COMMENT = message("workbench.sql.guard.nestedComment");
const LINE_END = message("workbench.sql.guard.lineEnd");
const SEVERAL = message("workbench.sql.guard.several");
const NOT_READ = message("workbench.sql.guard.notRead");
const NO_FILTER = message("workbench.sql.guard.noFilter");

type Token = { kind: "word" | "sign"; text: string };

type Scan = { tokens: Token[] } | { problem: Message };

/** The index of the quote that closes the string or name at `start`, or a problem. */
function closingQuote(sql: string, start: number): number | Message {
    const quote = sql[start];
    let index = start + 1;

    while (index < sql.length) {
        if (sql[index] === quote) {
            // A dialect with backslash escapes reads this quote as text.
            if (sql[index - 1] === "\\") return BACKSLASH_QUOTE;
            if (sql[index + 1] !== quote) return index;
            index += 2;
        } else {
            index += 1;
        }
    }

    return UNCLOSED;
}

/**
 * The code tokens of the text, read with the standard SQL rules. Strings, quoted names and
 * comments give no token. A mark that another dialect reads in another way gives a problem.
 */
function scan(sql: string): Scan {
    const tokens: Token[] = [];
    let index = 0;

    while (index < sql.length) {
        const char = sql[index];
        const next = sql[index + 1];

        if (SPACE.test(char)) {
            index += 1;
        } else if (char === "-" && next === "-") {
            let end = sql.indexOf("\n", index + 2);
            if (end === -1) end = sql.length;
            // Some readers also end the comment at a lone carriage return.
            const cr = sql.indexOf("\r", index + 2);
            if (cr !== -1 && cr < end - 1) return { problem: LINE_END };
            index = end + 1;
        } else if (char === "/" && next === "*") {
            const end = sql.indexOf("*/", index + 2);
            if (end === -1) return { problem: UNCLOSED };
            // The slice holds the `*` of the end, so a `/*/` also counts as nested.
            if (sql.slice(index + 2, end + 1).includes("/*")) return { problem: NESTED_COMMENT };
            index = end + 2;
        } else if (char === "'" || char === '"') {
            const end = closingQuote(sql, index);
            if (typeof end !== "number") return { problem: end };
            index = end + 1;
        } else if (AMBIGUOUS_SIGNS.has(char)) {
            return { problem: message("workbench.sql.guard.mark", { mark: char }) };
        } else if (WORD_START.test(char)) {
            let end = index + 1;
            while (end < sql.length && WORD_PART.test(sql[end])) end += 1;
            tokens.push({ kind: "word", text: sql.slice(index, end).toUpperCase() });
            index = end;
        } else if (DIGIT.test(char)) {
            // Letters after the digits make a word of their own, so `1INTO` still shows INTO.
            let end = index + 1;
            while (end < sql.length && (DIGIT.test(sql[end]) || sql[end] === ".")) end += 1;
            tokens.push({ kind: "sign", text: sql.slice(index, end) });
            index = end;
        } else {
            tokens.push({ kind: "sign", text: char });
            index += 1;
        }
    }

    return { tokens };
}

/** The reason that the text is not one statement that only reads, or null. */
export function readOnlyReason(sql: string): Message | null {
    const scanned = scan(sql);
    if ("problem" in scanned) return scanned.problem;

    const tokens = [...scanned.tokens];
    while (tokens.at(-1)?.text === ";") tokens.pop();

    if (tokens.length === 0) return EMPTY;
    if (tokens.some((token) => token.text === ";")) return SEVERAL;

    const first = tokens.find((token) => token.text !== "(");
    if (first?.kind !== "word" || !READ_STARTS.has(first.text)) return NOT_READ;

    const write = tokens.find((token) => token.kind === "word" && WRITE_WORDS.has(token.text));
    if (write) return message("workbench.sql.guard.writeWord", { word: write.text });

    return null;
}

/** True when the code holds a `WHERE` or a `LIMIT`. */
export function hasRowFilter(sql: string): boolean {
    const scanned = scan(sql);
    if ("problem" in scanned) return false;

    return scanned.tokens.some(
        (token) => token.kind === "word" && (token.text === "WHERE" || token.text === "LIMIT")
    );
}

/** The reason that the workbench must not run the SQL, or null. */
export function sqlBlockReason(sql: string, options: { requireFilter: boolean }): Message | null {
    const reason = readOnlyReason(sql);
    if (reason) return reason;
    if (options.requireFilter && !hasRowFilter(sql)) return NO_FILTER;

    return null;
}

export type Guarded<T> = { kind: "refused"; reason: Message } | { kind: "done"; value: T };

/** The part of the SDK client that a download needs. */
export interface RawSource {
    queryRaw(query: QueryInput, format?: OutputFormat, signal?: AbortSignal): Promise<Response>;
}

/** Runs the preview of read-only SQL. Refused SQL sends no request. */
export async function readOnlyPreview(
    source: BatchSource,
    sql: string,
    options: { signal: AbortSignal; requireFilter: boolean }
): Promise<Guarded<PreviewResult>> {
    const text = sql.trim();
    const reason = sqlBlockReason(text, options);
    if (reason) return { kind: "refused", reason };

    const value = await runPreview(source, { sql: text }, { signal: options.signal });
    return { kind: "done", value };
}

/** Fetches the full result of read-only SQL as a file. Refused SQL sends no request. */
export async function readOnlyDownload(
    source: RawSource,
    sql: string,
    format: SimpleOutputFormat,
    options: { requireFilter: boolean }
): Promise<Guarded<Response>> {
    const text = sql.trim();
    const reason = sqlBlockReason(text, options);
    if (reason) return { kind: "refused", reason };

    const value = await source.queryRaw({ sql: text, output: { format } });
    return { kind: "done", value };
}
