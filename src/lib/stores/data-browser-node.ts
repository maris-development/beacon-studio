/**
 * Beacon node selection shared by the data-browser list pages (datasets, data
 * tables). Picking a node on one page carries over to the other; each page
 * still shows the picker, so a user can switch it there too.
 */

import { persisted } from 'svelte-local-storage-store';

export const dataBrowserNodeId = persisted<string | null>('data-browser-node-id', null);
