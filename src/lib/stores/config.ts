/**
 * @deprecated Use `@/services/beacon-instance`.
 *
 * This file is a read-only bridge. It stays until every page moves to the
 * service. The two exports below are `Readable`, not writable stores. Use the
 * service actions (`selectInstance`, `addInstance`, ...) to change a value.
 */

import { currentInstance, instances } from '@/services/beacon-instance';

export type { BeaconInstance } from '@/beacon-api/types';

/** @deprecated Use `currentInstance` from `@/services/beacon-instance`. */
export const currentBeaconInstance = currentInstance;

/** @deprecated Use `instances` from `@/services/beacon-instance`. */
export const beaconInstances = instances;
