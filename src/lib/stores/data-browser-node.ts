/**
 * Beacon node selection shared by the data-browser list pages (datasets, data
 * tables). Picking a node on one page carries over to the other; each page
 * still shows the picker, so a user can switch it there too.
 */

import { persisted } from 'svelte-local-storage-store';
import { migrateKey } from '@/services/beacon-node';

const KEY = 'data-browser-node-id';

// An old storage key. It is a data format, not a term. Never rename it.
migrateKey('data-browser-instance-id', KEY);

export const dataBrowserNodeId = persisted<string | null>(KEY, null);
