/**
 * The save of the add and edit form of a Beacon node.
 *
 * The form can hold admin credentials. They go to `admin-session.ts` only, never on the node record.
 */

import type { BeaconNode } from '@/beacon-api/types';
import {
	adminErrorMessage,
	checkAdminCredentials,
	signIn,
	type AdminCredentials
} from './admin-session';
import { addNode, normalizeUrl, updateNode, type BeaconNodeInput } from './beacon-node';

/** True while the form URL keeps the node session. A save with a new URL signs out (`updateNode`). */
export function sessionSurvives(node: BeaconNode, url: string): boolean {
	return normalizeUrl(url) === normalizeUrl(node.url);
}

/** The saved node, and the error of the sign-in that followed, if any. */
export type NodeSaveResult = { node: BeaconNode; adminError: string | null };

/** True when the user typed into the admin fields. The form then needs both fields. */
export function hasAdminInput(admin: AdminCredentials | null): admin is AdminCredentials {
	return admin !== null && (admin.username !== '' || admin.password !== '');
}

/** Saves the node first, then signs in. A failed sign-in keeps the node. Null for an unknown id. */
export async function saveNodeForm(
	values: BeaconNodeInput,
	admin: AdminCredentials | null,
	editingId: string | null = null
): Promise<NodeSaveResult | null> {
	let node: BeaconNode | null;

	if (editingId) {
		node = updateNode(editingId, values);
	} else {
		node = addNode(values);
	}

	if (!node) return null;
	if (!hasAdminInput(admin)) return { node, adminError: null };

	try {
		await signIn(node, admin.username, admin.password);
		return { node, adminError: null };
	} catch (error) {
		return { node, adminError: adminErrorMessage(error) };
	}
}

/** True when both admin fields hold text, so the node can check them. */
export function hasCompleteAdminInput(admin: AdminCredentials | null): admin is AdminCredentials {
	return admin !== null && admin.username !== '' && admin.password !== '';
}

/** Checks the admin fields against the URL. Null means valid, or no complete pair. */
export async function testAdminInput(
	url: string,
	admin: AdminCredentials | null
): Promise<string | null> {
	if (!hasCompleteAdminInput(admin)) return null;

	try {
		await checkAdminCredentials(url, admin);
		return null;
	} catch (error) {
		return adminErrorMessage(error);
	}
}
