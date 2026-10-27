import type { BeaconNode } from "@/beacon-api/types";
import { makeBeaconClient } from "@/beacon-api/client";
import { readOnlyPreview } from "@/sql/guard";
import type { PreviewResult } from "@/sql/run";
import { isSqlDisabled, sqlError } from "@/sql/statement";
import { queryStore } from "@/stores/query-store.svelte";
import type { Message, MessageKey } from "@/i18n";

export type SqlOutcome =
    | { kind: "busy" }
    | { kind: "rows"; result: PreviewResult; duration: number }
    | { kind: "error"; message: Message }
    | { kind: "notice"; message: MessageKey };

/**
 * The preview runs of the SQL blocks. The record does not hold them, as it does not hold a
 * spinner. One run at a time: a new run stops the run in flight.
 */
export class SqlPreview {
    outcomes = $state<Record<string, SqlOutcome>>({});
    busy = $state(false);

    private controller: AbortController | null = null;
    // The run that owns the outcome of each block. A newer run of the block replaces it.
    private owners: Record<string, AbortController> = {};

    outcomeOf(blockId: string | null): SqlOutcome | null {
        if (!blockId) return null;
        return this.outcomes[blockId] ?? null;
    }

    /** Runs the SQL through the read-only guard. The workbench never runs SQL as admin. */
    async run(
        blockId: string,
        node: BeaconNode,
        sql: string,
        requireFilter: boolean
    ): Promise<void> {
        this.controller?.abort();

        const own = new AbortController();
        this.controller = own;
        this.owners[blockId] = own;
        this.busy = true;
        this.outcomes[blockId] = { kind: "busy" };

        const started = performance.now();
        let outcome: SqlOutcome;

        try {
            const result = await readOnlyPreview(makeBeaconClient(node), sql, {
                signal: own.signal,
                requireFilter
            });

            if (result.kind === "refused") {
                outcome = { kind: "error", message: result.reason };
            } else {
                outcome = {
                    kind: "rows",
                    result: result.value,
                    duration: performance.now() - started
                };
                this.record(blockId, node, sql, outcome.result, outcome.duration);
            }
        } catch (error) {
            if (own.signal.aborted) {
                outcome = { kind: "notice", message: "sqlEditor.result.stopped" };
            } else if (isSqlDisabled(error)) {
                outcome = { kind: "notice", message: "sqlEditor.result.sqlDisabled" };
            } else {
                outcome = { kind: "error", message: sqlError(error) };
            }
        }

        this.finish(own, blockId, outcome);
    }

    stop(): void {
        this.controller?.abort();
    }

    /** Drops the outcome of a block, and stops its run. */
    clear(blockId: string): void {
        this.owners[blockId]?.abort();
        delete this.owners[blockId];
        delete this.outcomes[blockId];
    }

    /** Adds a finished preview to the history. A truncated preview gives no row count. */
    private record(
        blockId: string,
        node: BeaconNode,
        sql: string,
        result: PreviewResult,
        duration: number
    ): void {
        if (result.cancelled) return;

        let rowCount: number | undefined;
        if (!result.truncated) {
            rowCount = result.rows.length;
        }

        queryStore.recordSqlRun(sql, node, { duration, rowCount, storedQueryId: blockId });
    }

    private finish(own: AbortController, blockId: string, outcome: SqlOutcome): void {
        if (this.owners[blockId] === own) {
            delete this.owners[blockId];
            this.outcomes[blockId] = outcome;
        }

        if (this.controller === own) {
            this.controller = null;
            this.busy = false;
        }
    }
}
