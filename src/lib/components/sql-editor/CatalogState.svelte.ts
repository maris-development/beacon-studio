import type { BeaconNode } from "@/beacon-api/types";
import { makeBeaconClient } from "@/beacon-api/client";
import { CatalogCache, type CatalogTree, type SchemaColumn } from "@/sql/catalog";
import {
    buildCompletions,
    parseFunctions,
    type CompletionEntry,
    type FnMeta
} from "@/sql/completion";
import type { TableRef } from "@/sql/identifiers";
import { sqlError } from "@/sql/statement";
import type { Message } from "@/i18n";

/** The tables, columns and functions of one node, for the table tree and the completion. */
export class CatalogState {
    tree = $state<CatalogTree | null>(null);
    loading = $state(false);
    error = $state<Message | null>(null);
    functions = $state<FnMeta[]>([]);

    private columnsVersion = $state(0);
    // The node of the last load. An answer for another node is stale.
    private nodeUrl = $state<string | null>(null);
    private readonly cache: CatalogCache;

    constructor(cache = new CatalogCache()) {
        this.cache = cache;
    }

    async load(node: BeaconNode, refresh = false): Promise<void> {
        const url = node.url;
        const client = makeBeaconClient(node);
        this.nodeUrl = url;
        this.loading = true;
        this.error = null;

        try {
            const result = await this.cache.tree(url, client, refresh);
            if (this.nodeUrl === url) this.tree = result;
        } catch (error) {
            if (this.nodeUrl === url) {
                this.tree = null;
                this.error = sqlError(error);
            }
        } finally {
            if (this.nodeUrl === url) this.loading = false;
        }

        // A failure removes the function suggestions only.
        client.functions().then(
            (raw) => {
                if (this.nodeUrl === url) this.functions = parseFunctions(raw);
            },
            () => {
                if (this.nodeUrl === url) this.functions = [];
            }
        );
    }

    /** Forgets the node. The tree shows its placeholder. */
    reset(): void {
        this.nodeUrl = null;
        this.tree = null;
        this.loading = false;
        this.error = null;
        this.functions = [];
    }

    async loadColumns(node: BeaconNode, ref: TableRef): Promise<SchemaColumn[]> {
        const result = await this.cache.columnsOf(node.url, makeBeaconClient(node), ref);
        this.columnsVersion += 1;

        return result;
    }

    /** The suggestions of the editor. A read-only editor gets no write keywords. */
    completions(readOnly = false): CompletionEntry[] {
        void this.columnsVersion;

        let columns: ReturnType<CatalogCache["loadedColumns"]> = [];
        if (this.nodeUrl) columns = this.cache.loadedColumns(this.nodeUrl);

        return buildCompletions({ tree: this.tree, functions: this.functions, columns, readOnly });
    }
}
