import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { poll } from '../poll';

describe('poll', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('starts the next read only after the last read ends', async () => {
		let finish = () => {};
		const read = vi.fn(
			() =>
				new Promise<void>((done) => {
					finish = done;
				})
		);

		const stop = poll(read, 1000);
		expect(read).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5000);
		expect(read).toHaveBeenCalledTimes(1);

		finish();
		await vi.advanceTimersByTimeAsync(999);
		expect(read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(read).toHaveBeenCalledTimes(2);

		stop();
	});

	it('reads no more after stop, also when a read is open', async () => {
		let finish = () => {};
		const read = vi.fn(
			() =>
				new Promise<void>((done) => {
					finish = done;
				})
		);

		const stop = poll(read, 1000);
		stop();
		finish();
		await vi.advanceTimersByTimeAsync(5000);
		expect(read).toHaveBeenCalledTimes(1);
	});
});
