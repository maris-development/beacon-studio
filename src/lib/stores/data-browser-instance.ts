/**
 * Beacon instance selection shared by the data-browser list pages (datasets,
 * data tables). Picking an instance on one page carries over to the other;
 * each page still shows the picker, so a user can switch it there too.
 */

import { persisted } from 'svelte-local-storage-store';

export const dataBrowserInstanceId = persisted<string | null>('data-browser-instance-id', null);
