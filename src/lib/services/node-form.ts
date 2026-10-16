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

/** The admin fields of the form, with the "Remember on this device" choice. */
export type AdminInput = AdminCredentials & { remember: boolean };

/** The saved node, the error of the sign-in that followed, and whether the remember step failed. */
export type NodeSaveResult = {
	node: BeaconNode;
	adminError: string | null;
	rememberFailed: boolean;
};

/** True when the user typed into the admin fields. The form then needs both fields. */
export function hasAdminInput(admin: AdminInput | null): admin is AdminInput {
	return admin !== null && (admin.username !== '' || admin.password !== '');
}

/** Saves the node first, then signs in. A failed sign-in keeps the node. Null for an unknown id. */
export async function saveNodeForm(
	values: BeaconNodeInput,
	admin: AdminInput | null,
	editingId: string | null = null
): Promise<NodeSaveResult | null> {
	let node: BeaconNode | null;

	if (editingId) {
		node = updateNode(editingId, values);
	} else {
		node = addNode(values);
	}

	if (!node) return null;
	if (!hasAdminInput(admin)) return { node, adminError: null, rememberFailed: false };

	try {
		const saved = await signIn(node, admin.username, admin.password, admin.remember);
		return { node, adminError: null, rememberFailed: !saved };
	} catch (error) {
		return { node, adminError: adminErrorMessage(error), rememberFailed: false };
	}
}

/** True when both admin fields hold text, so the node can check them. */
export function hasCompleteAdminInput(admin: AdminInput | null): admin is AdminInput {
	return admin !== null && admin.username !== '' && admin.password !== '';
}

/** Checks the admin fields against the URL. Null means valid, or no complete pair. */
export async function testAdminInput(
	url: string,
	admin: AdminInput | null
): Promise<string | null> {
	if (!hasCompleteAdminInput(admin)) return null;

	try {
		await checkAdminCredentials(url, admin);
		return null;
	} catch (error) {
		return adminErrorMessage(error);
	}
}
