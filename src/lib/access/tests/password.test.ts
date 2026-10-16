import { expect, it } from 'vitest';
import { generatePassword } from '../password';

it('gives 20 characters from the alphabet', () => {
	expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
});

it('drops bytes above the last full alphabet cycle', () => {
	// 255 is above the cutoff, so the next byte (0) gives the first letter.
	let calls = 0;
	const random = (bytes: Uint8Array) => {
		bytes.fill(calls++ === 0 ? 255 : 0);
		return bytes;
	};
	expect(generatePassword(random, 1)).toBe('A');
});
