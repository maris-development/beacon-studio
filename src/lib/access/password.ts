// Letters and digits without 0, O, 1, l and I.
const Alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const Cutoff = 256 - (256 % Alphabet.length);

type RandomBytes = (bytes: Uint8Array) => Uint8Array;

function cryptoBytes(bytes: Uint8Array): Uint8Array {
	return crypto.getRandomValues(bytes);
}

/** Hide a secret in a text. The SDK doubles each quote in the SQL, so both forms are masked. */
export function maskSecret(text: string, secret: string): string {
	if (secret === '') return text;
	const quoted = secret.replace(/'/g, "''");
	return text.split(quoted).join('***').split(secret).join('***');
}

/** Make a random password. Rejection sampling avoids modulo bias. */
export function generatePassword(random: RandomBytes = cryptoBytes, length = 20): string {
	let result = '';
	while (result.length < length) {
		const bytes = random(new Uint8Array(length));
		for (const byte of bytes) {
			if (byte >= Cutoff) continue;
			result += Alphabet[byte % Alphabet.length];
			if (result.length === length) break;
		}
	}
	return result;
}
