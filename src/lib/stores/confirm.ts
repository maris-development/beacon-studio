/**
 * The question that the app asks before a step that a user cannot undo.
 *
 * This store replaces the native `confirm` and `alert`. A native dialog blocks
 * the whole browser, it carries the URL of the app, and it takes no styling.
 *
 * One `<Confirm />` in the layout renders whatever this store holds. Therefore a
 * caller needs no markup of its own, and a `.svelte.ts` class can ask a question
 * as well.
 *
 * The call is asynchronous, so every caller awaits the answer:
 *
 * ```ts
 * if (!(await askConfirm({ title: 'Close query', message: '…' }))) return;
 * ```
 */

import { readonly, writable, type Readable } from 'svelte/store';

export interface ConfirmOptions {
	title: string;
	message: string;
	/** A second line, for the consequence of the step. */
	note?: string;
	/** The label of the button that goes ahead. */
	confirmLabel?: string;
	/** The label of the button that stops. Null hides it, which makes a message box. */
	cancelLabel?: string | null;
	/** Colours the button red. Use it when the step destroys something. */
	destructive?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
	/** Rises per question. The dialog keys on it, so a second question resets it. */
	id: number;
	settle: (answer: boolean) => void;
}

const request = writable<ConfirmRequest | null>(null);

/** The open question, or null. `<Confirm />` reads this. */
export const confirmRequest: Readable<ConfirmRequest | null> = readonly(request);

let counter = 0;

/**
 * Asks the user a question. Returns true when the user goes ahead.
 *
 * A second question replaces the first, and the first then answers false. A
 * caller must therefore treat a false as "do nothing", and never as an error.
 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		counter += 1;

		request.update((pending) => {
			pending?.settle(false);

			return { ...options, id: counter, settle: resolve };
		});
	});
}

/** Shows one message with a single button. It replaces a native `alert`. */
export function askAlert(options: Omit<ConfirmOptions, 'cancelLabel' | 'destructive'>): Promise<void> {
	return askConfirm({ ...options, cancelLabel: null, confirmLabel: options.confirmLabel ?? 'OK' }).then(
		() => undefined
	);
}

/** Answers the open question and closes the dialog. `<Confirm />` calls this. */
export function answerConfirm(answer: boolean): void {
	request.update((pending) => {
		pending?.settle(answer);

		return null;
	});
}
