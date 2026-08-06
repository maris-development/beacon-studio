/**
 * Arrow IPC decoder with zstd support — the app-side counterpart to the decoder
 * `@beacon/client` uses internally.
 *
 * Beacon's default query response is a *zstd-compressed* Arrow IPC stream. Two
 * pieces of one-time `apache-arrow` setup are needed to decode it, mirroring the
 * SDK:
 *
 * 1. Register a zstd codec: apache-arrow 21+ can decode compressed IPC, but ships
 *    no zstd implementation — one must be registered in `compressionRegistry`. We
 *    back it with `fzstd` (a tiny, pure-JS decompressor), exactly like the SDK.
 * 2. Patch decompressed-buffer alignment: arrow's IPC reader can hand out
 *    decompressed buffers at non-8-byte offsets, which breaks typed-array views.
 *
 * Both steps are idempotent and share the SDK's guards (the registry check and the
 * `__beaconAligned8` flag). Since `apache-arrow` is deduped to a single module
 * instance, whichever of the SDK or this module runs first does the setup and the
 * other becomes a no-op.
 *
 * The `apache-arrow` and `fzstd` imports are dynamic so callers that never decode a
 * query result don't pull them in until the first decode.
 */

import type { ArrowRecordBatch, ArrowTable } from '@beacon/client';

// The `ArrowModule` type and the setup below are copied from the SDK's `src/arrow.ts`.
// As of @beacon/client 2.0.0-rc.2 that module stays internal: the package entry point
// exports only `rowsFromTable`, `rowsFromBatch`, and the `ArrowTable`/`ArrowRecordBatch`
// types, so `getArrowDecoder` is not reachable. Drop this copy once the SDK exports it.

/** Same flag the SDK stamps on the patched prototype, so we never double-patch. */
const ALIGN_PATCH_FLAG = '__beaconAligned8';

/** The decode surface: build a Table from a full payload, or stream record batches. */
export interface ArrowDecoder {
	/** Decodes a complete Arrow IPC payload (stream or file) into a Table. */
	tableFromIPC(bytes: Uint8Array): ArrowTable;
	/** Opens a streaming reader over a chunked Arrow IPC source. */
	readStream(source: AsyncIterable<Uint8Array>): Promise<AsyncIterable<ArrowRecordBatch>>;
}

/** The bits of the `apache-arrow` module we touch. */
interface ArrowModule {
	tableFromIPC(bytes: Uint8Array): ArrowTable;
	tableFromArrays(arrays: Record<string, unknown>): unknown;
	tableToIPC(table: unknown, variant: string): Uint8Array;
	RecordBatchReader: {
		from(source: unknown): Promise<AsyncIterable<ArrowRecordBatch>> | AsyncIterable<ArrowRecordBatch>;
	};
	CompressionType: { ZSTD: number };
	compressionRegistry: {
		get(type: number): { decode?: (b: Uint8Array) => Uint8Array } | null;
		set(type: number, codec: { decode?: (b: Uint8Array) => Uint8Array }): void;
	};
}

let loaded: Promise<ArrowDecoder> | null = null;

/** Returns the shared, lazily-initialized Arrow decoder (zstd-capable). */
export function getArrowDecoder(): Promise<ArrowDecoder> {
	if (!loaded) {
		loaded = init();
	}
	return loaded;
}

async function init(): Promise<ArrowDecoder> {
	const arrow = (await import('apache-arrow')) as unknown as ArrowModule;
	await registerZstd(arrow);
	patchBufferAlignment(arrow);
	return {
		tableFromIPC: (bytes) => arrow.tableFromIPC(bytes),
		readStream: async (source) => arrow.RecordBatchReader.from(source)
	};
}

/** Registers an fzstd-backed ZSTD decode codec with apache-arrow (idempotent). */
async function registerZstd(arrow: ArrowModule): Promise<void> {
	const zstdType = arrow.CompressionType.ZSTD;
	if (arrow.compressionRegistry.get(zstdType)?.decode) return;
	const { decompress } = (await import('fzstd')) as { decompress: (b: Uint8Array) => Uint8Array };
	arrow.compressionRegistry.set(zstdType, { decode: (b) => decompress(b) });
}

function align8(buf: Uint8Array): Uint8Array {
	if (buf.byteOffset % 8 === 0) return buf;
	const copy = new Uint8Array(buf.byteLength);
	copy.set(buf);
	return copy;
}

/** Patches the IPC reader so decompressed buffers are 8-byte aligned (idempotent). */
function patchBufferAlignment(arrow: ArrowModule): void {
	try {
		const ipc = arrow.tableToIPC(arrow.tableFromArrays({ x: Uint8Array.from([0]) }), 'stream');
		const reader = arrow.RecordBatchReader.from(ipc) as unknown as { _impl?: object };
		let proto: object | null = reader._impl ? Object.getPrototypeOf(reader._impl) : null;
		while (proto && !Object.prototype.hasOwnProperty.call(proto, '_decompressBuffers')) {
			proto = Object.getPrototypeOf(proto);
		}
		const target = proto as
			| (Record<string, unknown> & {
					_decompressBuffers?: (...args: unknown[]) => { decommpressedBody?: Uint8Array[] };
			  })
			| null;
		if (!target || target[ALIGN_PATCH_FLAG] || typeof target._decompressBuffers !== 'function') {
			return;
		}
		const original = target._decompressBuffers;
		target._decompressBuffers = function (this: unknown, ...args: unknown[]) {
			const result = original.apply(this, args);
			// (sic) "decommpressedBody" matches the misspelled field in apache-arrow 21.
			if (result && Array.isArray(result.decommpressedBody)) {
				result.decommpressedBody = result.decommpressedBody.map(align8);
			}
			return result;
		};
		target[ALIGN_PATCH_FLAG] = true;
	} catch {
		// Best-effort: arrow internals moved — decoding still works for aligned buffers.
	}
}
