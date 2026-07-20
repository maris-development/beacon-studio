import type { BeaconClient } from './client';
import type { Schema } from './types';

const tablesCache = new Map<string, Promise<string[]>>();
const defaultTableCache = new Map<string, Promise<string>>();
const schemaCache = new Map<string, Promise<Schema>>();

export function getCachedTables(client: BeaconClient): Promise<string[]> {
    if (!tablesCache.has(client.host)) {
        tablesCache.set(client.host, client.getTables());
    }
    return tablesCache.get(client.host)!;
}

export function getCachedDefaultTable(client: BeaconClient): Promise<string> {
    if (!defaultTableCache.has(client.host)) {
        defaultTableCache.set(client.host, client.getDefaultTable());
    }
    return defaultTableCache.get(client.host)!;
}

export function getCachedSchema(client: BeaconClient, tableName: string): Promise<Schema> {
    const key = `${client.host}::${tableName}`;
    if (!schemaCache.has(key)) {
        schemaCache.set(key, client.getTableSchema(tableName));
    }
    return schemaCache.get(key)!;
}

export function clearMetadataCache(host?: string): void {
    if (host) {
        tablesCache.delete(host);
        defaultTableCache.delete(host);
        for (const key of schemaCache.keys()) {
            if (key.startsWith(`${host}::`)) schemaCache.delete(key);
        }
    } else {
        tablesCache.clear();
        defaultTableCache.clear();
        schemaCache.clear();
    }
}